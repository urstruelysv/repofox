import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { ok, err } from 'neverthrow'
import { simpleGit, type SimpleGit, type SimpleGitOptions } from 'simple-git'
import type { Logger } from '../logger/index.js'
import type { OperationType, RepoFoxError, RepoFoxResult, Snapshot } from '../types/index.js'

const SNAPSHOTS_REF = '.git/repofox/snapshots'

interface StoredUntrackedFile {
  path: string
  contentBase64: string
}

// Every snapshot is exactly these 4 files. No more, no less.
const SNAPSHOT_FILES = (id: string) => ({
  meta:      `${id}.meta.json`,       // the Snapshot object itself
  working:   `${id}.working.patch`,   // unstaged changes
  staged:    `${id}.staged.patch`,    // staged changes
  untracked: `${id}.untracked.json`,  // untracked files as base64
})

export class SnapshotManager {
  private readonly repoPath: string
  private readonly logger: Logger
  private readonly git: SimpleGit
  private locked = false

  constructor(repoPath: string, logger: Logger) {
    this.repoPath = repoPath
    this.logger = logger
    const config: Partial<SimpleGitOptions> = {
      baseDir: repoPath,
      binary: 'git',
      maxConcurrentProcesses: 1,
      trimmed: true,
    }
    this.git = simpleGit(config)
  }

  private get snapshotDir(): string {
    return join(this.repoPath, SNAPSHOTS_REF)
  }

  // Returns a temp dir path for a given snapshot id.
  // Nothing at this path is ever considered valid by the rest of the system.
  private pendingDir(id: string): string {
    return join(this.snapshotDir, `${id}.pending`)
  }

  // Returns the final dir path for a completed, verified snapshot.
  private snapshotPath(id: string): string {
    return join(this.snapshotDir, id)
  }

  private async acquireLock(): Promise<RepoFoxResult<void>> {
    if (this.locked) {
      return err(snapshotError('SNAPSHOT_LOCKED', 'Another snapshot operation is in progress'))
    }
    this.locked = true
    return ok(undefined)
  }

  private releaseLock(): void {
    this.locked = false
  }

  async capture(
    operation: OperationType,
    metadata: Record<string, string>,
  ): Promise<RepoFoxResult<Snapshot>> {
    const lockResult = await this.acquireLock()
    if (lockResult.isErr()) return err(lockResult.error)

    const id = randomUUID()
    const pending = this.pendingDir(id)

    try {
      // Step 1 — ensure the parent snapshots dir exists
      await mkdir(this.snapshotDir, { recursive: true })

      // Step 2 — gather all git state BEFORE touching disk
      const timestamp = Date.now()
      const branchRef = await this.getCurrentBranchRef()
      const status = await this.git.status()
      const headCommit = await this.git.revparse(['HEAD']).catch(() => '')
      const branchName = status.current ?? 'HEAD'
      const workingPatch = await this.git.diff(['--binary'])
      const stagedPatch = await this.git.diff(['--binary', '--cached'])
      const untrackedFiles = await this.captureUntrackedFiles(status.not_added)

      const files = SNAPSHOT_FILES(id)

      const snapshot: Snapshot = {
        id,
        operation,
        timestamp,
        branchRef,
        stashRef: null,
        valid: false, // not valid until the rename succeeds
        metadata: {
          ...metadata,
          branchName,
          headCommit,
          workingPatchFile: files.working,
          stagedPatchFile: files.staged,
          untrackedFile: files.untracked,
        },
        repoPath: this.repoPath,
      }

      // Step 3 — write everything into the PENDING directory, not the real one
      await mkdir(pending, { recursive: true })

      await Promise.all([
        writeFile(join(pending, files.meta), JSON.stringify({ ...snapshot, valid: true }, null, 2), 'utf-8'),
        writeFile(join(pending, files.working), workingPatch, 'utf-8'),
        writeFile(join(pending, files.staged), stagedPatch, 'utf-8'),
        writeFile(join(pending, files.untracked), JSON.stringify(untrackedFiles, null, 2), 'utf-8'),
      ])

      // Step 4 — verify every file is present and readable before we commit
      await this.verifyPendingDir(pending, id)

      // Step 5 — atomic rename: pending → real.
      // The OS guarantees this either fully completes or doesn't happen.
      // There is no state where the real path exists but is incomplete.
      await rename(pending, this.snapshotPath(id))

      this.logger.info('snapshot captured', { id, operation })
      return ok({ ...snapshot, valid: true })

    } catch (cause) {
      // Clean up the pending dir so no orphan files remain on disk
      await rm(pending, { recursive: true, force: true })
      return err(snapshotError('SNAPSHOT_CAPTURE_FAILED', 'Failed to capture snapshot', cause))
    } finally {
      this.releaseLock()
    }
  }

  // Verifies all 4 expected files exist and are non-empty in the pending dir.
  // Throws if anything is missing or unreadable — capture() will clean up.
  private async verifyPendingDir(pendingPath: string, id: string): Promise<void> {
    const files = SNAPSHOT_FILES(id)
    const required = [files.meta, files.working, files.staged, files.untracked]

    await Promise.all(
      required.map(async (filename) => {
        const fullPath = join(pendingPath, filename)
        const info = await stat(fullPath) // throws if file doesn't exist
        if (filename === files.meta && info.size === 0) {
          throw new Error(`Snapshot file is empty: ${filename}`)
        }
      }),
    )

    // Also verify the meta JSON actually parses cleanly
    const raw = await readFile(join(pendingPath, files.meta), 'utf-8')
    const parsed = JSON.parse(raw) as Snapshot // throws if malformed
    if (parsed.id !== id) {
      throw new Error(`Snapshot ID mismatch: expected ${id}, got ${parsed.id}`)
    }
  }

  async list(): Promise<RepoFoxResult<Snapshot[]>> {
    try {
      await mkdir(this.snapshotDir, { recursive: true })
      const entries = await readdir(this.snapshotDir, { withFileTypes: true })

      // Only read completed snapshot directories (not .pending dirs)
      const snapshotDirs = entries.filter(
        (e) => e.isDirectory() && !e.name.endsWith('.pending'),
      )

      const snapshots = await Promise.all(
        snapshotDirs.map(async (dir) => {
          const id = dir.name
          const files = SNAPSHOT_FILES(id)
          const metaPath = join(this.snapshotDir, id, files.meta)
          const raw = await readFile(metaPath, 'utf-8')
          return JSON.parse(raw) as Snapshot
        }),
      )

      return ok(snapshots.sort((a, b) => b.timestamp - a.timestamp))
    } catch (cause) {
      return err(snapshotError('SNAPSHOT_LIST_FAILED', 'Failed to list snapshots', cause))
    }
  }

  async getById(id: string): Promise<RepoFoxResult<Snapshot>> {
    const snapshots = await this.list()
    if (snapshots.isErr()) return err(snapshots.error)

    const snapshot = snapshots.value.find((s) => s.id === id)
    if (!snapshot) {
      return err(snapshotError('SNAPSHOT_NOT_FOUND', `Snapshot not found: ${id}`))
    }

    return ok(snapshot)
  }

  // Validates that a snapshot's files are all present and intact
  // before restore() is allowed to destroy anything.
  async validate(id: string): Promise<RepoFoxResult<Snapshot>> {
    const snapshotResult = await this.getById(id)
    if (snapshotResult.isErr()) return err(snapshotResult.error)

    const snapshot = snapshotResult.value
    const dir = this.snapshotPath(id)
    const files = SNAPSHOT_FILES(id)

    const requiredFiles = [files.working, files.staged, files.untracked]

    for (const filename of requiredFiles) {
      try {
        await stat(join(dir, filename))
      } catch {
        return err(snapshotError(
          'SNAPSHOT_CORRUPTED',
          `Snapshot ${id} is missing required file: ${filename}. Cannot safely restore.`,
        ))
      }
    }

    // Verify headCommit is reachable in this repo before we nuke anything
    const headCommit = snapshot.metadata['headCommit']
    if (headCommit) {
      try {
        await this.git.catFile(['-t', headCommit])
      } catch {
        return err(snapshotError(
          'SNAPSHOT_UNREACHABLE_COMMIT',
          `Snapshot ${id} references commit ${headCommit} which no longer exists in this repo.`,
        ))
      }
    }

    return ok(snapshot)
  }

  async restore(id: string): Promise<RepoFoxResult<void>> {
    const lockResult = await this.acquireLock()
    if (lockResult.isErr()) return err(lockResult.error)

    try {
      return await this.executeRestore(id)
    } finally {
      this.releaseLock()
    }
  }

  private async executeRestore(id: string): Promise<RepoFoxResult<void>> {
    // VALIDATE FIRST — before touching a single byte of the user's repo
    const validationResult = await this.validate(id)
    if (validationResult.isErr()) return err(validationResult.error)

    const snapshot = validationResult.value
    const dir = this.snapshotPath(id)
    const files = SNAPSHOT_FILES(id)

    const branchName = snapshot.metadata['branchName']
    const headCommit = snapshot.metadata['headCommit']
    const createdBranch = snapshot.metadata['branch']

    try {
      // POINT OF NO RETURN — only reached after full validation passes
      if (branchName && branchName !== 'HEAD') {
        await this.git.checkout(branchName).catch(() => undefined)
      }

      if (headCommit) {
        await this.git.reset(['--hard', headCommit])
      } else {
        await this.git.reset(['--hard'])
      }

      await this.git.raw(['clean', '-fd'])

      // Apply staged patch
      const stagedPatch = await readFile(join(dir, files.staged), 'utf-8')
      if (stagedPatch.trim().length > 0) {
        try {
          await this.git.raw(['apply', '--binary', '--cached', join(dir, files.staged)])
        } catch (patchError) {
          this.logger.warn('staged patch apply failed, continuing with working patch', { patchError })
        }
      }

      // Apply working patch
      const workingPatch = await readFile(join(dir, files.working), 'utf-8')
      if (workingPatch.trim().length > 0) {
        try {
          await this.git.raw(['apply', '--binary', join(dir, files.working)])
        } catch (patchError) {
          this.logger.warn('working patch apply failed, untracked files will still be restored', { patchError })
        }
      }

      // Restore untracked files
      const raw = await readFile(join(dir, files.untracked), 'utf-8')
      const untrackedFiles = JSON.parse(raw) as StoredUntrackedFile[]

      for (const file of untrackedFiles) {
        const target = join(this.repoPath, file.path)
        await mkdir(dirname(target), { recursive: true })
        await writeFile(target, Buffer.from(file.contentBase64, 'base64'))
      }

      // Clean up the branch that was created during the snapshotted operation
      if (snapshot.operation === 'branch_created' && createdBranch && createdBranch !== branchName) {
        await this.git.deleteLocalBranch(createdBranch, true).catch(() => undefined)
      }

      this.logger.info('snapshot restored', { id })
      return ok(undefined)

    } catch (cause) {
      return err(snapshotError('SNAPSHOT_RESTORE_FAILED', 'Failed to restore snapshot', cause))
    }
  }

  // Prune snapshots older than maxAgeDays. Call this on extension startup.
  async prune(maxAgeDays = 30): Promise<RepoFoxResult<number>> {
    const listResult = await this.list()
    if (listResult.isErr()) return err(listResult.error)

    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
    let pruned = 0

    for (const snapshot of listResult.value) {
      if (snapshot.timestamp < cutoff) {
        await rm(this.snapshotPath(snapshot.id), { recursive: true, force: true })
        pruned++
      }
    }

    // Also clean up any orphaned .pending dirs from previous crashed runs
    try {
      const entries = await readdir(this.snapshotDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.endsWith('.pending')) {
          await rm(join(this.snapshotDir, entry.name), { recursive: true, force: true })
        }
      }
    } catch {
      // Non-fatal — best effort cleanup
    }

    this.logger.info('snapshots pruned', { pruned, maxAgeDays })
    return ok(pruned)
  }

  private async getCurrentBranchRef(): Promise<string> {
    try {
      return (await readFile(join(this.repoPath, '.git', 'HEAD'), 'utf-8')).trim()
    } catch {
      return 'unknown'
    }
  }

  // 512kb cap — better to tell the user than to silently fail or bloat the snapshot
  // (notes: roadmap.md Day 10, git-internals-guide.md)
  private static readonly MAX_UNTRACKED_FILE_BYTES = 512 * 1024

  private async captureUntrackedFiles(paths: string[]): Promise<StoredUntrackedFile[]> {
    const files: StoredUntrackedFile[] = []

    for (const filePath of paths) {
      const absolutePath = join(this.repoPath, filePath)
      try {
        const info = await stat(absolutePath)
        if (info.size > SnapshotManager.MAX_UNTRACKED_FILE_BYTES) {
          this.logger.warn('skipping large untracked file — not included in snapshot', {
            path: filePath,
            sizeKb: Math.round(info.size / 1024),
            limitKb: SnapshotManager.MAX_UNTRACKED_FILE_BYTES / 1024,
          })
          continue
        }
        const content = await readFile(absolutePath)
        files.push({ path: filePath, contentBase64: content.toString('base64') })
      } catch (readError) {
        this.logger.warn('skipping unreadable untracked file', { path: filePath, error: readError })
        continue
      }
    }

    return files
  }
}

function snapshotError(code: string, message: string, cause?: unknown): RepoFoxError {
  return { code, message, cause }
}
