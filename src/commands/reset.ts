import { rm, writeFile } from "node:fs/promises";

import { getDefaultConfig } from "../config/schema.js";
import { ensurePromptTemplates, ensureWorkspace } from "../workspace/bootstrap.js";
import { getConfigPath, getWorkspaceRoot } from "../workspace/paths.js";

export async function runReset(opts: { all: boolean }): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  await ensureWorkspace(workspaceRoot);

  await ensurePromptTemplates(workspaceRoot, { overwrite: true });
  console.log("Restored prompt templates in ~/.genieceo/prompts/");

  if (opts.all) {
    const configPath = getConfigPath(workspaceRoot);
    // Remove first to ensure permissions/errors surface cleanly.
    await rm(configPath, { force: true });
    await writeFile(configPath, JSON.stringify(getDefaultConfig(), null, 2) + "\n", "utf8");
    console.log("Reset ~/.genieceo/config.json");
  }
}

