#!/usr/bin/env node
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseCliCommand, type CliOptions } from './config.js'
import { executeCliCommand, runCli, type CliIO } from './runner.js'

type RunCliFn = (options: CliOptions, io: CliIO) => Promise<number>

export async function main(
  argv: string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
  io: CliIO,
  run: RunCliFn = runCli,
): Promise<number> {
  try {
    const command = parseCliCommand(argv, env, cwd)
    if (command.kind === 'run') {
      return await run(command.options, io)
    }
    return await executeCliCommand(command, io)
  } catch (error) {
    io.error(error instanceof Error ? error.message : String(error))
    return 1
  }
}

function createNodeIO(rl: Pick<ReturnType<typeof createInterface>, 'question'>): CliIO {
  return {
    write: (message) => {
      output.write(`${message}\n`)
    },
    error: (message) => {
      process.stderr.write(`${message}\n`)
    },
    ask: async (question) => {
      const answer = await rl.question(`${question}: `)
      return answer
    },
  }
}

export async function runNodeCli(
  argv: string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
  rl: Pick<ReturnType<typeof createInterface>, 'question' | 'close'>,
  run: RunCliFn = runCli,
): Promise<number> {
  try {
    return await main(argv, env, cwd, createNodeIO(rl), run)
  } finally {
    rl.close()
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const rl = createInterface({ input, output })
  process.exitCode = await runNodeCli(process.argv.slice(2), process.env, process.cwd(), rl)
}
