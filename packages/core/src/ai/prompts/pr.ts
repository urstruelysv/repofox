import type { AIContext } from '../../types/index.js'

export function buildPRDescriptionPrompt(context: AIContext, commits: string[]): string {
  const prExamples = context.recentPRTitles.slice(0, 3).join('\n')

  return `You are a senior engineer writing a pull request description.

Recent PR titles in this repo (match this style):
${prExamples || 'feat: add user authentication\nfix: resolve login redirect issue'}

Commits in this PR:
${commits.join('\n')}

Staged diff summary (first 4000 chars):
${context.diff.slice(0, 4000)}

Write a pull request title and description.
Output ONLY valid JSON in this exact format, nothing else:
{
  "title": "short PR title following repo conventions",
  "body": "## What\\nBrief description of changes\\n\\n## Why\\nReason for the change\\n\\n## Testing\\nHow to verify this works",
  "labels": ["label1", "label2"],
  "suggestedReviewers": []
}`
}
