import type { AIConfig, AIProvider, GitStackedAction } from "@repofox/core";

const ACTIONS = new Set<GitStackedAction>([
  "commit",
  "push",
  "create_pr",
  "commit_push",
  "commit_push_pr",
]);

const PROVIDERS = new Set<AIProvider>(["groq", "openai", "anthropic"]);

export interface CliOptions {
  action: GitStackedAction;
  repoPath: string;
  ai: AIConfig;
  githubToken?: string;
  autoApprove: boolean;
  json: boolean;
}

export type CliCommand =
  | { kind: "run"; options: CliOptions }
  | { kind: "status"; repoPath: string; json: boolean }
  | { kind: "history"; repoPath: string; json: boolean }
  | {
      kind: "restore";
      repoPath: string;
      operationId: string;
      yes: boolean;
      json: boolean;
    };

interface RawFlags {
  action?: string;
  provider?: string;
  repoPath?: string;
  apiKey?: string;
  githubToken?: string;
  autoApprove: boolean;
  json: boolean;
}

export function parseCliArgs(
  argv: string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
): CliOptions {
  const flags = parseRawFlags(argv);
  const action = parseAction(flags.action ?? "commit_push_pr");
  const provider = parseProvider(
    flags.provider ?? env["AI_PROVIDER"] ?? "groq",
  );
  const apiKey = flags.apiKey ?? getProviderKey(provider, env);
  const githubToken =
    flags.githubToken ?? env["GITHUB_TOKEN"] ?? env["GH_TOKEN"];

  const options: CliOptions = {
    action,
    repoPath: flags.repoPath ?? cwd,
    ai: {
      provider,
      apiKey,
    },
    autoApprove: flags.autoApprove,
    json: flags.json,
  };

  if (githubToken && githubToken.trim().length > 0) {
    options.githubToken = githubToken;
  }

  return options;
}

export function parseCliCommand(
  argv: string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
): CliCommand {
  const command = argv[0];
  if (command === "run") {
    return { kind: "run", options: parseCliArgs(argv.slice(1), env, cwd) };
  }
  if (command === "status" || command === "history") {
    const flags = parseLedgerFlags(argv.slice(1), cwd);
    return { kind: command, repoPath: flags.repoPath, json: flags.json };
  }
  if (command === "restore") {
    const operationId = argv[1];
    if (!operationId || operationId.startsWith("-")) {
      throw new Error("Restore requires an operation id.");
    }
    const flags = parseLedgerFlags(argv.slice(2), cwd);
    return {
      kind: "restore",
      repoPath: flags.repoPath,
      operationId,
      yes: flags.yes,
      json: flags.json,
    };
  }
  return { kind: "run", options: parseCliArgs(argv, env, cwd) };
}

function parseRawFlags(argv: string[]): RawFlags {
  const flags: RawFlags = {
    autoApprove: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    switch (arg) {
      case "--action":
      case "-a":
        flags.action = readValue(argv, index, arg);
        index += 1;
        break;
      case "--provider":
      case "-p":
        flags.provider = readValue(argv, index, arg);
        index += 1;
        break;
      case "--repo":
      case "--cwd":
      case "-C":
        flags.repoPath = readValue(argv, index, arg);
        index += 1;
        break;
      case "--api-key":
        flags.apiKey = readValue(argv, index, arg);
        index += 1;
        break;
      case "--github-token":
        flags.githubToken = readValue(argv, index, arg);
        index += 1;
        break;
      case "--yes":
      case "-y":
        flags.autoApprove = true;
        break;
      case "--json":
        flags.json = true;
        break;
      default:
        if (arg?.startsWith("--action=")) {
          flags.action = arg.slice("--action=".length);
          break;
        }
        if (arg?.startsWith("--provider=")) {
          flags.provider = arg.slice("--provider=".length);
          break;
        }
        if (arg?.startsWith("--repo=")) {
          flags.repoPath = arg.slice("--repo=".length);
          break;
        }
        if (arg?.startsWith("--api-key=")) {
          flags.apiKey = arg.slice("--api-key=".length);
          break;
        }
        if (arg?.startsWith("--github-token=")) {
          flags.githubToken = arg.slice("--github-token=".length);
          break;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return flags;
}

function parseLedgerFlags(
  argv: string[],
  cwd: string,
): { repoPath: string; json: boolean; yes: boolean } {
  let repoPath = cwd;
  let json = false;
  let yes = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--repo" || arg === "--cwd" || arg === "-C") {
      repoPath = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--repo=")) {
      repoPath = arg.slice("--repo=".length);
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--yes" || arg === "-y") {
      yes = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { repoPath, json, yes };
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parseAction(value: string): GitStackedAction {
  if (!ACTIONS.has(value as GitStackedAction)) {
    throw new Error(`Invalid action: ${value}`);
  }
  return value as GitStackedAction;
}

function parseProvider(value: string): AIProvider {
  if (!PROVIDERS.has(value as AIProvider)) {
    throw new Error(`Invalid AI provider: ${value}`);
  }
  return value as AIProvider;
}

function getProviderKey(provider: AIProvider, env: NodeJS.ProcessEnv): string {
  if (provider === "openai") return env["OPENAI_API_KEY"] ?? "";
  if (provider === "anthropic") return env["ANTHROPIC_API_KEY"] ?? "";
  return env["GROQ_API_KEY"] ?? "";
}
