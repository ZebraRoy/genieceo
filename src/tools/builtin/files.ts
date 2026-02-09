import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Tool } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";

import { normalizeFileAccessMode, resolveFileToolPath, type FileScope } from "../path-access.js";
import type { ToolExecutionContext } from "../types.js";

export function registerFileTools(registry: { register: (tool: Tool, handler: (args: any) => Promise<string>) => void }, ctx: ToolExecutionContext) {
  const normalizeScope = (v: unknown): FileScope => {
    const s = String(v ?? "").trim();
    if (s === "project") return "project";
    if (s === "tmp") return "tmp";
    return "workspace";
  };

  const scopeSchema = Type.Optional(
    Type.Union([Type.Literal("workspace"), Type.Literal("project"), Type.Literal("tmp")], {
      description:
        "Where to resolve relative paths: 'workspace' (~/.genieceo), 'project' (where genieceo chat was launched), or 'tmp' (~/.genieceo/tmp). Default: 'workspace'.",
    })
  );

  const fileAccessMode = normalizeFileAccessMode((ctx.config as any)?.execution?.fileAccessMode);

  registry.register(
    {
      name: "read_file",
      description:
        "Read a UTF-8 text file. By default reads from the GenieCEO workspace; can also target the invocation directory or workspace tmp via 'scope'.",
      parameters: Type.Object({
        path: Type.String({ description: "Path relative to the workspace (or absolute within it)." }),
        scope: scopeSchema,
      }),
    },
    async (args) => {
      const scope = normalizeScope(args.scope);
      const p = resolveFileToolPath({
        workspaceRoot: ctx.workspaceRoot,
        invocationCwd: ctx.invocationCwd,
        mode: fileAccessMode,
        scope,
        userPath: String(args.path ?? ""),
      });
      return await readFile(p, "utf8");
    }
  );

  registry.register(
    {
      name: "write_file",
      description:
        "Write a UTF-8 text file (creates parent dirs). By default writes inside the GenieCEO workspace; can also target the invocation directory or workspace tmp via 'scope'.",
      parameters: Type.Object({
        path: Type.String({ description: "Path relative to the workspace (or absolute within it)." }),
        content: Type.String({ description: "Full file content." }),
        scope: scopeSchema,
      }),
    },
    async (args) => {
      const scope = normalizeScope(args.scope);
      const p = resolveFileToolPath({
        workspaceRoot: ctx.workspaceRoot,
        invocationCwd: ctx.invocationCwd,
        mode: fileAccessMode,
        scope,
        userPath: String(args.path ?? ""),
      });
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
        scope: scopeSchema,
      }),
    },
    async (args) => {
      const scope = normalizeScope(args.scope);
      const p = resolveFileToolPath({
        workspaceRoot: ctx.workspaceRoot,
        invocationCwd: ctx.invocationCwd,
        mode: fileAccessMode,
        scope,
        userPath: String(args.path ?? ""),
      });
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
      description:
        "List directory contents. By default lists inside the GenieCEO workspace; can also target the invocation directory or workspace tmp via 'scope'.",
      parameters: Type.Object({
        path: Type.String({ description: "Directory path relative to the workspace (or absolute within it)." }),
        scope: scopeSchema,
      }),
    },
    async (args) => {
      const scope = normalizeScope(args.scope);
      const dir = resolveFileToolPath({
        workspaceRoot: ctx.workspaceRoot,
        invocationCwd: ctx.invocationCwd,
        mode: fileAccessMode,
        scope,
        userPath: String(args.path ?? "."),
      });
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

