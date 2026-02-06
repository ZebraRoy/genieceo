import { mkdir, readFile, writeFile, copyFile, stat, readdir } from "node:fs/promises";
import path from "node:path";

import { getConfigPath, getLogsDir, getPluginsDir, getPromptsDir, getSessionsDir, getSkillsDir, getWorkspaceRoot } from "./paths.js";
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
  await mkdir(getPluginsDir(workspaceRoot), { recursive: true });
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

/**
 * Copies ALL installed prompt templates (.md files) into the workspace prompts folder.
 * This is used by `genieceo migrate` so older workspaces can pick up newly shipped templates.
 *
 * By default it is non-destructive: existing files are left untouched unless overwrite=true.
 */
export async function syncInstalledPromptTemplates(
  workspaceRoot: string,
  opts: { overwrite: boolean }
): Promise<{ copied: string[]; skipped: string[] }> {
  const templatesDir = getInstalledTemplatesDir();
  const promptsDir = getPromptsDir(workspaceRoot);
  await mkdir(promptsDir, { recursive: true });

  const copied: string[] = [];
  const skipped: string[] = [];

  if (!(await exists(templatesDir))) return { copied, skipped };

  const entries = await readdir(templatesDir, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (!ent.name.endsWith(".md")) continue;
    const src = path.join(templatesDir, ent.name);
    const dst = path.join(promptsDir, ent.name);
    if (!opts.overwrite && (await exists(dst))) {
      skipped.push(ent.name);
      continue;
    }
    await copyFile(src, dst);
    copied.push(ent.name);
  }

  copied.sort();
  skipped.sort();
  return { copied, skipped };
}

/**
 * Copies ALL installed built-in skills into the workspace skills folder.
 *
 * By default it is non-destructive: existing files are left untouched unless overwrite=true.
 * Even when overwrite=false, missing files inside an existing skill folder will be added.
 */
export async function syncInstalledBuiltinSkills(
  workspaceRoot: string,
  opts: { overwrite: boolean }
): Promise<{ installed: string[]; overwritten: string[]; existing: string[] }> {
  const installedDir = getInstalledBuiltinSkillsDir();
  const skillsDir = getSkillsDir(workspaceRoot);
  await mkdir(skillsDir, { recursive: true });

  const installed: string[] = [];
  const overwritten: string[] = [];
  const existing: string[] = [];

  if (!(await exists(installedDir))) return { installed, overwritten, existing };

  const entries = await readdir(installedDir, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const src = path.join(installedDir, ent.name);
    const dst = path.join(skillsDir, ent.name);
    const hadDst = await exists(dst);

    // copyDirRecursive is intentionally "merge-like" when overwrite=false.
    await copyDirRecursive(src, dst, opts);

    if (!hadDst) installed.push(ent.name);
    else if (opts.overwrite) overwritten.push(ent.name);
    else existing.push(ent.name);
  }

  installed.sort();
  overwritten.sort();
  existing.sort();
  return { installed, overwritten, existing };
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

