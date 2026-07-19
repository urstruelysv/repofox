import type { GitHubConfig, RepoFoxResult } from '../types/index.js'
import { GitHubClient } from './index.js'

export type GitHubWorkflowReadiness =
  | { status: 'ready'; config: GitHubConfig }
  | { status: 'token_missing' }
  | { status: 'remote_unavailable'; message: string }
  | { status: 'remote_not_github'; remote: string }

export function resolveGitHubWorkflowReadiness(input: {
  token: string
  remote: RepoFoxResult<string>
}): GitHubWorkflowReadiness {
  if (input.remote.isErr()) {
    return { status: 'remote_unavailable', message: input.remote.error.message }
  }

  const parsed = GitHubClient.parseOwnerRepo(input.remote.value)
  if (!parsed) {
    return { status: 'remote_not_github', remote: input.remote.value }
  }

  const token = input.token.trim()
  if (!token) return { status: 'token_missing' }

  return {
    status: 'ready',
    config: { token, owner: parsed.owner, repo: parsed.repo },
  }
}
