import { mkdir, readFile, appendFile } from "node:fs/promises";
import path from "node:path";

import type { Message } from "@mariozechner/pi-ai";

import { getSessionsDir } from "../workspace/paths.js";

export class JsonlSessionStore {
  constructor(private workspaceRoot: string) {}

  getSessionPath(conversationPathParts: string[]): string {
    const sessionsDir = getSessionsDir(this.workspaceRoot);
    return path.join(sessionsDir, ...conversationPathParts, "session.jsonl");
  }

  async load(conversationPathParts: string[], opts?: { maxLines?: number }): Promise<Message[]> {
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
    return out;
  }

  async append(conversationPathParts: string[], msg: unknown): Promise<void> {
    const p = this.getSessionPath(conversationPathParts);
    await mkdir(path.dirname(p), { recursive: true });
    await appendFile(p, JSON.stringify(msg) + "\n", "utf8");
  }

  async appendMany(conversationPathParts: string[], msgs: unknown[]): Promise<void> {
    if (msgs.length === 0) return;
    const p = this.getSessionPath(conversationPathParts);
    await mkdir(path.dirname(p), { recursive: true });
    const payload = msgs.map((m) => JSON.stringify(m)).join("\n") + "\n";
    await appendFile(p, payload, "utf8");
  }
}

