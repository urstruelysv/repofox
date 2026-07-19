// =============================================================================
// F8 — webview ↔ extension message contract
// =============================================================================
// First principles:
//   1. The webview runs in a sandboxed iframe. It CANNOT touch the network with
//      user secrets, CANNOT read SecretStorage, CANNOT import Node SDKs.
//   2. The extension host CAN do all of the above but has no DOM.
//   3. The only bridge between them is `postMessage` — a structured-clone
//      channel of plain JSON. Therefore every cross-boundary capability must
//      be expressed as a message type here, or it does not exist.
//
// What this file is:
//   The single source of truth for that channel. `WebviewMessage` = requests
//   the UI sends to the host. `ExtensionMessage` = pushes/responses the host
//   sends back. TypeScript discriminated unions on `type` give exhaustive
//   switches on both sides — adding a case here causes compile errors at
//   every untouched handler, which is the cheapest way to keep the contract
//   honest.
//
// Why F8 must add to this file FIRST:
//   "Test Connection" is a network probe with the user's secret key. The key
//   lives in the host (SecretStore). The button lives in the webview. So a
//   test press = round-trip RPC: webview asks → host probes → host replies.
//   That requires (a) a request message, (b) a response message, (c) a
//   request-id field so concurrent probes don't get mismatched. Same shape
//   for AI key test and GitHub token test — two probes, four new messages.
// =============================================================================

import type {
  AIProvider,
  ApprovalKind,
  BranchNameResult,
  CommitMessageResult,
  PRApprovalInput,
  PRDescriptionResult,
  WorkflowState,
} from "@repofox/core";

// Probe error kinds. Mapped from raw HTTP/SDK errors at the host so the UI
// never branches on status codes. 'auth' = bad/expired credential, 'network'
// = DNS/timeout/CORS, 'rate_limit' = 429, 'unknown' = catch-all.
export type ProbeErrorKind = "auth" | "network" | "rate_limit" | "unknown";

export interface ProbeError {
  kind: ProbeErrorKind;
  message: string;
}

export interface CompletedWorkflowSession {
  id: string;
  branchName: string;
  completedAt: number;
  prUrl: string | null;
  status: "open" | "closed";
}

export type WebviewMessage =
  | { type: "webview_ready" }
  | { type: "run_workflow" }
  | { type: "run_step" }
  | {
      type: "save_settings";
      payload: {
        provider: AIProvider;
        apiKey: string;
        githubToken: string;
      };
    }
  | { type: "approve_branch_name"; payload: { name: string } }
  | { type: "approve_commit_message"; payload: { message: string } }
  | { type: "approve_pr_description"; payload: PRApprovalInput }
  | { type: "open_pr_draft" }
  | { type: "submit_pr_draft" }
  | { type: "open_external"; payload: { url: string } }
  | { type: "revert_operation"; payload: { operationId: string } }
  | { type: "reset_workflow" }
  | {
      // Webview asks host to probe an AI provider with a (possibly unsaved)
      // key. Host runs models.list, replies via ai_provider_result.
      type: "test_ai_provider";
      payload: { requestId: string; provider: AIProvider; apiKey: string };
    }
  | {
      // Webview asks host to probe a GitHub PAT (possibly unsaved). Host runs
      // GET /user, parses X-OAuth-Scopes, replies via github_token_result.
      type: "test_github_token";
      payload: { requestId: string; token: string };
    };

// Discriminated on `ok`. Success and failure carry different fields by design
// — single bag with optional fields rots fast. requestId echoed so the
// webview's pending-Promise Map resolves the right caller under concurrent
// probes (user double-click, or AI+GH tested back-to-back).
export type AIProviderResult =
  | { requestId: string; ok: true; models: string[] }
  | { requestId: string; ok: false; error: ProbeError };

export type GitHubTokenResult =
  | {
      requestId: string;
      ok: true;
      username: string;
      // Granted scopes from X-OAuth-Scopes header. Empty array for
      // fine-grained PATs (they use a different permission model that doesn't
      // surface scopes via this header).
      scopes: string[];
      // Pre-computed at the host so UI doesn't encode scope policy.
      hasRepoScope: boolean;
      // True when scopes is empty AND auth succeeded — signals "scope
      // inspection N/A, trust the token shape." UI shows different copy than
      // "missing repo scope."
      isFineGrained: boolean;
    }
  | { requestId: string; ok: false; error: ProbeError };

export type ExtensionMessage =
  | {
      type: "init";
      payload: {
        provider: AIProvider;
        hasApiKey: boolean;
        hasGitHubToken: boolean;
        workflowState: WorkflowState | null;
        workspaceRoot: string;
        currentBranch: string;
        pastSessions?: CompletedWorkflowSession[];
      };
    }
  | {
      type: "settings_saved";
      payload: { hasApiKey: boolean; hasGitHubToken: boolean };
    }
  | { type: "workflow_started" }
  | { type: "workflow_state_changed"; payload: WorkflowState }
  | {
      type: "approval_required";
      payload: {
        kind: ApprovalKind;
        suggestion:
          | BranchNameResult
          | CommitMessageResult
          | PRDescriptionResult;
        aiFailed?: boolean;
      };
    }
  | { type: "workflow_complete"; payload: { prUrl: string | null } }
  | { type: "history_updated"; payload: CompletedWorkflowSession }
  | { type: "pr_draft_ready" }
  | { type: "warning"; payload: { message: string } }
  | { type: "error"; payload: { message: string } }
  | { type: "need_settings"; payload: { reason: string } }
  | { type: "trigger_workflow" }
  | { type: "open_settings" }
  | { type: "ai_provider_result"; payload: AIProviderResult }
  | { type: "github_token_result"; payload: GitHubTokenResult };
