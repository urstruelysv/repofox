import type { AIContext } from '../../types/index.js'

export function buildBranchNamePrompt(context: AIContext): string {
  const branchExamples = context.recentBranches.slice(0, 8).join('\n')
  const files = context.changedFiles.slice(0, 20).join('\n')

  return `You are a senior engineer on this project.

Recent branch names in this repository (follow this exact naming convention):
${branchExamples || 'feat/example-feature\nfix/example-bug'}

Files changed in the current working tree:
${files || 'unknown'}

Generate a single git branch name.
Rules:
- Follow the naming convention shown above EXACTLY
- Use kebab-case
- Be specific but concise (3-6 words max after the prefix)
- Output ONLY the branch name, nothing else
- No quotes, no explanation, no punctuation at end`
}
