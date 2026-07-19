import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import type { Logger } from '../logger/index.js'
import { GitClient } from './index.js'

const execFileAsync = promisify(execFile)

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
}

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd })
}

describe('GitClient', () => {
  it('detects tags with slash names without treating missing tags as present', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'repofox-git-client-'))

    try {
      await execFileAsync('git', ['init', '--initial-branch=main', repo])
      await git(repo, ['config', 'user.email', 'repofox@example.com'])
      await git(repo, ['config', 'user.name', 'RepoFox Test'])
      await writeFile(join(repo, 'README.md'), '# Demo\n', 'utf-8')
      await git(repo, ['add', 'README.md'])
      await git(repo, ['commit', '-m', 'chore: initial commit'])

      const client = new GitClient({ repoPath: repo, logger })

      await expect(client.tagExists('feat/repofox-dummy-flow')).resolves.toBe(false)

      await git(repo, ['tag', 'feat/repofox-dummy-flow'])

      await expect(client.tagExists('feat/repofox-dummy-flow')).resolves.toBe(true)
    } finally {
      await rm(repo, { recursive: true, force: true })
    }
  })
})
