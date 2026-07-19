import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({}));

import { StateManager, type CompletedWorkflowSession } from "./StateManager.js";

class MemoryMemento {
  private readonly values = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.values.delete(key);
      return;
    }
    this.values.set(key, value);
  }
}

function session(id: string, completedAt: number): CompletedWorkflowSession {
  return {
    id,
    branchName: `feat/${id}`,
    completedAt,
    prUrl: null,
    status: "closed",
  };
}

describe("StateManager completed workflow sessions", () => {
  it("persists a completed session per workspace", async () => {
    const manager = new StateManager(new MemoryMemento() as never);

    await manager.addCompletedSession(session("one", 1), "/workspace/one");

    expect(manager.getCompletedSessions("/workspace/one")).toEqual([
      session("one", 1),
    ]);
    expect(manager.getCompletedSessions("/workspace/two")).toEqual([]);
  });

  it("keeps only the 20 most recent completed sessions", async () => {
    const manager = new StateManager(new MemoryMemento() as never);

    for (let number = 1; number <= 21; number += 1) {
      await manager.addCompletedSession(
        session(String(number), number),
        "/workspace/one",
      );
    }

    const sessions = manager.getCompletedSessions("/workspace/one");
    expect(sessions).toHaveLength(20);
    expect(sessions[0]?.id).toBe("21");
    expect(sessions.at(-1)?.id).toBe("2");
  });
});
