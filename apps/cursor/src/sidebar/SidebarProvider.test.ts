import { beforeEach, describe, expect, it, vi } from 'vitest'

const postMessage = vi.fn()
let receiveMessage: ((message: unknown) => void) | undefined

vi.mock('vscode', () => ({
  window: {
    createOutputChannel: () => ({
      appendLine: vi.fn(),
      dispose: vi.fn(),
      show: vi.fn(),
    }),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/fixture' } }],
  },
  Uri: {
    joinPath: (...parts: string[]) => parts.join('/'),
  },
}))

vi.mock('@repofox/core', () => ({
  GitClient: class {
    async getRemoteUrl() {
      return { isOk: () => false }
    }

    async getStatus() {
      return { isOk: () => true, value: { branch: 'fixture-branch' } }
    }
  },
  GitHubClient: { parseOwnerRepo: () => null },
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
  },
  SnapshotManager: class {},
  WorkflowEngine: class {},
  WorkflowSessionRecorder: class {
    record() {}
    async flush() {
      return { isOk: () => true, isErr: () => false }
    }
  },
}))

import { SidebarProvider } from './SidebarProvider.js'

describe('SidebarProvider', () => {
  beforeEach(() => {
    postMessage.mockReset()
    receiveMessage = undefined
  })

  it('sends initial state after the webview declares itself ready', async () => {
    const provider = new SidebarProvider(
      {} as never,
      {
        getAIProvider: vi.fn().mockResolvedValue('groq'),
        getAPIKey: vi.fn().mockResolvedValue('fixture-key'),
        getGitHubToken: vi.fn().mockResolvedValue(undefined),
      } as never,
      {
        getWorkflowState: vi.fn().mockReturnValue(null),
      } as never,
    )
    const webview = {
      options: {},
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

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'init',
        payload: expect.objectContaining({ workspaceRoot: '/fixture' }),
      }),
    )
  })
})
