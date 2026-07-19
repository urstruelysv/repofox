import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type {
  AIProvider,
  ApprovalKind,
  BranchNameResult,
  CommitMessageResult,
  PRApprovalInput,
  PRDescriptionResult,
  WorkflowState,
} from '@repofox/core'
import { BigButton, OperationsHistory, SettingsPanel, StatusRow, tokens } from '@repofox/ui'
import type { SettingsValues } from '@repofox/ui'
import type { CompletedWorkflowSession, ExtensionMessage, WebviewMessage } from '../types/messages'

declare function acquireVsCodeApi(): {
  postMessage: (message: WebviewMessage) => void
}

const vscode = acquireVsCodeApi()

type View = 'main' | 'settings'

interface PendingApproval {
  kind: ApprovalKind
  title: string
  value: string
  body?: string
  labels?: string[]
}

interface AppState {
  provider: AIProvider
  hasApiKey: boolean
  hasGitHubToken: boolean
  workflowState: WorkflowState | null
  workspaceRoot: string
  currentBranch: string
  view: View
  buttonStatus: 'idle' | 'running' | 'complete' | 'error'
  completionText: string
  errorMessage: string | null
  pastSessions: CompletedWorkflowSession[]
}

const SECTION_LABEL_STYLE: CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  color: tokens.color.text.muted,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  padding: '10px 12px 5px',
}

export function App(): JSX.Element {
  const [appState, setAppState] = useState<AppState>({
    provider: 'groq',
    hasApiKey: false,
    hasGitHubToken: false,
    workflowState: null,
    workspaceRoot: '',
    currentBranch: 'no workspace',
    view: 'main',
    buttonStatus: 'idle',
    completionText: '',
    errorMessage: null,
    pastSessions: [],
  })
  const [approval, setApproval] = useState<PendingApproval | null>(null)
  const opsHistoryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let completionTimeoutId: number | undefined
    const handler = (event: MessageEvent<ExtensionMessage>) => {
      const message = event.data

      switch (message.type) {
        case 'init':
          setAppState((state) => ({
            ...state,
            provider: message.payload.provider,
            hasApiKey: message.payload.hasApiKey,
            hasGitHubToken: message.payload.hasGitHubToken,
            workflowState: message.payload.workflowState,
            workspaceRoot: message.payload.workspaceRoot,
            currentBranch: message.payload.currentBranch,
            pastSessions: message.payload.pastSessions,
            view: message.payload.hasApiKey ? 'main' : 'settings',
          }))
          break
        case 'history_updated':
          setAppState((state) => ({
            ...state,
            pastSessions: [
              message.payload,
              ...state.pastSessions.filter((session) => session.id !== message.payload.id),
            ],
          }))
          break
        case 'workflow_started':
          setApproval(null)
          setAppState((state) => ({
            ...state,
            buttonStatus: 'running',
            completionText: '',
            errorMessage: null,
          }))
          break
        case 'workflow_state_changed':
          setAppState((state) => ({
            ...state,
            workflowState: message.payload,
          }))
          break
        case 'approval_required':
          setApproval(mapApproval(message.payload.kind, message.payload.suggestion))
          break
        case 'workflow_complete':
          setApproval(null)
          setAppState((state) => ({
            ...state,
            buttonStatus: 'complete',
            completionText: message.payload.prUrl ? 'PR opened' : 'Done',
          }))
          if (completionTimeoutId !== undefined) window.clearTimeout(completionTimeoutId)
          completionTimeoutId = window.setTimeout(() => {
            setAppState((state) => ({ ...state, buttonStatus: 'idle', completionText: '' }))
          }, 4000)
          break
        case 'error':
          setAppState((state) => ({
            ...state,
            buttonStatus: 'error',
            errorMessage: message.payload.message,
          }))
          break
        case 'settings_saved':
          setAppState((state) => ({
            ...state,
            view: 'main',
            hasApiKey: message.payload.hasApiKey,
            hasGitHubToken: message.payload.hasGitHubToken,
            errorMessage: null,
          }))
          break
        case 'need_settings':
          setAppState((state) => ({ ...state, view: 'settings' }))
          break
        case 'trigger_workflow':
          post({ type: 'run_workflow' })
          break
        case 'open_settings':
          setAppState((state) => ({ ...state, view: 'settings' }))
          break
      }
    }

    window.addEventListener('message', handler)
    post({ type: 'webview_ready' })
    return () => {
      window.removeEventListener('message', handler)
      if (completionTimeoutId !== undefined) {
        window.clearTimeout(completionTimeoutId)
      }
    }
  }, [])

  const ops = appState.workflowState?.operations ?? []
  const modelName = useMemo(() => {
    if (appState.provider === 'groq') return 'llama-3.3-70b'
    if (appState.provider === 'openai') return 'gpt-4o-mini'
    return 'claude-3-5-haiku'
  }, [appState.provider])

  const branch = useMemo(() => {
    const workflowBranch = ops.find((operation) => operation.operation === 'branch_created')?.detail
    if (workflowBranch) {
      return workflowBranch
    }

    return (
      appState.currentBranch ||
      (appState.workspaceRoot ? basename(appState.workspaceRoot) : 'no workspace')
    )
  }, [appState.currentBranch, appState.workspaceRoot, ops])

  if (appState.view === 'settings') {
    return (
      <div style={{ height: '100%', overflowY: 'auto', background: tokens.color.bg.primary }}>
        <div style={SECTION_LABEL_STYLE}>Settings</div>
        <SettingsPanel
          currentProvider={appState.provider}
          currentApiKey=""
          githubToken=""
          hasSavedApiKey={appState.hasApiKey}
          hasSavedGitHubToken={appState.hasGitHubToken}
          onSave={(values: SettingsValues) => {
            post({
              type: 'save_settings',
              payload: {
                provider: values.provider,
                apiKey: values.apiKey,
                githubToken: values.githubToken,
              },
            })
          }}
          onTest={async (provider, apiKey) =>
            provider.length > 0 && apiKey.trim().length > 10
              ? { state: 'ok', models: [] }
              : { state: 'fail', reason: 'auth', message: 'Provide a key to test.' }
          }
          onTestGitHub={async (token) =>
            token.trim().length > 10
              ? { state: 'ok', username: 'stub-user', hasRepoScope: true, isFineGrained: false }
              : { state: 'fail', reason: 'auth', message: 'Provide a GitHub token to test.' }
          }
          onOpenExternal={(url) => post({ type: 'open_external', payload: { url } })}
        />
        <div style={{ padding: '0 12px 12px' }}>
          <button
            onClick={() => setAppState((state) => ({ ...state, view: 'main' }))}
            style={secondaryButtonStyle}
          >
            Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: tokens.color.bg.primary,
        color: tokens.color.text.primary,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '12px 12px 10px',
          borderBottom: `1px solid ${tokens.color.border.default}`,
          flexShrink: 0,
        }}
      >
        <div style={{ ...SECTION_LABEL_STYLE, padding: '0 0 10px' }}>RepoFox for Cursor</div>

        <BigButton
          label="Branch -> PR"
          status={appState.buttonStatus}
          completionText={appState.completionText}
          onRun={() => post({ type: 'run_workflow' })}
          onStepByStep={() => post({ type: 'run_step' })}
          onOpsHistory={() => opsHistoryRef.current?.scrollIntoView({ behavior: 'smooth' })}
          onSettings={() => setAppState((state) => ({ ...state, view: 'settings' }))}
        />

        <StatusRow
          provider={appState.provider}
          model={modelName}
          branch={branch}
          isConnected={appState.hasApiKey}
        />

        {approval && (
          <ApprovalCard
            approval={approval}
            onApprove={(value) => {
              if (value.kind === 'branch_name') {
                post({ type: 'approve_branch_name', payload: { name: value.value } })
                setApproval(null)
                return
              }

              if (value.kind === 'commit_message') {
                post({ type: 'approve_commit_message', payload: { message: value.value } })
                setApproval(null)
                return
              }

              const payload: PRApprovalInput = {
                title: value.value,
                body: value.body ?? '',
                labels: value.labels ?? [],
              }
              post({ type: 'approve_pr_description', payload })
              setApproval(null)
            }}
          />
        )}

        {appState.errorMessage && (
          <div
            style={{
              marginTop: '10px',
              borderRadius: tokens.radius.card,
              border: `1px solid ${tokens.color.status.error}`,
              background: '#331717',
              color: '#f3b2b2',
              padding: '9px 10px',
              fontSize: '12px',
              lineHeight: '18px',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>Error</div>
            <div>{appState.errorMessage}</div>
            <div
              style={{
                marginTop: '8px',
                paddingTop: '8px',
                borderTop: '1px solid rgba(243, 178, 178, 0.2)',
                fontSize: '11px',
                opacity: 0.9,
              }}
            >
              <span style={{ fontWeight: 600 }}>Action:</span>{' '}
              {getGitAction(appState.errorMessage || '')}
            </div>
          </div>
        )}
      </div>

      <div ref={opsHistoryRef} style={{ ...SECTION_LABEL_STYLE, flexShrink: 0 }}>
        Operations history
      </div>

      <OperationsHistory
        operations={ops}
        pastSessions={appState.pastSessions}
        onRevert={(operationId) => post({ type: 'revert_operation', payload: { operationId } })}
      />
    </div>
  )
}

function getGitAction(message: string): string {
  if (message.includes('Permission denied'))
    return "Check your GitHub token scopes (needs 'repo') or remote URL."
  if (message.includes('Authentication failed')) return 'Update your GitHub token in Settings.'
  if (message.includes('Push rejected')) return 'Pull changes from origin first (git pull).'
  if (message.includes('protected branch'))
    return 'Push to a feature branch instead of main/master.'
  if (message.includes('Network error')) return 'Check your internet connection.'
  if (message.includes('detached')) return 'Checkout a branch before running RepoFox.'
  if (message.includes('merge')) return 'Resolve the current merge before running RepoFox.'
  if (message.includes('rebase')) return 'Complete the current rebase before running RepoFox.'
  return 'Push failed. Check the RepoFox output panel for full error details.'
}

function ApprovalCard({
  approval,
  onApprove,
}: {
  approval: PendingApproval
  onApprove: (approval: PendingApproval) => void
}): JSX.Element {
  const [value, setValue] = useState(approval.value)
  const [body, setBody] = useState(approval.body ?? '')

  useEffect(() => {
    setValue(approval.value)
    setBody(approval.body ?? '')
  }, [approval])

  return (
    <div
      style={{
        marginTop: '10px',
        borderRadius: tokens.radius.card,
        border: `1px solid ${tokens.color.accent.primary}`,
        background: tokens.color.bg.elevated,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          padding: '7px 9px',
        }}
      >
        <div
          style={{
            width: '18px',
            height: '18px',
            borderRadius: '4px',
            background: '#2d2b55',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: tokens.color.branch.pillText,
            fontSize: '10px',
            fontWeight: 700,
          }}
        >
          AI
        </div>
        <span
          style={{
            fontSize: '12px',
            fontWeight: 500,
            color: tokens.color.text.primary,
            flex: 1,
          }}
        >
          {approval.title}
        </span>
        <span style={{ fontSize: '10px', color: tokens.color.text.muted }}>review</span>
      </div>

      <div style={{ padding: '0 9px 8px' }}>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          style={approvalInputStyle}
        />
      </div>

      {approval.kind === 'pr_description' && (
        <div style={{ padding: '0 9px 8px' }}>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            style={{
              ...approvalInputStyle,
              minHeight: '112px',
              resize: 'vertical',
              fontFamily: 'inherit',
              lineHeight: '18px',
            }}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: '4px', padding: '0 9px 9px' }}>
        <button
          onClick={() =>
            onApprove({
              ...approval,
              value,
              body,
            })
          }
          style={{
            fontSize: '10px',
            padding: '4px 8px',
            borderRadius: '4px',
            border: `1px solid ${tokens.color.accent.primary}`,
            background: tokens.color.accent.primary,
            color: tokens.color.text.onAccent,
            cursor: 'pointer',
          }}
        >
          Accept
        </button>
      </div>
    </div>
  )
}

function post(message: WebviewMessage): void {
  vscode.postMessage(message)
}

function mapApproval(
  kind: ApprovalKind,
  suggestion: BranchNameResult | CommitMessageResult | PRDescriptionResult,
): PendingApproval {
  if (kind === 'branch_name') {
    const typed = suggestion as { name: string }
    return {
      kind,
      title: 'Approve branch name',
      value: typed.name,
    }
  }

  if (kind === 'commit_message') {
    const typed = suggestion as { message: string }
    return {
      kind,
      title: 'Approve commit message',
      value: typed.message,
    }
  }

  const typed = suggestion as { title: string; body: string; labels: string[] }
  return {
    kind,
    title: 'Approve pull request',
    value: typed.title,
    body: typed.body,
    labels: typed.labels,
  }
}

function basename(input: string): string {
  const segments = input.split(/[\\/]/).filter(Boolean)
  return segments[segments.length - 1] ?? 'repofox'
}

const approvalInputStyle: CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  background: tokens.color.bg.surface,
  border: `1px solid ${tokens.color.border.default}`,
  borderRadius: tokens.radius.card,
  color: tokens.color.text.primary,
  fontSize: '12px',
  boxSizing: 'border-box',
  outline: 'none',
}

const secondaryButtonStyle: CSSProperties = {
  width: '100%',
  padding: '7px 0',
  background: 'transparent',
  border: `1px solid ${tokens.color.border.default}`,
  borderRadius: tokens.radius.button,
  color: tokens.color.text.secondary,
  fontSize: '12px',
  cursor: 'pointer',
}
