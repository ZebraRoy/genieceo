import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { parseSubagentMarkdown } from "./frontmatter.js";
import type { SubagentIndexEntry } from "./types.js";

export async function listSubagentDirectories(subagentsDirAbs: string): Promise<string[]> {
  const entries = await readdir(subagentsDirAbs, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => path.join(subagentsDirAbs, e.name))
    .sort((a, b) => a.localeCompare(b));
}

export async function buildSubagentsIndex(subagentsDirAbs: string, opts?: { limit?: number }): Promise<{
  subagents: SubagentIndexEntry[];
  skipped: { dir: string; reason: string }[];
  truncated: boolean;
}> {
  const dirs = await listSubagentDirectories(subagentsDirAbs);
  const skipped: { dir: string; reason: string }[] = [];
  const subagents: SubagentIndexEntry[] = [];

  const limit = typeof opts?.limit === "number" ? opts.limit : 200;

  for (const dir of dirs) {
    const name = path.basename(dir);
    const agentMdPath = path.join(dir, "AGENT.md");

    let content: string;
    try {
      content = await readFile(agentMdPath, "utf8");
    } catch {
      skipped.push({ dir, reason: "missing AGENT.md" });
      continue;
    }

    const parsed = parseSubagentMarkdown(content, { expectedName: name });
    if (!parsed.ok) {
      skipped.push({ dir, reason: parsed.error });
      continue;
    }

    const st = await stat(agentMdPath).catch(() => null);
    subagents.push({
      name: parsed.frontmatter.name,
      description: parsed.frontmatter.description,
      profile: parsed.frontmatter.profile,
      dir,
      agentMdPath,
      updatedAtMs: st?.mtimeMs,
    });

    if (subagents.length >= limit) {
      return { subagents, skipped, truncated: dirs.length > limit };
    }
  }

  return { subagents, skipped, truncated: false };
}

