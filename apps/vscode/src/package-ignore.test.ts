import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("VSIX package exclusions", () => {
  it("does not ship local Turbo logs or Finder metadata", () => {
    const ignoreFile = readFileSync(
      resolve(__dirname, "..", ".vscodeignore"),
      "utf8",
    );

    expect(ignoreFile).toContain(".turbo/**");
    expect(ignoreFile).toContain(".DS_Store");
  });

  it("builds the shared UI before VSIX prepublish", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(__dirname, "..", "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(manifest.scripts["vscode:prepublish"]).toContain(
      "pnpm --dir ../../packages/ui build",
    );
  });
});
