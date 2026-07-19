import { err, ok } from 'neverthrow'
import type { RepoFoxError, RepoFoxResult, WorkflowState } from '../types/index.js'
import type { WorkflowEvent } from '../workflow/index.js'
import type { WorkflowSession } from './index.js'

interface SessionWriter {
  saveActive(state: WorkflowState): Promise<RepoFoxResult<WorkflowSession>>
  complete(sessionId: string, prUrl: string | null): Promise<RepoFoxResult<WorkflowSession>>
  fail(sessionId: string, message: string): Promise<RepoFoxResult<WorkflowSession>>
}

export class WorkflowSessionRecorder {
  private pending: Promise<RepoFoxResult<void>> = Promise.resolve(ok(undefined))
  private sessionId: string | null = null

  constructor(private readonly store: SessionWriter) {}

  record(event: WorkflowEvent): void {
    if (event.type === 'state_changed') {
      this.sessionId = event.state.sessionId
      this.enqueue(() => this.store.saveActive(event.state))
      return
    }

    if (event.type === 'complete') {
      this.enqueueForSession((sessionId) => this.store.complete(sessionId, event.prUrl))
      return
    }

    if (event.type === 'error') {
      this.enqueueForSession((sessionId) => this.store.fail(sessionId, event.error.message))
    }
  }

  async flush(): Promise<RepoFoxResult<void>> {
    return this.pending
  }

  private enqueueForSession(
    write: (sessionId: string) => Promise<RepoFoxResult<WorkflowSession>>,
  ): void {
    if (!this.sessionId) {
      this.pending = this.pending.then(() => err(recorderError(
        'SESSION_RECORDER_NO_SESSION',
        'Workflow finished before a session state was recorded.',
      )))
      return
    }
    const sessionId = this.sessionId
    this.enqueue(() => write(sessionId))
  }

  private enqueue(
    write: () => Promise<RepoFoxResult<WorkflowSession>>,
  ): void {
    this.pending = this.pending.then(async (previous) => {
      if (previous.isErr()) return err(previous.error)
      const result = await write()
      return result.isErr() ? err(result.error) : ok(undefined)
    })
  }
}

function recorderError(code: string, message: string): RepoFoxError {
  return { code, message }
}
