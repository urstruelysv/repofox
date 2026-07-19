import type { AIContext } from '../../types/index.js'

export function buildCommitMessagePrompt(context: AIContext): string {
  const examples = context.recentCommits.slice(0, 6).join('\n')

  return `You are a senior engineer writing a git commit message.

Recent commits in this repository (match this style exactly):
${examples || 'feat(auth): add JWT middleware\nfix(api): handle null response edge case'}

Staged diff:
\`\`\`
${context.diff || 'No diff available'}
\`\`\`

Write a single conventional commit message.
Rules:
- Format: type(scope): description
- Types: feat, fix, refactor, docs, test, chore, style, perf
- Scope: the module or area affected (from file paths above)
- Description: imperative mood, lowercase, no period, max 72 chars
- Output ONLY the commit message, nothing else
- No explanation, no alternatives, no markdown`
}
