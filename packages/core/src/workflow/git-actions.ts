import type {
  GitActionMenuItem,
  GitQuickAction,
  GitStackedAction,
  OperationType,
  VcsStatus,
} from '../types/index.js'

export function buildGitActionProgressStages(input: {
  action: GitStackedAction
  hasCustomCommitMessage: boolean
  hasWorkingTreeChanges: boolean
  shouldPushBeforePr?: boolean
  needsBranch?: boolean
}): string[] {
  const branchStages = input.needsBranch ? ['Preparing feature branch...'] : []
  const pushStage = 'Pushing to origin...'
  const prStages = ['Preparing PR...', 'Generating PR content...', 'Creating pull request...']

  if (input.action === 'push') {
    return [pushStage]
  }
  if (input.action === 'create_pr') {
    return input.shouldPushBeforePr ? [pushStage, ...prStages] : prStages
  }

  const shouldIncludeCommitStages =
    input.action === 'commit' || input.hasWorkingTreeChanges
  const commitStages = !shouldIncludeCommitStages
    ? []
    : input.hasCustomCommitMessage
      ? ['Committing...']
      : ['Generating commit message...', 'Committing...']

  if (input.action === 'commit') {
    return [...branchStages, ...commitStages]
  }
  if (input.action === 'commit_push') {
    return [...branchStages, ...commitStages, pushStage]
  }
  return [...branchStages, ...commitStages, pushStage, ...prStages]
}

export function buildMenuItems(
  gitStatus: VcsStatus | null,
  isBusy: boolean,
  hasPrimaryRemote = true,
  _hasGithub = true,
): GitActionMenuItem[] {
  if (!gitStatus || !gitStatus.isRepo) return []

  const hasBranch = gitStatus.refName !== null
  const hasChanges = gitStatus.hasWorkingTreeChanges
  const hasOpenPr = gitStatus.pr?.state === 'open'
  const isBehind = gitStatus.behindCount > 0
  const hasDefaultBranchDelta =
    (gitStatus.aheadOfDefaultCount ?? gitStatus.aheadCount) > 0
  const canPushWithoutUpstream = hasPrimaryRemote && !gitStatus.hasUpstream
  const canCommit = !isBusy && hasChanges
  const canPush =
    !isBusy &&
    hasBranch &&
    !isBehind &&
    gitStatus.aheadCount > 0 &&
    (gitStatus.hasUpstream || canPushWithoutUpstream)
  const canCreatePr =
    !isBusy &&
    hasBranch &&
    !hasChanges &&
    !hasOpenPr &&
    hasDefaultBranchDelta &&
    !isBehind &&
    (gitStatus.hasUpstream || canPushWithoutUpstream)
  const canOpenPr = !isBusy && hasOpenPr

  const commitItem: GitActionMenuItem = {
    id: 'commit',
    label: 'Commit',
    disabled: !canCommit,
    icon: 'commit',
    kind: 'run_action',
    action: 'commit',
  }

  if (!hasPrimaryRemote) {
    return [commitItem]
  }

  return [
    commitItem,
    {
      id: 'push',
      label: 'Push',
      disabled: !canPush,
      icon: 'push',
      kind: 'run_action',
      action: 'push',
    },
    hasOpenPr
      ? {
          id: 'pr',
          label: 'View PR',
          disabled: !canOpenPr,
          icon: 'pr',
          kind: 'open_pr',
        }
      : {
          id: 'pr',
          label: 'Create PR',
          disabled: !canCreatePr,
          icon: 'pr',
          kind: 'run_action',
          action: 'create_pr',
        },
  ]
}

export function resolveQuickAction(
  gitStatus: VcsStatus | null,
  isBusy: boolean,
  isDefaultRef = false,
  hasPrimaryRemote = true,
  hasGithub = true,
): GitQuickAction {
  if (isBusy) {
    return { label: 'Commit', disabled: true, kind: 'show_hint', hint: 'Git action in progress.' }
  }

  if (!gitStatus || !gitStatus.isRepo) {
    return {
      label: 'Commit',
      disabled: true,
      kind: 'show_hint',
      hint: 'Git status is unavailable.',
    }
  }

  const hasBranch = gitStatus.refName !== null
  const hasChanges = gitStatus.hasWorkingTreeChanges
  const hasOpenPr = gitStatus.pr?.state === 'open'
  const isAhead = gitStatus.aheadCount > 0
  const hasDefaultBranchDelta =
    (gitStatus.aheadOfDefaultCount ?? gitStatus.aheadCount) > 0
  const isBehind = gitStatus.behindCount > 0
  const isDiverged = isAhead && isBehind

  if (!hasBranch) {
    return {
      label: 'Commit',
      disabled: true,
      kind: 'show_hint',
      hint: 'Checkout a branch before pushing or opening a pull request.',
    }
  }

  if (hasChanges) {
    if (!gitStatus.hasUpstream && !hasPrimaryRemote) {
      return { label: 'Commit', disabled: false, kind: 'run_action', action: 'commit' }
    }
    if (hasOpenPr || isDefaultRef) {
      return { label: 'Commit & push', disabled: false, kind: 'run_action', action: 'commit_push' }
    }
    if (!hasGithub) {
      return { label: 'Commit & push', disabled: false, kind: 'run_action', action: 'commit_push' }
    }
    return {
      label: 'Commit, push & PR',
      disabled: false,
      kind: 'run_action',
      action: 'commit_push_pr',
    }
  }

  if (!gitStatus.hasUpstream) {
    if (!hasPrimaryRemote) {
      if (hasOpenPr && !isAhead) {
        return { label: 'View PR', disabled: false, kind: 'open_pr' }
      }
      return {
        label: 'Commit',
        disabled: true,
        kind: 'show_hint',
        hint: 'Add an origin remote before pushing.',
      }
    }
    if (!isAhead) {
      if (hasOpenPr) {
        return { label: 'View PR', disabled: false, kind: 'open_pr' }
      }
      return {
        label: 'Push',
        disabled: true,
        kind: 'show_hint',
        hint: 'No local commits to push.',
      }
    }
    if (hasOpenPr || isDefaultRef) {
      return {
        label: 'Push',
        disabled: false,
        kind: 'run_action',
        action: isDefaultRef ? 'commit_push' : 'push',
      }
    }
    return {
      label: 'Push & create PR',
      disabled: false,
      kind: 'run_action',
      action: 'create_pr',
    }
  }

  if (isDiverged) {
    return {
      label: 'Sync branch',
      disabled: true,
      kind: 'show_hint',
      hint: 'Branch has diverged from upstream. Rebase or merge first.',
    }
  }

  if (isBehind) {
    return {
      label: 'Pull',
      disabled: false,
      kind: 'run_pull',
    }
  }

  if (isAhead) {
    if (hasOpenPr || isDefaultRef) {
      return {
        label: 'Push',
        disabled: false,
        kind: 'run_action',
        action: isDefaultRef ? 'commit_push' : 'push',
      }
    }
    return {
      label: 'Push & create PR',
      disabled: false,
      kind: 'run_action',
      action: 'create_pr',
    }
  }

  if (hasOpenPr && gitStatus.hasUpstream) {
    return { label: 'View PR', disabled: false, kind: 'open_pr' }
  }

  if (hasDefaultBranchDelta && !isDefaultRef) {
    return {
      label: 'Create PR',
      disabled: false,
      kind: 'run_action',
      action: 'create_pr',
    }
  }

  return {
    label: 'Commit',
    disabled: true,
    kind: 'show_hint',
    hint: 'Branch is up to date. No action needed.',
  }
}

export function planStackedActionOperations(
  action: GitStackedAction,
  status: VcsStatus,
  hasGithub: boolean,
): OperationType[] {
  const wantsCommit =
    action === 'commit' || action === 'commit_push' || action === 'commit_push_pr'
  const wantsPush =
    action === 'push' ||
    action === 'commit_push' ||
    action === 'commit_push_pr' ||
    (action === 'create_pr' && (!status.hasUpstream || status.aheadCount > 0))
  const wantsPr = (action === 'create_pr' || action === 'commit_push_pr') && hasGithub
  const needsBranch = wantsCommit && (status.isDefaultRef || status.refName === null)

  const operations: OperationType[] = []

  if (needsBranch) {
    operations.push('branch_created')
  }
  if (wantsCommit) {
    operations.push('files_staged', 'committed')
  }
  if (wantsPush) {
    operations.push('pushed')
  }
  if (wantsPr) {
    operations.push('pr_opened')
  }

  return operations
}

export function validateStackedAction(
  action: GitStackedAction,
  status: VcsStatus,
  hasGithub: boolean,
): string | null {
  if (!status.isRepo) {
    return 'Not a git repository.'
  }

  if (status.refName === null && action !== 'commit') {
    return 'Checkout a branch before running this action.'
  }

  if (action === 'create_pr' && status.hasWorkingTreeChanges) {
    return 'Commit local changes before creating a pull request.'
  }

  if ((action === 'create_pr' || action === 'commit_push_pr') && !hasGithub) {
    return 'GitHub is not configured. Add a token in Settings.'
  }

  const quick = resolveQuickAction(status, false, status.isDefaultRef, status.hasPrimaryRemote, hasGithub)
  if (quick.kind === 'run_action' && quick.action === action) {
    return null
  }

  if (action === 'commit' && status.hasWorkingTreeChanges) {
    return null
  }

  if (action === 'push' && status.aheadCount > 0 && status.behindCount === 0) {
    return null
  }

  return quick.hint ?? 'This action is not available for the current repository state.'
}
