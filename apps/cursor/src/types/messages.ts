import type {
  AIProvider,
  ApprovalKind,
  BranchNameResult,
  CommitMessageResult,
  PRApprovalInput,
  PRDescriptionResult,
  WorkflowState,
} from '@repofox/core'

export interface CompletedWorkflowSession {
  id: string
  branchName: string
  completedAt: number
  prUrl: string | null
  status: 'open' | 'closed'
}

export type WebviewMessage =
  | { type: 'webview_ready' }
  | { type: 'run_workflow' }
  | { type: 'run_step' }
  | {
      type: 'save_settings'
      payload: {
        provider: AIProvider
        apiKey: string
        githubToken: string
      }
    }
  | { type: 'approve_branch_name'; payload: { name: string } }
  | { type: 'approve_commit_message'; payload: { message: string } }
  | { type: 'approve_pr_description'; payload: PRApprovalInput }
  | { type: 'open_external'; payload: { url: string } }
  | { type: 'revert_operation'; payload: { operationId: string } }

export type ExtensionMessage =
  | {
      type: 'init'
      payload: {
        provider: AIProvider
        hasApiKey: boolean
        hasGitHubToken: boolean
        workflowState: WorkflowState | null
        workspaceRoot: string
        currentBranch: string
        pastSessions: CompletedWorkflowSession[]
      }
    }
  | { type: 'settings_saved'; payload: { hasApiKey: boolean; hasGitHubToken: boolean } }
  | { type: 'workflow_started' }
  | { type: 'workflow_state_changed'; payload: WorkflowState }
  | {
      type: 'approval_required'
      payload: {
        kind: ApprovalKind
        suggestion: BranchNameResult | CommitMessageResult | PRDescriptionResult
        aiFailed?: boolean
      }
    }
  | { type: 'workflow_complete'; payload: { prUrl: string | null } }
  | { type: 'history_updated'; payload: CompletedWorkflowSession }
  | { type: 'warning'; payload: { message: string } }
  | { type: 'error'; payload: { message: string } }
  | { type: 'need_settings'; payload: { reason: string } }
  | { type: 'trigger_workflow' }
  | { type: 'open_settings' }
