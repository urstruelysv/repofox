import { execFile } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { ok } from 'neverthrow'
import { GitClient } from '../git/index.js'
import type { Logger } from '../logger/index.js'
import { RAGBuilder } from '../rag/index.js'
import { SnapshotManager } from '../snapshot/index.js'
import { WorkflowEngine, type WorkflowEvent } from './index.js'

const execFileAsync = promisify(execFile)

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd })
  return stdout.trim()
}

async function gitPorcelain(cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd })
  return stdout.replace(/\n$/, '')
}

async function createFixtureRepo(): Promise<{ root: string; repo: string; remote: string }> {
  const root = await mkdtemp(join(tmpdir(), 'repofox-workflow-'))
  const remote = join(root, 'origin.git')
  const repo = join(root, 'work')

  await execFileAsync('git', ['init', '--bare', '--initial-branch=main', remote])
  await execFileAsync('git', ['init', '--initial-branch=main', repo])
  await git(repo, ['config', 'user.email', 'repofox@example.com'])
  await git(repo, ['config', 'user.name', 'RepoFox Test'])
  await writeFile(join(repo, 'README.md'), '# Demo\n', 'utf-8')
  await git(repo, ['add', 'README.md'])
  await git(repo, ['commit', '-m', 'chore: initial commit'])
  await git(repo, ['remote', 'add', 'origin', remote])
  await git(repo, ['push', '-u', 'origin', 'main'])
  await git(repo, ['fetch', 'origin'])
  await git(repo, ['remote', 'set-head', 'origin', 'main'])

  await writeFile(join(repo, 'README.md'), '# Demo\n\nChanged by RepoFox.\n', 'utf-8')
  await writeFile(join(repo, 'notes.txt'), 'untracked note\n', 'utf-8')

  return { root, repo, remote }
}

describe('WorkflowEngine filesystem integration', () => {
  it('creates branch, stages, commits, pushes, snapshots, and restores a dummy repo', async () => {
    const fixture = await createFixtureRepo()

    try {
      const gitClient = new GitClient({ repoPath: fixture.repo, logger })
      const snapshots = new SnapshotManager(fixture.repo, logger)
      const events: WorkflowEvent[] = []
      const engine = new WorkflowEngine(
        {
          ai: { provider: 'groq', apiKey: 'test-key' },
          github: null,
          repoPath: fixture.repo,
          autoApprove: true,
        },
        logger,
        (event) => {
          events.push(event)
        },
        {
          git: gitClient,
          snapshots,
          rag: new RAGBuilder(gitClient, logger),
          github: null,
          ai: {
            generateBranchName: async () => ok({ name: 'feat/repofox-dummy-flow', confidence: 'high' }),
            generateCommitMessage: async () =>
              ok({
                message: 'feat(test): verify repofox workflow',
                type: 'feat',
                scope: 'test',
                body: null,
              }),
            generatePRDescription: async () =>
              ok({
                title: 'feat: verify repofox workflow',
                body: '## What\nVerify workflow\n\n## Testing\nvitest',
                labels: [],
                suggestedReviewers: [],
              }),
          },
        },
      )

      const runResult = await engine.runStackedAction('commit_push')

      expect(runResult.isOk()).toBe(true)
      expect(engine.getState().status).toBe('complete')
      expect(engine.getState().operations.map((operation) => operation.operation)).toEqual([
        'branch_created',
        'files_staged',
        'committed',
        'pushed',
      ])
      expect(engine.getState().operations.every((operation) => operation.status === 'done')).toBe(true)

      const currentBranch = await git(fixture.repo, ['branch', '--show-current'])
      expect(currentBranch).toBe('feat/repofox-dummy-flow')
      expect(await gitPorcelain(fixture.repo)).toBe('')
      expect(await git(fixture.repo, ['log', '-1', '--pretty=%s'])).toBe(
        'feat(test): verify repofox workflow',
      )
      expect(await git(fixture.repo, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])).toBe(
        'origin/feat/repofox-dummy-flow',
      )
      expect(await git(fixture.remote, ['show-ref', '--verify', 'refs/heads/feat/repofox-dummy-flow']))
        .toContain('refs/heads/feat/repofox-dummy-flow')

      const listedSnapshots = await snapshots.list()
      expect(listedSnapshots.isOk()).toBe(true)
      if (listedSnapshots.isErr()) return
      expect(listedSnapshots.value.map((snapshot) => snapshot.operation).sort()).toEqual([
        'branch_created',
        'committed',
        'files_staged',
        'pushed',
      ])

      for (const snapshot of listedSnapshots.value) {
        const dir = join(fixture.repo, '.git', 'repofox', 'snapshots', snapshot.id)
        const files = await readdir(dir)
        expect(files).toEqual(
          expect.arrayContaining([
            `${snapshot.id}.meta.json`,
            `${snapshot.id}.working.patch`,
            `${snapshot.id}.staged.patch`,
            `${snapshot.id}.untracked.json`,
          ]),
        )
        await expect(stat(join(dir, `${snapshot.id}.meta.json`))).resolves.toMatchObject({
          size: expect.any(Number),
        })
      }

      const branchSnapshot = listedSnapshots.value.find(
        (snapshot) => snapshot.operation === 'branch_created',
      )
      expect(branchSnapshot).toBeDefined()
      if (!branchSnapshot) return

      const restoreResult = await snapshots.restore(branchSnapshot.id)
      expect(restoreResult.isOk()).toBe(true)
      expect(await git(fixture.repo, ['branch', '--show-current'])).toBe('main')
      expect(await readFile(join(fixture.repo, 'README.md'), 'utf-8')).toBe(
        '# Demo\n\nChanged by RepoFox.\n',
      )
      expect(await readFile(join(fixture.repo, 'notes.txt'), 'utf-8')).toBe('untracked note\n')
      expect(await gitPorcelain(fixture.repo)).toBe(' M README.md\n?? notes.txt')
      await expect(git(fixture.repo, ['rev-parse', '--verify', 'feat/repofox-dummy-flow'])).rejects.toThrow()

      expect(events.some((event) => event.type === 'complete')).toBe(true)
    } finally {
      await rm(fixture.root, { recursive: true, force: true })
    }
  }, 30_000)
})
