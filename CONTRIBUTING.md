# Contributing to RepoFox

Thanks for helping build RepoFox.

This project is still early, so the best contributions are the ones that improve reliability, clarity, and trust in the core workflow.

Before participating, please read the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Before You Start

Make sure you have:

- Node.js 18+
- pnpm 9+
- Git
- VS Code

Install dependencies:

```bash
pnpm install
```

## Development Workflow

### Core checks

Run from the repo root:

```bash
pnpm verify
```

### Build the extension

```bash
pnpm build:vscode
```

### Build the landing page

```bash
pnpm build:web
```

## Where to Contribute

Good areas:

- workflow reliability in `packages/core`
- snapshot and revert safety
- VS Code extension UX
- documentation
- testing

Please avoid large speculative features without discussion first, especially around:

- Git host expansion
- new adapters
- public SDK commitments
- config file shape

## Coding Expectations

- keep stateful git behavior in `packages/core`
- keep adapter-specific code in `apps/*`
- prefer small, reviewable PRs
- do not break root `build`, `typecheck`, `lint`, or `test`
- preserve local-first behavior and safety guarantees

## Pull Requests

Before opening a PR:

1. run `pnpm verify`
2. describe what changed
3. note any manual testing you performed
4. include screenshots if the change affects UI
5. mention risks or follow-ups honestly

Use the bug and feature templates in GitHub when possible so reports come with enough context to reproduce.

## Manual Testing

If you touch workflow behavior, please test:

- approvals in order
- branch creation
- commit generation
- push behavior
- revert behavior

Use `pnpm verify` before opening a pull request; it runs the repository's formatting, build, typecheck, lint, and test gates.

## Communication

If a change could alter workflow safety, snapshot behavior, or persisted state, open the discussion before widening scope.

If you believe you found a security issue, do not open a public issue. Follow the private reporting instructions in [SECURITY.md](./SECURITY.md).
