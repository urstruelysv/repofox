import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { err, ok } from "neverthrow";
import type { Logger } from "../logger/index.js";
import type {
  RepoFoxError,
  RepoFoxResult,
  WorkflowState,
} from "../types/index.js";

const SESSIONS_DIR = "sessions";
const INDEX_FILE = "index.json";
const MAX_SESSIONS = 20;

export type SessionOutcome = "active" | "complete" | "failed";

export interface WorkflowSession {
  version: 1;
  id: string;
  createdAt: number;
  updatedAt: number;
  outcome: SessionOutcome;
  state: WorkflowState;
  prUrl: string | null;
  error: string | null;
}

interface SessionIndex {
  version: 1;
  activeSessionId: string | null;
  sessionIds: string[];
}

export class SessionStore {
  constructor(
    private readonly repoPath: string,
    private readonly logger: Logger,
  ) {}

  async saveActive(
    state: WorkflowState,
  ): Promise<RepoFoxResult<WorkflowSession>> {
    const existing = await this.getById(state.sessionId);
    if (existing.isErr()) return err(existing.error);

    const now = Date.now();
    const session: WorkflowSession = {
      version: 1,
      id: state.sessionId,
      createdAt: existing.value?.createdAt ?? now,
      updatedAt: now,
      outcome: "active",
      state,
      prUrl: null,
      error: null,
    };

    return this.save(session, state.sessionId);
  }

  async complete(
    sessionId: string,
    prUrl: string | null,
  ): Promise<RepoFoxResult<WorkflowSession>> {
    return this.finish(sessionId, "complete", { prUrl, error: null });
  }

  async fail(
    sessionId: string,
    message: string,
  ): Promise<RepoFoxResult<WorkflowSession>> {
    return this.finish(sessionId, "failed", { prUrl: null, error: message });
  }

  async getActive(): Promise<RepoFoxResult<WorkflowSession | null>> {
    const index = await this.readIndex();
    if (index.isErr()) return err(index.error);
    if (!index.value.activeSessionId) return ok(null);

    const session = await this.getById(index.value.activeSessionId);
    if (session.isErr()) return err(session.error);
    if (!session.value) {
      return err(
        sessionError(
          "SESSION_CORRUPTED",
          `Active session ${index.value.activeSessionId} does not exist.`,
        ),
      );
    }
    return ok(session.value);
  }

  async getById(
    sessionId: string,
  ): Promise<RepoFoxResult<WorkflowSession | null>> {
    try {
      const raw = await readFile(this.sessionPath(sessionId), "utf8");
      return parseSession(raw, sessionId);
    } catch (cause) {
      if (isNotFound(cause)) return ok(null);
      return err(
        sessionError(
          "SESSION_READ_FAILED",
          `Failed to read session ${sessionId}.`,
          cause,
        ),
      );
    }
  }

  async list(): Promise<RepoFoxResult<WorkflowSession[]>> {
    try {
      const entries = await readdir(this.sessionsPath(), {
        withFileTypes: true,
      });
      const files = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => entry.name);

      const sessions: WorkflowSession[] = [];
      for (const filename of files) {
        const id = filename.slice(0, -".json".length);
        const raw = await readFile(join(this.sessionsPath(), filename), "utf8");
        const parsed = parseSession(raw, id);
        if (parsed.isErr()) return err(parsed.error);
        sessions.push(parsed.value);
      }

      return ok(
        sessions.sort((left, right) => right.updatedAt - left.updatedAt),
      );
    } catch (cause) {
      if (isNotFound(cause)) return ok([]);
      return err(
        sessionError(
          "SESSION_READ_FAILED",
          "Failed to list workflow sessions.",
          cause,
        ),
      );
    }
  }

  async clearActive(): Promise<RepoFoxResult<void>> {
    const index = await this.readIndex();
    if (index.isErr()) return err(index.error);

    const write = await this.writeIndex({
      ...index.value,
      activeSessionId: null,
    });
    return write.isErr() ? err(write.error) : ok(undefined);
  }

  private async finish(
    sessionId: string,
    outcome: Exclude<SessionOutcome, "active">,
    fields: Pick<WorkflowSession, "prUrl" | "error">,
  ): Promise<RepoFoxResult<WorkflowSession>> {
    const existing = await this.getById(sessionId);
    if (existing.isErr()) return err(existing.error);
    if (!existing.value) {
      return err(
        sessionError(
          "SESSION_NOT_FOUND",
          `Workflow session ${sessionId} was not found.`,
        ),
      );
    }

    const session: WorkflowSession = {
      ...existing.value,
      ...fields,
      outcome,
      updatedAt: Date.now(),
      state: {
        ...existing.value.state,
        status: outcome === "complete" ? "complete" : "failed",
      },
    };
    return this.save(session, null);
  }

  private async save(
    session: WorkflowSession,
    activeSessionId: string | null,
  ): Promise<RepoFoxResult<WorkflowSession>> {
    try {
      await mkdir(this.sessionsPath(), { recursive: true });
      await this.atomicWrite(
        this.sessionPath(session.id),
        JSON.stringify(session, null, 2),
      );

      const currentIndex = await this.readIndex();
      if (currentIndex.isErr()) return err(currentIndex.error);
      const sessionIds = [
        session.id,
        ...currentIndex.value.sessionIds.filter((id) => id !== session.id),
      ].slice(0, MAX_SESSIONS);
      const nextIndex: SessionIndex = {
        version: 1,
        activeSessionId,
        sessionIds,
      };
      const written = await this.writeIndex(nextIndex);
      if (written.isErr()) return err(written.error);

      this.logger.info("workflow session saved", {
        id: session.id,
        outcome: session.outcome,
      });
      return ok(session);
    } catch (cause) {
      return err(
        sessionError(
          "SESSION_WRITE_FAILED",
          `Failed to save session ${session.id}.`,
          cause,
        ),
      );
    }
  }

  private async readIndex(): Promise<RepoFoxResult<SessionIndex>> {
    try {
      const raw = await readFile(this.indexPath(), "utf8");
      return parseIndex(raw);
    } catch (cause) {
      if (isNotFound(cause)) {
        return ok({ version: 1, activeSessionId: null, sessionIds: [] });
      }
      return err(
        sessionError(
          "SESSION_READ_FAILED",
          "Failed to read workflow session index.",
          cause,
        ),
      );
    }
  }

  private async writeIndex(index: SessionIndex): Promise<RepoFoxResult<void>> {
    try {
      await mkdir(this.ledgerPath(), { recursive: true });
      await this.atomicWrite(this.indexPath(), JSON.stringify(index, null, 2));
      return ok(undefined);
    } catch (cause) {
      return err(
        sessionError(
          "SESSION_WRITE_FAILED",
          "Failed to write workflow session index.",
          cause,
        ),
      );
    }
  }

  private async atomicWrite(path: string, content: string): Promise<void> {
    const pending = `${path}.${randomUUID()}.pending`;
    await writeFile(pending, content, "utf8");
    await rename(pending, path);
  }

  private ledgerPath(): string {
    return join(this.gitDirPath(), "repofox");
  }

  private gitDirPath(): string {
    const dotGit = join(this.repoPath, ".git");
    try {
      const pointer = readFileSync(dotGit, "utf8").trim();
      const match = pointer.match(/^gitdir:\s*(.+)$/i);
      if (match?.[1]) {
        return resolve(this.repoPath, match[1].trim());
      }
    } catch {
      // A normal checkout has `.git` as a directory, which is the default below.
    }
    return dotGit;
  }

  private sessionsPath(): string {
    return join(this.ledgerPath(), SESSIONS_DIR);
  }

  private sessionPath(id: string): string {
    return join(this.sessionsPath(), `${id}.json`);
  }

  private indexPath(): string {
    return join(this.ledgerPath(), INDEX_FILE);
  }
}

function parseSession(
  raw: string,
  expectedId: string,
): RepoFoxResult<WorkflowSession> {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!isWorkflowSession(value) || value.id !== expectedId) {
      return err(
        sessionError("SESSION_CORRUPTED", `Session ${expectedId} is invalid.`),
      );
    }
    return ok(value);
  } catch (cause) {
    return err(
      sessionError(
        "SESSION_CORRUPTED",
        `Session ${expectedId} contains invalid JSON.`,
        cause,
      ),
    );
  }
}

function parseIndex(raw: string): RepoFoxResult<SessionIndex> {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!isSessionIndex(value)) {
      return err(
        sessionError("SESSION_CORRUPTED", "Workflow session index is invalid."),
      );
    }
    return ok(value);
  } catch (cause) {
    return err(
      sessionError(
        "SESSION_CORRUPTED",
        "Workflow session index contains invalid JSON.",
        cause,
      ),
    );
  }
}

function isWorkflowSession(value: unknown): value is WorkflowSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WorkflowSession>;
  return (
    candidate.version === 1 &&
    typeof candidate.id === "string" &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.updatedAt === "number" &&
    (candidate.outcome === "active" ||
      candidate.outcome === "complete" ||
      candidate.outcome === "failed") &&
    (typeof candidate.prUrl === "string" || candidate.prUrl === null) &&
    (typeof candidate.error === "string" || candidate.error === null) &&
    isWorkflowState(candidate.state)
  );
}

function isWorkflowState(value: unknown): value is WorkflowState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<WorkflowState>;
  return (
    typeof state.sessionId === "string" &&
    Array.isArray(state.operations) &&
    (state.status === "idle" ||
      state.status === "running" ||
      state.status === "paused" ||
      state.status === "complete" ||
      state.status === "failed") &&
    (state.currentOperation === null ||
      typeof state.currentOperation === "string")
  );
}

function isSessionIndex(value: unknown): value is SessionIndex {
  if (!value || typeof value !== "object") return false;
  const index = value as Partial<SessionIndex>;
  return (
    index.version === 1 &&
    (typeof index.activeSessionId === "string" ||
      index.activeSessionId === null) &&
    Array.isArray(index.sessionIds) &&
    index.sessionIds.every((id) => typeof id === "string")
  );
}

function isNotFound(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    cause.code === "ENOENT"
  );
}

function sessionError(
  code: string,
  message: string,
  cause?: unknown,
): RepoFoxError {
  return { code, message, cause };
}
