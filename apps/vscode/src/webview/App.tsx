import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type {
  AIProvider,
  ApprovalKind,
  BranchNameResult,
  CommitMessageResult,
  PRDescriptionResult,
  WorkflowState,
} from "@repofox/core";
import {
  BigButton,
  OperationsHistory,
  SettingsPanel,
  StatusRow,
  tokens,
} from "@repofox/ui";
import type { AITestState, GHTestState, SettingsValues } from "@repofox/ui";
import type {
  AIProviderResult,
  CompletedWorkflowSession,
  ExtensionMessage,
  GitHubTokenResult,
  WebviewMessage,
} from "../types/messages";

declare function acquireVsCodeApi(): {
  postMessage: (message: WebviewMessage) => void;
};

const vscode = acquireVsCodeApi();

// F8 — pending probe RPCs.
//
// postMessage is fire-and-forget. To turn it into request/response we tag
// each probe with a requestId, store the Promise resolver here, and let the
// global message listener (in App's useEffect) resolve the right one when
// the matching ai_provider_result / github_token_result arrives.
//
// Why outside React state: this is a transport map, not UI state. Putting it
// in useState would re-render on every probe + leak through closure capture.
//
// Type-erased value because the same Map serves both AI and GH probes; the
// listener narrows by message type before calling resolve.
const pendingProbes = new Map<string, (value: unknown) => void>();

function makeRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

// F8 — translate the wire-level result (AIProviderResult) into the UI-level
// terminal state (AITestState minus idle/testing). The shapes are similar but
// not identical: SettingsPanel doesn't need requestId, and we lift error.kind
// to a top-level `reason` so the panel never imports message types.
function aiResultToState(
  result: AIProviderResult,
): Exclude<AITestState, { state: "idle" | "testing" }> {
  if (result.ok) return { state: "ok", models: result.models };
  return {
    state: "fail",
    reason: result.error.kind,
    message: result.error.message,
  };
}

function ghResultToState(
  result: GitHubTokenResult,
): Exclude<GHTestState, { state: "idle" | "testing" }> {
  if (result.ok) {
    return {
      state: "ok",
      username: result.username,
      hasRepoScope: result.hasRepoScope,
      isFineGrained: result.isFineGrained,
    };
  }
  return {
    state: "fail",
    reason: result.error.kind,
    message: result.error.message,
  };
}

type View = "main" | "settings";

interface PendingApproval {
  kind: ApprovalKind;
  title: string;
  value: string;
  body?: string;
  labels?: string[];
  aiFailed?: boolean;
}

interface AppState {
  provider: AIProvider;
  hasApiKey: boolean;
  hasGitHubToken: boolean;
  workflowState: WorkflowState | null;
  workspaceRoot: string;
  currentBranch: string;
  view: View;
  buttonStatus: "idle" | "running" | "complete" | "error";
  completionText: string;
  errorMessage: string | null;
  warningMessage: string | null;
  pastSessions: CompletedWorkflowSession[];
  prDraftReady: boolean;
}

const SECTION_LABEL_STYLE: CSSProperties = {
  fontSize: "10px",
  fontWeight: 600,
  color: tokens.color.text.muted,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  padding: "10px 12px 5px",
};

export function App(): JSX.Element {
  const [appState, setAppState] = useState<AppState>({
    provider: "groq",
    hasApiKey: false,
    hasGitHubToken: false,
    workflowState: null,
    workspaceRoot: "",
    currentBranch: "no workspace",
    view: "main",
    buttonStatus: "idle",
    completionText: "",
    errorMessage: null,
    warningMessage: null,
    pastSessions: [],
    prDraftReady: false,
  });
  const [approval, setApproval] = useState<PendingApproval | null>(null);
  const opsHistoryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MessageEvent<ExtensionMessage>) => {
      const message = event.data;

      switch (message.type) {
        case "init":
          setAppState((state) => ({
            ...state,
            provider: message.payload.provider,
            hasApiKey: message.payload.hasApiKey,
            hasGitHubToken: message.payload.hasGitHubToken,
            workflowState: message.payload.workflowState,
            workspaceRoot: message.payload.workspaceRoot,
            currentBranch: message.payload.currentBranch,
            pastSessions: message.payload.pastSessions ?? [],
            view: message.payload.hasApiKey ? "main" : "settings",
          }));
          break;
        case "workflow_started":
          setApproval(null);
          setAppState((state) => ({
            ...state,
            buttonStatus: "running",
            completionText: "",
            errorMessage: null,
            prDraftReady: false,
          }));
          break;
        case "workflow_state_changed":
          setAppState((state) => ({
            ...state,
            workflowState: message.payload,
          }));
          break;
        case "approval_required":
          if (message.payload.kind === "pr_description") break;
          setApproval({
            ...mapApproval(message.payload.kind, message.payload.suggestion),
            aiFailed: message.payload.aiFailed ?? false,
          });
          break;
        case "history_updated":
          setAppState((state) => ({
            ...state,
            pastSessions: [
              message.payload,
              ...state.pastSessions.filter(
                (session) => session.id !== message.payload.id,
              ),
            ].slice(0, 20),
          }));
          break;
        case "pr_draft_ready":
          setAppState((state) => ({ ...state, prDraftReady: true }));
          break;
        case "warning":
          setAppState((state) => ({
            ...state,
            warningMessage: message.payload.message,
          }));
          window.setTimeout(() => {
            setAppState((state) => ({ ...state, warningMessage: null }));
          }, 6000);
          break;
        case "workflow_complete":
          setApproval(null);
          setAppState((state) => ({
            ...state,
            buttonStatus: "complete",
            completionText: message.payload.prUrl ? "PR opened" : "Done",
            prDraftReady: false,
          }));
          window.setTimeout(() => {
            setAppState((state) => ({
              ...state,
              buttonStatus: "idle",
              completionText: "",
            }));
          }, 4000);
          break;
        case "error":
          setAppState((state) => ({
            ...state,
            buttonStatus: "error",
            errorMessage: message.payload.message,
            prDraftReady: false,
          }));
          break;
        case "settings_saved":
          setAppState((state) => ({
            ...state,
            view: "main",
            hasApiKey: message.payload.hasApiKey,
            hasGitHubToken: message.payload.hasGitHubToken,
            errorMessage: null,
          }));
          break;
        case "need_settings":
          setAppState((state) => ({ ...state, view: "settings" }));
          break;
        case "trigger_workflow":
          post({ type: "run_workflow" });
          break;
        case "open_settings":
          setAppState((state) => ({ ...state, view: "settings" }));
          break;
        case "ai_provider_result": {
          const resolver = pendingProbes.get(message.payload.requestId);
          if (resolver) {
            pendingProbes.delete(message.payload.requestId);
            resolver(aiResultToState(message.payload));
          }
          break;
        }
        case "github_token_result": {
          const resolver = pendingProbes.get(message.payload.requestId);
          if (resolver) {
            pendingProbes.delete(message.payload.requestId);
            resolver(ghResultToState(message.payload));
          }
          break;
        }
      }
    };

    window.addEventListener("message", handler);
    post({ type: "webview_ready" });
    return () => window.removeEventListener("message", handler);
  }, []);

  const ops = appState.workflowState?.operations ?? [];
  const modelName = useMemo(() => {
    if (appState.provider === "groq") return "llama-3.3-70b";
    if (appState.provider === "openai") return "gpt-4o-mini";
    return "claude-3-5-haiku";
  }, [appState.provider]);

  const branch = useMemo(() => {
    const workflowBranch = ops.find(
      (operation) => operation.operation === "branch_created",
    )?.detail;
    if (workflowBranch) {
      return workflowBranch;
    }

    return (
      appState.currentBranch ||
      (appState.workspaceRoot
        ? basename(appState.workspaceRoot)
        : "no workspace")
    );
  }, [appState.currentBranch, appState.workspaceRoot, ops]);

  if (appState.view === "settings") {
    return (
      <div
        style={{
          height: "100%",
          overflowY: "auto",
          background: tokens.color.bg.primary,
        }}
      >
        <div style={SECTION_LABEL_STYLE}>Settings</div>
        <SettingsPanel
          currentProvider={appState.provider}
          currentApiKey=""
          githubToken=""
          hasSavedApiKey={appState.hasApiKey}
          hasSavedGitHubToken={appState.hasGitHubToken}
          onSave={(values: SettingsValues) => {
            post({
              type: "save_settings",
              payload: {
                provider: values.provider,
                apiKey: values.apiKey,
                githubToken: values.githubToken,
              },
            });
          }}
          onTest={async (probeProvider, probeKey) => {
            const requestId = makeRequestId();
            const promise = new Promise<
              Exclude<AITestState, { state: "idle" | "testing" }>
            >((resolve) => {
              pendingProbes.set(requestId, resolve as (value: unknown) => void);
            });
            post({
              type: "test_ai_provider",
              payload: { requestId, provider: probeProvider, apiKey: probeKey },
            });
            return promise;
          }}
          onTestGitHub={async (probeToken) => {
            const requestId = makeRequestId();
            const promise = new Promise<
              Exclude<GHTestState, { state: "idle" | "testing" }>
            >((resolve) => {
              pendingProbes.set(requestId, resolve as (value: unknown) => void);
            });
            post({
              type: "test_github_token",
              payload: { requestId, token: probeToken },
            });
            return promise;
          }}
          onOpenExternal={(url) =>
            post({ type: "open_external", payload: { url } })
          }
        />
        <div style={{ padding: "0 12px 12px" }}>
          <button
            onClick={() => setAppState((state) => ({ ...state, view: "main" }))}
            style={secondaryButtonStyle}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: tokens.color.bg.primary,
        color: tokens.color.text.primary,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 12px 10px",
          borderBottom: `1px solid ${tokens.color.border.default}`,
          flexShrink: 0,
        }}
      >
        <div style={{ ...SECTION_LABEL_STYLE, padding: "0 0 10px" }}>
          RepoFox
        </div>

        <BigButton
          label="Branch -> PR"
          status={appState.buttonStatus}
          completionText={appState.completionText}
          onRun={() => post({ type: "run_workflow" })}
          onStepByStep={() => post({ type: "run_step" })}
          onOpsHistory={() =>
            opsHistoryRef.current?.scrollIntoView({ behavior: "smooth" })
          }
          onSettings={() =>
            setAppState((state) => ({ ...state, view: "settings" }))
          }
        />

        <StatusRow
          provider={appState.provider}
          model={modelName}
          branch={branch}
          isConnected={appState.hasApiKey}
        />

        {appState.workspaceRoot && !appState.hasGitHubToken && (
          <div style={tokenNoticeStyle}>
            Pull-request creation is disabled until you add a GitHub token.
            RepoFox can still branch, commit, and push.
          </div>
        )}

        {appState.prDraftReady && (
          <div style={draftNoticeStyle}>
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>
              Pull request draft ready
            </div>
            <div style={{ marginBottom: "8px" }}>
              Review the Markdown draft in VS Code, then open the pull request
              when ready.
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={() => post({ type: "open_pr_draft" })}
                style={inlineSecondaryButtonStyle}
              >
                Show draft
              </button>
              <button
                onClick={() => post({ type: "submit_pr_draft" })}
                style={primaryButtonStyle}
              >
                Open PR
              </button>
            </div>
          </div>
        )}

        {approval && (
          <ApprovalCard
            approval={approval}
            onApprove={(value) => {
              if (value.kind === "branch_name") {
                post({
                  type: "approve_branch_name",
                  payload: { name: value.value },
                });
                setApproval(null);
                return;
              }

              if (value.kind === "commit_message") {
                post({
                  type: "approve_commit_message",
                  payload: { message: value.value },
                });
                setApproval(null);
                return;
              }
            }}
          />
        )}

        {appState.warningMessage && (
          <div
            style={{
              marginTop: "8px",
              borderRadius: tokens.radius.card,
              border: "1px solid #7a5c1a",
              background: "#2a1f09",
              color: "#e8c97a",
              padding: "7px 10px",
              fontSize: "11px",
              lineHeight: "16px",
            }}
          >
            ⚠ {appState.warningMessage}
          </div>
        )}

        {appState.errorMessage && (
          <div
            style={{
              marginTop: "10px",
              borderRadius: tokens.radius.card,
              border: `1px solid ${tokens.color.status.error}`,
              background: "#331717",
              color: "#f3b2b2",
              padding: "9px 10px",
              fontSize: "12px",
              lineHeight: "18px",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>Error</div>
            <div>{appState.errorMessage}</div>
            <div
              style={{
                marginTop: "8px",
                paddingTop: "8px",
                borderTop: "1px solid rgba(243, 178, 178, 0.2)",
                fontSize: "11px",
                opacity: 0.9,
              }}
            >
              <span style={{ fontWeight: 600 }}>Action:</span>{" "}
              {getGitAction(appState.errorMessage)}
            </div>
          </div>
        )}
      </div>

      <div
        ref={opsHistoryRef}
        style={{ ...SECTION_LABEL_STYLE, flexShrink: 0 }}
      >
        Operations history
      </div>

      <OperationsHistory
        operations={ops}
        pastSessions={appState.pastSessions}
        onRevert={(operationId) =>
          post({ type: "revert_operation", payload: { operationId } })
        }
      />
    </div>
  );
}

function ApprovalCard({
  approval,
  onApprove,
}: {
  approval: PendingApproval;
  onApprove: (approval: PendingApproval) => void;
}): JSX.Element {
  const [value, setValue] = useState(approval.value);

  return (
    <div
      style={{
        marginTop: "10px",
        borderRadius: tokens.radius.card,
        border: `1px solid ${tokens.color.accent.primary}`,
        background: tokens.color.bg.elevated,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "7px",
          padding: "7px 9px",
        }}
      >
        <div
          style={{
            width: "18px",
            height: "18px",
            borderRadius: "4px",
            background: approval.aiFailed ? "#3a2800" : "#2d2b55",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: approval.aiFailed ? "#e8c97a" : tokens.color.branch.pillText,
            fontSize: "10px",
            fontWeight: 700,
          }}
        >
          {approval.aiFailed ? "!" : "AI"}
        </div>
        <span
          style={{
            fontSize: "12px",
            fontWeight: 500,
            color: tokens.color.text.primary,
            flex: 1,
          }}
        >
          {approval.title}
        </span>
        <span
          style={{
            fontSize: "10px",
            color: approval.aiFailed ? "#e8c97a" : tokens.color.text.muted,
          }}
        >
          {approval.aiFailed ? "type manually" : "review"}
        </span>
      </div>

      <div style={{ padding: "0 9px 8px" }}>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          style={approvalInputStyle}
        />
      </div>

      <div style={{ display: "flex", gap: "4px", padding: "0 9px 9px" }}>
        <button
          onClick={() =>
            onApprove({
              ...approval,
              value,
            })
          }
          style={{
            fontSize: "10px",
            padding: "4px 8px",
            borderRadius: "4px",
            border: `1px solid ${tokens.color.accent.primary}`,
            background: tokens.color.accent.primary,
            color: tokens.color.text.onAccent,
            cursor: "pointer",
          }}
        >
          Accept
        </button>
      </div>
    </div>
  );
}

function getGitAction(message: string): string {
  if (message.includes("Permission denied"))
    return "Check your GitHub token scopes (needs 'repo') or remote URL.";
  if (message.includes("Authentication failed"))
    return "Update your GitHub token in Settings.";
  if (message.includes("Push rejected"))
    return "Pull changes from origin first (git pull).";
  if (message.includes("protected branch"))
    return "Push to a feature branch instead of main/master.";
  if (message.includes("Network error"))
    return "Check your internet connection.";
  if (message.includes("detached"))
    return "Checkout a branch before running RepoFox.";
  if (message.includes("merge"))
    return "Resolve the current merge before running RepoFox.";
  if (message.includes("rebase"))
    return "Complete the current rebase before running RepoFox.";
  return "Push failed. Check the RepoFox output panel for full error details.";
}

function post(message: WebviewMessage): void {
  vscode.postMessage(message);
}

function mapApproval(
  kind: ApprovalKind,
  suggestion: BranchNameResult | CommitMessageResult | PRDescriptionResult,
): PendingApproval {
  if (kind === "branch_name") {
    const typed = suggestion as { name: string };
    return {
      kind,
      title: "Approve branch name",
      value: typed.name,
    };
  }

  if (kind === "commit_message") {
    const typed = suggestion as { message: string };
    return {
      kind,
      title: "Approve commit message",
      value: typed.message,
    };
  }

  const typed = suggestion as { title: string; body: string; labels: string[] };
  return {
    kind,
    title: "Approve pull request",
    value: typed.title,
    body: typed.body,
    labels: typed.labels,
  };
}

function basename(input: string): string {
  const segments = input.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? "repofox";
}

const approvalInputStyle: CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  background: tokens.color.bg.surface,
  border: `1px solid ${tokens.color.border.default}`,
  borderRadius: tokens.radius.card,
  color: tokens.color.text.primary,
  fontSize: "12px",
  boxSizing: "border-box",
  outline: "none",
};

const secondaryButtonStyle: CSSProperties = {
  width: "100%",
  padding: "7px 0",
  background: "transparent",
  border: `1px solid ${tokens.color.border.default}`,
  borderRadius: tokens.radius.button,
  color: tokens.color.text.secondary,
  fontSize: "12px",
  cursor: "pointer",
};

const inlineSecondaryButtonStyle: CSSProperties = {
  ...secondaryButtonStyle,
  width: "auto",
  padding: "7px 10px",
};

const primaryButtonStyle: CSSProperties = {
  ...inlineSecondaryButtonStyle,
  background: tokens.color.accent.primary,
  borderColor: tokens.color.accent.primary,
  color: tokens.color.text.onAccent,
};

const tokenNoticeStyle: CSSProperties = {
  marginTop: "8px",
  borderRadius: tokens.radius.card,
  border: "1px solid #7a5c1a",
  background: "#2a1f09",
  color: "#e8c97a",
  padding: "7px 10px",
  fontSize: "11px",
  lineHeight: "16px",
};

const draftNoticeStyle: CSSProperties = {
  ...tokenNoticeStyle,
  borderColor: tokens.color.accent.primary,
  background: tokens.color.bg.elevated,
  color: tokens.color.text.secondary,
};
