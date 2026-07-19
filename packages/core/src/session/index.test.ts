import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SessionStore, type Logger, type WorkflowState } from "../index.js";

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function state(sessionId: string): WorkflowState {
  return {
    status: "running",
    currentOperation: null,
    operations: [],
    sessionId,
  };
}

async function fixtureRepo(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "repofox-session-"));
  await mkdir(join(repo, ".git"), { recursive: true });
  return repo;
}

describe("SessionStore", () => {
  it("persists active workflow state readable by a fresh store instance", async () => {
    const repo = await fixtureRepo();
    try {
      const store = new SessionStore(repo, logger);
      const saved = await store.saveActive(state("session-1"));
      expect(saved.isOk()).toBe(true);

      const freshStore = new SessionStore(repo, logger);
      const active = await freshStore.getActive();
      expect(active.isOk() && active.value).toMatchObject({
        id: "session-1",
        outcome: "active",
      });
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("keeps completed receipts and snapshots when active state is reset", async () => {
    const repo = await fixtureRepo();
    try {
      const store = new SessionStore(repo, logger);
      await store.saveActive(state("session-1"));
      await store.complete("session-1", "https://github.com/acme/demo/pull/1");
      const snapshotDir = join(
        repo,
        ".git",
        "repofox",
        "snapshots",
        "snapshot-1",
      );
      await mkdir(snapshotDir, { recursive: true });

      const cleared = await store.clearActive();
      expect(cleared.isOk()).toBe(true);

      const active = await store.getActive();
      expect(active.isOk() && active.value).toBeNull();
      const sessions = await store.list();
      expect(sessions.isOk() && sessions.value).toEqual([
        expect.objectContaining({ id: "session-1", outcome: "complete" }),
      ]);
      await expect(stat(snapshotDir)).resolves.toBeDefined();
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("stores workflow state in a linked worktree git directory", async () => {
    const repo = await mkdtemp(join(tmpdir(), "repofox-session-worktree-"));
    const gitDir = join(repo, "worktree-git-dir");
    await mkdir(gitDir, { recursive: true });
    await writeFile(join(repo, ".git"), "gitdir: worktree-git-dir\n", "utf8");

    try {
      const saved = await new SessionStore(repo, logger).saveActive(
        state("session-worktree"),
      );

      expect(saved.isOk()).toBe(true);
      await expect(
        stat(join(gitDir, "repofox", "sessions", "session-worktree.json")),
      ).resolves.toBeDefined();
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("rejects malformed session data instead of returning partial history", async () => {
    const repo = await fixtureRepo();
    try {
      const sessionDir = join(repo, ".git", "repofox", "sessions");
      await mkdir(sessionDir, { recursive: true });
      await writeFile(join(sessionDir, "bad.json"), "{bad json", "utf8");

      const result = await new SessionStore(repo, logger).list();
      expect(result.isErr() && result.error.code).toBe("SESSION_CORRUPTED");
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("rejects a partial record even when its filename and id agree", async () => {
    const repo = await fixtureRepo();
    try {
      const sessionDir = join(repo, ".git", "repofox", "sessions");
      await mkdir(sessionDir, { recursive: true });
      await writeFile(
        join(sessionDir, "session-1.json"),
        JSON.stringify({
          version: 1,
          id: "session-1",
          prUrl: null,
          error: null,
          state: state("session-1"),
        }),
        "utf8",
      );

      const result = await new SessionStore(repo, logger).list();
      expect(result.isErr() && result.error.code).toBe("SESSION_CORRUPTED");
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});
