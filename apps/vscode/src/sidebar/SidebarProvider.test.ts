import { beforeEach, describe, expect, it, vi } from 'vitest'

const postMessage = vi.fn()
let receiveMessage: ((message: unknown) => void) | undefined
let remoteResult: unknown
const workflowConfigs: unknown[] = []

vi.mock('vscode', () => ({
  window: { createOutputChannel: () => ({ appendLine: vi.fn(), show: vi.fn() }) },
  workspace: { workspaceFolders: [{ uri: { fsPath: '/fixture' } }] },
  Uri: {
    joinPath: (...parts: string[]) => parts.join('/'),
  },
}))

vi.mock('@repofox/core', () => ({
  GitClient: class {
    async getRemoteUrl() {
      return remoteResult
    }
    async getStatus() {
      return { isOk: () => true, value: { branch: 'fixture-branch' } }
    }
  },
  GitHubClient: { parseOwnerRepo: () => ({ owner: 'owner', repo: 'repo' }) },
  resolveGitHubWorkflowReadiness: ({ token, remote }: { token: string; remote: { isErr: () => boolean; error?: { message: string }; value?: string } }) => {
    if (!token.trim()) return { status: 'token_missing' }
    if (remote.isErr()) return { status: 'remote_unavailable', message: remote.error?.message ?? 'remote unavailable' }
    return { status: 'ready', config: { token: token.trim(), owner: 'owner', repo: 'repo' } }
  },
  SessionStore: class {
    async getActive() {
      return { isOk: () => true, isErr: () => false, value: null }
    }
    async getById() {
      return { isOk: () => true, isErr: () => false, value: null }
    }
    async list() {
      return { isOk: () => true, isErr: () => false, value: [] }
    }
    async clearActive() {
      return { isOk: () => true, isErr: () => false }
    }
    async saveActive() {
      return { isOk: () => true, isErr: () => false }
    }
  },
  SnapshotManager: class {},
  WorkflowEngine: class {
    constructor(config: unknown) {
      workflowConfigs.push(config)
    }
    async run() {
      return { isOk: () => true, isErr: () => false }
    }
  },
  WorkflowSessionRecorder: class {
    record() {}
    async flush() {
      return { isOk: () => true, isErr: () => false }
    }
  },
}))

import { SidebarProvider } from './SidebarProvider.js'

describe('SidebarProvider credential initialization', () => {
  beforeEach(() => {
    postMessage.mockReset()
    receiveMessage = undefined
    remoteResult = { isOk: () => true, isErr: () => false, value: 'git@github.com:owner/repo.git' }
    workflowConfigs.splice(0)
  })

  it('sends fresh saved-credential state after the webview is ready', async () => {
    const provider = new SidebarProvider(
      {} as never,
      {
        getAIProvider: vi.fn().mockResolvedValue('groq'),
        getAPIKey: vi.fn().mockResolvedValue('saved-groq-key'),
        getGitHubToken: vi.fn().mockResolvedValue('saved-github-token'),
      } as never,
      {
        getWorkflowState: vi.fn().mockReturnValue(null),
        getCompletedSessions: vi.fn().mockReturnValue([]),
      } as never,
    )
    const webview = {
      options: {},
      cspSource: 'vscode-webview://fixture',
      asWebviewUri: vi.fn().mockReturnValue('vscode-webview://fixture'),
      onDidReceiveMessage: vi.fn((listener) => {
        receiveMessage = listener
      }),
      postMessage,
    }

    provider.resolveWebviewView({ webview } as never)
    await new Promise((resolve) => setImmediate(resolve))
    postMessage.mockClear()

    receiveMessage?.({ type: 'webview_ready' })
    await new Promise((resolve) => setImmediate(resolve))

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'init',
      payload: expect.objectContaining({ hasApiKey: true, hasGitHubToken: true }),
    }))
  })

  it('explains an unreadable remote instead of treating a saved token as missing', async () => {
    remoteResult = {
      isOk: () => false,
      isErr: () => true,
      error: { code: 'REMOTE_NOT_FOUND', message: 'origin is missing' },
    }
    const provider = new SidebarProvider(
      {} as never,
      {
        getAIProvider: vi.fn().mockResolvedValue('groq'),
        getAPIKey: vi.fn().mockResolvedValue('saved-groq-key'),
        getGitHubToken: vi.fn().mockResolvedValue('saved-github-token'),
      } as never,
      { getWorkflowState: vi.fn().mockReturnValue(null), getCompletedSessions: vi.fn().mockReturnValue([]) } as never,
    )
    const webview = {
      options: {},
      cspSource: 'vscode-webview://fixture',
      asWebviewUri: vi.fn().mockReturnValue('vscode-webview://fixture'),
      onDidReceiveMessage: vi.fn((listener) => { receiveMessage = listener }),
      postMessage,
    }

    provider.resolveWebviewView({ webview } as never)
    receiveMessage?.({ type: 'run_workflow' })
    await new Promise((resolve) => setImmediate(resolve))

    expect(postMessage).toHaveBeenCalledWith({
      type: 'error',
      payload: { message: 'RepoFox cannot read origin. Add a GitHub remote before creating a pull request.' },
    })
    expect(workflowConfigs).toHaveLength(0)
  })

  it('returns non-secret credential status immediately after saving', async () => {
    const secrets = {
      getAIProvider: vi.fn().mockResolvedValue('groq'),
      getAPIKey: vi.fn().mockResolvedValue('saved-groq-key'),
      getGitHubToken: vi.fn().mockResolvedValue('saved-github-token'),
      setAIProvider: vi.fn(),
      setAPIKey: vi.fn(),
      setGitHubToken: vi.fn(),
    }
    const provider = new SidebarProvider(
      {} as never,
      secrets as never,
      { getWorkflowState: vi.fn().mockReturnValue(null), getCompletedSessions: vi.fn().mockReturnValue([]) } as never,
    )
    const webview = {
      options: {},
      cspSource: 'vscode-webview://fixture',
      asWebviewUri: vi.fn().mockReturnValue('vscode-webview://fixture'),
      onDidReceiveMessage: vi.fn((listener) => { receiveMessage = listener }),
      postMessage,
    }

    provider.resolveWebviewView({ webview } as never)
    receiveMessage?.({
      type: 'save_settings',
      payload: { provider: 'groq', apiKey: 'new-groq-key', githubToken: 'new-github-token' },
    })
    await new Promise((resolve) => setImmediate(resolve))

    expect(postMessage).toHaveBeenCalledWith({
      type: 'settings_saved',
      payload: { hasApiKey: true, hasGitHubToken: true },
    })
  })
})
