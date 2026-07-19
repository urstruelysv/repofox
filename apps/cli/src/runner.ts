import {
  GitClient,
  GitHubClient,
  SessionStore,
  SnapshotManager,
  WorkflowEngine,
  WorkflowSessionRecorder,
  type GitStackedAction,
  type Logger,
  type PRApprovalInput,
  type RepoFoxResult,
  type WorkflowConfig,
  type WorkflowEvent,
  type WorkflowEventHandler,
} from '@repofox/core'
import type { CliCommand, CliOptions } from './config.js'

export interface CliIO {
  write: (message: string) => void
  error: (message: string) => void
  ask: (question: string, defaultValue?: string) => Promise<string>
}

export interface CliWorkflow {
  runStackedAction: (action: GitStackedAction) => Promise<RepoFoxResult<string | null>>
  approveBranchName: (name: string) => Promise<RepoFoxResult<void>>
  approveCommitMessage: (message: string) => Promise<RepoFoxResult<void>>
  approvePRDescription: (input: PRApprovalInput) => Promise<RepoFoxResult<void>>
}

export interface CliDependencies {
  createWorkflow?: (
    config: WorkflowConfig,
    onEvent: WorkflowEventHandler,
    logger: Logger,
  ) => CliWorkflow | Promise<CliWorkflow>
  createSessionStore?: (repoPath: string, logger: Logger) => SessionStore
  restoreSnapshot?: (
    repoPath: string,
    snapshotId: string,
    logger: Logger,
  ) => Promise<RepoFoxResult<void>>
}

export async function executeCliCommand(
  command: CliCommand,
  io: CliIO,
  dependencies: CliDependencies = {},
): Promise<number> {
  if (command.kind === 'run') {
    return runCli(command.options, io, dependencies)
  }

  const logger = createCliLogger(io)
  const store = dependencies.createSessionStore?.(command.repoPath, logger)
    ?? new SessionStore(command.repoPath, logger)

  if (command.kind === 'status') {
    const active = await store.getActive()
    if (active.isErr()) {
      io.error(active.error.message)
      return 1
    }
    writeLedgerResult(command.json, io, active.value)
    return 0
  }

  const sessions = await store.list()
  if (sessions.isErr()) {
    io.error(sessions.error.message)
    return 1
  }

  if (command.kind === 'history') {
    writeLedgerResult(command.json, io, sessions.value)
    return 0
  }

  const operation = sessions.value
    .flatMap((session) => session.state.operations)
    .find((record) => record.id === command.operationId)
  if (!operation) {
    io.error(`Operation ${command.operationId} was not found in the workflow ledger.`)
    return 1
  }
  if (!operation.snapshotId) {
    io.error(`Operation ${command.operationId} has no recovery snapshot.`)
    return 1
  }
  if (!command.yes) {
    const answer = await io.ask(`Restore snapshot for ${operation.label}? [y/N]`)
    if (answer.trim().toLowerCase() !== 'y') {
      io.write('Restore cancelled.')
      return 0
    }
  }

  const restore = dependencies.restoreSnapshot
    ?? ((repoPath, snapshotId, restoreLogger) => new SnapshotManager(repoPath, restoreLogger).restore(snapshotId))
  const restored = await restore(command.repoPath, operation.snapshotId, logger)
  if (restored.isErr()) {
    io.error(restored.error.message)
    return 1
  }
  writeLedgerResult(command.json, io, { ok: true, operationId: operation.id, snapshotId: operation.snapshotId })
  return 0
}

export async function runCli(
  options: CliOptions,
  io: CliIO,
  dependencies: CliDependencies = {},
): Promise<number> {
  if (!options.ai.apiKey) {
    io.error(`Missing API key for provider "${options.ai.provider}".`)
    return 1
  }

  const logger = createCliLogger(io)
  const store = dependencies.createSessionStore?.(options.repoPath, logger)
    ?? new SessionStore(options.repoPath, logger)
  const recorder = new WorkflowSessionRecorder(store)
  const pendingApprovals: WorkflowEvent[] = []
  let completed = false
  let completedPrUrl: string | null = null
  let failedMessage: string | null = null

  const onEvent: WorkflowEventHandler = (event) => {
    recorder.record(event)
    switch (event.type) {
      case 'approval_required':
        pendingApprovals.push(event)
        break
      case 'warning':
        io.write(`warning: ${event.message}`)
        break
      case 'error':
        failedMessage = event.error.message
        break
      case 'complete':
        completed = true
        completedPrUrl = event.prUrl
        break
      case 'state_changed':
        break
    }
  }

  const shouldResolveGitHub = dependencies.createWorkflow === undefined
  const workflowConfig = await buildWorkflowConfig(options, logger, shouldResolveGitHub)
  const workflow = await (dependencies.createWorkflow ?? createWorkflow)(
    workflowConfig,
    onEvent,
    logger,
  )

  const runResult = await workflow.runStackedAction(options.action)
  if (runResult.isErr()) {
    io.error(runResult.error.message)
    return 1
  }

  while (!completed && pendingApprovals.length > 0) {
    const event = pendingApprovals.shift()
    if (!event || event.type !== 'approval_required') continue

    const approvalResult = await approveEvent(event, workflow, options, io)
    if (approvalResult.isErr()) {
      io.error(approvalResult.error.message)
      return 1
    }
  }

  const persisted = await recorder.flush()
  if (persisted.isErr()) {
    io.error(persisted.error.message)
    return 1
  }

  if (failedMessage) {
    io.error(failedMessage)
    return 1
  }

  if (completed || runResult.value !== null) {
    const prUrl = completedPrUrl ?? runResult.value
    writeSuccess(options, io, prUrl)
    return 0
  }

  io.error('Workflow paused before completion.')
  return 1
}

async function buildWorkflowConfig(
  options: CliOptions,
  logger: Logger,
  resolveGitHub: boolean,
): Promise<WorkflowConfig> {
  const github = options.githubToken && resolveGitHub
    ? await resolveGitHubConfig(options, logger)
    : null

  return {
    ai: options.ai,
    github,
    repoPath: options.repoPath,
    autoApprove: options.autoApprove,
  }
}

async function resolveGitHubConfig(
  options: CliOptions,
  logger: Logger,
): Promise<WorkflowConfig['github']> {
  const githubToken = options.githubToken
  if (!githubToken) return null

  const git = new GitClient({
    repoPath: options.repoPath,
    logger,
    githubToken,
  })
  const remote = await git.getRemoteUrl()
  if (remote.isErr()) return null

  const parsed = GitHubClient.parseOwnerRepo(remote.value)
  if (!parsed) return null

  return {
    token: githubToken,
    owner: parsed.owner,
    repo: parsed.repo,
  }
}

function createWorkflow(
  config: WorkflowConfig,
  onEvent: WorkflowEventHandler,
  logger: Logger,
): CliWorkflow {
  return new WorkflowEngine(config, logger, onEvent)
}

async function approveEvent(
  event: Extract<WorkflowEvent, { type: 'approval_required' }>,
  workflow: CliWorkflow,
  options: CliOptions,
  io: CliIO,
): Promise<RepoFoxResult<void>> {
  if (event.kind === 'branch_name') {
    const suggestion = event.suggestion.name
    const name = options.autoApprove
      ? suggestion
      : await chooseValue(io, 'Approve branch name', suggestion)
    return workflow.approveBranchName(name)
  }

  if (event.kind === 'commit_message') {
    const suggestion = event.suggestion.message
    const message = options.autoApprove
      ? suggestion
      : await chooseValue(io, 'Approve commit message', suggestion)
    return workflow.approveCommitMessage(message)
  }

  const title = options.autoApprove
    ? event.suggestion.title
    : await chooseValue(io, 'Approve PR title', event.suggestion.title)
  return workflow.approvePRDescription({
    title,
    body: event.suggestion.body,
    labels: event.suggestion.labels,
  })
}

async function chooseValue(
  io: CliIO,
  label: string,
  defaultValue: string,
): Promise<string> {
  const answer = await io.ask(`${label} [${defaultValue}]`, defaultValue)
  return answer.trim().length > 0 ? answer.trim() : defaultValue
}

function writeSuccess(options: CliOptions, io: CliIO, prUrl: string | null): void {
  if (options.json) {
    io.write(JSON.stringify({ ok: true, prUrl }))
    return
  }

  const suffix = prUrl ? `: ${prUrl}` : ''
  io.write(`Workflow complete${suffix}`)
}

function writeLedgerResult(json: boolean, io: CliIO, value: unknown): void {
  if (json) {
    io.write(JSON.stringify(value))
    return
  }
  if (value === null) {
    io.write('No active workflow.')
    return
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      io.write('No workflow history.')
      return
    }
    for (const session of value) {
      io.write(`${session.id} ${session.outcome} ${session.state.sessionId}`)
    }
    return
  }
  io.write(JSON.stringify(value))
}

function createCliLogger(io: CliIO): Logger {
  return {
    debug: () => undefined,
    info: (message, data) => {
      if (data === undefined) return
      io.write(`info: ${message} ${safeStringify(data)}`)
    },
    warn: (message, data) => {
      io.write(`warning: ${message}${data === undefined ? '' : ` ${safeStringify(data)}`}`)
    },
    error: (message, data) => {
      io.error(`error: ${message}${data === undefined ? '' : ` ${safeStringify(data)}`}`)
    },
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '"[unserializable]"'
  }
}
