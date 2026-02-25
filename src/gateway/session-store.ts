import { mkdir, readFile, appendFile, rm } from "node:fs/promises";
import path from "node:path";

import type { Message } from "@mariozechner/pi-ai";

import { getSessionsDir } from "../workspace/paths.js";
import type { HookRuntime } from "../hooks/runtime.js";

export class JsonlSessionStore {
  constructor(private workspaceRoot: string, private hooks?: HookRuntime) {}

  getSessionPath(conversationPathParts: string[]): string {
    const sessionsDir = getSessionsDir(this.workspaceRoot);
    return path.join(sessionsDir, ...conversationPathParts, "session.jsonl");
  }

  async load(
    conversationPathParts: string[],
    opts?: { maxLines?: number; conversationKey?: string; channel?: string; runId?: string },
  ): Promise<Message[]> {
    const p = this.getSessionPath(conversationPathParts);
    const raw = await readFile(p, "utf8").catch(() => "");
    if (!raw.trim()) return [];

    const lines = raw.split("\n").filter((l) => l.trim());
    const maxLines = typeof opts?.maxLines === "number" ? opts.maxLines : undefined;
    const slice = maxLines && lines.length > maxLines ? lines.slice(lines.length - maxLines) : lines;

    const out: Message[] = [];
    for (const line of slice) {
      try {
        out.push(JSON.parse(line));
      } catch {
        // Skip corrupted lines; keep going.
      }
    }
    if (this.hooks?.enabled) {
      await this.hooks.emit({
        name: "session.load",
        timestampMs: Date.now(),
        workspaceRoot: this.workspaceRoot,
        scope: "gateway",
        runId: opts?.runId,
        channel: opts?.channel,
        conversationKey: opts?.conversationKey,
        data: {
          path: p,
          lineCount: out.length,
        },
      });
    }
    return out;
  }

  async append(
    conversationPathParts: string[],
    msg: unknown,
    meta?: { conversationKey?: string; channel?: string; runId?: string },
  ): Promise<void> {
    const p = this.getSessionPath(conversationPathParts);
    await mkdir(path.dirname(p), { recursive: true });
    await appendFile(p, JSON.stringify(msg) + "\n", "utf8");
    if (this.hooks?.enabled) {
      await this.hooks.emit({
        name: "session.append",
        timestampMs: Date.now(),
        workspaceRoot: this.workspaceRoot,
        scope: "gateway",
        runId: meta?.runId,
        channel: meta?.channel,
        conversationKey: meta?.conversationKey,
        data: { path: p },
      });
    }
  }

  async appendMany(
    conversationPathParts: string[],
    msgs: unknown[],
    meta?: { conversationKey?: string; channel?: string; runId?: string },
  ): Promise<void> {
    if (msgs.length === 0) return;
    const p = this.getSessionPath(conversationPathParts);
    await mkdir(path.dirname(p), { recursive: true });
    const payload = msgs.map((m) => JSON.stringify(m)).join("\n") + "\n";
    await appendFile(p, payload, "utf8");
    if (this.hooks?.enabled) {
      await this.hooks.emit({
        name: "session.append_many",
        timestampMs: Date.now(),
        workspaceRoot: this.workspaceRoot,
        scope: "gateway",
        runId: meta?.runId,
        channel: meta?.channel,
        conversationKey: meta?.conversationKey,
        data: { path: p, count: msgs.length },
      });
    }
  }

  /**
   * Clears the conversation history by deleting the session JSONL file.
   * Safe to call even if it doesn't exist.
   */
  async clear(
    conversationPathParts: string[],
    meta?: { conversationKey?: string; channel?: string; runId?: string },
  ): Promise<void> {
    const p = this.getSessionPath(conversationPathParts);
    await rm(p, { force: true }).catch(() => {});
    if (this.hooks?.enabled) {
      await this.hooks.emit({
        name: "session.clear",
        timestampMs: Date.now(),
        workspaceRoot: this.workspaceRoot,
        scope: "gateway",
        runId: meta?.runId,
        channel: meta?.channel,
        conversationKey: meta?.conversationKey,
        data: { path: p },
      });
    }
  }
}

