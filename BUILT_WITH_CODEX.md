# Built with Codex and GPT-5.6

## Clean Build Week submission snapshot

This repository is a clean Build Week submission snapshot. It intentionally starts with one publication commit and excludes prior repository history, local-agent artifacts, credentials, and private submission data.

RepoFox had a **Pre-Build-Week baseline**: an approval-oriented Git product and initial editor experience. Under the OpenAI Build Week rules, that baseline is not the work being put forward for evaluation.

The Build Week extension below was developed with **Codex and GPT-5.6**. The real `/feedback` Codex session ID is provided in the private Devpost submission field; it is not fabricated or committed to source control.

## Build Week contributions

- Added a repository-scoped, atomic workflow ledger in `packages/core/src/session/`.
- Wired ledger receipts into the shared workflow events and exposed them through `repofox status`, `repofox history`, and guarded `repofox restore` CLI commands.
- Moved VS Code and Cursor history to the shared ledger so the supported editor surfaces use the same workflow record as the CLI.
- Added regression tests for explicit CLI `run` commands and linked Git worktrees, where `.git` is a `gitdir:` pointer rather than a directory.
- Rebuilt and checked the core, CLI, extensions, and web app through the repository verification command.

## Judge boundary

Evaluate the items above as the Build Week work. The baseline is disclosed here so the project does not overclaim earlier product work. The new path is independently inspectable from this snapshot: it can be installed, built, run in a disposable Git repository, and verified with the commands below.

## How to evaluate it

```bash
pnpm install --frozen-lockfile
pnpm build:cli
node apps/cli/dist/index.js status --json
```

For the complete repository verification suite, run `pnpm verify`.

For a fuller disposable-repository check, run a workflow with a real supported provider key, inspect `history --json`, and only then test `restore <operation-id> --yes`.

## Submission-only data

The Devpost submission receives the real `/feedback` Codex session ID, public demo URL, and any private judge access details. Those values are not invented or committed to this repository.
