import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import type { Tool } from "@mariozechner/pi-ai";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";

import type { ToolExecutionContext } from "../types.js";
import {
  appendDailyMemory,
  appendLongTermMemory,
  readDailyMemory,
  readLongTermMemory,
  todayUtc,
} from "../../workspace/memory.js";
import { getLongTermMemoryPath, getMemoryDir } from "../../workspace/paths.js";

function clampTail(text: string, maxChars: number): string {
  const t = String(text ?? "");
  if (!Number.isFinite(maxChars) || maxChars <= 0) return "";
  if (t.length <= maxChars) return t;
  return `...[truncated ${t.length - maxChars} chars]...\n\n${t.slice(Math.max(0, t.length - maxChars))}`;
}

export function registerMemoryTools(
  registry: { register: (tool: Tool, handler: (args: any) => Promise<string>) => void },
  ctx: ToolExecutionContext
) {
  registry.register(
    {
      name: "memory_append",
      description:
        "Append a note to persistent memory. Use layer='long_term' for durable facts/preferences/decisions; layer='daily' for day-to-day context.",
      parameters: Type.Object({
        layer: StringEnum(["daily", "long_term"], { description: "Memory layer to write." }),
        content: Type.String({ minLength: 1, description: "Markdown text to append." }),
        dateUtc: Type.Optional(
          Type.String({
            description:
              "For layer='daily' only: which UTC day to write (YYYY-MM-DD). Defaults to today (UTC).",
          })
        ),
      }),
    },
    async (args) => {
      const layer = String(args.layer ?? "").trim();
      const content = String(args.content ?? "").trim();
      const dateUtc = String(args.dateUtc ?? "").trim() || undefined;
      if (!content) return "Error: content is empty";

      if (layer === "daily") {
        return await appendDailyMemory({ workspaceRoot: ctx.workspaceRoot, dateUtc, content });
      }
      if (layer === "long_term") {
        return await appendLongTermMemory({ workspaceRoot: ctx.workspaceRoot, content });
      }
      return "Error: invalid layer (expected 'daily' or 'long_term')";
    }
  );

  registry.register(
    {
      name: "memory_get",
      description:
        "Read memory content. Prefer relying on the injected MEMORY prompt block unless you need exact raw contents.",
      parameters: Type.Object({
        layer: StringEnum(["daily", "long_term"], { description: "Memory layer to read." }),
        dateUtc: Type.Optional(
          Type.String({
            description:
              "For layer='daily' only: which UTC day to read (YYYY-MM-DD). Defaults to today (UTC).",
          })
        ),
        maxChars: Type.Optional(Type.Number({ minimum: 100, maximum: 200000, description: "Max characters to return." })),
      }),
    },
    async (args) => {
      const layer = String(args.layer ?? "").trim();
      const maxChars = typeof args.maxChars === "number" ? args.maxChars : 50_000;

      if (layer === "long_term") {
        const raw = await readLongTermMemory(ctx.workspaceRoot);
        return clampTail(raw, maxChars);
      }

      if (layer === "daily") {
        const dateUtc = String(args.dateUtc ?? "").trim() || todayUtc();
        const raw = await readDailyMemory(ctx.workspaceRoot, dateUtc);
        return clampTail(raw, maxChars);
      }

      return "Error: invalid layer (expected 'daily' or 'long_term')";
    }
  );

  registry.register(
    {
      name: "memory_list",
      description: "List recent daily memory files and the long-term memory file path.",
      parameters: Type.Object({
        count: Type.Optional(Type.Number({ minimum: 1, maximum: 90, description: "How many daily files to list." })),
      }),
    },
    async (args) => {
      const count = typeof args.count === "number" ? Math.floor(args.count) : 14;
      const memDir = getMemoryDir(ctx.workspaceRoot);
      const longPath = getLongTermMemoryPath(ctx.workspaceRoot);

      const longStat = await stat(longPath).catch(() => null);
      const longLine = longStat ? `- long_term: ${longPath} (${longStat.size} bytes)` : `- long_term: ${longPath} (missing)`;

      const entries = await readdir(memDir, { withFileTypes: true }).catch(() => []);
      const daily = entries
        .filter((e) => e.isFile() && /^\d{4}-\d{2}-\d{2}\.md$/.test(e.name))
        .map((e) => e.name)
        .sort()
        .reverse()
        .slice(0, count)
        .map((name) => `- daily: ${path.join(memDir, name)}`);

      return [longLine, ...daily].join("\n");
    }
  );
}

