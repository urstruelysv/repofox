import * as vscode from 'vscode'
import type { WorkflowState } from '@repofox/core'

const KEYS = {
  WORKFLOW_STATE: 'repofox.workflow.state',
} as const

export class StateManager {
  constructor(private readonly globalState: vscode.Memento) {}

  getWorkflowState(workspaceRoot?: string): WorkflowState | null {
    if (workspaceRoot) {
      return this.globalState.get<WorkflowState>(this.getScopedKey(workspaceRoot)) ?? null
    }

    return this.globalState.get<WorkflowState>(KEYS.WORKFLOW_STATE) ?? null
  }

  async setWorkflowState(state: WorkflowState, workspaceRoot?: string): Promise<void> {
    const key = workspaceRoot ? this.getScopedKey(workspaceRoot) : KEYS.WORKFLOW_STATE
    await this.globalState.update(key, state)
  }

  async clearWorkflowState(workspaceRoot?: string): Promise<void> {
    const key = workspaceRoot ? this.getScopedKey(workspaceRoot) : KEYS.WORKFLOW_STATE
    await this.globalState.update(key, undefined)
  }

  private getScopedKey(workspaceRoot: string): string {
    const hash = workspaceRoot.split("").reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0)
      return a & a
    }, 0)
    return `${KEYS.WORKFLOW_STATE}.${Math.abs(hash).toString(36)}`
  }
}
