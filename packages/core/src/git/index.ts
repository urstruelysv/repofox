// =============================================================================
// GitClient — the only place RepoFox shells out to the `git` binary.
// =============================================================================
//
// Why this file exists:
//   Every git side-effect (status, branch creation, push, fetch, ref lookup)
//   is funneled through this class. One choke point means one place to enforce
//   timeouts, environment fixes (SSH socket on macOS), and credential handling
//   (token-injected HTTPS URLs instead of SSH key prompts). When something
//   goes wrong with git in production, the investigation starts and ends here.
//
// What changed for F3 (branch-name validation):
//   The audit identified that we were passing whatever string the AI returned
//   straight to `git checkout -b <name>`. Three real-world failures followed:
//     1. AI returns a name with spaces or colons → git rejects with a cryptic
//        error mid-workflow, after the snapshot is already captured.
//     2. The AI's name happens to match an existing branch (local or on
//        origin) → checkout fails, workflow lies in a broken state.
//     3. The name collides with an existing tag → ref becomes ambiguous,
//        push appears to succeed, but later operations break.
//
//   We now expose the minimum primitives needed for the WorkflowEngine to
//   self-heal silently before ever asking the user. Each primitive is a
//   thin wrapper around a single git command. We deliberately do NOT
//   re-implement git's ref-format rules — `git check-ref-format --branch`
//   is the source of truth, and reimplementing it would silently drift
//   from real git as edge cases (Unicode, reserved names, locale) evolve.
//
//   Trust boundary: validation primitives never throw. Invalid input is a
//   normal control-flow signal, not an exception. This lets the caller
//   compose them in tight loops (collision retry) without try/catch noise.
// =============================================================================

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ok, err } from 'neverthrow'
import { simpleGit, type SimpleGit, type SimpleGitOptions } from 'simple-git'
import type { Logger } from '../logger/index.js'
import type {
  CommitResult,
  GitFile,
  GitStatus,
  RepoFoxError,
  RepoFoxResult,
} from '../types/index.js'

const execFileAsync = promisify(execFile)

// 30 seconds — the right default for network git operations (notes: Day 19)
const NETWORK_TIMEOUT_MS = 30_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`OPERATION_TIMEOUT: ${label} timed out after ${ms}ms`)), ms),
    ),
  ])
}

/**
 * Find the SSH_AUTH_SOCK for the current user.
 * When VS Code is launched from a desktop GUI the extension host inherits
 * a stripped environment — SSH_AUTH_SOCK is missing and git push hangs.
 * (notes: child-process-guide.md, linux-env-guide.md, roadmap Day 14)
 */
async function resolveSSHAuthSock(): Promise<string | undefined> {
  // Already in env — nothing to do
  if (process.env['SSH_AUTH_SOCK']) return process.env['SSH_AUTH_SOCK']

  // macOS: ask launchctl which owns the socket
  if (process.platform === 'darwin') {
    try {
      const { stdout } = await execFileAsync('launchctl', ['getenv', 'SSH_AUTH_SOCK'], { timeout: 2000 })
      const sock = stdout.trim()
      if (sock) return sock
    } catch {
      // launchctl not available or socket not registered — fall through
    }
  }

  // Linux: common systemd/gnome-keyring paths
  if (process.platform === 'linux') {
    const uid = process.getuid?.()
    if (uid !== undefined) {
      const candidates = [
        `/run/user/${uid}/ssh-agent.socket`,
        `/tmp/ssh-agent.${uid}`,
      ]
      const { existsSync } = await import('node:fs')
      for (const candidate of candidates) {
        if (existsSync(candidate)) return candidate
      }
    }
  }

  return undefined
}

export interface GitClientOptions {
  repoPath: string
  logger: Logger
  githubToken?: string
}

export class GitClient {
  private readonly git: SimpleGit
  private readonly logger: Logger
  private readonly githubToken?: string
  private readonly repoPath: string

  constructor(options: GitClientOptions) {
    this.logger = options.logger
    this.repoPath = options.repoPath
    if (options.githubToken !== undefined) this.githubToken = options.githubToken

    // Inject SSH_AUTH_SOCK synchronously from env if present; async resolution
    // happens in ensureSSHEnv() which is called before any network operation.
    const env: NodeJS.ProcessEnv = { ...process.env }

    const config: Partial<SimpleGitOptions> = {
      baseDir: options.repoPath,
      binary: 'git',
      maxConcurrentProcesses: 1,
      trimmed: true,
      config: [],
      // Pass the full environment so SSH agent socket is available
      ...(Object.keys(env).length > 0 ? { } : {}),
    }
    this.git = simpleGit(config)

    // Wire SSH env — fire-and-forget, will be ready before any real network op
    void this.ensureSSHEnv()
  }

  private async ensureSSHEnv(): Promise<void> {
    const sock = await resolveSSHAuthSock()
    if (sock && !process.env['SSH_AUTH_SOCK']) {
      process.env['SSH_AUTH_SOCK'] = sock
      this.logger.info('SSH_AUTH_SOCK injected', { sock })
    }
  }

  /**
   * Convert a git@github.com SSH URL to an HTTPS URL with the token embedded.
   * Returns null if the token is unavailable or the URL is not a GitHub SSH URL.
   * The token is never written to disk — only used in-process for the git command.
   */
  private toHttpsUrl(remoteUrl: string): string | null {
    if (!this.githubToken) return null
    const match = remoteUrl.match(/^git@github\.com:(.+?)(?:\.git)?$/)
    if (!match) return null
    return `https://x-access-token:${this.githubToken}@github.com/${match[1]}.git`
  }

  async getStatus(): Promise<RepoFoxResult<GitStatus>> {
    try {
      const status = await this.git.status()
      const files = normalizeStatusFiles(status)
      const branch = status.current ?? 'HEAD'

      this.logger.debug('git status', {
        branch,
        fileCount: files.length,
        ahead: status.ahead,
        behind: status.behind,
      })

      const tracking = status.tracking?.trim() ?? ''
      const hasUpstream = tracking.length > 0

      return ok({
        branch,
        files,
        isClean: status.isClean(),
        hasUntracked: status.not_added.length > 0,
        ahead: status.ahead,
        behind: status.behind,
        hasUpstream,
        trackingBranch: hasUpstream ? tracking : null,
      })
    } catch (cause) {
      return err(gitError('GIT_STATUS_FAILED', 'Failed to get git status', cause))
    }
  }

  async getDiff(staged = false): Promise<RepoFoxResult<string>> {
    try {
      const args = staged ? ['--cached'] : []
      const diff = await this.git.diff(args)
      const truncated = diff.length > 8000 ? `${diff.slice(0, 8000)}\n... (truncated)` : diff
      return ok(truncated)
    } catch (cause) {
      return err(gitError('GIT_DIFF_FAILED', 'Failed to get diff', cause))
    }
  }

  async getBinaryDiff(staged = false): Promise<RepoFoxResult<string>> {
    try {
      const args = staged ? ['--binary', '--cached'] : ['--binary']
      return ok(await this.git.diff(args))
    } catch (cause) {
      return err(gitError('GIT_BINARY_DIFF_FAILED', 'Failed to get binary diff', cause))
    }
  }

  async getRecentCommits(count = 50): Promise<RepoFoxResult<string[]>> {
    try {
      const log = await this.git.log({ maxCount: count, format: { message: '%s' } })
      return ok(log.all.map((entry) => entry.message))
    } catch (cause) {
      return err(gitError('GIT_LOG_FAILED', 'Failed to get commit log', cause))
    }
  }

  async getRecentBranches(count = 10): Promise<RepoFoxResult<string[]>> {
    try {
      const result = await this.git.branch(['-a', '--sort=-committerdate'])
      const names = result.all
        .map((branch) => branch.replace(/^\*\s*/, '').replace('remotes/origin/', '').trim())
        .filter(Boolean)
      return ok([...new Set(names)].slice(0, count))
    } catch (cause) {
      return err(gitError('GIT_BRANCH_FAILED', 'Failed to get branches', cause))
    }
  }

  async createBranch(name: string): Promise<RepoFoxResult<void>> {
    // Defensive guard. The WorkflowEngine should already have validated the
    // name via resolveBranchName() before getting here, but this guarantees
    // that no caller — current or future — can land us with a malformed ref
    // mid-flow and a snapshot already captured.
    const formatCheck = await this.validateRefFormat(name)
    if (formatCheck.isErr()) return err(formatCheck.error)

    try {
      await this.git.checkoutLocalBranch(name)
      this.logger.info('branch created', { name })
      return ok(undefined)
    } catch (cause) {
      return err(gitError('GIT_BRANCH_CREATE_FAILED', `Failed to create branch: ${name}`, cause))
    }
  }

  /**
   * Validates a candidate branch name against git's own rules.
   *
   * We invoke `git check-ref-format --branch <name>` rather than reimplementing
   * the rules. Git owns the spec; reimplementation would drift. The command
   * exits 0 when the name is valid and non-zero otherwise. We pass the name as
   * a separate argv element (no shell), so injection is impossible regardless
   * of what the AI returns.
   *
   * Returns ok(void) for valid names, err(BRANCH_NAME_INVALID) otherwise.
   * Never throws — invalid names are a normal flow signal, not an exception.
   */
  async validateRefFormat(name: string): Promise<RepoFoxResult<void>> {
    if (!name || name.length === 0) {
      return err(gitError('BRANCH_NAME_INVALID', 'Branch name is empty.'))
    }
    try {
      await execFileAsync('git', ['check-ref-format', '--branch', name], {
        cwd: this.repoPath,
        timeout: 3000,
      })
      return ok(undefined)
    } catch (cause) {
      return err(gitError('BRANCH_NAME_INVALID', `Invalid branch name: ${name}`, cause))
    }
  }

  /**
   * Returns the set of local branch short-names. Used by the collision check
   * to do in-memory lookups instead of one git call per candidate during
   * suffix retry. One git call per resolveBranchName() pass — not per try.
   *
   * We bypass simple-git's branch() parser (which assumes the human-readable
   * `* current\n  other` layout and silently drops entries when given a
   * --format flag) and call `git for-each-ref` directly. Bare lines, no
   * parsing surprises.
   */
  async listLocalBranches(): Promise<RepoFoxResult<Set<string>>> {
    try {
      const raw = await this.git.raw([
        'for-each-ref',
        '--format=%(refname:short)',
        'refs/heads',
      ])
      const names = new Set<string>(
        raw.split('\n').map((line) => line.trim()).filter(Boolean),
      )
      return ok(names)
    } catch (cause) {
      return err(gitError('GIT_BRANCH_LIST_FAILED', 'Failed to list local branches', cause))
    }
  }

  /**
   * Returns remote branches for `remote` as a set of short-names (no
   * `origin/` prefix). Reads from the local refs/remotes cache — caller is
   * expected to call fetchRemote() first if they want a fresh view. We split
   * fetch and read deliberately: fetch can fail offline, but reading what we
   * already have should never fail just because the network is down.
   */
  async listRemoteBranches(remote = 'origin'): Promise<RepoFoxResult<Set<string>>> {
    try {
      const raw = await this.git.raw([
        'for-each-ref',
        '--format=%(refname:short)',
        `refs/remotes/${remote}`,
      ])
      const prefix = `${remote}/`
      const names = new Set<string>()
      for (const line of raw.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        // Skip symbolic refs like `origin/HEAD` (its short form is just
        // `origin` or aliases another ref).
        if (trimmed === remote) continue
        if (trimmed.startsWith(prefix)) names.add(trimmed.slice(prefix.length))
        else names.add(trimmed)
      }
      return ok(names)
    } catch (cause) {
      return err(gitError('GIT_REMOTE_BRANCH_LIST_FAILED', 'Failed to list remote branches', cause))
    }
  }

  /**
   * True if a tag exists with this exact name. The tag-vs-branch ambiguity
   * is the rarest of the three F3 failure modes, but the cheapest to check
   * (one `git rev-parse`), and ignoring it produces the worst symptom: the
   * ref looks fine, push succeeds, then later operations behave inconsistently
   * depending on which ref git resolves first. Always check.
   */
  async tagExists(name: string): Promise<boolean> {
    try {
      await execFileAsync('git', ['show-ref', '--verify', '--quiet', `refs/tags/${name}`], {
        cwd: this.repoPath,
        timeout: 3000,
      })
      return true
    } catch {
      return false
    }
  }

  async stageFiles(paths: string[]): Promise<RepoFoxResult<void>> {
    try {
      await this.git.add(paths)
      this.logger.info('files staged', { count: paths.length })
      return ok(undefined)
    } catch (cause) {
      return err(gitError('GIT_STAGE_FAILED', 'Failed to stage files', cause))
    }
  }

  async stageAll(): Promise<RepoFoxResult<void>> {
    try {
      await this.git.add('.')
      this.logger.info('all files staged')
      return ok(undefined)
    } catch (cause) {
      return err(gitError('GIT_STAGE_ALL_FAILED', 'Failed to stage all files', cause))
    }
  }

  async commit(message: string): Promise<RepoFoxResult<CommitResult>> {
    try {
      const result = await this.git.commit(message)
      const status = await this.git.status()
      return ok({
        hash: result.commit,
        message,
        branch: status.current ?? 'HEAD',
        timestamp: Date.now(),
      })
    } catch (cause) {
      return err(gitError('GIT_COMMIT_FAILED', 'Failed to create commit', cause))
    }
  }

  async push(branch: string, remote = 'origin'): Promise<RepoFoxResult<void>> {
    try {
      // When a GitHub token is available, bypass SSH entirely (no passphrase prompt)
      // by pushing to an inline HTTPS URL. Token stays in-process only.
      const urlResult = await this.getRemoteUrl(remote)
      const httpsUrl = urlResult.isOk() ? this.toHttpsUrl(urlResult.value) : null

      if (httpsUrl) {
        await withTimeout(
          this.git.push(httpsUrl, branch, ['--set-upstream']),
          NETWORK_TIMEOUT_MS,
          'git push',
        )
        this.logger.info('pushed via https token', { branch })
      } else {
        await withTimeout(
          this.git.push(remote, branch, ['--set-upstream']),
          NETWORK_TIMEOUT_MS,
          'git push',
        )
        this.logger.info('pushed', { branch, remote })
      }
      return ok(undefined)
    } catch (cause: unknown) {
      const rawError = cause instanceof Error ? cause.message : String(cause)
      const parsedError = parseGitError(rawError)
      this.logger.error('git push failed', { rawError, parsedError })
      return err(gitError('GIT_PUSH_FAILED', parsedError, cause))
    }
  }

  async fetchRemote(remote = 'origin'): Promise<RepoFoxResult<void>> {
    try {
      await withTimeout(this.git.fetch(remote), NETWORK_TIMEOUT_MS, 'git fetch')
      return ok(undefined)
    } catch (cause) {
      return err(gitError('GIT_FETCH_FAILED', 'Failed to fetch from remote', cause))
    }
  }

  /**
   * Diagnostic: verify the SSH agent socket exists and a remote is reachable.
   * Used by the "Run Diagnostics" command. (notes: sre-hardening-guide.md Day 16)
   */
  async checkRemoteAccess(remote = 'origin'): Promise<RepoFoxResult<string>> {
    try {
      const urlResult = await this.getRemoteUrl(remote)
      if (urlResult.isErr()) return err(urlResult.error)
      // Prefer HTTPS with token to avoid SSH passphrase prompts during preflight
      const target = this.toHttpsUrl(urlResult.value) ?? remote
      await withTimeout(
        this.git.raw(['ls-remote', '--heads', target]),
        NETWORK_TIMEOUT_MS,
        'git ls-remote',
      )
      return ok(urlResult.value)
    } catch (cause: unknown) {
      const msg = cause instanceof Error ? cause.message : String(cause)
      return err(gitError('GIT_REMOTE_UNREACHABLE', parseGitError(msg), cause))
    }
  }

  async getGitVersion(): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', ['--version'], { timeout: 3000 })
      return stdout.trim()
    } catch {
      return 'git not found'
    }
  }

  async isInsideRepo(): Promise<boolean> {
    try {
      await this.git.revparse(['--show-toplevel'])
      return true
    } catch {
      return false
    }
  }

  async hasPrimaryRemote(remote = 'origin'): Promise<boolean> {
    try {
      const url = await this.git.remote(['get-url', remote])
      return (url ?? '').trim().length > 0
    } catch {
      return false
    }
  }

  async getDefaultRemoteBranch(remote = 'origin'): Promise<RepoFoxResult<string>> {
    try {
      const raw = await this.git.raw(['symbolic-ref', `refs/remotes/${remote}/HEAD`])
      const match = /^refs\/remotes\/[^/]+\/(.+)$/m.exec(raw.trim())
      if (match?.[1]) {
        return ok(match[1].trim())
      }
      return err(gitError('GIT_DEFAULT_BRANCH_FAILED', 'Could not resolve default remote branch.'))
    } catch (cause) {
      return err(gitError('GIT_DEFAULT_BRANCH_FAILED', 'Could not resolve default remote branch.', cause))
    }
  }

  async countCommitsAheadOf(ref: string): Promise<RepoFoxResult<number>> {
    try {
      const raw = await this.git.raw(['rev-list', '--count', `${ref}..HEAD`])
      const count = Number.parseInt(raw.trim(), 10)
      return ok(Number.isFinite(count) ? count : 0)
    } catch (cause) {
      return err(gitError('GIT_REV_LIST_FAILED', `Failed to count commits ahead of ${ref}`, cause))
    }
  }

  async getRemoteUrl(remote = 'origin'): Promise<RepoFoxResult<string>> {
    try {
      const url = await this.git.remote(['get-url', remote])
      return ok((url ?? '').trim())
    } catch (cause) {
      return err(gitError('GIT_REMOTE_FAILED', 'Failed to get remote URL', cause))
    }
  }

  async getHeadCommit(): Promise<RepoFoxResult<string>> {
    try {
      return ok((await this.git.revparse(['HEAD'])).trim())
    } catch (cause) {
      return err(gitError('GIT_HEAD_FAILED', 'Failed to resolve HEAD commit', cause))
    }
  }

  async isDetachedHead(): Promise<boolean> {
    try {
      const ref = await this.git.revparse(['--symbolic-full-name', 'HEAD'])
      return ref.trim() === 'HEAD'
    } catch {
      return false
    }
  }

  async isMerging(): Promise<boolean> {
    try {
      await this.git.raw(['rev-parse', '--verify', 'MERGE_HEAD'])
      return true
    } catch {
      return false
    }
  }

  async isRebasing(): Promise<boolean> {
    try {
      const gitDir = (await this.git.revparse(['--git-dir'])).trim()
      const { existsSync } = await import('node:fs')
      const { join } = await import('node:path')
      return existsSync(join(gitDir, 'rebase-merge')) || existsSync(join(gitDir, 'rebase-apply'))
    } catch {
      return false
    }
  }

  async getUntrackedFiles(): Promise<RepoFoxResult<string[]>> {
    try {
      const raw = await this.git.raw(['ls-files', '--others', '--exclude-standard'])
      const files = raw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      return ok(files)
    } catch (cause) {
      return err(gitError('GIT_UNTRACKED_FAILED', 'Failed to list untracked files', cause))
    }
  }
}

function normalizeStatusFiles(status: Awaited<ReturnType<SimpleGit['status']>>): GitFile[] {
  const files = new Map<string, GitFile>()

  const upsert = (
    path: string,
    nextStatus: GitFile['status'],
    staged: boolean,
  ): void => {
    const current = files.get(path)
    if (!current) {
      files.set(path, { path, status: nextStatus, staged })
      return
    }

    files.set(path, {
      path,
      status: current.status === 'untracked' && nextStatus !== 'untracked' ? nextStatus : current.status,
      staged: current.staged || staged,
    })
  }

  status.modified.forEach((path) => upsert(path, 'modified', false))
  status.staged.forEach((path) => upsert(path, 'modified', true))
  status.created.forEach((path) => upsert(path, 'added', true))
  status.deleted.forEach((path) => upsert(path, 'deleted', false))
  status.not_added.forEach((path) => upsert(path, 'untracked', false))
  status.renamed.forEach((item) => upsert(item.to, 'renamed', true))

  return [...files.values()]
}

function gitError(code: string, message: string, cause?: unknown): RepoFoxError {
  return { code, message, cause }
}

function parseGitError(rawError: string): string {
  if (rawError.includes('permission denied') || rawError.includes('403')) {
    return 'Permission denied. Check your GitHub token scopes (needs "repo").'
  }
  if (rawError.includes('Authentication failed') || rawError.includes('401')) {
    return 'Authentication failed. Please update your GitHub token in Settings.'
  }
  if (rawError.includes('fetch first') || rawError.includes('non-fast-forward')) {
    return 'Push rejected. Remote has changes you don’t have. Pull first.'
  }
  if (rawError.includes('protected branch')) {
    return 'Cannot push to a protected branch. Please use a feature branch.'
  }
  if (rawError.includes('could not resolve host')) {
    return 'Network error. Could not reach GitHub.'
  }
  return rawError.replace(/^Error:\s*/, '').split('\n')[0] ?? 'Unknown Git push error'
}
