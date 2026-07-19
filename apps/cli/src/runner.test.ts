import { describe, expect, it, vi } from 'vitest'
import type { RepoFoxError, RepoFoxResult, WorkflowEventHandler } from '@repofox/core'
import { executeCliCommand, runCli, type CliWorkflow } from './runner.js'
import type { CliCommand, CliOptions } from './config.js'

function createOptions(overrides: Partial<CliOptions> = {}): CliOptions {
  return {
    action: 'commit_push_pr',
    repoPath: '/repofox/demo',
    ai: {
      provider: 'groq',
      apiKey: 'groq-key',
    },
    githubToken: 'gh-token',
    autoApprove: true,
    json: false,
    ...overrides,
  }
}

function createIO() {
  return {
    write: vi.fn(),
    error: vi.fn(),
    ask: vi.fn<() => Promise<string>>().mockResolvedValue(''),
  }
}

function okResult<T>(value: T): RepoFoxResult<T> {
  return {
    isOk: () => true,
    isErr: () => false,
    value,
  } as RepoFoxResult<T>
}

function errResult<T>(error: RepoFoxError): RepoFoxResult<T> {
  return {
    isOk: () => false,
    isErr: () => true,
    error,
  } as RepoFoxResult<T>
}

describe('runCli', () => {
  it('runs the selected stacked action through the workflow interface', async () => {
    const workflow: CliWorkflow = {
      runStackedAction: vi.fn().mockResolvedValue(okResult('https://github.com/repofox/repofox/pull/42')),
      approveBranchName: vi.fn(),
      approveCommitMessage: vi.fn(),
      approvePRDescription: vi.fn(),
    }
    const io = createIO()

    const exitCode = await runCli(createOptions({ action: 'commit_push' }), io, {
      createWorkflow: () => workflow,
    })

    expect(exitCode).toBe(0)
    expect(workflow.runStackedAction).toHaveBeenCalledWith('commit_push')
    expect(io.write).toHaveBeenCalledWith(expect.stringContaining('Workflow complete'))
  })

  it('drives approval events with suggested values when autoApprove is enabled', async () => {
    let onEvent: WorkflowEventHandler = () => undefined
    const store = {
      saveActive: vi.fn().mockResolvedValue(okResult(undefined)),
      complete: vi.fn().mockResolvedValue(okResult(undefined)),
      fail: vi.fn().mockResolvedValue(okResult(undefined)),
    }
    const workflow: CliWorkflow = {
      runStackedAction: vi.fn().mockImplementation(async () => {
        await onEvent({
          type: 'state_changed',
          state: {
            status: 'running',
            currentOperation: null,
            operations: [],
            sessionId: 'session-approval',
          },
        })
        await onEvent({
          type: 'approval_required',
          kind: 'commit_message',
          suggestion: {
            message: 'feat(cli): use workflow engine',
            type: 'feat',
            scope: 'cli',
            body: null,
          },
        })
        return okResult(null)
      }),
      approveBranchName: vi.fn(),
      approveCommitMessage: vi.fn().mockImplementation(async () => {
        await onEvent({ type: 'complete', prUrl: null })
        return okResult(undefined)
      }),
      approvePRDescription: vi.fn(),
    }
    const io = createIO()

    const exitCode = await runCli(createOptions({ autoApprove: true }), io, {
      createWorkflow: (_config, eventHandler) => {
        onEvent = eventHandler
        return workflow
      },
      createSessionStore: () => store as never,
    })

    expect(exitCode).toBe(0)
    expect(workflow.approveCommitMessage).toHaveBeenCalledWith('feat(cli): use workflow engine')
    expect(io.ask).not.toHaveBeenCalled()
  })

  it('returns a failing exit code and writes workflow errors to stderr', async () => {
    const workflow: CliWorkflow = {
      runStackedAction: vi.fn().mockResolvedValue(errResult({ code: 'NO_ACTION', message: 'No action available.' })),
      approveBranchName: vi.fn(),
      approveCommitMessage: vi.fn(),
      approvePRDescription: vi.fn(),
    }
    const io = createIO()

    const exitCode = await runCli(createOptions(), io, {
      createWorkflow: () => workflow,
    })

    expect(exitCode).toBe(1)
    expect(io.error).toHaveBeenCalledWith(expect.stringContaining('No action available.'))
  })

  it('prints completed ledger history without creating a workflow', async () => {
    const io = createIO()
    const sessions = [{
      id: 'session-1',
      outcome: 'complete',
      prUrl: 'https://github.com/repofox/repofox/pull/1',
      error: null,
      createdAt: 1,
      updatedAt: 2,
      version: 1 as const,
      state: {
        status: 'complete' as const,
        currentOperation: null,
        operations: [],
        sessionId: 'session-1',
      },
    }]
    const store = {
      getActive: vi.fn(),
      list: vi.fn().mockResolvedValue(okResult(sessions)),
    }

    const exitCode = await executeCliCommand(
      { kind: 'history', repoPath: '/repofox/demo', json: true },
      io,
      { createSessionStore: () => store as never },
    )

    expect(exitCode).toBe(0)
    expect(io.write).toHaveBeenCalledWith(expect.stringContaining('session-1'))
  })

  it('restores the snapshot selected by operation id only after --yes', async () => {
    const io = createIO()
    const store = {
      getActive: vi.fn(),
      list: vi.fn().mockResolvedValue(okResult([{
        id: 'session-1',
        outcome: 'complete',
        prUrl: null,
        error: null,
        createdAt: 1,
        updatedAt: 2,
        version: 1 as const,
        state: {
          status: 'complete' as const,
          currentOperation: null,
          sessionId: 'session-1',
          operations: [{
            id: 'operation-1',
            operation: 'committed' as const,
            status: 'done' as const,
            timestamp: 1,
            label: 'Commit',
            detail: 'abc123',
            snapshotId: 'snapshot-1',
          }],
        },
      }])),
    }
    const restoreSnapshot = vi.fn().mockResolvedValue(okResult(undefined))
    const command: CliCommand = {
      kind: 'restore',
      repoPath: '/repofox/demo',
      operationId: 'operation-1',
      yes: true,
      json: false,
    }

    const exitCode = await executeCliCommand(command, io, {
      createSessionStore: () => store as never,
      restoreSnapshot,
    })

    expect(exitCode).toBe(0)
    expect(restoreSnapshot).toHaveBeenCalledWith('/repofox/demo', 'snapshot-1', expect.any(Object))
  })
})
