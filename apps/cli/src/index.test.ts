import { describe, expect, it, vi } from "vitest";
import { main, runNodeCli } from "./index.js";
import type { CliOptions } from "./config.js";

describe("main", () => {
  it("parses argv and delegates to the CLI runner", async () => {
    const run = vi
      .fn<(options: CliOptions) => Promise<number>>()
      .mockResolvedValue(0);
    const io = {
      write: vi.fn(),
      error: vi.fn(),
      ask: vi.fn<() => Promise<string>>().mockResolvedValue(""),
    };

    const exitCode = await main(
      ["--action", "commit_push", "--yes"],
      {
        GROQ_API_KEY: "groq-key",
      },
      "/repofox/demo",
      io,
      run,
    );

    expect(exitCode).toBe(0);
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "commit_push",
        repoPath: "/repofox/demo",
        autoApprove: true,
      }),
      io,
    );
  });

  it("accepts the explicit run command used by editor adapters", async () => {
    const run = vi
      .fn<(options: CliOptions) => Promise<number>>()
      .mockResolvedValue(0);
    const io = {
      write: vi.fn(),
      error: vi.fn(),
      ask: vi.fn<() => Promise<string>>().mockResolvedValue(""),
    };

    const exitCode = await main(
      ["run", "--action", "commit", "--yes"],
      { GROQ_API_KEY: "groq-key" },
      "/repofox/demo",
      io,
      run,
    );

    expect(exitCode).toBe(0);
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ action: "commit", autoApprove: true }),
      io,
    );
  });

  it("reports parser errors without starting a workflow", async () => {
    const run = vi
      .fn<(options: CliOptions) => Promise<number>>()
      .mockResolvedValue(0);
    const io = {
      write: vi.fn(),
      error: vi.fn(),
      ask: vi.fn<() => Promise<string>>().mockResolvedValue(""),
    };

    const exitCode = await main(
      ["--action", "bad"],
      {
        GROQ_API_KEY: "groq-key",
      },
      "/repofox/demo",
      io,
      run,
    );

    expect(exitCode).toBe(1);
    expect(run).not.toHaveBeenCalled();
    expect(io.error).toHaveBeenCalledWith("Invalid action: bad");
  });

  it("closes the interactive readline interface after a workflow completes", async () => {
    const run = vi
      .fn<(options: CliOptions) => Promise<number>>()
      .mockResolvedValue(0);
    const readline = {
      question: vi.fn<() => Promise<string>>().mockResolvedValue(""),
      close: vi.fn(),
    };

    const exitCode = await runNodeCli(
      ["--action", "commit_push", "--yes"],
      { GROQ_API_KEY: "groq-key" },
      "/repofox/demo",
      readline,
      run,
    );

    expect(exitCode).toBe(0);
    expect(readline.close).toHaveBeenCalledOnce();
  });
});
