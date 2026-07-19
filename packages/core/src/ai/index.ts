// =============================================================================
// F8 — AI provider client (network surface for key validation)
// =============================================================================
// First principles:
//   1. A "valid" API key is one that, RIGHT NOW, the provider's auth layer
//      accepts. Format/regex checks are guesses; only the provider knows.
//      Therefore the only honest test is a real authenticated request.
//   2. We don't actually need a completion to prove auth — we need a 401 vs
//      200. The cheapest call that exercises auth is the right call.
//        - Groq    → models.list  (HTTP GET, no token billing)
//        - OpenAI  → models.list  (HTTP GET, no token billing)
//        - Anthropic → has no list endpoint; smallest legal call is
//          messages.create with max_tokens: 1 (a few tokens billed; cost
//          per probe is fractions of a cent — acceptable).
//   3. "Failed" must distinguish three causes, because UI affordance differs:
//        a. wrong key (401/403) → user must replace key
//        b. transient (429/5xx/network) → user should retry, key may be fine
//        c. unknown → log + show generic
//      The existing isTransientError() helper already encodes (b).
//
// What this file is:
//   The single boundary to provider HTTP. `complete()` is the production
//   path used by branch/commit/PR generation, with retries baked in.
//   `testConnection()` (to be added for F8) is a deliberately separate
//   probe — NO retries, NO backoff, fast feedback to the UI. Reusing
//   complete() would lie to the user: a 5-second retry chain looks like
//   a hung button.
//
// Why a method on AIClient and not a free function:
//   - Same provider switch logic (one place to add a 4th provider).
//   - Same SDK construction (Groq/OpenAI/Anthropic clients are typed here).
//   - Same model map (returning the model string in the success result lets
//     the UI confirm "connected: llama-3.3-70b" — proves it's a real probe,
//     not a length check).
//
// Return shape (suggested):
//   Result<{ model: string }, RepoFoxError>
//   where err code ∈ { AI_AUTH_FAILED, AI_TRANSIENT, AI_UNKNOWN }
//   so SidebarProvider can map cleanly to the UI states above.
// =============================================================================

import Anthropic from '@anthropic-ai/sdk'
import Groq from 'groq-sdk'
import { ok, err } from 'neverthrow'
import OpenAI from 'openai'
import type { Logger } from '../logger/index.js'
import type {
  AIConfig,
  AIContext,
  AIProvider,
  BranchNameResult,
  CommitMessageResult,
  PRDescriptionResult,
  RepoFoxError,
  RepoFoxResult,
} from '../types/index.js'

export type ProbeErrorKind = 'auth' | 'network' | 'rate_limit' | 'unknown'

export interface ProbeError {
  kind: ProbeErrorKind
  message: string
}

export type TestConnectionResult =
  | { ok: true; models: string[] }
  | { ok: false; error: ProbeError }
import { buildBranchNamePrompt } from './prompts/branch.js'
import { buildCommitMessagePrompt } from './prompts/commit.js'
import { buildPRDescriptionPrompt } from './prompts/pr.js'

const MODELS: Record<string, string> = {
  groq: 'llama-3.3-70b-versatile',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-20241022',
}

/**
 * sanitizeBranchName — best-effort cleanup of an LLM-generated branch name.
 *
 * Why we sanitize at all when GitClient.validateRefFormat is the source of
 * truth: validation tells us yes/no, but it can't suggest a fix. Most LLM
 * outputs are *almost* valid (a stray space, a colon, a "feat:" prefix). A
 * 10-line scrubber rescues 90%+ of those without an extra round-trip to the
 * model. Anything the scrubber can't fix is caught downstream by
 * validateRefFormat and triggers an AI retry in resolveBranchName().
 *
 * Rules applied (mirroring git check-ref-format):
 *   - Lowercase common prefixes split with a space ("feat: foo" → "feat/foo")
 *   - Whitespace collapses to a single hyphen
 *   - Strip characters git forbids: : ~ ^ ? * [ \\ and ASCII control codes
 *   - Strip leading/trailing dots, slashes, hyphens
 *   - Collapse `..`, `//`, multiple consecutive hyphens
 *   - Drop trailing `.lock` suffix (forbidden by git)
 *   - Cap length at 200 chars (git accepts more, but long names break UIs)
 */
export function sanitizeBranchName(raw: string): string {
  let s = raw.trim()
  // Convention-fix: "feat: scope" → "feat/scope". LLMs often confuse
  // commit-message style with branch style.
  s = s.replace(/^([a-z]+):\s*/i, '$1/')
  // Whitespace → single hyphen.
  s = s.replace(/\s+/g, '-')
  // Strip git-forbidden chars and ASCII controls (\x00-\x1F and \x7F).
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[:~^?*[\]\\\x00-\x1F\x7F]/g, '')
  // Collapse ".." (forbidden) to "-".
  s = s.replace(/\.\.+/g, '-')
  // Collapse "//" (forbidden) to single "/".
  s = s.replace(/\/+/g, '/')
  // Strip @{ sequence (forbidden).
  s = s.replace(/@\{/g, '')
  // Strip trailing .lock.
  s = s.replace(/\.lock$/i, '')
  // Strip leading/trailing junk (dots, slashes, hyphens).
  s = s.replace(/^[./-]+|[./-]+$/g, '')
  // Collapse multiple hyphens.
  s = s.replace(/-{2,}/g, '-')
  // Length cap.
  if (s.length > 200) s = s.slice(0, 200).replace(/[./-]+$/g, '')
  return s
}

export class AIClient {
  private config: AIConfig
  private readonly logger: Logger

  constructor(config: AIConfig, logger: Logger) {
    this.config = config
    this.logger = logger
  }

  updateConfig(config: AIConfig): void {
    this.config = config
  }

  async generateBranchName(context: AIContext): Promise<RepoFoxResult<BranchNameResult>> {
    const result = await this.complete(buildBranchNamePrompt(context), 60)
    return result.map((text) => ({
      name: sanitizeBranchName(text.trim().replace(/['"]/g, '').split('\n')[0] ?? 'feat/ai-generated'),
      confidence: 'high',
    }))
  }

  async generateCommitMessage(context: AIContext): Promise<RepoFoxResult<CommitMessageResult>> {
    const result = await this.complete(buildCommitMessagePrompt(context), 150)

    return result.map((text) => {
      const message = text.trim().split('\n')[0] ?? 'chore: update files'
      const match = message.match(/^(\w+)(?:\(([^)]+)\))?:\s+(.+)$/)

      return {
        message,
        type: match?.[1] ?? 'chore',
        scope: match?.[2] ?? null,
        body: null,
      }
    })
  }

  async generatePRDescription(
    context: AIContext,
    commits: string[],
  ): Promise<RepoFoxResult<PRDescriptionResult>> {
    const result = await this.complete(buildPRDescriptionPrompt(context, commits), 600)

    return result.andThen((text) => {
      try {
        const parsed = JSON.parse(text.replace(/```json|```/g, '').trim()) as PRDescriptionResult
        return ok(parsed)
      } catch {
        return ok({
          title: commits[0] ?? 'Update',
          body: `## What\n${commits.join('\n')}\n\n## Why\nSync repository changes\n\n## Testing\nNot run`,
          labels: [],
          suggestedReviewers: [],
        })
      }
    })
  }

  // F8 — auth probe + model discovery in one call. NO retries (probe should
  // give fast UI feedback; complete()'s 3-retry chain would mask a 401 as a
  // hung button). Hard 5s timeout per attempt. Returns the model id list so
  // the settings dropdown can populate from real data instead of the MODELS
  // constant above.
  static async testConnection(
    provider: AIProvider,
    apiKey: string,
  ): Promise<TestConnectionResult> {
    const timeoutMs = 5000

    try {
      const models = await withTimeout(listModels(provider, apiKey), timeoutMs)
      return { ok: true, models }
    } catch (cause) {
      return { ok: false, error: classifyProbeError(cause) }
    }
  }

  private async complete(prompt: string, maxTokens: number): Promise<RepoFoxResult<string>> {
    const model = (this.config.model ?? MODELS[this.config.provider] ?? MODELS['groq']) as string
    const maxRetries = 3
    const baseDelay = 1000

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        switch (this.config.provider) {
          case 'groq': {
            const client = new Groq({ apiKey: this.config.apiKey })
            const response = await client.chat.completions.create({
              model,
              max_tokens: this.config.maxTokens ?? maxTokens,
              temperature: 0.2,
              messages: [{ role: 'user', content: prompt }],
            })
            return ok(response.choices[0]?.message.content ?? '')
          }
          case 'openai': {
            const client = new OpenAI({ apiKey: this.config.apiKey })
            const response = await client.chat.completions.create({
              model,
              max_tokens: this.config.maxTokens ?? maxTokens,
              temperature: 0.2,
              messages: [{ role: 'user', content: prompt }],
            })
            return ok(response.choices[0]?.message.content ?? '')
          }
          case 'anthropic': {
            const client = new Anthropic({ apiKey: this.config.apiKey })
            const response = await client.messages.create({
              model,
              max_tokens: this.config.maxTokens ?? maxTokens,
              messages: [{ role: 'user', content: prompt }],
            })
            const textBlock = response.content.find((block) => block.type === 'text')
            return ok(textBlock?.type === 'text' ? textBlock.text : '')
          }
        }
      } catch (cause) {
        const isRetryable = isTransientError(cause)

        if (isRetryable && attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt)
          this.logger.warn('AI call failed, retrying', {
            provider: this.config.provider,
            attempt: attempt + 1,
            maxRetries,
            delayMs: delay,
          })
          await new Promise((resolve) => setTimeout(resolve, delay))
          continue
        }

        this.logger.error('AI call failed', { provider: this.config.provider, attempt, cause })
        return err(aiError('AI_CALL_FAILED', 'AI provider returned an error', cause))
      }
    }

    return err(aiError('AI_CALL_FAILED', 'AI call failed after all retries'))
  }
}

function aiError(code: string, message: string, cause?: unknown): RepoFoxError {
  return { code, message, cause }
}

async function listModels(provider: AIProvider, apiKey: string): Promise<string[]> {
  switch (provider) {
    case 'groq': {
      const client = new Groq({ apiKey })
      const res = await client.models.list()
      return res.data.map((m) => m.id)
    }
    case 'openai': {
      const client = new OpenAI({ apiKey })
      const res = await client.models.list()
      return res.data.map((m) => m.id)
    }
    case 'anthropic': {
      const client = new Anthropic({ apiKey })
      const res = await client.models.list()
      return res.data.map((m) => m.id)
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`probe timed out after ${ms}ms`)), ms),
    ),
  ])
}

// Maps SDK/HTTP errors to the 4 probe kinds. UI never sees raw status codes.
function classifyProbeError(cause: unknown): ProbeError {
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

function isTransientError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false

  const message = 'message' in error ? String((error as { message: string }).message) : ''
  const status = 'status' in error ? (error as { status: number }).status : 0

  if (status === 429 || status === 500 || status === 502 || status === 503) return true
  if (message.includes('ECONNRESET') || message.includes('ETIMEDOUT') || message.includes('ENOTFOUND')) return true
  if (message.includes('rate limit') || message.includes('overloaded')) return true

  return false
}
