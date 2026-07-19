import { describe, expect, it } from 'vitest'
import { parseCliArgs, parseCliCommand } from './config.js'

describe('parseCliArgs', () => {
  it('defaults to the one-click branch-to-PR action with Groq credentials from env', () => {
    const options = parseCliArgs([], {
      GROQ_API_KEY: 'groq-key',
      GITHUB_TOKEN: 'gh-token',
    }, '/repofox/demo')

    expect(options).toEqual({
      action: 'commit_push_pr',
      repoPath: '/repofox/demo',
      ai: {
        provider: 'groq',
        apiKey: 'groq-key',
      },
      githubToken: 'gh-token',
      autoApprove: false,
      json: false,
    })
  })

  it('uses provider-specific API keys and explicit action flags', () => {
    const options = parseCliArgs([
      '--action',
      'commit_push',
      '--provider',
      'openai',
      '--repo',
      '/repofox/other',
      '--yes',
      '--json',
    ], {
      OPENAI_API_KEY: 'openai-key',
      GROQ_API_KEY: 'groq-key',
    }, '/repofox/demo')

    expect(options.action).toBe('commit_push')
    expect(options.repoPath).toBe('/repofox/other')
    expect(options.ai).toEqual({
      provider: 'openai',
      apiKey: 'openai-key',
    })
    expect(options.autoApprove).toBe(true)
    expect(options.json).toBe(true)
  })

  it('rejects invalid stacked actions before any workflow starts', () => {
    expect(() => parseCliArgs(['--action', 'ship_it'], {
      GROQ_API_KEY: 'groq-key',
    }, '/repofox/demo')).toThrow('Invalid action: ship_it')
  })

  it('parses status without requiring an AI key', () => {
    expect(parseCliCommand(['status', '--repo', '/repofox/fixture'], {}, '/repofox/demo')).toEqual({
      kind: 'status',
      repoPath: '/repofox/fixture',
      json: false,
    })
  })

  it('parses a confirmed snapshot restore by operation id', () => {
    expect(parseCliCommand(['restore', 'operation-1', '--yes'], {}, '/repofox/demo')).toEqual({
      kind: 'restore',
      repoPath: '/repofox/demo',
      operationId: 'operation-1',
      yes: true,
      json: false,
    })
  })
})
