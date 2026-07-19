import { describe, expect, it } from 'vitest'
import {
  planStackedActionOperations,
  resolveQuickAction,
  validateStackedAction,
} from './git-actions.js'
import type { VcsStatus } from '../types/index.js'

function baseStatus(overrides: Partial<VcsStatus> = {}): VcsStatus {
  return {
    isRepo: true,
    hasPrimaryRemote: true,
    isDefaultRef: false,
    refName: 'feat/auth',
    hasWorkingTreeChanges: false,
    workingTree: { files: [], insertions: 0, deletions: 0 },
    hasUpstream: true,
    aheadCount: 0,
    behindCount: 0,
    aheadOfDefaultCount: 2,
    pr: null,
    ...overrides,
  }
}

describe('resolveQuickAction', () => {
  it('offers commit_push_pr when feature branch has local changes', () => {
    const action = resolveQuickAction(
      baseStatus({ hasWorkingTreeChanges: true }),
      false,
      false,
      true,
    )
    expect(action).toMatchObject({
      kind: 'run_action',
      action: 'commit_push_pr',
      disabled: false,
    })
  })

  it('offers create PR when branch is clean and ahead of default', () => {
    const action = resolveQuickAction(baseStatus(), false, false, true)
    expect(action).toMatchObject({
      kind: 'run_action',
      action: 'create_pr',
      disabled: false,
    })
  })

  it('offers view PR when an open PR already exists', () => {
    const action = resolveQuickAction(
      baseStatus({
        pr: {
          number: 12,
          title: 'feat: auth',
          url: 'https://github.com/repofox/repofox/pull/12',
          baseRef: 'main',
          headRef: 'feat/auth',
          state: 'open',
        },
      }),
      false,
      false,
      true,
    )
    expect(action).toMatchObject({ kind: 'open_pr', label: 'View PR' })
  })
})

describe('planStackedActionOperations', () => {
  it('includes branch creation when committing from default ref', () => {
    const ops = planStackedActionOperations(
      'commit_push_pr',
      baseStatus({ isDefaultRef: true, hasWorkingTreeChanges: true }),
      true,
    )
    expect(ops).toEqual([
      'branch_created',
      'files_staged',
      'committed',
      'pushed',
      'pr_opened',
    ])
  })

  it('skips branch creation when already on a feature branch', () => {
    const ops = planStackedActionOperations(
      'commit_push_pr',
      baseStatus({ hasWorkingTreeChanges: true }),
      true,
    )
    expect(ops).toEqual(['files_staged', 'committed', 'pushed', 'pr_opened'])
  })

  it('plans push and PR only for create_pr when ahead without local changes', () => {
    const ops = planStackedActionOperations(
      'create_pr',
      baseStatus({ aheadCount: 1, aheadOfDefaultCount: 1 }),
      true,
    )
    expect(ops).toEqual(['pushed', 'pr_opened'])
  })
})

describe('validateStackedAction', () => {
  it('rejects create_pr when working tree is dirty', () => {
    const message = validateStackedAction(
      'create_pr',
      baseStatus({ hasWorkingTreeChanges: true }),
      true,
    )
    expect(message).toContain('Commit local changes')
  })
})
