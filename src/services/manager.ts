import { closeSync, openSync } from "node:fs";
import { mkdir, open, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import type { GenieCeoConfig } from "../config/schema.js";
import { getLogsDir, getServicesDir } from "../workspace/paths.js";
import { defaultShellAllowedRoots, expandHome, isWithinRoot, normalizeFileAccessMode } from "../tools/path-access.js";

export type ServiceRuntimeContext = {
  workspaceRoot: string;
  invocationCwd: string;
  config: GenieCeoConfig;
};

export type ServiceRecord = {
  version: 1;
  name: string;
  command: string;
  cwd: string;
  pid: number;
  startedAtMs: number;
  logPath: string;
};

export function safeServiceName(input: unknown): string {
  const s = String(input ?? "").trim();
  if (!s) throw new Error("service name is required");
  if (!/^[a-zA-Z0-9._-]+$/.test(s)) {
    throw new Error("service name may only contain letters, numbers, dot, underscore, and hyphen");
  }
  return s;
}

export function isPidRunning(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function getServiceRecordPath(ctx: Pick<ServiceRuntimeContext, "workspaceRoot">, name: string): string {
  const dir = getServicesDir(ctx.workspaceRoot);
  return path.join(dir, `${name}.json`);
}

export async function readServiceRecord(recordPath: string): Promise<ServiceRecord | null> {
  const raw = await readFile(recordPath, "utf8").catch(() => "");
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.version !== 1) return null;
    if (typeof parsed.name !== "string") return null;
    if (typeof parsed.command !== "string") return null;
    if (typeof parsed.cwd !== "string") return null;
    if (typeof parsed.pid !== "number") return null;
    if (typeof parsed.startedAtMs !== "number") return null;
    if (typeof parsed.logPath !== "string") return null;
    return parsed as ServiceRecord;
  } catch {
    return null;
  }
}

export async function writeServiceRecord(recordPath: string, rec: ServiceRecord): Promise<void> {
  await mkdir(path.dirname(recordPath), { recursive: true });
  await writeFile(recordPath, JSON.stringify(rec, null, 2) + "\n", "utf8");
}

function ensureShellEnabled(config: GenieCeoConfig): void {
  const enabled = Boolean((config as any)?.execution?.shell?.enabled);
  if (!enabled) {
    throw new Error(
      "Shell execution is disabled. Set config.execution.shell.enabled=true in ~/.genieceo/config.json to enable starting/stopping services."
    );
  }
}

function getEffectiveAllowedRoots(ctx: ServiceRuntimeContext): string[] {
  const configuredRoots = Array.isArray((ctx.config as any)?.execution?.shell?.allowedRoots)
    ? ((ctx.config as any).execution.shell.allowedRoots as string[])
    : [];
  const shellAccessMode = normalizeFileAccessMode((ctx.config as any)?.execution?.shellAccessMode);

  return defaultShellAllowedRoots({
    workspaceRoot: ctx.workspaceRoot,
    invocationCwd: ctx.invocationCwd,
    mode: shellAccessMode,
    configuredRoots,
  });
}

function assertCwdAllowed(allowedRoots: string[], cwdAbs: string): void {
  if (!allowedRoots.some((r) => isWithinRoot(r, cwdAbs))) {
    throw new Error(`cwd '${cwdAbs}' is not allowed. Allowed roots:\n` + allowedRoots.map((r) => `- ${r}`).join("\n"));
  }
}

export function resolveServiceCwd(ctx: ServiceRuntimeContext, cwdInput: string | undefined): { cwd: string; allowedRoots: string[] } {
  ensureShellEnabled(ctx.config);
  const allowedRoots = getEffectiveAllowedRoots(ctx);

  // Default to invocation cwd.
  if (!cwdInput || !String(cwdInput).trim()) {
    const cwd = path.resolve(ctx.invocationCwd);
    assertCwdAllowed(allowedRoots, cwd);
    return { cwd, allowedRoots };
  }

  const raw = expandHome(String(cwdInput));
  const resolved = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(ctx.invocationCwd, raw);
  assertCwdAllowed(allowedRoots, resolved);
  return { cwd: resolved, allowedRoots };
}

function startDetachedProcess(opts: { command: string; cwd: string; logPath: string }): number {
  const command = String(opts.command ?? "").trim();
  if (!command) throw new Error("command is required");
  const cwd = path.resolve(String(opts.cwd ?? ""));
  if (!cwd) throw new Error("cwd is required");

  // Use file descriptors so the parent can close its handles while the child keeps writing.
  const outFd = openSync(opts.logPath, "a");
  const errFd = openSync(opts.logPath, "a");

  const child = spawn(command, {
    cwd,
    shell: true,
    env: process.env,
    detached: true,
    stdio: ["ignore", outFd, errFd],
  });

  // Close parent handles (child keeps them).
  try {
    closeSync(outFd);
  } catch {
    // ignore
  }
  try {
    closeSync(errFd);
  } catch {
    // ignore
  }

  child.unref();

  const pid = child.pid;
  if (!pid) throw new Error("failed to start process (no pid returned)");
  return pid;
}

export async function startService(ctx: ServiceRuntimeContext, opts: {
  name: string;
  command: string;
  cwd?: string;
  overwriteIfStopped?: boolean;
}): Promise<ServiceRecord> {
  const name = safeServiceName(opts.name);
  const command = String(opts.command ?? "").trim();
  if (!command) throw new Error("command is required");

  const recordPath = getServiceRecordPath(ctx, name);
  const existing = await readServiceRecord(recordPath);
  if (existing && isPidRunning(existing.pid)) {
    throw new Error(`service '${name}' is already running (pid ${existing.pid})`);
  }
  const overwriteIfStopped = opts.overwriteIfStopped == null ? true : Boolean(opts.overwriteIfStopped);
  if (existing && !overwriteIfStopped) {
    throw new Error(`service '${name}' has an existing record but is not running (set overwriteIfStopped=true to replace)`);
  }

  const { cwd } = resolveServiceCwd(ctx, opts.cwd);

  const logsDir = path.join(getLogsDir(ctx.workspaceRoot), "services");
  await mkdir(logsDir, { recursive: true });
  const logPath = path.join(logsDir, `${name}.log`);

  const pid = startDetachedProcess({ command, cwd, logPath });
  const rec: ServiceRecord = {
    version: 1,
    name,
    command,
    cwd,
    pid,
    startedAtMs: Date.now(),
    logPath,
  };
  await writeServiceRecord(recordPath, rec);
  return rec;
}

export async function ensureServiceRunning(ctx: ServiceRuntimeContext, nameInput: string): Promise<ServiceRecord> {
  const name = safeServiceName(nameInput);
  const recordPath = getServiceRecordPath(ctx, name);
  const rec = await readServiceRecord(recordPath);
  if (!rec) throw new Error(`service '${name}' not found (no record at ${recordPath})`);

  if (isPidRunning(rec.pid)) return rec;

  // Validate + restart using persisted command/cwd/logPath.
  ensureShellEnabled(ctx.config);
  const allowedRoots = getEffectiveAllowedRoots(ctx);
  const cwdAbs = path.resolve(expandHome(rec.cwd));
  assertCwdAllowed(allowedRoots, cwdAbs);

  await mkdir(path.dirname(rec.logPath), { recursive: true });
  const pid = startDetachedProcess({ command: rec.command, cwd: cwdAbs, logPath: rec.logPath });

  const updated: ServiceRecord = { ...rec, pid, startedAtMs: Date.now(), cwd: cwdAbs };
  await writeServiceRecord(recordPath, updated);
  return updated;
}

export async function listServices(ctx: Pick<ServiceRuntimeContext, "workspaceRoot">): Promise<Array<ServiceRecord & { running: boolean }>> {
  const dir = getServicesDir(ctx.workspaceRoot);
  await mkdir(dir, { recursive: true });
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);

  const out: Array<ServiceRecord & { running: boolean }> = [];
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (!ent.name.endsWith(".json")) continue;
    const p = path.join(dir, ent.name);
    const rec = await readServiceRecord(p);
    if (!rec) continue;
    out.push({ ...rec, running: isPidRunning(rec.pid) });
  }
  out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return out;
}

export async function getServiceStatus(ctx: Pick<ServiceRuntimeContext, "workspaceRoot">, nameInput: string): Promise<{
  recordPath: string;
  record: ServiceRecord;
  running: boolean;
  uptimeSec: number | null;
}> {
  const name = safeServiceName(nameInput);
  const recordPath = getServiceRecordPath(ctx, name);
  const rec = await readServiceRecord(recordPath);
  if (!rec) throw new Error(`service '${name}' not found (no record at ${recordPath})`);
  const running = isPidRunning(rec.pid);
  const uptimeSec = running ? Math.max(0, Math.floor((Date.now() - rec.startedAtMs) / 1000)) : null;
  return { recordPath, record: rec, running, uptimeSec };
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isPidRunning(pid)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return !isPidRunning(pid);
}

export async function stopService(ctx: ServiceRuntimeContext, nameInput: string, opts?: { timeoutMs?: number }): Promise<{ name: string; pid: number; running: boolean }> {
  const name = safeServiceName(nameInput);
  ensureShellEnabled(ctx.config);

  const { record } = await getServiceStatus(ctx, name);
  const pid = record.pid;
  const timeoutMs = typeof opts?.timeoutMs === "number" ? opts.timeoutMs : 5000;

  if (!isPidRunning(pid)) {
    return { name, pid, running: false };
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch (e: any) {
    const msg = e?.message ? String(e.message) : String(e);
    throw new Error(`failed to SIGTERM pid ${pid}: ${msg}`);
  }

  const exited = await waitForExit(pid, timeoutMs);
  if (!exited) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // ignore
    }
  }

  return { name, pid, running: isPidRunning(pid) };
}

export async function tailServiceLogs(ctx: Pick<ServiceRuntimeContext, "workspaceRoot">, nameInput: string, opts?: { lines?: number; maxBytes?: number }): Promise<string> {
  const name = safeServiceName(nameInput);
  const { record } = await getServiceStatus(ctx, name);

  const lines = typeof opts?.lines === "number" ? Math.max(1, Math.min(500, Math.floor(opts.lines))) : 80;
  const maxBytes = typeof opts?.maxBytes === "number" ? Math.max(1000, Math.min(200000, Math.floor(opts.maxBytes))) : 50_000;

  const p = path.resolve(String(record.logPath));
  const s = await stat(p).catch(() => null);
  if (!s || !s.isFile()) throw new Error(`log file not found: ${p}`);
  if (s.size <= 0) return "[empty]";

  const toRead = Math.min(s.size, maxBytes);
  const fh = await open(p, "r");
  try {
    const buf = Buffer.alloc(toRead);
    await fh.read(buf, 0, toRead, Math.max(0, s.size - toRead));
    const raw = buf.toString("utf8");
    const all = raw.split(/\r?\n/);
    const tail = all.slice(Math.max(0, all.length - lines)).join("\n").trimEnd();
    return tail || "[empty]";
  } finally {
    await fh.close().catch(() => {});
  }
}

export async function ensureServicesDir(workspaceRoot: string): Promise<void> {
  await mkdir(getServicesDir(workspaceRoot), { recursive: true });
}

