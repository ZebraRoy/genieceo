import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Tool } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";

import { resolveWithinWorkspace } from "../path-safety.js";
import type { ToolExecutionContext } from "../types.js";

export function registerFileTools(registry: { register: (tool: Tool, handler: (args: any) => Promise<string>) => void }, ctx: ToolExecutionContext) {
  registry.register(
    {
      name: "read_file",
      description: "Read a UTF-8 text file from the GenieCEO workspace.",
      parameters: Type.Object({
        path: Type.String({ description: "Path relative to the workspace (or absolute within it)." }),
      }),
    },
    async (args) => {
      const p = resolveWithinWorkspace(ctx.workspaceRoot, String(args.path ?? ""));
      return await readFile(p, "utf8");
    }
  );

  registry.register(
    {
      name: "write_file",
      description: "Write a UTF-8 text file inside the GenieCEO workspace (creates parent dirs).",
      parameters: Type.Object({
        path: Type.String({ description: "Path relative to the workspace (or absolute within it)." }),
        content: Type.String({ description: "Full file content." }),
      }),
    },
    async (args) => {
      const p = resolveWithinWorkspace(ctx.workspaceRoot, String(args.path ?? ""));
      await mkdir(path.dirname(p), { recursive: true });
      await writeFile(p, String(args.content ?? ""), "utf8");
      return `Wrote ${p}`;
    }
  );

  registry.register(
    {
      name: "edit_file",
      description: "Edit a file by replacing the first occurrence of old_text with new_text.",
      parameters: Type.Object({
        path: Type.String({ description: "Path relative to the workspace (or absolute within it)." }),
        old_text: Type.String({ description: "Exact text to replace (first occurrence)." }),
        new_text: Type.String({ description: "Replacement text." }),
      }),
    },
    async (args) => {
      const p = resolveWithinWorkspace(ctx.workspaceRoot, String(args.path ?? ""));
      const oldText = String(args.old_text ?? "");
      const newText = String(args.new_text ?? "");
      const before = await readFile(p, "utf8");
      const idx = before.indexOf(oldText);
      if (idx === -1) {
        return `Error: old_text not found in ${p}`;
      }
      const after = before.slice(0, idx) + newText + before.slice(idx + oldText.length);
      await writeFile(p, after, "utf8");
      return `Edited ${p} (replaced 1 occurrence)`;
    }
  );

  registry.register(
    {
      name: "list_dir",
      description: "List the contents of a directory inside the GenieCEO workspace.",
      parameters: Type.Object({
        path: Type.String({ description: "Directory path relative to the workspace (or absolute within it)." }),
      }),
    },
    async (args) => {
      const dir = resolveWithinWorkspace(ctx.workspaceRoot, String(args.path ?? "."));
      const entries = await readdir(dir, { withFileTypes: true });
      const lines: string[] = [];
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        const s = await stat(full).catch(() => null);
        const suffix = ent.isDirectory() ? "/" : "";
        const size = s && !ent.isDirectory() ? ` (${s.size} bytes)` : "";
        lines.push(`${ent.name}${suffix}${size}`);
      }
      return lines.join("\n");
    }
  );
}

