import { describe, expect, it } from 'vitest'
import { err, ok } from 'neverthrow'
import { resolveGitHubWorkflowReadiness } from './readiness.js'

describe('resolveGitHubWorkflowReadiness', () => {
  it('builds GitHub config from a saved token and SSH GitHub remote', () => {
    expect(
      resolveGitHubWorkflowReadiness({
        token: '  ghp_saved-token  ',
        remote: ok('git@github.com:owner/repo.git'),
      }),
    ).toEqual({
      status: 'ready',
      config: { token: 'ghp_saved-token', owner: 'owner', repo: 'repo' },
    })
  })

  it('identifies a missing token before attempting PR creation', () => {
    expect(
      resolveGitHubWorkflowReadiness({
        token: '',
        remote: ok('git@github.com:owner/repo.git'),
      }),
    ).toEqual({ status: 'token_missing' })
  })

  it('distinguishes an unreadable remote from a missing token', () => {
    expect(
      resolveGitHubWorkflowReadiness({
        token: 'ghp_saved-token',
        remote: err({ code: 'REMOTE_NOT_FOUND', message: 'origin is missing' }),
      }),
    ).toEqual({ status: 'remote_unavailable', message: 'origin is missing' })
  })

  it('keeps a non-GitHub remote out of the PR path without calling it a token failure', () => {
    expect(
      resolveGitHubWorkflowReadiness({
        token: 'ghp_saved-token',
        remote: ok('git@gitlab.com:owner/repo.git'),
      }),
    ).toEqual({ status: 'remote_not_github', remote: 'git@gitlab.com:owner/repo.git' })
  })

  it('does not send a non-GitHub repository to token settings when no token exists', () => {
    expect(
      resolveGitHubWorkflowReadiness({
        token: '',
        remote: ok('git@gitlab.com:owner/repo.git'),
      }),
    ).toEqual({ status: 'remote_not_github', remote: 'git@gitlab.com:owner/repo.git' })
  })
})
