import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as vscode from 'vscode'
import {
  GitClient,
  GitHubClient,
  resolveGitHubWorkflowReadiness,
  SessionStore,
  SnapshotManager,
  WorkflowEngine,
  WorkflowSessionRecorder,
  type Logger,
  type WorkflowEvent,
  type WorkflowSession,
} from '@repofox/core'
import type { StateManager } from '../state/StateManager'
import type { SecretStore } from '../storage/SecretStore'
import type { CompletedWorkflowSession, ExtensionMessage, WebviewMessage } from '../types/messages'

export class SidebarProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private webviewView?: vscode.WebviewView
  private workflowEngine?: WorkflowEngine
  private sessionRecorder?: WorkflowSessionRecorder
  private readonly output = vscode.window.createOutputChannel('RepoFox')
  private readonly logger: Logger

  dispose(): void {
    this.output.dispose()
  }

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly secrets: SecretStore,
    private readonly state: StateManager,
  ) {
    this.logger = createOutputLogger(this.output)
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.webviewView = webviewView

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'dist'),
        vscode.Uri.joinPath(this.extensionUri, 'assets'),
      ],
    }

    webviewView.webview.html = this.getHtml(webviewView.webview)

    webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
      void this.handleMessage(message)
    })
  }

  triggerWorkflow(): void {
    this.postMessage({ type: 'trigger_workflow' })
  }

  openSettings(): void {
    this.postMessage({ type: 'open_settings' })
  }

  async runDiagnostics(): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ''

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'RepoFox: Running Diagnostics…',
        cancellable: false,
      },
      async () => {
        const lines: string[] = []

        if (workspaceRoot) {
          const gitClient = new GitClient({ repoPath: workspaceRoot, logger: this.logger })
          lines.push(`Git: ${await gitClient.getGitVersion()}`)
          const remoteCheck = await gitClient.checkRemoteAccess()
          lines.push(
            remoteCheck.isOk()
              ? `Remote: reachable (${remoteCheck.value})`
              : `Remote: UNREACHABLE — ${remoteCheck.error.message}`,
          )
        } else {
          lines.push('Git: no workspace open')
          lines.push('Remote: no workspace open')
        }

        const sshSock = process.env['SSH_AUTH_SOCK']
        lines.push(`SSH_AUTH_SOCK: ${sshSock ?? 'NOT SET (push over SSH will hang)'}`)

        const provider = await this.secrets.getAIProvider()
        const apiKey = (await this.secrets.getAPIKey(provider)) ?? ''
        lines.push(`AI provider: ${provider} — key ${apiKey ? 'set' : 'MISSING'}`)

        const githubToken = (await this.secrets.getGitHubToken()) ?? ''
        lines.push(`GitHub token: ${githubToken ? 'set' : 'NOT SET (PR creation disabled)'}`)

        if (workspaceRoot) {
          const lockPath = join(workspaceRoot, '.git', 'refs', 'repofox', 'workflow.lock')
          if (existsSync(lockPath)) {
            try {
              const raw = readFileSync(lockPath, 'utf-8')
              const lock = JSON.parse(raw) as { pid: number; timestamp: number }
              const age = Math.round((Date.now() - lock.timestamp) / 1000)
              lines.push(`Workflow lock: HELD by PID ${lock.pid} (${age}s ago)`)
            } catch {
              lines.push('Workflow lock: unreadable')
            }
          } else {
            lines.push('Workflow lock: none (idle)')
          }
        }

        const report = lines.join('\n')
        this.output.appendLine('\n--- RepoFox Diagnostics ---\n' + report + '\n---')
        this.output.show(true)

        const hasError = lines.some(
          (l) => l.includes('UNREACHABLE') || l.includes('MISSING') || l.includes('NOT SET'),
        )
        if (hasError) {
          void vscode.window.showWarningMessage(
            'RepoFox Diagnostics: issues found — see Output panel.',
          )
        } else {
          void vscode.window.showInformationMessage('RepoFox Diagnostics: all checks passed ✓')
        }
      },
    )
  }

  private async sendInitialState(): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ''
    const provider = await this.secrets.getAIProvider()
    const apiKey = (await this.secrets.getAPIKey(provider)) ?? ''
    const githubToken = (await this.secrets.getGitHubToken()) ?? ''

    let remoteInfo: { owner: string; repo: string } | null = null
    if (workspaceRoot) {
      const gitClient = new GitClient({ repoPath: workspaceRoot, logger: this.logger })
      const remote = await gitClient.getRemoteUrl()
      remoteInfo = remote.isOk() ? GitHubClient.parseOwnerRepo(remote.value) : null
    }

    if (remoteInfo && !githubToken) {
      this.postMessage({ type: 'need_settings', payload: { reason: 'no_github_token' } })
      return
    }
    const sessions = workspaceRoot ? new SessionStore(workspaceRoot, this.logger) : undefined
    const active = sessions ? await sessions.getActive() : undefined
    const history = sessions ? await sessions.list() : undefined
    if (active?.isErr()) this.logger.warn('could not read active workflow session', active.error)
    if (history?.isErr()) this.logger.warn('could not read workflow history', history.error)
    const workflowState = active?.isOk() ? active.value?.state ?? null : null
    const currentBranch = await this.getCurrentBranch(workspaceRoot)

    this.postMessage({
      type: 'init',
      payload: {
        provider,
        hasApiKey: apiKey.length > 0,
        hasGitHubToken: githubToken.length > 0,
        workflowState,
        workspaceRoot,
        currentBranch,
        pastSessions: history?.isOk()
          ? history.value.filter((session) => session.outcome !== 'active').map(toCompletedSession)
          : [],
      },
    })
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case 'webview_ready':
        await this.sendInitialState()
        break
      case 'run_workflow':
        await this.startWorkflow()
        break
      case 'run_step':
        await this.runStep()
        break
      case 'save_settings': {
        if (!message.payload.apiKey.trim()) {
          this.postError('API key cannot be empty.')
          break
        }
        const githubToken = message.payload.githubToken.trim()
        await this.secrets.setAIProvider(message.payload.provider)
        await this.secrets.setAPIKey(message.payload.provider, message.payload.apiKey.trim())
        if (githubToken) {
          await this.secrets.setGitHubToken(githubToken)
        }
        this.postMessage({
          type: 'settings_saved',
          payload: {
            hasApiKey: true,
            hasGitHubToken: Boolean(githubToken || (await this.secrets.getGitHubToken())),
          },
        })
        await this.sendInitialState()
        break
      }
      case 'approve_branch_name':
        if (!this.workflowEngine) {
          this.postError('No active workflow to approve.')
          break
        }
        {
          const result = await this.workflowEngine.approveBranchName(message.payload.name)
          if (result.isErr()) {
            this.postError(result.error.message)
          }
        }
        break
      case 'approve_commit_message':
        if (!this.workflowEngine) {
          this.postError('No active workflow to approve.')
          break
        }
        {
          const result = await this.workflowEngine.approveCommitMessage(message.payload.message)
          if (result.isErr()) {
            this.postError(result.error.message)
          }
        }
        break
      case 'approve_pr_description':
        if (!this.workflowEngine) {
          this.postError('No active workflow to approve.')
          break
        }
        {
          const result = await this.workflowEngine.approvePRDescription(message.payload)
          if (result.isErr()) {
            this.postError(result.error.message)
          }
        }
        break
      case 'open_external':
        try {
          const url = new URL(message.payload.url)
          if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            this.postError('Invalid URL protocol.')
            break
          }
          void vscode.env.openExternal(vscode.Uri.parse(message.payload.url))
        } catch {
          this.postError('Invalid URL.')
        }
        break
      case 'revert_operation':
        await this.revertOperation(message.payload.operationId)
        break
    }
  }

  private async startWorkflow(): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!workspaceRoot) {
      this.postError('No workspace folder open.')
      return
    }

    if (this.workflowEngine?.getState().status === 'running') {
      this.postError('A RepoFox workflow is already running.')
      return
    }

    const provider = await this.secrets.getAIProvider()
    const apiKey = (await this.secrets.getAPIKey(provider)) ?? ''

    if (!apiKey) {
      this.postMessage({ type: 'need_settings', payload: { reason: 'no_api_key' } })
      return
    }

    const gitClient = new GitClient({ repoPath: workspaceRoot, logger: this.logger })
    const remote = await gitClient.getRemoteUrl()
    const githubToken = (await this.secrets.getGitHubToken()) ?? ''
    const githubReadiness = resolveGitHubWorkflowReadiness({ token: githubToken, remote })
    if (githubReadiness.status === 'token_missing') {
      this.postMessage({ type: 'need_settings', payload: { reason: 'no_github_token' } })
      return
    }
    if (githubReadiness.status === 'remote_unavailable') {
      this.postError('RepoFox cannot read origin. Add a GitHub remote before creating a pull request.')
      return
    }
    if (githubReadiness.status === 'remote_not_github') {
      this.postMessage({
        type: 'warning',
        payload: { message: 'This remote is not hosted on GitHub. RepoFox can branch, commit, and push, but cannot create a GitHub pull request.' },
      })
    }

    this.workflowEngine = new WorkflowEngine(
      {
        ai: {
          provider,
          apiKey,
        },
        github: githubReadiness.status === 'ready' ? githubReadiness.config : null,
        repoPath: workspaceRoot,
        autoApprove: false,
      },
      this.logger,
      async (event) => {
        await this.handleWorkflowEvent(event)
      },
    )
    this.sessionRecorder = new WorkflowSessionRecorder(new SessionStore(workspaceRoot, this.logger))

    this.postMessage({ type: 'workflow_started' })

    const result = await this.workflowEngine.run()
    if (result.isErr()) {
      this.postError(result.error.message)
      this.workflowEngine = undefined
    }
  }

  private async runStep(): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!workspaceRoot) {
      this.postError('No workspace folder open.')
      return
    }

    if (!this.workflowEngine) {
      const provider = await this.secrets.getAIProvider()
      const apiKey = (await this.secrets.getAPIKey(provider)) ?? ''

      if (!apiKey) {
        this.postMessage({ type: 'need_settings', payload: { reason: 'no_api_key' } })
        return
      }

      const gitClient = new GitClient({ repoPath: workspaceRoot, logger: this.logger })
      const remote = await gitClient.getRemoteUrl()
      const githubToken = (await this.secrets.getGitHubToken()) ?? ''
      const githubReadiness = resolveGitHubWorkflowReadiness({ token: githubToken, remote })
      if (githubReadiness.status === 'token_missing') {
        this.postMessage({ type: 'need_settings', payload: { reason: 'no_github_token' } })
        return
      }
      if (githubReadiness.status === 'remote_unavailable') {
        this.postError('RepoFox cannot read origin. Add a GitHub remote before creating a pull request.')
        return
      }
      if (githubReadiness.status === 'remote_not_github') {
        this.postMessage({
          type: 'warning',
          payload: { message: 'This remote is not hosted on GitHub. RepoFox can branch, commit, and push, but cannot create a GitHub pull request.' },
        })
      }

      this.workflowEngine = new WorkflowEngine(
        {
          ai: {
            provider,
            apiKey,
          },
          github: githubReadiness.status === 'ready' ? githubReadiness.config : null,
          repoPath: workspaceRoot,
          autoApprove: false,
        },
        this.logger,
        async (event) => {
          await this.handleWorkflowEvent(event)
        },
      )
      this.sessionRecorder = new WorkflowSessionRecorder(new SessionStore(workspaceRoot, this.logger))
    }

    this.postMessage({ type: 'workflow_started' })

    const result = await this.workflowEngine.next()
    if (result.isErr()) {
      this.postError(result.error.message)
      this.workflowEngine = undefined
    }
  }

  private async handleWorkflowEvent(event: WorkflowEvent): Promise<void> {
    this.sessionRecorder?.record(event)
    switch (event.type) {
      case 'state_changed':
        this.postMessage({ type: 'workflow_state_changed', payload: event.state })
        break
      case 'approval_required':
        this.postMessage({
          type: 'approval_required',
          payload: {
            kind: event.kind,
            suggestion: event.suggestion,
            aiFailed: 'aiFailed' in event ? event.aiFailed : false,
          },
        })
        break
      case 'warning':
        this.postMessage({ type: 'warning', payload: { message: event.message } })
        this.output.appendLine(`[warn] ${event.message}`)
        break
      case 'complete':
        {
          const persisted = await this.sessionRecorder?.flush()
          if (persisted?.isErr()) {
            this.postError(persisted.error.message)
            return
          }
          const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
          if (workspaceRoot) {
            const session = await new SessionStore(workspaceRoot, this.logger).getById(
              this.workflowEngine?.getState().sessionId ?? '',
            )
            if (session.isOk() && session.value) {
              this.postMessage({ type: 'history_updated', payload: toCompletedSession(session.value) })
            }
          }
        }
        this.postMessage({ type: 'workflow_complete', payload: { prUrl: event.prUrl } })
        this.workflowEngine = undefined
        this.sessionRecorder = undefined
        if (event.prUrl) {
          void vscode.env.openExternal(vscode.Uri.parse(event.prUrl))
        }
        break
      case 'error':
        await this.sessionRecorder?.flush()
        this.workflowEngine = undefined
        this.sessionRecorder = undefined
        this.postError(event.error.message)
        break
    }
  }

  private async revertOperation(operationId: string): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    const sessionStore = workspaceRoot ? new SessionStore(workspaceRoot, this.logger) : undefined
    const active = sessionStore ? await sessionStore.getActive() : undefined
    const workflowState = active?.isOk() ? active.value?.state ?? null : null

    if (!workflowState || !workspaceRoot) {
      this.postError('No workflow state available to revert.')
      return
    }

    const operation = workflowState.operations.find((item) => item.id === operationId)
    if (!operation?.snapshotId) {
      this.postError('Selected operation cannot be reverted.')
      return
    }

    const snapshots = new SnapshotManager(workspaceRoot, this.logger)
    const restored = await snapshots.restore(operation.snapshotId)
    if (restored.isErr()) {
      this.postError(restored.error.message)
      return
    }

    const opIndex = workflowState.operations.findIndex((item) => item.id === operationId)
    const nextState = {
      ...workflowState,
      status: 'idle' as const,
      currentOperation: null,
      operations: workflowState.operations.slice(0, opIndex),
    }
    const saved = await sessionStore?.saveActive(nextState)
    if (saved?.isErr()) {
      this.postError(saved.error.message)
      return
    }
    this.postMessage({ type: 'workflow_state_changed', payload: nextState })
    void vscode.window.showInformationMessage(`RepoFox restored "${operation.label}".`)
  }

  private async getCurrentBranch(workspaceRoot: string): Promise<string> {
    if (!workspaceRoot) {
      return 'no workspace'
    }

    const git = new GitClient({ repoPath: workspaceRoot, logger: this.logger })
    const status = await git.getStatus()
    return status.isOk() ? status.value.branch : 'unknown'
  }

  private postError(message: string): void {
    this.postMessage({ type: 'error', payload: { message } })
    this.output.appendLine(`[error] ${message}`)
  }

  private postMessage(message: ExtensionMessage): void {
    void this.webviewView?.webview.postMessage(message)
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js'),
    )
    const nonce = getNonce()

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
</html>`
  }
}

function toCompletedSession(session: WorkflowSession): CompletedWorkflowSession {
  const branchName = session.state.operations.find((operation) => operation.operation === 'branch_created')?.detail
    ?? 'unknown branch'
  return {
    id: session.id,
    branchName,
    completedAt: session.updatedAt,
    prUrl: session.prUrl,
    status: session.prUrl ? 'open' : 'closed',
  }
}

function createOutputLogger(output: vscode.OutputChannel): Logger {
  const write = (level: string, message: string, data?: unknown): void => {
    const timestamp = new Date().toISOString()
    const suffix = data === undefined ? '' : ` ${safeStringify(data)}`
    output.appendLine(`[${timestamp}] [${level}] ${message}${suffix}`)
  }

  return {
    debug: (message, data) => write('debug', message, data),
    info: (message, data) => write('info', message, data),
    warn: (message, data) => write('warn', message, data),
    error: (message, data) => write('error', message, data),
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '"[unserializable]"'
  }
}

function getNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let text = ''

  for (let index = 0; index < 32; index += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }

  return text
}
