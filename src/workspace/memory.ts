import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getLongTermMemoryPath, getMemoryDir } from "./paths.js";

type TruncationResult = { text: string; truncated: boolean };

function isIsoDate(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

export function todayUtc(nowMs: number = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function shiftUtcDate(dateUtc: string, deltaDays: number): string {
  if (!isIsoDate(dateUtc)) throw new Error(`Invalid dateUtc '${dateUtc}' (expected YYYY-MM-DD)`);
  const dt = new Date(`${dateUtc}T00:00:00.000Z`);
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

export function getDailyMemoryPath(workspaceRoot: string, dateUtc: string): string {
  if (!isIsoDate(dateUtc)) throw new Error(`Invalid dateUtc '${dateUtc}' (expected YYYY-MM-DD)`);
  return path.join(getMemoryDir(workspaceRoot), `${dateUtc}.md`);
}

function truncateTail(text: string, maxChars: number): TruncationResult {
  const t = String(text ?? "");
  if (!Number.isFinite(maxChars) || maxChars <= 0) return { text: "", truncated: Boolean(t) };
  if (t.length <= maxChars) return { text: t, truncated: false };
  const head = `...[truncated ${t.length - maxChars} chars]...\n\n`;
  return { text: head + t.slice(Math.max(0, t.length - maxChars)), truncated: true };
}

export async function readLongTermMemory(workspaceRoot: string): Promise<string> {
  const p = getLongTermMemoryPath(workspaceRoot);
  return await readFile(p, "utf8").catch(() => "");
}

export async function readDailyMemory(workspaceRoot: string, dateUtc: string): Promise<string> {
  const p = getDailyMemoryPath(workspaceRoot, dateUtc);
  return await readFile(p, "utf8").catch(() => "");
}

export async function appendDailyMemory(opts: { workspaceRoot: string; dateUtc?: string; content: string; nowMs?: number }): Promise<string> {
  const nowMs = typeof opts.nowMs === "number" ? opts.nowMs : Date.now();
  const dateUtc = String(opts.dateUtc ?? "").trim() || todayUtc(nowMs);
  const content = String(opts.content ?? "").trim();
  if (!content) return "Error: content is empty";

  const dir = getMemoryDir(opts.workspaceRoot);
  await mkdir(dir, { recursive: true });

  const p = getDailyMemoryPath(opts.workspaceRoot, dateUtc);
  const before = await readFile(p, "utf8").catch(() => "");
  const header = before.trim() ? "" : `# ${dateUtc}\n\n`;
  const next = `${before}${before && !before.endsWith("\n") ? "\n" : ""}${header}${content}\n`;
  await writeFile(p, next, "utf8");
  return `Appended daily memory: memory/${dateUtc}.md`;
}

export async function appendLongTermMemory(opts: { workspaceRoot: string; content: string; nowMs?: number }): Promise<string> {
  const nowMs = typeof opts.nowMs === "number" ? opts.nowMs : Date.now();
  const dateUtc = todayUtc(nowMs);
  const content = String(opts.content ?? "").trim();
  if (!content) return "Error: content is empty";

  const p = getLongTermMemoryPath(opts.workspaceRoot);
  const before = await readFile(p, "utf8").catch(() => "");
  const sep = before.trim() ? "\n\n" : "";
  const stamped = `## ${dateUtc}\n\n${content}\n`;
  await writeFile(p, `${before}${sep}${stamped}`, "utf8");
  return "Appended long-term memory: MEMORY.md";
}

export async function buildMemoryPromptBlock(opts: {
  workspaceRoot: string;
  nowMs?: number;
  includeYesterday?: boolean;
  maxLongTermChars?: number;
  maxDailyChars?: number;
}): Promise<string> {
  const nowMs = typeof opts.nowMs === "number" ? opts.nowMs : Date.now();
  const includeYesterday = opts.includeYesterday !== false;
  const maxLongTermChars = typeof opts.maxLongTermChars === "number" ? opts.maxLongTermChars : 12_000;
  const maxDailyChars = typeof opts.maxDailyChars === "number" ? opts.maxDailyChars : 8_000;

  const today = todayUtc(nowMs);
  const yesterday = shiftUtcDate(today, -1);

  const longRaw = await readLongTermMemory(opts.workspaceRoot);
  const todayRaw = await readDailyMemory(opts.workspaceRoot, today);
  const yRaw = includeYesterday ? await readDailyMemory(opts.workspaceRoot, yesterday) : "";

  const long = truncateTail(longRaw.trim(), maxLongTermChars);
  const t = truncateTail(todayRaw.trim(), maxDailyChars);
  const y = truncateTail(yRaw.trim(), maxDailyChars);

  const sections: string[] = [];
  if (long.text.trim()) sections.push(`### Long-term (MEMORY.md)\n\n${long.text.trim()}`);
  if (includeYesterday && y.text.trim()) sections.push(`### Yesterday (${yesterday})\n\n${y.text.trim()}`);
  if (t.text.trim()) sections.push(`### Today (${today})\n\n${t.text.trim()}`);

  if (sections.length === 0) return "";

  return `## MEMORY\n\n${sections.join("\n\n")}`;
}

