# RepoFox

> An approval-first Git workflow with one portable core: run it from the CLI or through VS Code and Cursor.

RepoFox turns a proposed change into a reviewable Git handoff. It generates and requires approval for Git actions, runs the selected branch-to-PR action through one TypeScript workflow engine, and records a local, repository-scoped workflow ledger. The ledger survives editor restarts and is shared by every RepoFox surface for that repository.

## Supported surfaces

- **CLI** — the baseline, editor-independent interface.
- **VS Code** — packaged sidebar extension with settings stored in VS Code SecretStorage.
- **Cursor** — packaged sidebar extension backed by the same core and ledger.

The workflow ledger is stored in Git metadata under `repofox/` and works in both ordinary clones and linked Git worktrees. It is local to the repository; no RepoFox server receives your credentials or history.

## Quick judge path

Requirements: Node 18+, pnpm 9+, Git, and a local Git repository.

```bash
git clone https://github.com/urstruelysv/repofox.git
cd repofox
pnpm install --frozen-lockfile
pnpm build:cli
node apps/cli/dist/index.js status --json
```

The final command prints `null` when no active workflow exists. It is a safe way to confirm that the portable ledger can be read without any provider or GitHub credential.

To run a workflow from the CLI, configure one provider key in your environment and choose an action. The CLI asks for approval by default; `--yes` is intended only for disposable test repositories.

```bash
export GROQ_API_KEY="..."
node apps/cli/dist/index.js run --action commit_push --provider groq
node apps/cli/dist/index.js history --json
```

`OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are also supported. Set `GITHUB_TOKEN` only for `create_pr` or `commit_push_pr`; local workflow actions do not require it.

## Editor installation

### VS Code and Cursor

Package the matching extension from the repository, then install the generated VSIX through **Extensions → … → Install from VSIX…**.

For the no-build judge path, download the matching prebuilt VSIX from the
[latest Build Week release](https://github.com/urstruelysv/repofox/releases/latest),
then use the same **Install from VSIX…** command.

```bash
pnpm --dir apps/vscode package
pnpm --dir apps/cursor package
```

For local development, open `apps/vscode` or `apps/cursor` in the matching editor and launch its Extension Development Host. In the RepoFox sidebar, add a provider key in Settings, test the connection, and save. Add a GitHub token only before creating a pull request.

## Inspect, restore, and test

```bash
node apps/cli/dist/index.js history --json
node apps/cli/dist/index.js restore <operation-id> --yes
```

The history command shows completed and failed receipts. Restore requires an explicit operation ID and `--yes`; test it only in a disposable repository.

## OpenAI Build Week

RepoFox is submitted to the **Developer Tools** track. This is a clean Build Week submission snapshot: it contains the working product and no prior repository history, local-agent artifacts, or secrets.

RepoFox had a pre-Build-Week baseline. The contribution being evaluated is the portable workflow ledger, its CLI status/history/restore path, and the shared VS Code/Cursor adapters. Those additions were developed with Codex and GPT-5.6 and are covered by tests. [BUILT_WITH_CODEX.md](./BUILT_WITH_CODEX.md) separates the baseline from the Build Week work and gives the exact judge path.

The project does not commit API keys, GitHub tokens, or a Codex feedback-session ID. Those are supplied only in the private Devpost submission fields.

Thank you codex 5.6 

## Contributing and license

Run `pnpm verify` before proposing a change. RepoFox is licensed under [AGPLv3](./LICENSE).
