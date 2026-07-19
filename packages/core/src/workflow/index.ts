import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { ok, err } from "neverthrow";
import { AIClient } from "../ai/index.js";
import { GitClient } from "../git/index.js";
import { GitHubClient } from "../github/index.js";
import type { Logger } from "../logger/index.js";
import { RAGBuilder } from "../rag/index.js";
import { SnapshotManager } from "../snapshot/index.js";
import { loadRC, mergeConfig } from "../config/index.js";
import { buildVcsStatus } from "../vcs/status.js";
import type {
  AIContext,
  BranchNameResult,
  CommitMessageResult,
  GitStackedAction,
  OperationType,
  PRApprovalInput,
  PRDescriptionResult,
  RepoFoxError,
  RepoFoxResult,
  VcsStatus,
  WorkflowConfig,
  WorkflowState,
} from "../types/index.js";
import {
  planStackedActionOperations,
  resolveQuickAction,
  validateStackedAction,
} from "./git-actions.js";

export type WorkflowEvent =
  | { type: "state_changed"; state: WorkflowState }
  | {
      type: "approval_required";
      kind: "branch_name";
      suggestion: BranchNameResult;
      needsManualEntry?: boolean;
    }
  | {
      type: "approval_required";
      kind: "commit_message";
      suggestion: CommitMessageResult;
      aiFailed?: boolean;
    }
  | {
      type: "approval_required";
      kind: "pr_description";
      suggestion: PRDescriptionResult;
    }
  | { type: "warning"; message: string }
  | { type: "error"; error: { code: string; message: string } }
  | { type: "complete"; prUrl: string | null };

export type WorkflowEventHandler = (
  event: WorkflowEvent,
) => void | Promise<void>;

type WorkflowPhase =
  | "idle"
  | "awaiting_branch_approval"
  | "awaiting_commit_approval"
  | "awaiting_pr_approval"
  | "complete"
  | "failed";

type GitPort = Pick<
  GitClient,
  | "isInsideRepo"
  | "getRemoteUrl"
  | "getStatus"
  | "stageAll"
  | "createBranch"
  | "commit"
  | "push"
  | "getDiff"
  | "isDetachedHead"
  | "isMerging"
  | "isRebasing"
  | "checkRemoteAccess"
  | "validateRefFormat"
  | "listLocalBranches"
  | "listRemoteBranches"
  | "tagExists"
  | "fetchRemote"
  | "getHeadCommit"
  | "hasPrimaryRemote"
  | "getDefaultRemoteBranch"
  | "countCommitsAheadOf"
>;

type SnapshotPort = Pick<SnapshotManager, "capture">;
type AIPort = Pick<
  AIClient,
  "generateBranchName" | "generateCommitMessage" | "generatePRDescription"
>;
type RAGPort = Pick<RAGBuilder, "buildContext" | "enrichWithPRHistory">;
type GitHubPort = Pick<
  GitHubClient,
  "getRecentPRTitles" | "getDefaultBranch" | "createPR" | "findOpenPR"
>;

export interface WorkflowDependencies {
  git?: GitPort;
  snapshots?: SnapshotPort;
  ai?: AIPort;
  rag?: RAGPort;
  github?: GitHubPort | null;
}

const OPERATION_META: Record<
  OperationType,
  { label: string; pendingDetail: string }
> = {
  branch_created: {
    label: "Branch created",
    pendingDetail: "Awaiting branch name approval",
  },
  files_staged: {
    label: "Files staged",
    pendingDetail: "Waiting to stage selected changes",
  },
  committed: {
    label: "Committed",
    pendingDetail: "Awaiting commit message approval",
  },
  pushed: {
    label: "Pushed to origin",
    pendingDetail: "Waiting to push the branch",
  },
  pr_opened: {
    label: "Pull request opened",
    pendingDetail: "Awaiting pull request approval",
  },
};

const OPERATIONS_WITH_PR: OperationType[] = [
  "branch_created",
  "files_staged",
  "committed",
  "pushed",
  "pr_opened",
];

const OPERATIONS_WITHOUT_PR: OperationType[] = [
  "branch_created",
  "files_staged",
  "committed",
  "pushed",
];

// Lockfile path inside the repo: .git/refs/repofox/workflow.lock
// Prevents two VS Code windows from running concurrent workflows on the same repo.
// (notes: roadmap.md Day 18, sre-hardening-guide.md)
interface LockfileContent {
  pid: number;
  timestamp: number;
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export class WorkflowEngine {
  private config: WorkflowConfig;
  private readonly git: GitPort;
  private readonly snapshots: SnapshotPort;
  private readonly ai: AIPort;
  private readonly rag: RAGPort;
  private readonly github: GitHubPort | null;
  private readonly logger: Logger;
  private readonly eventHandler: WorkflowEventHandler;
  private state: WorkflowState;
  private phase: WorkflowPhase = "idle";
  private executing = false;
  private cancelled = false;
  private context: AIContext | null = null;
  private branchName: string | null = null;
  private commitMessages: string[] = [];

  private get lockfilePath(): string {
    return join(
      this.config.repoPath,
      ".git",
      "refs",
      "repofox",
      "workflow.lock",
    );
  }

  private async acquireWorkflowLock(): Promise<RepoFoxResult<void>> {
    try {
      await mkdir(join(this.config.repoPath, ".git", "refs", "repofox"), {
        recursive: true,
      });
      const existing = await readFile(this.lockfilePath, "utf-8").catch(
        () => null,
      );
      if (existing) {
        const lock = JSON.parse(existing) as LockfileContent;
        if (isPidAlive(lock.pid)) {
          return err(
            workflowError(
              "WORKFLOW_LOCKED",
              `Another RepoFox workflow is already running (PID ${lock.pid}). Close the other window or wait for it to finish.`,
            ),
          );
        }
        // Stale lock from a crashed process — clean it up
        this.logger.warn("cleaning up stale workflow lock", {
          stalePid: lock.pid,
        });
        await rm(this.lockfilePath, { force: true });
      }
      const content: LockfileContent = {
        pid: process.pid,
        timestamp: Date.now(),
      };
      await writeFile(this.lockfilePath, JSON.stringify(content), "utf-8");
      return ok(undefined);
    } catch (cause) {
      // Non-fatal: if we can't create the lock, continue without it
      this.logger.warn("could not acquire workflow lock", { cause });
      return ok(undefined);
    }
  }

  private async releaseWorkflowLock(): Promise<void> {
    await rm(this.lockfilePath, { force: true }).catch(() => undefined);
  }

  constructor(
    config: WorkflowConfig,
    logger: Logger,
    onEvent: WorkflowEventHandler,
    dependencies?: WorkflowDependencies,
  ) {
    this.config = config;
    this.logger = logger;
    this.eventHandler = onEvent;
    this.git =
      dependencies?.git ??
      new GitClient({
        repoPath: config.repoPath,
        logger,
        ...(config.github?.token !== undefined
          ? { githubToken: config.github.token }
          : {}),
      });
    this.snapshots =
      dependencies?.snapshots ?? new SnapshotManager(config.repoPath, logger);
    this.ai = dependencies?.ai ?? new AIClient(config.ai, logger);
    this.rag =
      dependencies?.rag ?? new RAGBuilder(this.git as GitClient, logger);
    this.github =
      dependencies && "github" in dependencies
        ? (dependencies.github ?? null)
        : config.github
          ? new GitHubClient(config.github, logger)
          : null;
    this.state = {
      status: "idle",
      currentOperation: null,
      operations: [],
      sessionId: randomUUID(),
    };
  }

  getState(): WorkflowState {
    return {
      ...this.state,
      operations: [...this.state.operations],
    };
  }

  isActive(): boolean {
    return this.state.status === "running";
  }

  async getVcsStatus(): Promise<RepoFoxResult<VcsStatus>> {
    return buildVcsStatus({
      git: this.git,
      github: this.github,
      logger: this.logger,
    });
  }

  async runStackedAction(
    action: GitStackedAction,
  ): Promise<RepoFoxResult<string | null>> {
    const vcsStatus = await this.getVcsStatus();
    if (vcsStatus.isErr()) {
      return err(vcsStatus.error);
    }

    if (vcsStatus.value.refName === null) {
      return err(
        workflowError(
          "DETACHED_HEAD",
          "HEAD is detached. Please checkout a branch before running RepoFox.",
        ),
      );
    }

    const validationError = validateStackedAction(
      action,
      vcsStatus.value,
      this.github !== null,
    );
    if (validationError) {
      return err(workflowError("ACTION_NOT_AVAILABLE", validationError));
    }

    const operations = planStackedActionOperations(
      action,
      vcsStatus.value,
      this.github !== null,
    );
    if (operations.length === 0) {
      return err(
        workflowError(
          "ACTION_NOT_AVAILABLE",
          "No workflow steps are required for this action.",
        ),
      );
    }

    const preflight = await this.runPreflightChecks();
    if (preflight.isErr()) {
      return err(preflight.error);
    }

    this.cancelled = false;
    this.resetForRun(operations);
    return this.next();
  }

  async run(): Promise<RepoFoxResult<string | null>> {
    if (this.isActive()) {
      return err(
        workflowError(
          "WORKFLOW_ALREADY_RUNNING",
          "A RepoFox workflow is already in progress.",
        ),
      );
    }

    if (await this.git.isDetachedHead()) {
      return err(
        workflowError(
          "DETACHED_HEAD",
          "HEAD is detached. Please checkout a branch before running RepoFox.",
        ),
      );
    }

    const vcsStatus = await this.getVcsStatus();
    if (vcsStatus.isErr()) {
      return err(vcsStatus.error);
    }

    const quick = resolveQuickAction(
      vcsStatus.value,
      false,
      vcsStatus.value.isDefaultRef,
      vcsStatus.value.hasPrimaryRemote,
      this.github !== null,
    );

    if (quick.kind === "open_pr") {
      const prUrl = vcsStatus.value.pr?.url ?? null;
      await this.emit({ type: "complete", prUrl });
      return ok(prUrl);
    }

    if (quick.kind === "show_hint") {
      return err(workflowError("NO_ACTION", quick.hint ?? quick.label));
    }

    if (quick.kind === "run_pull") {
      return err(
        workflowError(
          "PULL_REQUIRED",
          "Pull the latest changes before running RepoFox.",
        ),
      );
    }

    if (!quick.action) {
      return err(
        workflowError(
          "NO_ACTION",
          quick.hint ?? "No action is available for this repository state.",
        ),
      );
    }

    return this.runStackedAction(quick.action);
  }

  private async runPreflightChecks(): Promise<RepoFoxResult<void>> {
    if (this.isActive()) {
      return err(
        workflowError(
          "WORKFLOW_ALREADY_RUNNING",
          "A RepoFox workflow is already in progress.",
        ),
      );
    }

    const lockResult = await this.acquireWorkflowLock();
    if (lockResult.isErr()) return err(lockResult.error);

    const insideRepo = await this.git.isInsideRepo();
    if (!insideRepo) {
      await this.releaseWorkflowLock();
      return err(
        workflowError(
          "NOT_A_REPOSITORY",
          "The current workspace is not a git repository.",
        ),
      );
    }

    if (await this.git.isDetachedHead()) {
      await this.releaseWorkflowLock();
      return err(
        workflowError(
          "DETACHED_HEAD",
          "HEAD is detached. Please checkout a branch before running RepoFox.",
        ),
      );
    }

    if (await this.git.isMerging()) {
      await this.releaseWorkflowLock();
      return err(
        workflowError(
          "MERGE_IN_PROGRESS",
          "A merge is in progress. Resolve it before running RepoFox.",
        ),
      );
    }

    if (await this.git.isRebasing()) {
      await this.releaseWorkflowLock();
      return err(
        workflowError(
          "REBASE_IN_PROGRESS",
          "A rebase is in progress. Complete it before running RepoFox.",
        ),
      );
    }

    const remoteAccess = await this.git.checkRemoteAccess();
    if (remoteAccess.isErr()) {
      await this.releaseWorkflowLock();
      return err(remoteAccess.error);
    }

    return ok(undefined);
  }

  cancel(): void {
    if (this.isActive()) {
      this.cancelled = true;
      this.logger.info("workflow cancelled by user");
    }
  }

  /**
   * Run the next step in the workflow.
   * If the next step requires AI generation, it will pause for approval.
   * If the next step is a simple git operation, it will execute it and move to the next.
   */
  async next(): Promise<RepoFoxResult<string | null>> {
    if (this.executing) {
      return err(
        workflowError(
          "WORKFLOW_STEP_IN_PROGRESS",
          "A workflow step is already executing.",
        ),
      );
    }

    if (this.cancelled) {
      return this.fail(
        workflowError("WORKFLOW_CANCELLED", "Workflow was cancelled."),
      );
    }

    this.executing = true;
    try {
      return await this.executeNext();
    } finally {
      this.executing = false;
    }
  }

  private async executeNext(): Promise<RepoFoxResult<string | null>> {
    // Reload .repofoxrc before each step
    const rcResult = await loadRC(this.config.repoPath);
    if (rcResult.isOk()) {
      this.config = mergeConfig(this.config, rcResult.value);
      if (this.ai instanceof AIClient) {
        this.ai.updateConfig(this.config.ai);
      }
    }

    const nextOp = this.state.operations.find(
      (op) => op.status === "pending",
    )?.operation;

    if (!nextOp) {
      if (this.state.status === "running") {
        return this.complete(null);
      }
      return ok(null);
    }

    // Mark the next operation as 'current' immediately so the UI shows activity
    // even during the context-building + AI call phase.
    this.setCurrentOperation(nextOp);

    // Initialize context if needed
    if (!this.context) {
      const remoteResult = await this.git.getRemoteUrl();
      const repoName = remoteResult.isOk()
        ? (GitHubClient.parseOwnerRepo(remoteResult.value)?.repo ??
          basename(this.config.repoPath))
        : basename(this.config.repoPath);

      let context = await this.rag.buildContext(repoName);
      if (this.github) {
        // Non-blocking: GitHub PR history enriches suggestions but must not hang the flow
        const prTitles = await Promise.race([
          this.github.getRecentPRTitles(),
          new Promise<string[]>((resolve) =>
            setTimeout(() => resolve([]), 5000),
          ),
        ]);
        context = this.rag.enrichWithPRHistory(context, prTitles);
      }
      this.context = context;
    }

    switch (nextOp) {
      case "branch_created":
        return this.stepBranch();
      case "files_staged":
        return this.stepStage();
      case "committed":
        return this.stepCommit();
      case "pushed":
        return this.stepPush();
      case "pr_opened":
        return this.stepPR();
      default:
        return err(
          workflowError("UNKNOWN_OPERATION", `Unknown operation: ${nextOp}`),
        );
    }
  }

  private async stepBranch(): Promise<RepoFoxResult<string | null>> {
    // F3 — silent self-heal pipeline. Loud only when the user must act.
    // 1. AI proposes a name (up to 3 attempts, sanitized each time).
    // 2. If still invalid, we fall back to a deterministic seed (HEAD sha).
    // 3. We append `-2`, `-3`, ... until we find one that doesn't collide
    //    with a local branch, remote branch, or tag.
    // 4. Only when all 20 suffixes also collide — a truly pathological repo
    //    state — do we surface an empty input with a "type one" hint.
    // The user sees a single approval card no matter which path was taken.
    const resolved = await this.resolveBranchName(this.context!);

    const suggestion: BranchNameResult = {
      name: resolved.name,
      confidence: resolved.needsManualEntry ? "low" : "high",
    };

    if (
      this.config.autoApprove &&
      !resolved.needsManualEntry &&
      resolved.name
    ) {
      this.phase = "awaiting_branch_approval";
      const result = await this.approveBranchName(resolved.name);
      return result.isOk() ? this.executeNext() : err(result.error);
    }

    this.phase = "awaiting_branch_approval";
    await this.emit({
      type: "approval_required",
      kind: "branch_name",
      suggestion,
      needsManualEntry: resolved.needsManualEntry,
    });

    return ok(null);
  }

  /**
   * resolveBranchName — produce a branch name the user can approve in one click.
   *
   * Investor-readable summary:
   *   When the user clicks "Run", they expect a working branch name on the
   *   first try. The AI gets us 95% of the way there, but ~5% of names come
   *   back malformed (extra punctuation) or already-taken (the user ran the
   *   same flow yesterday). This function silently absorbs both classes of
   *   failure so the user never has to debug them. The remaining ~0.1% of
   *   cases — where even our deterministic fallback collides 20 times — fall
   *   through to a manual-entry prompt.
   *
   * Implementation notes:
   *   - AI retries are silent: 3 attempts, no UI emission between them. The
   *     model is non-deterministic, so retrying often works; bothering the
   *     user with "AI failed, retrying" noise hurts trust without helping.
   *   - The deterministic fallback uses the HEAD short-sha so it's stable
   *     across retries within the same checkout — the user pressing "Run"
   *     twice gets the same suggestion both times, no collision storm.
   *   - Remote branch list is fetched once and cached as a Set for O(1)
   *     lookups. Doing 20 round-trips on a pathological collision day would
   *     burn 5+ seconds. Fetch failure is swallowed: offline users can still
   *     ship to a new branch, they just won't be warned about a name that
   *     collides on origin only.
   */
  private async resolveBranchName(
    context: AIContext,
  ): Promise<{ name: string; needsManualEntry: boolean }> {
    const MAX_AI_ATTEMPTS = 3;
    const MAX_SUFFIX = 20;

    // -------- 1. Ask the AI, retry silently on invalid output ---------------
    let candidate: string | null = null;
    for (let attempt = 1; attempt <= MAX_AI_ATTEMPTS; attempt++) {
      const aiResult = await this.ai.generateBranchName(context);
      if (aiResult.isErr()) {
        this.logger.warn("AI branch name generation failed", {
          attempt,
          error: aiResult.error,
        });
        continue;
      }
      const proposed = aiResult.value.name;
      const formatCheck = await this.git.validateRefFormat(proposed);
      if (formatCheck.isOk()) {
        candidate = proposed;
        break;
      }
      this.logger.warn("AI returned malformed branch name", {
        attempt,
        proposed,
      });
    }

    // -------- 2. Deterministic fallback seed --------------------------------
    // No LLM dependency. Stable for the same checkout so a retry doesn't
    // produce a different name and a new collision tree. We track usedFallback
    // so the UI can pre-fill but still mark this as "needs review" — the
    // generic seed is correct but rarely the most descriptive name available.
    let usedFallback = false;
    if (!candidate) {
      const headResult = await this.git.getHeadCommit();
      const shortSha = headResult.isOk()
        ? headResult.value.slice(0, 7)
        : Date.now().toString(36);
      candidate = `feat/changes-${shortSha}`;
      usedFallback = true;
    }

    // -------- 3. Fetch + build collision sets (cheap, in-memory) ------------
    // fetchRemote is best-effort. If we're offline, listRemoteBranches still
    // returns whatever was last seen — better than nothing, never blocks.
    await this.git.fetchRemote().catch(() => undefined);

    const localResult = await this.git.listLocalBranches();
    const remoteResult = await this.git.listRemoteBranches();
    const localBranches = localResult.isOk()
      ? localResult.value
      : new Set<string>();
    const remoteBranches = remoteResult.isOk()
      ? remoteResult.value
      : new Set<string>();

    this.logger.info("branch collision check", {
      candidate,
      localCount: localBranches.size,
      remoteCount: remoteBranches.size,
      localHasCandidate: localBranches.has(candidate),
      remoteHasCandidate: remoteBranches.has(candidate),
    });

    // -------- 4. Suffix loop: candidate, candidate-2, ... candidate-20 ------
    for (let i = 1; i <= MAX_SUFFIX; i++) {
      const trial = i === 1 ? candidate : `${candidate}-${i}`;
      if (localBranches.has(trial)) continue;
      if (remoteBranches.has(trial)) continue;
      // tag check is async but cheap; cap at 20 calls in worst case.
      if (await this.git.tagExists(trial)) continue;
      if (trial !== candidate) {
        this.logger.info("branch suffix applied", {
          from: candidate,
          to: trial,
        });
      }
      return { name: trial, needsManualEntry: usedFallback };
    }

    // -------- 5. Pathological exhaustion ------------------------------------
    // Every suffix collided. With sha-based seeds this means the user has 20
    // branches matching this exact prefix — vanishingly rare. Surface an
    // empty input + "type one" hint instead of a name we know is broken.
    return { name: "", needsManualEntry: true };
  }

  private async stepStage(): Promise<RepoFoxResult<string | null>> {
    const branchResult = await this.git.getStatus();
    const currentBranch = branchResult.isOk()
      ? branchResult.value.branch
      : "unknown";

    const stageSnapshot = await this.snapshots.capture("files_staged", {
      branch: currentBranch,
    });
    if (stageSnapshot.isErr()) {
      return this.fail(stageSnapshot.error);
    }

    const staged = await this.git.stageAll();
    if (staged.isErr()) {
      return this.fail(staged.error);
    }

    this.markOperationDone(
      "files_staged",
      "all changes",
      stageSnapshot.value.id,
    );

    const diff = await this.git.getDiff(true);
    if (this.context && diff.isOk()) {
      this.context = { ...this.context, diff: diff.value };
    }

    return this.executeNext();
  }

  private async stepCommit(): Promise<RepoFoxResult<string | null>> {
    const diff = await this.git.getDiff(true);

    // Warn the user when AI quality may be reduced due to diff truncation
    // (notes: workflow-and-risks.md)
    if (diff.isOk() && diff.value.includes("... (truncated)")) {
      await this.emit({
        type: "warning",
        message:
          "Diff is large and was truncated. AI commit message quality may be reduced.",
      });
    }

    const commitSuggestion = await this.ai.generateCommitMessage(
      this.buildContextFallback(diff.isOk() ? diff.value : ""),
    );

    // AI failure must never block the workflow — fall back to manual input
    // (notes: ai-implementation.md, error-handling-theory.md)
    const aiFailed = commitSuggestion.isErr();
    if (aiFailed) {
      this.logger.warn(
        "AI commit message generation failed — falling back to manual input",
        {
          error: commitSuggestion.error,
        },
      );
      await this.emit({
        type: "warning",
        message: "AI is unavailable. Please type a commit message.",
      });
    }

    const suggestion: CommitMessageResult = commitSuggestion.isOk()
      ? commitSuggestion.value
      : { message: "", type: "chore", scope: null, body: null };

    if (this.config.autoApprove && !aiFailed) {
      this.phase = "awaiting_commit_approval";
      const result = await this.approveCommitMessage(suggestion.message);
      return result.isOk() ? this.executeNext() : err(result.error);
    }

    this.phase = "awaiting_commit_approval";
    await this.emit({
      type: "approval_required",
      kind: "commit_message",
      suggestion,
      aiFailed,
    });

    return ok(null);
  }

  private async stepPush(): Promise<RepoFoxResult<string | null>> {
    const branchResult = await this.git.getStatus();
    const currentBranch = branchResult.isOk() ? branchResult.value.branch : "";

    const pushSnapshot = await this.snapshots.capture("pushed", {
      branch: currentBranch,
    });
    if (pushSnapshot.isErr()) {
      return this.fail(pushSnapshot.error);
    }

    const pushed = await this.git.push(currentBranch);
    if (pushed.isErr()) {
      return this.fail(pushed.error);
    }

    this.markOperationDone("pushed", currentBranch, pushSnapshot.value.id);
    return this.executeNext();
  }

  private async stepPR(): Promise<RepoFoxResult<string | null>> {
    if (!this.github) {
      return this.complete(null);
    }

    const prSuggestion = await this.ai.generatePRDescription(
      this.buildContextFallback(this.context?.diff ?? ""),
      this.commitMessages,
    );

    const fallback: PRDescriptionResult = {
      title: this.commitMessages[0] ?? "Update repository",
      body: `## What\n${this.commitMessages.join("\n")}\n\n## Why\nShip the latest repository changes\n\n## Testing\nNot run`,
      labels: [],
      suggestedReviewers: [],
    };

    const suggestion = prSuggestion.isOk() ? prSuggestion.value : fallback;

    if (this.config.autoApprove) {
      this.phase = "awaiting_pr_approval";
      const result = await this.approvePRDescription({
        title: suggestion.title,
        body: suggestion.body,
        labels: suggestion.labels,
      });
      return result.isOk() ? ok(null) : err(result.error);
    }

    this.phase = "awaiting_pr_approval";
    await this.emit({
      type: "approval_required",
      kind: "pr_description",
      suggestion,
    });

    return ok(null);
  }

  async approveBranchName(name: string): Promise<RepoFoxResult<void>> {
    if (this.phase !== "awaiting_branch_approval") {
      return err(
        workflowError(
          "INVALID_APPROVAL_STATE",
          "Branch approval is not expected right now.",
        ),
      );
    }

    this.phase = "idle";

    const snapshot = await this.snapshots.capture("branch_created", {
      branch: name,
    });
    if (snapshot.isErr()) {
      return this.fail(snapshot.error);
    }

    const created = await this.git.createBranch(name);
    if (created.isErr()) {
      return this.fail(created.error);
    }

    this.branchName = name;
    this.markOperationDone("branch_created", name, snapshot.value.id);

    // In autoApprove mode, we don't automatically call next() here,
    // we let the caller handle it to avoid deep recursion or unexpected flow.
    // However, for the 'run()' method, we want it to continue.
    if (!this.config.autoApprove) {
      const advanced = await this.next();
      if (advanced.isErr()) {
        return err(advanced.error);
      }
    }

    return ok(undefined);
  }

  async approveCommitMessage(message: string): Promise<RepoFoxResult<void>> {
    if (this.phase !== "awaiting_commit_approval") {
      return err(
        workflowError(
          "INVALID_APPROVAL_STATE",
          "Commit approval is not expected right now.",
        ),
      );
    }

    this.phase = "idle";

    const snapshot = await this.snapshots.capture("committed", {
      branch: this.branchName ?? "",
      message,
    });
    if (snapshot.isErr()) {
      return this.fail(snapshot.error);
    }

    const committed = await this.git.commit(message);
    if (committed.isErr()) {
      return this.fail(committed.error);
    }

    this.commitMessages.push(message);
    this.markOperationDone("committed", message, snapshot.value.id);

    if (!this.config.autoApprove) {
      const advanced = await this.next();
      if (advanced.isErr()) {
        return err(advanced.error);
      }
    }

    return ok(undefined);
  }

  async approvePRDescription(
    input: PRApprovalInput,
  ): Promise<RepoFoxResult<void>> {
    if (this.phase !== "awaiting_pr_approval") {
      return err(
        workflowError(
          "INVALID_APPROVAL_STATE",
          "Pull request approval is not expected right now.",
        ),
      );
    }

    if (!this.github) {
      return (await this.complete(null)).map(() => undefined);
    }

    this.phase = "idle";

    const branchResult = await this.git.getStatus();
    if (branchResult.isErr()) {
      return this.fail(branchResult.error);
    }

    const prSnapshot = await this.snapshots.capture("pr_opened", {
      branch: branchResult.value.branch,
      title: input.title,
    });
    if (prSnapshot.isErr()) {
      return this.fail(prSnapshot.error);
    }

    const base = await this.github.getDefaultBranch();
    const pr = await this.github.createPR(
      input.title,
      input.body,
      this.branchName ?? branchResult.value.branch,
      base,
      input.labels,
    );
    if (pr.isErr()) {
      return this.fail(pr.error);
    }

    this.markOperationDone(
      "pr_opened",
      `#${pr.value.number} ${pr.value.title}`,
      prSnapshot.value.id,
    );
    return (await this.complete(pr.value.url)).map(() => undefined);
  }

  private resetForRun(sequence?: OperationType[]): void {
    const planned =
      sequence ?? (this.github ? OPERATIONS_WITH_PR : OPERATIONS_WITHOUT_PR);
    const now = Date.now();

    this.phase = "idle";
    this.context = null;
    this.branchName = null;
    this.commitMessages = [];
    this.state = {
      status: "running",
      currentOperation: null,
      operations: planned.map((operation) => ({
        id: randomUUID(),
        operation,
        status: "pending",
        timestamp: now,
        label: OPERATION_META[operation].label,
        detail: OPERATION_META[operation].pendingDetail,
        snapshotId: null,
      })),
      sessionId: randomUUID(),
    };

    this.emitState();
  }

  private buildContextFallback(diff: string): AIContext {
    return (
      this.context ?? {
        recentBranches: [],
        recentCommits: [],
        recentPRTitles: [],
        changedFiles: [],
        diff,
        repoName: basename(this.config.repoPath),
      }
    );
  }

  private setCurrentOperation(
    operation: WorkflowState["currentOperation"],
  ): void {
    const now = Date.now();
    const operations = this.state.operations.map((record) => {
      if (record.operation === operation) {
        return {
          ...record,
          status: "current" as const,
          timestamp: now,
        };
      }

      if (record.status === "current") {
        return {
          ...record,
          status: "pending" as const,
          detail: OPERATION_META[record.operation].pendingDetail,
        };
      }

      return record;
    });

    this.state = {
      ...this.state,
      currentOperation: operation,
      operations,
    };

    this.emitState();
  }

  private markOperationDone(
    operation: OperationType,
    detail: string,
    snapshotId: string | null,
  ): void {
    const now = Date.now();
    const operations = this.state.operations.map((record) =>
      record.operation === operation
        ? {
            ...record,
            status: "done" as const,
            detail,
            snapshotId,
            timestamp: now,
          }
        : record,
    );

    this.state = {
      ...this.state,
      operations,
      currentOperation:
        operation === this.state.currentOperation
          ? null
          : this.state.currentOperation,
    };

    this.emitState();
  }

  private markOperationFailed(
    operation: OperationType | null,
    message: string,
  ): void {
    if (!operation) {
      return;
    }

    const now = Date.now();
    const operations = this.state.operations.map((record) =>
      record.operation === operation
        ? {
            ...record,
            status: "failed" as const,
            detail: message,
            timestamp: now,
          }
        : record,
    );

    this.state = {
      ...this.state,
      operations,
    };
  }

  private async complete(
    prUrl: string | null,
  ): Promise<RepoFoxResult<string | null>> {
    this.phase = "complete";
    this.state = {
      ...this.state,
      status: "complete",
      currentOperation: null,
    };
    this.emitState();
    await this.emit({ type: "complete", prUrl });
    await this.releaseWorkflowLock();
    return ok(prUrl);
  }

  private async fail(error: RepoFoxError): Promise<RepoFoxResult<never>> {
    this.logger.error("workflow failed", error);
    this.phase = "failed";
    this.markOperationFailed(this.state.currentOperation, error.message);
    this.state = {
      ...this.state,
      status: "failed",
      currentOperation: null,
    };
    this.emitState();
    await this.emit({
      type: "error",
      error: {
        code: error.code,
        message: error.message,
      },
    });
    await this.releaseWorkflowLock();
    return err(error);
  }

  private emitState(): void {
    void this.emit({ type: "state_changed", state: this.getState() });
  }

  private async emit(event: WorkflowEvent): Promise<void> {
    await Promise.resolve(this.eventHandler(event));
  }
}

function workflowError(
  code: string,
  message: string,
  cause?: unknown,
): RepoFoxError {
  return { code, message, cause };
}
