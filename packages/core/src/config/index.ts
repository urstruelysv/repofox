import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ok, err } from 'neverthrow'
import type { RepoFoxResult, WorkflowConfig } from '../types/index.js'

function isENOENT(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  )
}

export interface RepoFoxRC {
  ai?: {
    model?: string
    maxTokens?: number
  }
  autoApprove?: boolean
  workflow?: {
    autoApprove?: boolean
  }
}

export async function loadRC(repoPath: string): Promise<RepoFoxResult<RepoFoxRC | null>> {
  const rcPath = join(repoPath, '.repofoxrc')
  try {
    const content = await readFile(rcPath, 'utf-8')
    return ok(JSON.parse(content) as RepoFoxRC)
  } catch (error) {
    if (isENOENT(error)) {
      return ok(null)
    }
    return err({
      code: 'CONFIG_LOAD_FAILED',
      message: `Failed to load .repofoxrc: ${(error as Error).message}`,
      cause: error,
    })
  }
}

function mergeAIConfig(base: WorkflowConfig['ai'], rc: RepoFoxRC): WorkflowConfig['ai'] {
  const ai: WorkflowConfig['ai'] = {
    provider: base.provider,
    apiKey: base.apiKey,
  }
  const model = rc.ai?.model !== undefined ? rc.ai.model : base.model
  const maxTokens = rc.ai?.maxTokens !== undefined ? rc.ai.maxTokens : base.maxTokens
  if (model !== undefined) {
    ai.model = model
  }
  if (maxTokens !== undefined) {
    ai.maxTokens = maxTokens
  }
  return ai
}

export function mergeConfig(base: WorkflowConfig, rc: RepoFoxRC | null): WorkflowConfig {
  if (!rc) return base

  return {
    ...base,
    ai: mergeAIConfig(base.ai, rc),
    autoApprove: rc.workflow?.autoApprove ?? rc.autoApprove ?? base.autoApprove,
  }
}
