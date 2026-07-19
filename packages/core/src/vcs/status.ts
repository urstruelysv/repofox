import { ok, err } from 'neverthrow'
import type { GitClient } from '../git/index.js'
import type { GitHubClient } from '../github/index.js'
import type { Logger } from '../logger/index.js'
import type { RepoFoxResult, VcsStatus } from '../types/index.js'

export interface VcsStatusDependencies {
  git: Pick<
    GitClient,
    | 'isInsideRepo'
    | 'isDetachedHead'
    | 'getStatus'
    | 'hasPrimaryRemote'
    | 'getDefaultRemoteBranch'
    | 'countCommitsAheadOf'
    | 'fetchRemote'
  >
  github?: Pick<GitHubClient, 'findOpenPR' | 'getDefaultBranch'> | null
  logger: Logger
}

function emptyWorkingTree(): VcsStatus['workingTree'] {
  return { files: [], insertions: 0, deletions: 0 }
}

function nonRepositoryStatus(): VcsStatus {
  return {
    isRepo: false,
    hasPrimaryRemote: false,
    isDefaultRef: false,
    refName: null,
    hasWorkingTreeChanges: false,
    workingTree: emptyWorkingTree(),
    hasUpstream: false,
    aheadCount: 0,
    behindCount: 0,
    aheadOfDefaultCount: 0,
    pr: null,
  }
}

export async function buildVcsStatus(
  dependencies: VcsStatusDependencies,
): Promise<RepoFoxResult<VcsStatus>> {
  const { git, github, logger } = dependencies

  const insideRepo = await git.isInsideRepo()
  if (!insideRepo) {
    return ok(nonRepositoryStatus())
  }

  const hasPrimaryRemote = await git.hasPrimaryRemote()
  const statusResult = await git.getStatus()
  if (statusResult.isErr()) {
    return err(statusResult.error)
  }

  const gitStatus = statusResult.value
  const detached = await git.isDetachedHead()
  const refName = detached || gitStatus.branch === 'HEAD' ? null : gitStatus.branch

  const workingTreeFiles = gitStatus.files.map((file) => ({
    path: file.path,
    insertions: 0,
    deletions: 0,
  }))

  let defaultBranch = 'main'
  if (hasPrimaryRemote) {
    const defaultResult = await git.getDefaultRemoteBranch()
    if (defaultResult.isOk()) {
      defaultBranch = defaultResult.value
    } else if (github) {
      defaultBranch = await github.getDefaultBranch()
    }
  } else if (github) {
    defaultBranch = await github.getDefaultBranch()
  }

  const isDefaultRef = refName !== null && refName === defaultBranch

  let aheadOfDefaultCount = 0
  if (refName !== null && hasPrimaryRemote) {
    await git.fetchRemote().catch(() => undefined)
    const aheadOfDefault = await git.countCommitsAheadOf(`origin/${defaultBranch}`)
    if (aheadOfDefault.isOk()) {
      aheadOfDefaultCount = aheadOfDefault.value
    }
  }

  let pr: VcsStatus['pr'] = null
  if (refName !== null && github) {
    try {
      const openPr = await github.findOpenPR(refName, defaultBranch)
      if (openPr) {
        pr = {
          number: openPr.number,
          title: openPr.title,
          url: openPr.url,
          baseRef: defaultBranch,
          headRef: refName,
          state: openPr.state === 'merged' ? 'merged' : openPr.state,
        }
      }
    } catch (cause) {
      logger.warn('failed to resolve open pull request for VCS status', { cause })
    }
  }

  return ok({
    isRepo: true,
    hasPrimaryRemote,
    isDefaultRef,
    refName,
    hasWorkingTreeChanges: !gitStatus.isClean,
    workingTree: {
      files: workingTreeFiles,
      insertions: 0,
      deletions: 0,
    },
    hasUpstream: gitStatus.hasUpstream,
    aheadCount: gitStatus.ahead,
    behindCount: gitStatus.behind,
    aheadOfDefaultCount,
    pr,
  })
}
