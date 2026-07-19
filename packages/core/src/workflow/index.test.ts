import { describe, expect, it, vi, beforeEach } from "vitest";
import { ok, err } from "neverthrow";
import {
  WorkflowEngine,
  type WorkflowDependencies,
  type WorkflowEvent,
} from "./index.js";
import type { AIContext, Logger, WorkflowConfig } from "../index.js";

// Prevent real filesystem writes (lockfile lives at repoPath/.git/refs/repofox/workflow.lock).
// Without this mock, the lockfile written by one test is found by the next, causing WORKFLOW_LOCKED
// errors because the test process PID is still alive across all tests.
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi
    .fn()
    .mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function createDependencies(
  withGitHub = false,
  branch = "feat/test-branch",
): WorkflowDependencies {
  const context: AIContext = {
    recentBranches: ["feat/existing-branch"],
    recentCommits: ["feat(core): existing commit"],
    recentPRTitles: [],
    changedFiles: ["src/index.ts"],
    diff: "diff --git a/src/index.ts b/src/index.ts",
    repoName: "repofox",
  };

  return {
    git: {
      isInsideRepo: vi.fn().mockResolvedValue(true),
      isDetachedHead: vi.fn().mockResolvedValue(false),
      getRemoteUrl: vi
        .fn()
        .mockResolvedValue(ok("git@github.com:repofox/repofox.git")),
      getStatus: vi.fn().mockResolvedValue(
        ok({
          branch,
          files: [],
          isClean: false,
          hasUntracked: false,
          ahead: 0,
          behind: 0,
          hasUpstream: true,
          trackingBranch: `origin/${branch}`,
        }),
      ),
      stageAll: vi.fn().mockResolvedValue(ok(undefined)),
      createBranch: vi.fn().mockResolvedValue(ok(undefined)),
      commit: vi.fn().mockResolvedValue(
        ok({
          hash: "abc123",
          message: "feat(core): add workflow tests",
          branch: "feat/test-branch",
          timestamp: Date.now(),
        }),
      ),
      push: vi.fn().mockResolvedValue(ok(undefined)),
      getDiff: vi.fn().mockResolvedValue(ok("staged diff")),
      isMerging: vi.fn().mockResolvedValue(false),
      isRebasing: vi.fn().mockResolvedValue(false),
      checkRemoteAccess: vi
        .fn()
        .mockResolvedValue(ok("https://github.com/repofox/repofox.git")),
      validateRefFormat: vi.fn().mockResolvedValue(ok(undefined)),
      listLocalBranches: vi.fn().mockResolvedValue(ok(new Set<string>())),
      listRemoteBranches: vi.fn().mockResolvedValue(ok(new Set<string>())),
      tagExists: vi.fn().mockResolvedValue(false),
      fetchRemote: vi.fn().mockResolvedValue(ok(undefined)),
      getHeadCommit: vi
        .fn()
        .mockResolvedValue(ok("abc1234deadbeefcafebabe1234567890abcdef0")),
      hasPrimaryRemote: vi.fn().mockResolvedValue(true),
      getDefaultRemoteBranch: vi.fn().mockResolvedValue(ok("main")),
      countCommitsAheadOf: vi.fn().mockResolvedValue(ok(0)),
    },
    snapshots: {
      capture: vi
        .fn()
        .mockResolvedValueOnce(
          ok({
            id: "snapshot-branch",
            operation: "branch_created",
            timestamp: Date.now(),
            branchRef: "ref: refs/heads/main",
            stashRef: null,
            metadata: {},
            repoPath: "/tmp/repofox",
          }),
        )
        .mockResolvedValueOnce(
          ok({
            id: "snapshot-stage",
            operation: "files_staged",
            timestamp: Date.now(),
            branchRef: "ref: refs/heads/main",
            stashRef: null,
            metadata: {},
            repoPath: "/tmp/repofox",
          }),
        )
        .mockResolvedValueOnce(
          ok({
            id: "snapshot-commit",
            operation: "committed",
            timestamp: Date.now(),
            branchRef: "ref: refs/heads/main",
            stashRef: null,
            metadata: {},
            repoPath: "/tmp/repofox",
          }),
        )
        .mockResolvedValueOnce(
          ok({
            id: "snapshot-push",
            operation: "pushed",
            timestamp: Date.now(),
            branchRef: "ref: refs/heads/main",
            stashRef: null,
            metadata: {},
            repoPath: "/tmp/repofox",
          }),
        )
        .mockResolvedValueOnce(
          ok({
            id: "snapshot-pr",
            operation: "pr_opened",
            timestamp: Date.now(),
            branchRef: "ref: refs/heads/main",
            stashRef: null,
            metadata: {},
            repoPath: "/tmp/repofox",
          }),
        ),
    },
    ai: {
      generateBranchName: vi
        .fn()
        .mockResolvedValue(
          ok({ name: "feat/test-branch", confidence: "high" }),
        ),
      generateCommitMessage: vi.fn().mockResolvedValue(
        ok({
          message: "feat(core): add workflow tests",
          type: "feat",
          scope: "core",
          body: null,
        }),
      ),
      generatePRDescription: vi.fn().mockResolvedValue(
        ok({
          title: "feat: add workflow tests",
          body: "## What\nAdd tests\n\n## Why\nIncrease confidence\n\n## Testing\nvitest",
          labels: ["test"],
          suggestedReviewers: [],
        }),
      ),
    },
    rag: {
      buildContext: vi.fn().mockResolvedValue(context),
      enrichWithPRHistory: vi.fn().mockImplementation((value) => value),
    },
    github: withGitHub
      ? {
          getRecentPRTitles: vi.fn().mockResolvedValue(["feat: previous PR"]),
          getDefaultBranch: vi.fn().mockResolvedValue("main"),
          findOpenPR: vi.fn().mockResolvedValue(null),
          createPR: vi.fn().mockResolvedValue(
            ok({
              number: 42,
              url: "https://github.com/repofox/repofox/pull/42",
              title: "feat: add workflow tests",
              body: "body",
              state: "open",
            }),
          ),
        }
      : null,
  };
}

function createLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createConfig(): WorkflowConfig {
  return {
    ai: {
      provider: "groq",
      apiKey: "test-key",
    },
    github: null,
    repoPath: "/tmp/repofox",
    autoApprove: false,
  };
}

describe("WorkflowEngine", () => {
  it("initializes operations and requests branch approval on run from default branch", async () => {
    const events: WorkflowEvent[] = [];
    const engine = new WorkflowEngine(
      createConfig(),
      createLogger(),
      (event) => {
        events.push(event);
      },
      createDependencies(false, "main"),
    );

    const result = await engine.run();

    expect(result.isOk()).toBe(true);
    expect(engine.getState().status).toBe("running");
    expect(engine.getState().currentOperation).toBe("branch_created");
    expect(
      engine.getState().operations.map((operation) => operation.status),
    ).toEqual(["current", "pending", "pending", "pending"]);
    expect(
      events.some(
        (event) =>
          event.type === "approval_required" && event.kind === "branch_name",
      ),
    ).toBe(true);
  });

  it("starts on feature branch without recreating the branch", async () => {
    const engine = new WorkflowEngine(
      createConfig(),
      createLogger(),
      () => undefined,
      createDependencies(false),
    );

    const result = await engine.run();

    expect(result.isOk()).toBe(true);
    expect(engine.getState().currentOperation).toBe("committed");
    expect(
      engine.getState().operations.map((operation) => operation.operation),
    ).toEqual(["files_staged", "committed", "pushed"]);
  });

  it("reports detached HEAD before quick-action planning", async () => {
    const dependencies = createDependencies(false, "");
    dependencies.git!.isDetachedHead = vi.fn().mockResolvedValue(true);
    const engine = new WorkflowEngine(
      createConfig(),
      createLogger(),
      () => undefined,
      dependencies,
    );

    const result = await engine.run();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("DETACHED_HEAD");
      expect(result.error.message).toBe(
        "HEAD is detached. Please checkout a branch before running RepoFox.",
      );
    }
    expect(dependencies.git!.checkRemoteAccess).not.toHaveBeenCalled();
  });

  it("reports detached HEAD before a selected action is planned", async () => {
    const dependencies = createDependencies(false, "HEAD");
    dependencies.git!.isDetachedHead = vi.fn().mockResolvedValue(true);
    dependencies.git!.getStatus = vi.fn().mockResolvedValue(
      ok({
        branch: "HEAD",
        files: [],
        isClean: true,
        hasUntracked: false,
        ahead: 0,
        behind: 0,
        hasUpstream: true,
        trackingBranch: "origin/main",
      }),
    );
    const engine = new WorkflowEngine(
      createConfig(),
      createLogger(),
      () => undefined,
      dependencies,
    );

    const result = await engine.runStackedAction("commit");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("DETACHED_HEAD");
      expect(result.error.message).toBe(
        "HEAD is detached. Please checkout a branch before running RepoFox.",
      );
    }
    expect(dependencies.git!.checkRemoteAccess).not.toHaveBeenCalled();
  });

  it("rejects approvals that arrive out of order", async () => {
    const engine = new WorkflowEngine(
      createConfig(),
      createLogger(),
      () => undefined,
      createDependencies(false),
    );

    const result = await engine.approveCommitMessage(
      "feat(core): invalid approval",
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("INVALID_APPROVAL_STATE");
    }
  });

  it("completes a stacked workflow without GitHub and keeps operation statuses consistent", async () => {
    const engine = new WorkflowEngine(
      createConfig(),
      createLogger(),
      () => undefined,
      createDependencies(false),
    );

    await engine.run();
    const result = await engine.approveCommitMessage(
      "feat(core): add workflow tests",
    );

    expect(result.isOk()).toBe(true);
    expect(engine.getState().status).toBe("complete");
    expect(
      engine.getState().operations.map((operation) => operation.status),
    ).toEqual(["done", "done", "done"]);
  });

  it("prevents a second run while a workflow is already active", async () => {
    const engine = new WorkflowEngine(
      createConfig(),
      createLogger(),
      () => undefined,
      createDependencies(false),
    );

    await engine.run();
    const secondRun = await engine.run();

    expect(secondRun.isErr()).toBe(true);
    if (secondRun.isErr()) {
      expect(secondRun.error.code).toBe("WORKFLOW_ALREADY_RUNNING");
    }
  });

  it("continues to PR approval when GitHub is configured", async () => {
    const events: WorkflowEvent[] = [];
    const engine = new WorkflowEngine(
      {
        ...createConfig(),
        github: {
          token: "github-token",
          owner: "repofox",
          repo: "repofox",
        },
      },
      createLogger(),
      (event) => {
        events.push(event);
      },
      createDependencies(true),
    );

    await engine.run();
    await engine.approveCommitMessage("feat(core): add workflow tests");

    expect(engine.getState().currentOperation).toBe("pr_opened");
    expect(
      events.some(
        (event) =>
          event.type === "approval_required" && event.kind === "pr_description",
      ),
    ).toBe(true);
  });
});

// =============================================================================
// F3 — Branch name validation pipeline
//
// These tests cover the silent self-heal contract documented in
// resolveBranchName(). The user must see exactly one approval card,
// regardless of how many AI retries or suffix attempts happened underneath.
// =============================================================================
describe("WorkflowEngine — F3 branch name validation", () => {
  const mainBranchDeps = () => createDependencies(false, "main");

  it("uses the AI suggestion when it is valid and unused", async () => {
    const events: WorkflowEvent[] = [];
    const deps = mainBranchDeps();
    const engine = new WorkflowEngine(
      createConfig(),
      createLogger(),
      (e) => {
        events.push(e);
      },
      deps,
    );

    await engine.run();

    const approval = events.find(
      (e) => e.type === "approval_required" && e.kind === "branch_name",
    );
    expect(approval).toBeDefined();
    if (
      approval &&
      approval.type === "approval_required" &&
      approval.kind === "branch_name"
    ) {
      expect(approval.suggestion.name).toBe("feat/test-branch");
      expect(approval.needsManualEntry).toBe(false);
    }
  });

  it("silently appends -2 when the AI name collides with a local branch", async () => {
    const events: WorkflowEvent[] = [];
    const deps = mainBranchDeps();
    deps.git!.listLocalBranches = vi
      .fn()
      .mockResolvedValue(ok(new Set(["feat/test-branch"])));

    const engine = new WorkflowEngine(
      createConfig(),
      createLogger(),
      (e) => {
        events.push(e);
      },
      deps,
    );
    await engine.run();

    const approval = events.find(
      (e) => e.type === "approval_required" && e.kind === "branch_name",
    );
    if (
      approval &&
      approval.type === "approval_required" &&
      approval.kind === "branch_name"
    ) {
      expect(approval.suggestion.name).toBe("feat/test-branch-2");
      expect(approval.needsManualEntry).toBe(false);
    }
    // Critically: only ONE approval emitted. No "name was taken, here's another"
    // intermediate noise.
    const approvalCount = events.filter(
      (e) => e.type === "approval_required" && e.kind === "branch_name",
    ).length;
    expect(approvalCount).toBe(1);
  });

  it("skips a name that collides with a remote branch", async () => {
    const events: WorkflowEvent[] = [];
    const deps = mainBranchDeps();
    deps.git!.listRemoteBranches = vi
      .fn()
      .mockResolvedValue(ok(new Set(["feat/test-branch"])));

    const engine = new WorkflowEngine(
      createConfig(),
      createLogger(),
      (e) => {
        events.push(e);
      },
      deps,
    );
    await engine.run();

    const approval = events.find(
      (e) => e.type === "approval_required" && e.kind === "branch_name",
    );
    if (
      approval &&
      approval.type === "approval_required" &&
      approval.kind === "branch_name"
    ) {
      expect(approval.suggestion.name).toBe("feat/test-branch-2");
    }
  });

  it("skips a name that collides with a tag", async () => {
    const events: WorkflowEvent[] = [];
    const deps = mainBranchDeps();
    deps.git!.tagExists = vi
      .fn()
      .mockImplementation(async (n: string) => n === "feat/test-branch");

    const engine = new WorkflowEngine(
      createConfig(),
      createLogger(),
      (e) => {
        events.push(e);
      },
      deps,
    );
    await engine.run();

    const approval = events.find(
      (e) => e.type === "approval_required" && e.kind === "branch_name",
    );
    if (
      approval &&
      approval.type === "approval_required" &&
      approval.kind === "branch_name"
    ) {
      expect(approval.suggestion.name).toBe("feat/test-branch-2");
    }
  });

  it("retries the AI silently when it returns a malformed name, then accepts a clean attempt", async () => {
    const events: WorkflowEvent[] = [];
    const deps = mainBranchDeps();
    // First call: garbage that fails ref-format. Second call: clean.
    deps.ai!.generateBranchName = vi
      .fn()
      .mockResolvedValueOnce(ok({ name: "feat: bad name", confidence: "high" }))
      .mockResolvedValueOnce(
        ok({ name: "feat/clean-name", confidence: "high" }),
      );
    deps.git!.validateRefFormat = vi
      .fn()
      .mockImplementation(async (n: string) => {
        if (n === "feat: bad name")
          return err({ code: "BRANCH_NAME_INVALID", message: "bad" });
        return ok(undefined);
      });

    const engine = new WorkflowEngine(
      createConfig(),
      createLogger(),
      (e) => {
        events.push(e);
      },
      deps,
    );
    await engine.run();

    expect(deps.ai!.generateBranchName).toHaveBeenCalledTimes(2);
    const approval = events.find(
      (e) => e.type === "approval_required" && e.kind === "branch_name",
    );
    if (
      approval &&
      approval.type === "approval_required" &&
      approval.kind === "branch_name"
    ) {
      expect(approval.suggestion.name).toBe("feat/clean-name");
      expect(approval.needsManualEntry).toBe(false);
    }
    // No intermediate emit between AI retries.
    expect(events.filter((e) => e.type === "warning")).toHaveLength(0);
  });

  it("falls back to a deterministic seed when all AI attempts return invalid names", async () => {
    const events: WorkflowEvent[] = [];
    const deps = mainBranchDeps();
    deps.ai!.generateBranchName = vi
      .fn()
      .mockResolvedValue(ok({ name: "feat: still bad", confidence: "high" }));
    // Validation rejects every AI attempt; accepts the seed.
    deps.git!.validateRefFormat = vi
      .fn()
      .mockImplementation(async (n: string) => {
        if (n.startsWith("feat/changes-")) return ok(undefined);
        return err({ code: "BRANCH_NAME_INVALID", message: "bad" });
      });

    const engine = new WorkflowEngine(
      createConfig(),
      createLogger(),
      (e) => {
        events.push(e);
      },
      deps,
    );
    await engine.run();

    expect(deps.ai!.generateBranchName).toHaveBeenCalledTimes(3);
    const approval = events.find(
      (e) => e.type === "approval_required" && e.kind === "branch_name",
    );
    if (
      approval &&
      approval.type === "approval_required" &&
      approval.kind === "branch_name"
    ) {
      // Pre-filled seed (the user can keep it with one click) but flagged as
      // needing review since it's the generic deterministic fallback.
      expect(approval.suggestion.name).toMatch(/^feat\/changes-/);
      expect(approval.needsManualEntry).toBe(true);
    }
  });

  it("emits an empty suggestion only when 20 suffixes all collide (offline pathological)", async () => {
    const events: WorkflowEvent[] = [];
    const deps = mainBranchDeps();
    // Simulate offline: fetch fails. Local list contains every possible
    // suffix of the AI name. Tests that fetch failure does not crash and
    // that exhaustion produces empty + needsManualEntry.
    deps.git!.fetchRemote = vi
      .fn()
      .mockResolvedValue(err({ code: "GIT_FETCH_FAILED", message: "offline" }));
    const colliding = new Set<string>(["feat/test-branch"]);
    for (let i = 2; i <= 20; i++) colliding.add(`feat/test-branch-${i}`);
    deps.git!.listLocalBranches = vi.fn().mockResolvedValue(ok(colliding));

    const engine = new WorkflowEngine(
      createConfig(),
      createLogger(),
      (e) => {
        events.push(e);
      },
      deps,
    );
    await engine.run();

    const approval = events.find(
      (e) => e.type === "approval_required" && e.kind === "branch_name",
    );
    if (
      approval &&
      approval.type === "approval_required" &&
      approval.kind === "branch_name"
    ) {
      expect(approval.suggestion.name).toBe("");
      expect(approval.needsManualEntry).toBe(true);
    }
  });
});
