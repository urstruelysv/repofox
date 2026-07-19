import type { Result } from 'neverthrow'

export interface GitFile {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
  staged: boolean
}

export interface GitStatus {
  branch: string
  files: GitFile[]
  isClean: boolean
  hasUntracked: boolean
  ahead: number
  behind: number
  hasUpstream: boolean
  trackingBranch: string | null
}

export type GitStackedAction =
  | 'commit'
  | 'push'
  | 'create_pr'
  | 'commit_push'
  | 'commit_push_pr'

export interface VcsChangeRequest {
  number: number
  title: string
  url: string
  baseRef: string
  headRef: string
  state: 'open' | 'closed' | 'merged'
}

export interface VcsWorkingTreeSummary {
  files: Array<{ path: string; insertions: number; deletions: number }>
  insertions: number
  deletions: number
}

export interface VcsStatus {
  isRepo: boolean
  hasPrimaryRemote: boolean
  isDefaultRef: boolean
  refName: string | null
  hasWorkingTreeChanges: boolean
  workingTree: VcsWorkingTreeSummary
  hasUpstream: boolean
  aheadCount: number
  behindCount: number
  aheadOfDefaultCount: number
  pr: VcsChangeRequest | null
}

export type GitActionIconName = 'commit' | 'push' | 'pr'

export type GitQuickActionKind =
  | 'run_action'
  | 'run_pull'
  | 'open_pr'
  | 'show_hint'

export interface GitQuickAction {
  label: string
  disabled: boolean
  kind: GitQuickActionKind
  action?: GitStackedAction
  hint?: string
}

export interface GitActionMenuItem {
  id: 'commit' | 'push' | 'pr'
  label: string
  disabled: boolean
  icon: GitActionIconName
  kind: 'run_action' | 'open_pr'
  action?: GitStackedAction
}

export interface CommitResult {
  hash: string
  message: string
  branch: string
  timestamp: number
}

export type OperationType =
  | 'branch_created'
  | 'files_staged'
  | 'committed'
  | 'pushed'
  | 'pr_opened'

export interface Snapshot {
  id: string
  operation: OperationType
  timestamp: number
  branchRef: string
  stashRef: string | null
  valid: boolean
  metadata: Record<string, string>
  repoPath: string
}

export interface OperationRecord {
  id: string
  operation: OperationType
  status: 'done' | 'current' | 'pending' | 'failed'
  timestamp: number
  label: string
  detail: string
  snapshotId: string | null
}

export type AIProvider = 'groq' | 'openai' | 'anthropic'

export interface AIConfig {
  provider: AIProvider
  apiKey: string
  model?: string
  maxTokens?: number
}

export interface AIContext {
  recentBranches: string[]
  recentCommits: string[]
  recentPRTitles: string[]
  changedFiles: string[]
  diff: string
  repoName: string
}

export interface BranchNameResult {
  name: string
  confidence: 'high' | 'medium' | 'low'
}

export interface CommitMessageResult {
  message: string
  type: string
  scope: string | null
  body: string | null
}

export interface PRDescriptionResult {
  title: string
  body: string
  labels: string[]
  suggestedReviewers: string[]
}

export interface GitHubConfig {
  token: string
  owner: string
  repo: string
}

export interface PullRequest {
  number: number
  url: string
  title: string
  body: string
  state: 'open' | 'closed' | 'merged'
}

export interface WorkflowConfig {
  ai: AIConfig
  github: GitHubConfig | null
  repoPath: string
  autoApprove: boolean
}

export interface WorkflowState {
  status: 'idle' | 'running' | 'paused' | 'complete' | 'failed'
  currentOperation: OperationType | null
  operations: OperationRecord[]
  sessionId: string
}

export type ApprovalKind = 'branch_name' | 'commit_message' | 'pr_description'

export interface PRApprovalInput {
  title: string
  body: string
  labels: string[]
}

export type RepoFoxResult<T> = Result<T, RepoFoxError>

export interface RepoFoxError {
  code: string
  message: string
  cause?: unknown
}
