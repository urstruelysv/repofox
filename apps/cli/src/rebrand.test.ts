import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('RepoFox CLI rebrand', () => {
  it('does not ship the legacy Go implementation inside apps/cli', () => {
    const legacyPaths = [
      'cmd',
      'internal',
      'go.mod',
      'go.sum',
      `repofox-${'cli'}`,
      `auto${'commit'}-cli`,
      `.auto${'commit'}_cache`,
    ]

    expect(
      legacyPaths.filter((path) => existsSync(join(process.cwd(), path))),
    ).toEqual([])
  })
})
