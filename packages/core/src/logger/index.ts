export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface Logger {
  debug: (msg: string, data?: unknown) => void
  info: (msg: string, data?: unknown) => void
  warn: (msg: string, data?: unknown) => void
  error: (msg: string, data?: unknown) => void
}

function safeSerialize(data: unknown): string {
  try {
    return JSON.stringify(data)
  } catch {
    return '"[unserializable]"'
  }
}

export function createStderrLogger(prefix = 'repofox'): Logger {
  const format = (level: LogLevel, msg: string, data?: unknown): string => {
    const ts = new Date().toISOString()
    const base = `[${ts}] [${prefix}] [${level.toUpperCase()}] ${msg}`
    return data !== undefined ? `${base} ${safeSerialize(data)}` : base
  }

  return {
    debug: (msg, data) => {
      if (process.env['NODE_ENV'] === 'development') {
        process.stderr.write(format('debug', msg, data) + '\n')
      }
    },
    info: (msg, data) => process.stderr.write(format('info', msg, data) + '\n'),
    warn: (msg, data) => process.stderr.write(format('warn', msg, data) + '\n'),
    error: (msg, data) => process.stderr.write(format('error', msg, data) + '\n'),
  }
}

export const noopLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
}
