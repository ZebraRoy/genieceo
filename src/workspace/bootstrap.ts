import { mkdir, readFile, writeFile, copyFile, stat } from "node:fs/promises";
import path from "node:path";

import { getConfigPath, getLogsDir, getPromptsDir, getSessionsDir, getWorkspaceRoot } from "./paths.js";
import { getInstalledTemplatesDir, PROMPT_TEMPLATE_FILES } from "./templates.js";
import { getDefaultConfig } from "../config/schema.js";

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

  await ensurePromptTemplates(workspaceRoot, { overwrite: false });

  // Create empty config.json placeholder (onboard will populate).
  const configPath = getConfigPath(workspaceRoot);
  if (!(await exists(configPath))) {
    await writeFile(configPath, JSON.stringify(getDefaultConfig(), null, 2) + "\n", "utf8");
  }
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

  return parts.join("\n\n---\n\n");
}

