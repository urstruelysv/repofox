// =============================================================================
// F8 — extension-host bridge (only place that may touch secrets + network)
// =============================================================================
// First principles:
//   1. SecretStorage lives on the host process. The webview is a sandboxed
//      iframe and cannot reach it. Any operation that needs a real key must
//      execute here.
//   2. CSP on the webview blocks outbound network anyway, so even if a key
//      leaked into the DOM, the probe still couldn't run client-side.
//   3. Therefore "Test Connection" is structurally an RPC: the webview sends
//      a request, this file reads the secret, runs the network probe via
//      core (AIClient / GitHubClient), and posts the result back. The key
//      never crosses the boundary — only a boolean + metadata does.
//
// What this file is:
//   The router. `handleMessage` is the switch that turns webview intents
//   into host-side capabilities. Every new RPC for F8 lands here as a case.
//   `postMessage` is the only way back to the UI; everything reaches the
//   user through that funnel.
//
// Why F8 wires through here, not directly from the webview:
//   - Secret hygiene: the key is read inside this process and dropped after
//     the probe. It is never serialized into a postMessage payload, never
//     logged (see runDiagnostics line 96 — it logs "set"/"MISSING", never
//     the value), never stored in webview state.
//   - Provider isolation: the AI SDKs (Groq/OpenAI/Anthropic) are Node-only
//     and pull in transitive deps that don't bundle for a browser webview.
//     They have to live in the host.
//   - Same reason GitHubClient stays here — Octokit + scope-header parsing
//     is a Node concern.
//
// What to add for F8 (two new cases in handleMessage):
//   - 'test_ai_connection' → build AIClient, call testConnection(), reply
//     with { requestId, ok, model? } via a new ExtensionMessage type.
//   - 'test_github_token'  → call GitHubClient.testToken(token), reply with
//     { requestId, ok, login?, scopes?, missingRepo? }.
// =============================================================================

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import {
  AIClient,
  GitClient,
  GitHubClient,
  resolveGitHubWorkflowReadiness,
  SessionStore,
  SnapshotManager,
  WorkflowEngine,
  WorkflowSessionRecorder,
  type Logger,
  type PRDescriptionResult,
  type WorkflowEvent,
  type WorkflowSession,
} from "@repofox/core";
import { parsePRDraft, serializePRDraft } from "../pr-draft";
import { getWorkflowAccess } from "../workflow-access";
import type { StateManager } from "../state/StateManager";
import type { SecretStore } from "../storage/SecretStore";
import type {
  CompletedWorkflowSession,
  ExtensionMessage,
  WebviewMessage,
} from "../types/messages";

export class SidebarProvider implements vscode.WebviewViewProvider {
  private webviewView?: vscode.WebviewView;
  private workflowEngine?: WorkflowEngine;
  private sessionRecorder?: WorkflowSessionRecorder;
  private pendingPRDraft?: vscode.TextDocument;
  private readonly output = vscode.window.createOutputChannel("RepoFox");
  private readonly logger: Logger;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly secrets: SecretStore,
    private readonly state: StateManager,
  ) {
    this.logger = createOutputLogger(this.output);
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.webviewView = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, "dist"),
        vscode.Uri.joinPath(this.extensionUri, "assets"),
      ],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
      void this.handleMessage(message);
    });
  }

  triggerWorkflow(): void {
    this.postMessage({ type: "trigger_workflow" });
  }

  openSettings(): void {
    this.postMessage({ type: "open_settings" });
  }

  /**
   * Run Diagnostics — check environment health and report in a VS Code information dialog.
   * (notes: sre-hardening-guide.md Day 16, stability-patterns.md "Fail Fast")
   */
  async runDiagnostics(): Promise<void> {
    const workspaceRoot =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "RepoFox: Running Diagnostics…",
        cancellable: false,
      },
      async () => {
        const lines: string[] = [];

        // 1. Git binary
        if (workspaceRoot) {
          const gitClient = new GitClient({
            repoPath: workspaceRoot,
            logger: this.logger,
          });
          const version = await gitClient.getGitVersion();
          lines.push(`Git: ${version}`);

          // 2. Remote connectivity + push access (30s timeout built into checkRemoteAccess)
          const remoteCheck = await gitClient.checkRemoteAccess();
          if (remoteCheck.isOk()) {
            lines.push(`Remote: reachable (${remoteCheck.value})`);
          } else {
            lines.push(`Remote: UNREACHABLE — ${remoteCheck.error.message}`);
          }
        } else {
          lines.push("Git: no workspace open");
          lines.push("Remote: no workspace open");
        }

        // 3. SSH_AUTH_SOCK
        const sshSock = process.env["SSH_AUTH_SOCK"];
        lines.push(
          `SSH_AUTH_SOCK: ${sshSock ?? "NOT SET (push over SSH will hang)"}`,
        );

        // 4. API key
        const provider = await this.secrets.getAIProvider();
        const apiKey = await this.secrets.getAPIKey(provider);
        lines.push(
          `AI provider: ${provider} — key ${apiKey ? "set" : "MISSING"}`,
        );

        // 5. GitHub token
        const githubToken = await this.secrets.getGitHubToken();
        lines.push(
          `GitHub token: ${githubToken ? "set" : "NOT SET (PR creation disabled)"}`,
        );

        // 6. Workflow lockfile
        if (workspaceRoot) {
          const lockPath = join(
            workspaceRoot,
            ".git",
            "refs",
            "repofox",
            "workflow.lock",
          );
          if (existsSync(lockPath)) {
            try {
              const raw = readFileSync(lockPath, "utf-8");
              const lock = JSON.parse(raw) as {
                pid: number;
                timestamp: number;
              };
              const age = Math.round((Date.now() - lock.timestamp) / 1000);
              lines.push(
                `Workflow lock: HELD by PID ${lock.pid} (${age}s ago)`,
              );
            } catch {
              lines.push("Workflow lock: unreadable");
            }
          } else {
            lines.push("Workflow lock: none (idle)");
          }
        }

        const report = lines.join("\n");
        this.output.appendLine(
          "\n--- RepoFox Diagnostics ---\n" + report + "\n---",
        );
        this.output.show(true);

        const hasError = lines.some(
          (l) =>
            l.includes("UNREACHABLE") ||
            l.includes("MISSING") ||
            l.includes("NOT SET"),
        );
        if (hasError) {
          void vscode.window.showWarningMessage(
            "RepoFox Diagnostics: issues found — see Output panel.",
          );
        } else {
          void vscode.window.showInformationMessage(
            "RepoFox Diagnostics: all checks passed ✓",
          );
        }
      },
    );
  }

  private async sendInitialState(): Promise<void> {
    const workspaceRoot =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
    const provider = await this.secrets.getAIProvider();
    const apiKey = await this.secrets.getAPIKey(provider);
    const githubToken = await this.secrets.getGitHubToken();

    const sessions = workspaceRoot
      ? new SessionStore(workspaceRoot, this.logger)
      : undefined;
    const active = sessions ? await sessions.getActive() : undefined;
    const history = sessions ? await sessions.list() : undefined;
    if (active?.isErr())
      this.logger.warn("could not read active workflow session", active.error);
    if (history?.isErr())
      this.logger.warn("could not read workflow history", history.error);
    const workflowState = active?.isOk() ? (active.value?.state ?? null) : null;
    const currentBranch = await this.getCurrentBranch(workspaceRoot);

    this.postMessage({
      type: "init",
      payload: {
        provider,
        hasApiKey: apiKey.length > 0,
        hasGitHubToken: githubToken.length > 0,
        workflowState,
        workspaceRoot,
        currentBranch,
        pastSessions: history?.isOk()
          ? history.value
              .filter((session) => session.outcome !== "active")
              .map(toCompletedSession)
          : [],
      },
    });
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case "webview_ready":
        await this.sendInitialState();
        break;
      case "run_workflow":
        await this.startWorkflow();
        break;
      case "run_step":
        await this.runStep();
        break;
      case "save_settings": {
        if (!message.payload.apiKey.trim()) {
          this.postError("API key cannot be empty.");
          break;
        }
        const githubToken = message.payload.githubToken.trim();
        await this.secrets.setAIProvider(message.payload.provider);
        await this.secrets.setAPIKey(
          message.payload.provider,
          message.payload.apiKey.trim(),
        );
        if (githubToken) {
          await this.secrets.setGitHubToken(githubToken);
        }
        this.postMessage({
          type: "settings_saved",
          payload: {
            hasApiKey: true,
            hasGitHubToken: Boolean(
              githubToken || (await this.secrets.getGitHubToken()),
            ),
          },
        });
        await this.sendInitialState();
        break;
      }
      case "approve_branch_name":
        if (!this.workflowEngine) {
          this.postError("No active workflow to approve.");
          break;
        }
        {
          const result = await this.workflowEngine.approveBranchName(
            message.payload.name,
          );
          if (result.isErr()) {
            this.postError(result.error.message);
          }
        }
        break;
      case "approve_commit_message":
        if (!this.workflowEngine) {
          this.postError("No active workflow to approve.");
          break;
        }
        {
          const result = await this.workflowEngine.approveCommitMessage(
            message.payload.message,
          );
          if (result.isErr()) {
            this.postError(result.error.message);
          }
        }
        break;
      case "approve_pr_description":
        if (!this.workflowEngine) {
          this.postError("No active workflow to approve.");
          break;
        }
        {
          const result = await this.workflowEngine.approvePRDescription(
            message.payload,
          );
          if (result.isErr()) {
            this.postError(result.error.message);
          }
        }
        break;
      case "open_pr_draft":
        await this.showPRDraft();
        break;
      case "submit_pr_draft":
        await this.submitPRDraft();
        break;
      case "open_external":
        try {
          const url = new URL(message.payload.url);
          if (url.protocol !== "http:" && url.protocol !== "https:") {
            this.postError("Invalid URL protocol.");
            break;
          }
          void vscode.env.openExternal(vscode.Uri.parse(message.payload.url));
        } catch {
          this.postError("Invalid URL.");
        }
        break;
      case "revert_operation":
        await this.revertOperation(message.payload.operationId);
        break;
      case "reset_workflow":
        await this.resetWorkflow();
        break;
      case "test_ai_provider": {
        // F8 — key arrives in payload (user just pasted, not yet saved).
        // Reference dropped after probe; never logged, never echoed back.
        const { requestId, provider, apiKey } = message.payload;
        const result = await AIClient.testConnection(provider, apiKey);
        this.postMessage({
          type: "ai_provider_result",
          payload: { requestId, ...result },
        });
        break;
      }
      case "test_github_token": {
        const { requestId, token } = message.payload;
        const result = await GitHubClient.testToken(token);
        this.postMessage({
          type: "github_token_result",
          payload: { requestId, ...result },
        });
        break;
      }
    }
  }

  private async resetWorkflow(): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    // Cancel any active engine
    this.workflowEngine?.cancel();
    this.workflowEngine = undefined;
    this.sessionRecorder = undefined;
    // Clear persisted workflow state
    if (workspaceRoot) {
      const cleared = await new SessionStore(
        workspaceRoot,
        this.logger,
      ).clearActive();
      if (cleared.isErr()) {
        this.postError(cleared.error.message);
        return;
      }
    }
    // Re-send initial state so UI returns to the "ready" screen
    await this.sendInitialState();
  }

  private async startWorkflow(): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      this.postError("No workspace folder open.");
      return;
    }

    if (this.workflowEngine?.getState().status === "running") {
      this.postError("A RepoFox workflow is already running.");
      return;
    }

    const provider = await this.secrets.getAIProvider();
    const apiKey = await this.secrets.getAPIKey(provider);
    const githubToken = await this.secrets.getGitHubToken();
    const access = getWorkflowAccess({
      hasApiKey: Boolean(apiKey),
      hasGitHubToken: Boolean(githubToken),
    });

    if (!access.canRun) {
      this.postMessage({
        type: "need_settings",
        payload: { reason: "no_api_key" },
      });
      return;
    }

    const gitClient = new GitClient({
      repoPath: workspaceRoot,
      logger: this.logger,
    });
    const remote = await gitClient.getRemoteUrl();
    const githubReadiness = resolveGitHubWorkflowReadiness({
      token: githubToken,
      remote,
    });
    if (githubReadiness.status === "token_missing") {
      this.postMessage({
        type: "need_settings",
        payload: { reason: "no_github_token" },
      });
      return;
    }
    if (githubReadiness.status === "remote_unavailable") {
      this.postError(
        "RepoFox cannot read origin. Add a GitHub remote before creating a pull request.",
      );
      return;
    }
    if (githubReadiness.status === "remote_not_github") {
      this.postMessage({
        type: "warning",
        payload: {
          message:
            "This remote is not hosted on GitHub. RepoFox can branch, commit, and push, but cannot create a GitHub pull request.",
        },
      });
    }

    this.workflowEngine = new WorkflowEngine(
      {
        ai: {
          provider,
          apiKey,
        },
        github:
          githubReadiness.status === "ready" ? githubReadiness.config : null,
        repoPath: workspaceRoot,
        autoApprove: false,
      },
      this.logger,
      async (event) => {
        await this.handleWorkflowEvent(event);
      },
    );
    this.sessionRecorder = new WorkflowSessionRecorder(
      new SessionStore(workspaceRoot, this.logger),
    );

    this.postMessage({ type: "workflow_started" });

    const result = await this.workflowEngine.run();
    if (result.isErr()) {
      this.postError(result.error.message);
      this.workflowEngine = undefined;
    }
  }

  private async runStep(): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      this.postError("No workspace folder open.");
      return;
    }

    if (!this.workflowEngine) {
      const provider = await this.secrets.getAIProvider();
      const apiKey = await this.secrets.getAPIKey(provider);
      const githubToken = await this.secrets.getGitHubToken();
      const access = getWorkflowAccess({
        hasApiKey: Boolean(apiKey),
        hasGitHubToken: Boolean(githubToken),
      });

      if (!access.canRun) {
        this.postMessage({
          type: "need_settings",
          payload: { reason: "no_api_key" },
        });
        return;
      }

      const gitClient = new GitClient({
        repoPath: workspaceRoot,
        logger: this.logger,
      });
      const remote = await gitClient.getRemoteUrl();
      const githubReadiness = resolveGitHubWorkflowReadiness({
        token: githubToken,
        remote,
      });
      if (githubReadiness.status === "token_missing") {
        this.postMessage({
          type: "need_settings",
          payload: { reason: "no_github_token" },
        });
        return;
      }
      if (githubReadiness.status === "remote_unavailable") {
        this.postError(
          "RepoFox cannot read origin. Add a GitHub remote before creating a pull request.",
        );
        return;
      }
      if (githubReadiness.status === "remote_not_github") {
        this.postMessage({
          type: "warning",
          payload: {
            message:
              "This remote is not hosted on GitHub. RepoFox can branch, commit, and push, but cannot create a GitHub pull request.",
          },
        });
      }

      this.workflowEngine = new WorkflowEngine(
        {
          ai: {
            provider,
            apiKey,
          },
          github:
            githubReadiness.status === "ready" ? githubReadiness.config : null,
          repoPath: workspaceRoot,
          autoApprove: false,
        },
        this.logger,
        async (event) => {
          await this.handleWorkflowEvent(event);
        },
      );
      this.sessionRecorder = new WorkflowSessionRecorder(
        new SessionStore(workspaceRoot, this.logger),
      );
    }

    this.postMessage({ type: "workflow_started" });

    const result = await this.workflowEngine.next();
    if (result.isErr()) {
      this.postError(result.error.message);
      this.workflowEngine = undefined;
    }
  }

  private async handleWorkflowEvent(event: WorkflowEvent): Promise<void> {
    this.sessionRecorder?.record(event);
    switch (event.type) {
      case "state_changed":
        this.postMessage({
          type: "workflow_state_changed",
          payload: event.state,
        });
        break;
      case "approval_required":
        if (event.kind === "pr_description") {
          await this.openPRDraft(event.suggestion);
          break;
        }
        this.postMessage({
          type: "approval_required",
          payload: {
            kind: event.kind,
            suggestion: event.suggestion,
            aiFailed: "aiFailed" in event ? event.aiFailed : false,
          },
        });
        break;
      case "warning":
        this.postMessage({
          type: "warning",
          payload: { message: event.message },
        });
        this.output.appendLine(`[warn] ${event.message}`);
        break;
      case "complete":
        {
          const persisted = await this.sessionRecorder?.flush();
          if (persisted?.isErr()) {
            this.postError(persisted.error.message);
            return;
          }
        }
        await this.archiveCompletedWorkflow(event.prUrl);
        this.postMessage({
          type: "workflow_complete",
          payload: { prUrl: event.prUrl },
        });
        this.workflowEngine = undefined;
        this.sessionRecorder = undefined;
        if (event.prUrl) {
          void vscode.env.openExternal(vscode.Uri.parse(event.prUrl));
        }
        break;
      case "error":
        await this.sessionRecorder?.flush();
        this.workflowEngine = undefined;
        this.sessionRecorder = undefined;
        this.postError(event.error.message);
        break;
    }
  }

  private async openPRDraft(suggestion: PRDescriptionResult): Promise<void> {
    const document = await vscode.workspace.openTextDocument({
      content: serializePRDraft({
        title: suggestion.title,
        body: suggestion.body,
        labels: suggestion.labels,
      }),
      language: "markdown",
    });
    this.pendingPRDraft = document;
    await vscode.window.showTextDocument(document, { preview: false });
    this.postMessage({ type: "pr_draft_ready" });
  }

  private async showPRDraft(): Promise<void> {
    if (!this.pendingPRDraft) {
      this.postError("No pull request draft is waiting for review.");
      return;
    }
    await vscode.window.showTextDocument(this.pendingPRDraft, {
      preview: false,
    });
  }

  private async submitPRDraft(): Promise<void> {
    if (!this.workflowEngine) {
      this.postError("No active workflow to approve.");
      return;
    }
    if (!this.pendingPRDraft) {
      this.postError("No pull request draft is waiting for review.");
      return;
    }

    const draft = parsePRDraft(this.pendingPRDraft.getText());
    if (!draft.ok) {
      this.postError(draft.error);
      return;
    }

    const result = await this.workflowEngine.approvePRDescription(draft.value);
    if (result.isErr()) {
      this.postError(result.error.message);
      return;
    }
    this.pendingPRDraft = undefined;
  }

  private async archiveCompletedWorkflow(_prUrl: string | null): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const sessionId = this.workflowEngine?.getState().sessionId;
    if (!workspaceRoot || !sessionId) return;
    const session = await new SessionStore(workspaceRoot, this.logger).getById(
      sessionId,
    );
    if (session.isOk() && session.value) {
      this.postMessage({
        type: "history_updated",
        payload: toCompletedSession(session.value),
      });
    }
  }

  private async revertOperation(operationId: string): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const sessions = workspaceRoot
      ? new SessionStore(workspaceRoot, this.logger)
      : undefined;
    const active = sessions ? await sessions.getActive() : undefined;
    const workflowState = active?.isOk() ? (active.value?.state ?? null) : null;

    if (!workflowState || !workspaceRoot) {
      this.postError("No workflow state available to revert.");
      return;
    }

    const operation = workflowState.operations.find(
      (item) => item.id === operationId,
    );
    if (!operation?.snapshotId) {
      this.postError("Selected operation cannot be reverted.");
      return;
    }

    const snapshots = new SnapshotManager(workspaceRoot, this.logger);
    const restored = await snapshots.restore(operation.snapshotId);
    if (restored.isErr()) {
      this.postError(restored.error.message);
      return;
    }

    const opIndex = workflowState.operations.findIndex(
      (item) => item.id === operationId,
    );
    const nextState = {
      ...workflowState,
      status: "idle" as const,
      currentOperation: null,
      operations: workflowState.operations.slice(0, opIndex),
    };
    const saved = await sessions?.saveActive(nextState);
    if (saved?.isErr()) {
      this.postError(saved.error.message);
      return;
    }
    this.postMessage({ type: "workflow_state_changed", payload: nextState });
    void vscode.window.showInformationMessage(
      `RepoFox restored "${operation.label}".`,
    );
  }

  private async getCurrentBranch(workspaceRoot: string): Promise<string> {
    if (!workspaceRoot) {
      return "no workspace";
    }

    const git = new GitClient({ repoPath: workspaceRoot, logger: this.logger });
    const status = await git.getStatus();
    return status.isOk() ? status.value.branch : "unknown";
  }

  private postError(message: string): void {
    this.postMessage({ type: "error", payload: { message } });
    this.output.appendLine(`[error] ${message}`);
  }

  private postMessage(message: ExtensionMessage): void {
    void this.webviewView?.webview.postMessage(message);
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js"),
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource};"
  />
  <title>RepoFox</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #root {
      height: 100%;
      background: #1e1e1e;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-thumb { background: #444; border-radius: 2px; }
    ::-webkit-scrollbar-track { background: transparent; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function toCompletedSession(
  session: WorkflowSession,
): CompletedWorkflowSession {
  const branchName =
    session.state.operations.find(
      (operation) => operation.operation === "branch_created",
    )?.detail ?? "unknown branch";
  return {
    id: session.id,
    branchName,
    completedAt: session.updatedAt,
    prUrl: session.prUrl,
    status: session.prUrl ? "open" : "closed",
  };
}

function createOutputLogger(output: vscode.OutputChannel): Logger {
  const write = (level: string, message: string, data?: unknown): void => {
    const timestamp = new Date().toISOString();
    const suffix = data === undefined ? "" : ` ${safeStringify(data)}`;
    output.appendLine(`[${timestamp}] [${level}] ${message}${suffix}`);
  };

  return {
    debug: (message, data) => write("debug", message, data),
    info: (message, data) => write("info", message, data),
    warn: (message, data) => write("warn", message, data),
    error: (message, data) => write("error", message, data),
  };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '"[unserializable]"';
  }
}

function getNonce(): string {
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";

  for (let index = 0; index < 32; index += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return text;
}
