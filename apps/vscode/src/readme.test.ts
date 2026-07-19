import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("VS Code VSIX guide", () => {
  it("documents installation, credential checks, and the real judge path", () => {
    const readme = readFileSync(resolve(__dirname, "..", "README.md"), "utf8");

    expect(readme).toContain("Install from VSIX");
    expect(readme).toContain("Test connection");
    expect(readme).toContain("Test token");
    expect(readme).toContain("GitHub token");
    expect(readme).toContain("`repo`");
    expect(readme).toContain("Operations History");
    expect(readme).toContain("https://github.com/urstruelysv/repofox");
    expect(readme).not.toContain("can be reverted");
    expect(readme).not.toContain("repofox.dev");
  });
});
