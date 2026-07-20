import nodeFs from 'node:fs';
import nodePath from 'node:path';
import nodeOs from 'node:os';
import { app } from 'electron';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  ts: string;
  level: LogLevel;
  scope: string;
  message: string;
  meta?: unknown;
}

let initialized = false;
let logFilePath = '';
let writeQueue: string[] = [];
let flushing = false;

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const minLevel: LogLevel = process.env.VITE_DEV_SERVER_URL ? 'debug' : 'info';

const ensureInit = () => {
  if (initialized) return;
  try {
    const base = app?.getPath?.('userData') || nodePath.join(nodeOs.tmpdir(), 'bucketview-logs');
    const dir = nodePath.join(base, 'logs');
    nodeFs.mkdirSync(dir, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    logFilePath = nodePath.join(dir, `bucketview-${day}.log`);
    initialized = true;
  } catch {
    logFilePath = '';
    initialized = true;
  }
};

const flush = () => {
  if (flushing || !logFilePath || writeQueue.length === 0) return;
  flushing = true;
  const chunk = writeQueue.join('');
  writeQueue = [];
  try {
    nodeFs.appendFile(logFilePath, chunk, () => {
      flushing = false;
      if (writeQueue.length > 0) flush();
    });
  } catch {
    flushing = false;
  }
};

export const getLogFilePath = () => {
  ensureInit();
  return logFilePath;
};

export const getLogDirectory = () => {
  ensureInit();
  return logFilePath ? nodePath.dirname(logFilePath) : '';
};

export const log = (level: LogLevel, scope: string, message: string, meta?: unknown) => {
  if (levelWeight[level] < levelWeight[minLevel]) return;
  ensureInit();
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    scope,
    message,
  };
  if (meta !== undefined) entry.meta = meta;
  const line = `${JSON.stringify(entry)}${nodeOs.EOL}`;
  if (logFilePath) {
    writeQueue.push(line);
    flush();
  }
  const prefix = `[${entry.ts}] [${level.toUpperCase()}] [${scope}] ${message}`;
  if (level === 'error') console.error(prefix, meta ?? '');
  else if (level === 'warn') console.warn(prefix, meta ?? '');
  else console.log(prefix, meta ?? '');
};

export const logger = {
  debug: (scope: string, message: string, meta?: unknown) => log('debug', scope, message, meta),
  info: (scope: string, message: string, meta?: unknown) => log('info', scope, message, meta),
  warn: (scope: string, message: string, meta?: unknown) => log('warn', scope, message, meta),
  error: (scope: string, message: string, meta?: unknown) => log('error', scope, message, meta),
  getLogFilePath,
  getLogDirectory,
};
