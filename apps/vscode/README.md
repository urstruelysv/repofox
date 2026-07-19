# RepoFox for VS Code

> Approval-first Git workflow with a repository-scoped ledger.

RepoFox proposes a Git workflow, waits for your approval, performs the selected
work, and records a local receipt. The same ledger is available from the CLI,
VS Code, and Cursor for the same repository.

## Install from VSIX

From a clone of the source repository:

```bash
pnpm install --frozen-lockfile
pnpm --dir apps/vscode package
```

In VS Code, open **Extensions**, select **… → Install from VSIX…**, then choose
`apps/vscode/repofox-0.0.1.vsix`. Reload when VS Code asks.

## First-run setup

1. Open a disposable Git repository in VS Code and select the RepoFox icon in
   the Activity Bar.
2. Open **Settings** in the RepoFox view, choose Groq, OpenAI, or Anthropic,
   paste one provider key, select **Test connection**, and then **Save settings**.
3. Add a **GitHub token** only when testing pull-request creation. It needs the
   classic `repo` scope. Select **Test token** before saving it.

Provider keys and GitHub tokens are stored in VS Code SecretStorage. They are
not written to the repository or RepoFox ledger.

## Judge test path

1. Make an uncommitted change in the disposable repository.
2. Select **Branch -> PR**. Review the proposed workflow and approve it.
3. Without a GitHub token, RepoFox can still branch, commit, and push. With a
   tested token and a GitHub remote, it can continue to pull-request creation.
4. Open **Operations History** after completion to inspect the receipt. Close
   and reopen VS Code; the repository-scoped history remains available.

Use **RepoFox: Run Diagnostics** or the **RepoFox Output** panel if a Git or
provider action fails. The receipt records the completed or failed operation;
restore remains an explicit CLI command for a disposable repository.

## Requirements

- VS Code 1.85+
- Git 2.30+
- Node 18+ and pnpm 9+ only when packaging from source
- A Groq, OpenAI, or Anthropic API key (BYOK)

## Privacy and source

RepoFox keeps its workflow ledger in local Git metadata. Your selected provider
receives only the data needed to generate the requested Git text; RepoFox does
not operate a service that receives your credentials or history.

Source, CLI instructions, and issue reporting:
<https://github.com/urstruelysv/repofox>

## License

[AGPL-3.0-only](../../LICENSE)
