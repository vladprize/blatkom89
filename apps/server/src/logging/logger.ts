/** Structured JSON logger (one line per record). Never log tokens, initData or passwords. */
type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

const REDACT = /token|password|secret|initdata|authorization|cookie/i;

function sanitize(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (REDACT.test(k)) out[k] = '[redacted]';
    else if (v instanceof Error) out[k] = { name: v.name, message: v.message, stack: v.stack?.split('\n').slice(0, 6).join('\n') };
    else out[k] = v;
  }
  return out;
}

export function createLogger(level: Level = 'info', base: Record<string, unknown> = {}, sink: (line: string) => void = (l) => process.stdout.write(l + '\n')): Logger {
  const min = ORDER[level];
  const write = (lvl: Level, msg: string, fields?: Record<string, unknown>) => {
    if (ORDER[lvl] < min) return;
    sink(JSON.stringify({ t: new Date().toISOString(), level: lvl, msg, ...base, ...(fields ? sanitize(fields) : {}) }));
  };
  return {
    debug: (m, f) => write('debug', m, f),
    info: (m, f) => write('info', m, f),
    warn: (m, f) => write('warn', m, f),
    error: (m, f) => write('error', m, f),
    child: (fields) => createLogger(level, { ...base, ...fields }, sink),
  };
}

export const silentLogger: Logger = createLogger('error', {}, () => {});
