// =============================================================================
// F8 — secret storage (OS keychain wrapper, NEVER plaintext)
// =============================================================================
// First principles:
//   1. Any secret stored in plain memory or disk is a leak waiting to happen:
//      crash dumps, swap files, log shipping, accidental console.log, all
//      capture process memory or write streams. The OS keychain (Keychain
//      on macOS, Credential Manager on Windows, libsecret on Linux) is the
//      one storage layer designed for this — encrypted at rest, gated by
//      OS-level auth, and audited by platform.
//   2. VS Code's `SecretStorage` is the official wrapper around that
//      keychain for extensions. Using it is not optional — anything else
//      (workspace settings, globalState, .env in the workspace) is a
//      security regression.
//   3. The secret should leave this module ONLY when it's about to be used
//      for a network call, and the caller (SidebarProvider) should drop
//      the reference immediately after. Never serialize into a postMessage
//      payload (would cross into the webview process), never log the value
//      (only "set"/"MISSING" strings — see runDiagnostics line ~96 for the
//      pattern).
//
// What this file is:
//   The single read/write surface for AI keys + GitHub tokens. Five logical
//   slots: AI provider id, three provider-keyed slots, one GH token. The
//   provider id is technically not a secret, but storing it alongside means
//   a single mock in tests covers all settings reads.
//
// Why F8 does NOT need to change this file:
//   The probe (Test Connection) is a READ + EPHEMERAL USE pattern that is
//   already supported: caller does `getAPIKey(provider)`, passes it to
//   AIClient, drops the reference. No new storage shape needed.
//
//   Resist the temptation to cache "last test result" or "scopes" here.
//   That's stale by definition (token can be revoked between save and use)
//   and turns a clean storage layer into a state machine. The probe runs
//   on demand; that's the whole point.
// =============================================================================

import * as vscode from 'vscode'
import type { AIProvider } from '@repofox/core'

const KEYS = {
  AI_PROVIDER: 'repofox.ai.provider',
  GROQ_KEY: 'repofox.ai.groq.key',
  OPENAI_KEY: 'repofox.ai.openai.key',
  ANTHROPIC_KEY: 'repofox.ai.anthropic.key',
  GITHUB_TOKEN: 'repofox.github.token',
} as const

export class SecretStore {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async getAIProvider(): Promise<AIProvider> {
    const value = await this.secrets.get(KEYS.AI_PROVIDER)
    return (value as AIProvider | undefined) ?? 'groq'
  }

  async setAIProvider(provider: AIProvider): Promise<void> {
    await this.secrets.store(KEYS.AI_PROVIDER, provider)
  }

  async getAPIKey(provider: AIProvider): Promise<string> {
    const key =
      provider === 'groq'
        ? KEYS.GROQ_KEY
        : provider === 'openai'
          ? KEYS.OPENAI_KEY
          : KEYS.ANTHROPIC_KEY

    return (await this.secrets.get(key)) ?? ''
  }

  async setAPIKey(provider: AIProvider, key: string): Promise<void> {
    const storeKey =
      provider === 'groq'
        ? KEYS.GROQ_KEY
        : provider === 'openai'
          ? KEYS.OPENAI_KEY
          : KEYS.ANTHROPIC_KEY
    if (key.trim().length === 0) {
      await this.secrets.delete(storeKey)
      return
    }

    await this.secrets.store(storeKey, key)
  }

  async getGitHubToken(): Promise<string> {
    return (await this.secrets.get(KEYS.GITHUB_TOKEN)) ?? ''
  }

  async setGitHubToken(token: string): Promise<void> {
    if (token.trim().length === 0) {
      await this.secrets.delete(KEYS.GITHUB_TOKEN)
      return
    }

    await this.secrets.store(KEYS.GITHUB_TOKEN, token)
  }
}
