import { mkdir, readFile, writeFile, copyFile, stat, readdir } from "node:fs/promises";
import path from "node:path";

import { getConfigPath, getLogsDir, getPromptsDir, getSessionsDir, getSkillsDir, getWorkspaceRoot } from "./paths.js";
import { getInstalledTemplatesDir, PROMPT_TEMPLATE_FILES } from "./templates.js";
import { getDefaultConfig } from "../config/schema.js";
import { getInstalledBuiltinSkillsDir } from "./builtin-skills.js";
import { buildSkillsIndex } from "../skills/index.js";

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function ensureWorkspace(workspaceRoot: string = getWorkspaceRoot()): Promise<void> {
  await mkdir(workspaceRoot, { recursive: true });
  await mkdir(getPromptsDir(workspaceRoot), { recursive: true });
  await mkdir(getSessionsDir(workspaceRoot), { recursive: true });
  await mkdir(getLogsDir(workspaceRoot), { recursive: true });
  await mkdir(getSkillsDir(workspaceRoot), { recursive: true });

  await ensurePromptTemplates(workspaceRoot, { overwrite: false });
  await ensureBaselineSkills(workspaceRoot, { overwrite: false });

  // Create empty config.json placeholder (onboard will populate).
  const configPath = getConfigPath(workspaceRoot);
  if (!(await exists(configPath))) {
    await writeFile(configPath, JSON.stringify(getDefaultConfig(), null, 2) + "\n", "utf8");
  }
}

async function copyDirRecursive(srcDir: string, dstDir: string, opts: { overwrite: boolean }): Promise<void> {
  await mkdir(dstDir, { recursive: true });
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const ent of entries) {
    const src = path.join(srcDir, ent.name);
    const dst = path.join(dstDir, ent.name);
    if (ent.isDirectory()) {
      await copyDirRecursive(src, dst, opts);
      continue;
    }
    if (!opts.overwrite && (await exists(dst))) continue;
    await copyFile(src, dst);
  }
}

/**
 * Seeds a minimal set of built-in skills so GenieCEO always knows how to manage skills.
 * Additional skills are installed via the onboard wizard.
 */
export async function ensureBaselineSkills(workspaceRoot: string, opts: { overwrite: boolean }): Promise<void> {
  const installed = getInstalledBuiltinSkillsDir();
  const skillsDir = getSkillsDir(workspaceRoot);

  // Minimal baseline: manage-skills.
  const src = path.join(installed, "manage-skills");
  const dst = path.join(skillsDir, "manage-skills");
  if (!(await exists(src))) return;
  await copyDirRecursive(src, dst, opts);
}

export async function installBuiltinSkills(
  workspaceRoot: string,
  skillNames: string[],
  opts: { overwrite: boolean }
): Promise<{ installed: string[]; skipped: { name: string; reason: string }[] }> {
  const installedDir = getInstalledBuiltinSkillsDir();
  const skillsDir = getSkillsDir(workspaceRoot);

  const installed: string[] = [];
  const skipped: { name: string; reason: string }[] = [];

  for (const name of skillNames) {
    const src = path.join(installedDir, name);
    const dst = path.join(skillsDir, name);
    if (!(await exists(src))) {
      skipped.push({ name, reason: "builtin skill not found in installation" });
      continue;
    }
    await copyDirRecursive(src, dst, opts);
    installed.push(name);
  }

  return { installed, skipped };
}

export async function ensurePromptTemplates(
  workspaceRoot: string,
  opts: { overwrite: boolean }
): Promise<void> {
  const templatesDir = getInstalledTemplatesDir();
  const promptsDir = getPromptsDir(workspaceRoot);

  for (const filename of PROMPT_TEMPLATE_FILES) {
    const src = path.join(templatesDir, filename);
    const dst = path.join(promptsDir, filename);

    if (!opts.overwrite && (await exists(dst))) continue;
    await copyFile(src, dst);
  }
}

export async function loadSystemPrompt(workspaceRoot: string): Promise<string> {
  const promptsDir = getPromptsDir(workspaceRoot);
  const parts: string[] = [];

  for (const filename of PROMPT_TEMPLATE_FILES) {
    const p = path.join(promptsDir, filename);
    const content = await readFile(p, "utf8");
    parts.push(`## ${filename}\n\n${content.trim()}`);
  }

  // Append a compact, metadata-only index of skills (progressive disclosure).
  const skillsDir = getSkillsDir(workspaceRoot);
  const { skills, skipped, truncated } = await buildSkillsIndex(skillsDir, { limit: 200 });

  const skillsLines: string[] = [];
  for (const s of skills) {
    skillsLines.push(`- ${s.name}: ${s.description}`);
  }
  if (truncated) skillsLines.push(`- [truncated]`);
  if (skillsLines.length === 0) skillsLines.push("- [none installed]");

  parts.push(`## SKILLS_INDEX\n\n${skillsLines.join("\n")}`);

  // Don't spam: only include a small diagnostic if something is wrong.
  if (skipped.length > 0) {
    const sample = skipped.slice(0, 5).map((x) => `- ${path.basename(x.dir)}: ${x.reason}`);
    parts.push(
      `## SKILLS_INDEX_NOTES\n\nSkipped ${skipped.length} invalid skill folder(s). Fix or remove them.\n\n${sample.join("\n")}${
        skipped.length > sample.length ? "\n- [more omitted]" : ""
      }`
    );
  }

  return parts.join("\n\n---\n\n");
}

