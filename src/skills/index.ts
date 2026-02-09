import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { parseSkillMarkdown } from "./frontmatter.js";
import type { SkillIndexEntry } from "./types.js";

export async function listSkillDirectories(skillsDirAbs: string): Promise<string[]> {
  const entries = await readdir(skillsDirAbs, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => path.join(skillsDirAbs, e.name))
    .sort((a, b) => a.localeCompare(b));
}

export async function buildSkillsIndex(skillsDirAbs: string, opts?: { limit?: number }): Promise<{
  skills: SkillIndexEntry[];
  skipped: { dir: string; reason: string }[];
  truncated: boolean;
}> {
  const dirs = await listSkillDirectories(skillsDirAbs);
  const skipped: { dir: string; reason: string }[] = [];
  const skills: SkillIndexEntry[] = [];

  const limit = typeof opts?.limit === "number" ? opts.limit : 200;

  for (const dir of dirs) {
    const name = path.basename(dir);
    const skillMdPath = path.join(dir, "SKILL.md");

    let content: string;
    try {
      content = await readFile(skillMdPath, "utf8");
    } catch {
      skipped.push({ dir, reason: "missing SKILL.md" });
      continue;
    }

    const parsed = parseSkillMarkdown(content, { expectedName: name });
    if (!parsed.ok) {
      skipped.push({ dir, reason: parsed.error });
      continue;
    }

    const st = await stat(skillMdPath).catch(() => null);
    skills.push({
      name: parsed.frontmatter.name,
      description: parsed.frontmatter.description,
      dir,
      skillMdPath,
      updatedAtMs: st?.mtimeMs,
    });

    if (skills.length >= limit) {
      return { skills, skipped, truncated: dirs.length > limit };
    }
  }

  return { skills, skipped, truncated: false };
}

