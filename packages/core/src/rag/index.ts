import type { GitClient } from '../git/index.js'
import type { Logger } from '../logger/index.js'
import type { AIContext } from '../types/index.js'

export class RAGBuilder {
  private readonly gitClient: GitClient
  private readonly logger: Logger

  constructor(gitClient: GitClient, logger: Logger) {
    this.gitClient = gitClient
    this.logger = logger
  }

  async buildContext(repoName: string): Promise<AIContext> {
    const [branches, commits, diff, status] = await Promise.all([
      this.gitClient.getRecentBranches(10),
      this.gitClient.getRecentCommits(50),
      this.gitClient.getDiff(false),
      this.gitClient.getStatus(),
    ])

    const context: AIContext = {
      recentBranches: branches.isOk() ? branches.value : [],
      recentCommits: commits.isOk() ? commits.value : [],
      recentPRTitles: [],
      changedFiles: status.isOk() ? status.value.files.map((file) => file.path) : [],
      diff: diff.isOk() ? diff.value : '',
      repoName,
    }

    this.logger.debug('RAG context built', {
      branches: context.recentBranches.length,
      commits: context.recentCommits.length,
      files: context.changedFiles.length,
      diffLen: context.diff.length,
    })

    return context
  }

  enrichWithPRHistory(context: AIContext, prTitles: string[]): AIContext {
    return { ...context, recentPRTitles: prTitles }
  }
}
