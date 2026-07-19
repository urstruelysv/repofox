import * as vscode from "vscode";
import type { WorkflowState } from "@repofox/core";
import type { CompletedWorkflowSession } from "../types/messages";

export type { CompletedWorkflowSession } from "../types/messages";

const KEYS = {
  WORKFLOW_STATE: "repofox.workflow.state",
  COMPLETED_SESSIONS: "repofox.workflow.completedSessions",
} as const;

const MAX_COMPLETED_SESSIONS = 20;

export class StateManager {
  constructor(private readonly globalState: vscode.Memento) {}

  getWorkflowState(workspaceRoot?: string): WorkflowState | null {
    if (workspaceRoot) {
      return (
        this.globalState.get<WorkflowState>(this.getScopedKey(workspaceRoot)) ??
        null
      );
    }

    return this.globalState.get<WorkflowState>(KEYS.WORKFLOW_STATE) ?? null;
  }

  async setWorkflowState(
    state: WorkflowState,
    workspaceRoot?: string,
  ): Promise<void> {
    const key = workspaceRoot
      ? this.getScopedKey(workspaceRoot)
      : KEYS.WORKFLOW_STATE;
    await this.globalState.update(key, state);
  }

  async clearWorkflowState(workspaceRoot?: string): Promise<void> {
    const key = workspaceRoot
      ? this.getScopedKey(workspaceRoot)
      : KEYS.WORKFLOW_STATE;
    await this.globalState.update(key, undefined);
  }

  getCompletedSessions(workspaceRoot?: string): CompletedWorkflowSession[] {
    if (!workspaceRoot) return [];
    return (
      this.globalState.get<CompletedWorkflowSession[]>(
        this.getCompletedSessionsKey(workspaceRoot),
      ) ?? []
    );
  }

  async addCompletedSession(
    session: CompletedWorkflowSession,
    workspaceRoot?: string,
  ): Promise<void> {
    if (!workspaceRoot) return;

    const sessions = this.getCompletedSessions(workspaceRoot).filter(
      (existing) => existing.id !== session.id,
    );
    sessions.unshift(session);
    await this.globalState.update(
      this.getCompletedSessionsKey(workspaceRoot),
      sessions.slice(0, MAX_COMPLETED_SESSIONS),
    );
  }

  private getScopedKey(workspaceRoot: string): string {
    return `${KEYS.WORKFLOW_STATE}.${workspaceRoot.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
  }

  private getCompletedSessionsKey(workspaceRoot: string): string {
    return `${KEYS.COMPLETED_SESSIONS}.${workspaceRoot.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
  }
}
