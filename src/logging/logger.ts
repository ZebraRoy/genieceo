import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { getLogsDir } from "../workspace/paths.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function envLogLevel(): LogLevel {
  const raw = String(process.env.GENIECEO_LOG_LEVEL ?? "").trim().toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  const dbg = String(process.env.GENIECEO_DEBUG ?? "").trim().toLowerCase();
  if (dbg === "1" || dbg === "true" || dbg === "yes" || dbg === "on") return "debug";
  return "info";
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify(String(value));
  }
}

function serializeError(err: unknown): { name?: string; message: string; stack?: string } {
  if (err && typeof err === "object") {
    const e: any = err as any;
    const name = typeof e.name === "string" ? e.name : undefined;
    const message = typeof e.message === "string" ? e.message : safeJson(e);
    const stack = typeof e.stack === "string" ? e.stack : undefined;
    return { name, message, stack };
  }
  return { message: String(err) };
}

export type Logger = {
  level: LogLevel;
  scope: string;
  debug: (msg: string, fields?: Record<string, unknown>) => void;
  info: (msg: string, fields?: Record<string, unknown>) => void;
  warn: (msg: string, fields?: Record<string, unknown>) => void;
  error: (msg: string, fields?: Record<string, unknown>) => void;
  errorWith: (msg: string, err: unknown, fields?: Record<string, unknown>) => void;
  child: (scope: string) => Logger;
};

export function createLogger(opts: {
  workspaceRoot: string;
  scope?: string;
  level?: LogLevel;
  logFile?: string;
  logToConsole?: boolean;
}): Logger {
  const scope = String(opts.scope ?? "app").trim() || "app";
  const level = opts.level ?? envLogLevel();
  const logToConsole = opts.logToConsole ?? true;
  const logFile =
    opts.logFile ??
    path.join(getLogsDir(opts.workspaceRoot), `${scope.replace(/[^\w.-]+/g, "_")}.log`);

  // Best-effort: ensure log dir exists.
  void mkdir(path.dirname(logFile), { recursive: true }).catch(() => {});

  function emit(lvl: LogLevel, msg: string, fields?: Record<string, unknown>): void {
    if (LEVEL_ORDER[lvl] < LEVEL_ORDER[level]) return;

    const lineObj = {
      ts: new Date().toISOString(),
      level: lvl,
      scope,
      msg,
      ...(fields ?? {}),
    };
    const line = safeJson(lineObj) + "\n";

    // File logging (best-effort, non-blocking).
    void appendFile(logFile, line, "utf8").catch(() => {});

    if (!logToConsole) return;
    const pretty = `[${lineObj.ts}] [${lvl}] [${scope}] ${msg}`;
    if (lvl === "error") console.error(pretty);
    else if (lvl === "warn") console.warn(pretty);
    else console.log(pretty);
  }

  const logger: Logger = {
    scope,
    level,
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
    errorWith: (msg, err, fields) => emit("error", msg, { error: serializeError(err), ...(fields ?? {}) }),
    child: (childScope) =>
      createLogger({
        workspaceRoot: opts.workspaceRoot,
        scope: `${scope}.${String(childScope ?? "").trim() || "child"}`,
        level,
        logFile,
        logToConsole,
      }),
  };

  return logger;
}

