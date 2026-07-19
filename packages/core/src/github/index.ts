// =============================================================================
// F8 — GitHub client (token validation + scope inspection)
// =============================================================================
// First principles:
//   1. A GitHub token has TWO independent failure modes that look the same
//      to a naive ok/fail probe but mean different things to the user:
//        a. Token invalid/expired → 401. Replace the token.
//        b. Token valid but missing scopes → 200 on /user, but PR creation
//           later fails with a confusing 403/404. Catching this at settings
//           time is the entire point of the test button.
//      Conflating them = user pastes a working-but-underscoped token, gets
//      a green checkmark, then the workflow blows up mid-run on PR creation.
//      That's the worst possible UX.
//
//   2. GitHub returns granted scopes in the response header `X-OAuth-Scopes`
//      on any authenticated request. So one call to GET /user gives us BOTH
//      auth validity (status code) AND scope set (header). No extra round-
//      trip needed.
//
//   3. The constructor below requires { owner, repo, token } — that shape
//      is for normal operation (createPR etc). For a token probe we don't
//      know owner/repo yet; the user is still on the settings screen. So
//      the probe must be a STATIC method, not an instance method, taking
//      just the token. Forcing callers to fake owner/repo would be a smell.
//
// What this file is:
//   The single wrapper over Octokit. Anything that talks to GitHub goes
//   through here — including the F8 token probe. Parsing X-OAuth-Scopes
//   here (not in SidebarProvider) keeps GitHub-specific knowledge in one
//   place; the host just gets a typed result.
//
// Suggested probe signature:
//   static async testToken(token: string, logger: Logger): Promise<
//     RepoFoxResult<{ login: string; scopes: string[]; hasRepoScope: boolean }>
//   >
//
// Implementation notes:
//   - Use a fresh Octokit({ auth: token }) — do NOT reuse `this.octokit`
//     since this is static and there's no instance.
//   - Call octokit.rest.users.getAuthenticated().
//   - Read response.headers['x-oauth-scopes'] (lower-case in node-fetch).
//     Split on /,\s*/, filter empty. Beware: fine-grained PATs return an
//     EMPTY x-oauth-scopes header — they use a different permission model.
//     For those, fall back to checking the response succeeded and warn
//     the user that scope inspection is unavailable for fine-grained PATs.
//   - hasRepoScope = scopes.includes('repo') || scopes.includes('public_repo').
//     The `repo` scope is required for private repos; `public_repo` works
//     for public-only. Spec says warn on missing `repo` — surface both
//     facts so the UI can decide.
// =============================================================================

import { Octokit } from '@octokit/rest'
import { ok, err } from 'neverthrow'
import type { Logger } from '../logger/index.js'
import type { GitHubConfig, PullRequest, RepoFoxError, RepoFoxResult } from '../types/index.js'
import type { ProbeError } from '../ai/index.js'

export type TokenTestResult =
  | {
      ok: true
      username: string
      scopes: string[]
      hasRepoScope: boolean
      isFineGrained: boolean
    }
  | { ok: false; error: ProbeError }

export class GitHubClient {
  private readonly octokit: Octokit
  private readonly config: GitHubConfig
  private readonly logger: Logger

  constructor(config: GitHubConfig, logger: Logger) {
    this.config = config
    this.logger = logger
    this.octokit = new Octokit({ auth: config.token })
  }

  async createPR(
    title: string,
    body: string,
    head: string,
    base = 'main',
    labels: string[] = [],
    draft = false,
  ): Promise<RepoFoxResult<PullRequest>> {
    try {
      // Check for existing PR with same head branch
      const existing = await this.findExistingPR(head, base)
      if (existing) {
        this.logger.info('PR already exists for this branch', { number: existing.number, url: existing.url })
        return ok(existing)
      }

      const { data } = await this.octokit.pulls.create({
        owner: this.config.owner,
        repo: this.config.repo,
        title,
        body,
        head,
        base,
        draft,
      })

      if (labels.length > 0) {
        await this.octokit.issues
          .addLabels({
            owner: this.config.owner,
            repo: this.config.repo,
            issue_number: data.number,
            labels: labels.filter(Boolean),
          })
          .catch((labelError) => {
            this.logger.warn('failed to add labels to PR', { number: data.number, labels, error: labelError })
          })
      }

      this.logger.info('PR created', { number: data.number, url: data.html_url })

      return ok({
        number: data.number,
        url: data.html_url,
        title: data.title,
        body: data.body ?? '',
        state: 'open',
      })
    } catch (cause) {
      return err(githubError('PR_CREATE_FAILED', 'Failed to create pull request', cause))
    }
  }

  async getRecentPRTitles(count = 5): Promise<string[]> {
    try {
      const { data } = await this.octokit.pulls.list({
        owner: this.config.owner,
        repo: this.config.repo,
        state: 'closed',
        per_page: count,
        sort: 'updated',
      })

      return data.map((pr) => pr.title)
    } catch {
      return []
    }
  }

  async getDefaultBranch(): Promise<string> {
    try {
      const { data } = await this.octokit.repos.get({
        owner: this.config.owner,
        repo: this.config.repo,
      })
      return data.default_branch
    } catch {
      return 'main'
    }
  }

  async findOpenPR(head: string, base?: string): Promise<PullRequest | null> {
    const resolvedBase = base ?? await this.getDefaultBranch()
    return this.findExistingPR(head, resolvedBase)
  }

  private async findExistingPR(head: string, base: string): Promise<PullRequest | null> {
    try {
      const { data } = await this.octokit.pulls.list({
        owner: this.config.owner,
        repo: this.config.repo,
        head: `${this.config.owner}:${head}`,
        base,
        state: 'open',
        per_page: 1,
      })

      if (data.length > 0) {
        const pr = data[0]!
        return {
          number: pr.number,
          url: pr.html_url,
          title: pr.title,
          body: pr.body ?? '',
          state: 'open',
        }
      }
    } catch {
      // Non-fatal — fall through and create a new PR
    }
    return null
  }

  // F8 — token + scope probe. Static because the user is on the settings
  // screen and we don't yet know the target owner/repo. One call to
  // GET /user gives both auth (200 vs 401) and scopes (X-OAuth-Scopes
  // header). Fine-grained PATs return EMPTY scopes header — surfaced as
  // isFineGrained so UI can show different copy than "missing repo."
  static async testToken(token: string): Promise<TokenTestResult> {
    const timeoutMs = 5000
    const octokit = new Octokit({ auth: token, request: { timeout: timeoutMs } })

    try {
      const res = await octokit.rest.users.getAuthenticated()
      const rawScopes = res.headers['x-oauth-scopes'] ?? ''
      const scopes = rawScopes
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
      const isFineGrained = scopes.length === 0
      const hasRepoScope = scopes.includes('repo') || scopes.includes('public_repo')

      return {
        ok: true,
        username: res.data.login,
        scopes,
        hasRepoScope,
        isFineGrained,
      }
    } catch (cause) {
      return { ok: false, error: classifyGhError(cause) }
    }
  }

  static parseOwnerRepo(remoteUrl: string): { owner: string; repo: string } | null {
    const patterns = [/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/]

    for (const pattern of patterns) {
      const match = pattern.exec(remoteUrl)
      if (match?.[1] && match[2]) {
        return { owner: match[1], repo: match[2] }
      }
    }

    return null
  }
}

function githubError(code: string, message: string, cause?: unknown): RepoFoxError {
  return { code, message, cause }
}

function classifyGhError(cause: unknown): ProbeError {
  const message = cause instanceof Error ? cause.message : String(cause)
  const status =
    typeof cause === 'object' && cause !== null && 'status' in cause
      ? Number((cause as { status: unknown }).status)
      : 0

  if (status === 401 || status === 403) return { kind: 'auth', message }
  if (status === 429) return { kind: 'rate_limit', message }
  if (
    message.includes('ECONNRESET') ||
    message.includes('ETIMEDOUT') ||
    message.includes('ENOTFOUND') ||
    message.includes('timed out') ||
    status === 500 ||
    status === 502 ||
    status === 503
  ) {
    return { kind: 'network', message }
  }
  return { kind: 'unknown', message }
}
