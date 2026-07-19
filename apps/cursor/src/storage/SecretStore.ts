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
    const VALID_PROVIDERS: AIProvider[] = ["groq", "openai", "anthropic"]
    const value = await this.secrets.get(KEYS.AI_PROVIDER)
    if (value && VALID_PROVIDERS.includes(value as AIProvider)) {
      return value as AIProvider
    }
    return "groq"
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
    const trimmed = key.trim()
    if (trimmed.length === 0) {
      await this.secrets.delete(storeKey)
      return
    }

    await this.secrets.store(storeKey, trimmed)
  }

  async getGitHubToken(): Promise<string> {
    return (await this.secrets.get(KEYS.GITHUB_TOKEN)) ?? ''
  }

  async setGitHubToken(token: string): Promise<void> {
    const trimmed = token.trim()
    if (trimmed.length === 0) {
      await this.secrets.delete(KEYS.GITHUB_TOKEN)
      return
    }

    await this.secrets.store(KEYS.GITHUB_TOKEN, trimmed)
  }
}
