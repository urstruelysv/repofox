import { ok } from 'neverthrow'
import { describe, expect, it, vi } from 'vitest'
import type { WorkflowState } from '../types/index.js'
import { WorkflowSessionRecorder } from './recorder.js'

function state(sessionId: string): WorkflowState {
  return {
    status: 'running',
    currentOperation: null,
    operations: [],
    sessionId,
  }
}

describe('WorkflowSessionRecorder', () => {
  it('persists state before completing its session', async () => {
    const calls: string[] = []
    const store = {
      saveActive: vi.fn().mockImplementation(async () => {
        calls.push('save')
        return ok(undefined)
      }),
      complete: vi.fn().mockImplementation(async () => {
        calls.push('complete')
        return ok(undefined)
      }),
      fail: vi.fn(),
    }
    const recorder = new WorkflowSessionRecorder(store)

    recorder.record({ type: 'state_changed', state: state('session-1') })
    recorder.record({ type: 'complete', prUrl: 'https://github.com/acme/demo/pull/1' })

    const result = await recorder.flush()
    expect(result.isOk()).toBe(true)
    expect(calls).toEqual(['save', 'complete'])
    expect(store.complete).toHaveBeenCalledWith(
      'session-1',
      'https://github.com/acme/demo/pull/1',
    )
  })

  it('records an engine error against the last observed session', async () => {
    const store = {
      saveActive: vi.fn().mockResolvedValue(ok(undefined)),
      complete: vi.fn(),
      fail: vi.fn().mockResolvedValue(ok(undefined)),
    }
    const recorder = new WorkflowSessionRecorder(store)

    recorder.record({ type: 'state_changed', state: state('session-2') })
    recorder.record({ type: 'error', error: { code: 'PUSH_FAILED', message: 'Push rejected' } })

    const result = await recorder.flush()
    expect(result.isOk()).toBe(true)
    expect(store.fail).toHaveBeenCalledWith('session-2', 'Push rejected')
  })
})
