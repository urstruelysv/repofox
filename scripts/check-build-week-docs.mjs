import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { strict as assert } from "node:assert";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");

const readme = read("README.md");
const packageJson = JSON.parse(read("package.json"));
for (const requirement of [
  "Supported surfaces",
  "VS Code",
  "Cursor",
  "status --json",
  "history --json",
  "GPT-5.6",
]) {
  assert.ok(readme.includes(requirement), `README is missing ${requirement}`);
}

assert.ok(
  !readme.includes("Neovim"),
  "README must not claim unverified Neovim support",
);
assert.equal(
  packageJson.scripts["build:cli"],
  "pnpm --dir packages/core build && pnpm --dir apps/cli build",
  "build:cli must build the CLI's workspace dependency first",
);
assert.ok(
  readme.includes("releases/latest"),
  "README must link judges to the prebuilt latest VSIX assets",
);

const evidence = read("BUILT_WITH_CODEX.md");
assert.match(evidence, /pnpm verify/);
assert.match(evidence, /not invented.*committed/);
assert.match(evidence, /linked Git worktrees/);
assert.match(evidence, /Clean Build Week submission snapshot/);
assert.match(evidence, /Pre-Build-Week baseline/);
assert.match(evidence, /Codex and GPT-5\.6/);

assert.ok(
  !existsSync(resolve(root, "repo_truth_report.md")),
  "stale internal report must not ship in the judge repository",
);
assert.ok(
  !existsSync(resolve(root, ".antigravitycli")),
  "unrelated local-agent artifacts must not ship in the judge repository",
);

console.log("Submission documentation checks passed.");
