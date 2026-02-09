import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getConfigPath, getWorkspaceRoot } from "../workspace/paths.js";
import { ConfigSchema, GenieCeoConfig, getDefaultConfig } from "./schema.js";

export class ConfigError extends Error {
  name = "ConfigError";
}

export async function loadConfig(workspaceRoot: string = getWorkspaceRoot()): Promise<GenieCeoConfig> {
  const configPath = getConfigPath(workspaceRoot);

  try {
    const raw = await readFile(configPath, "utf8");
    const parsedJson = JSON.parse(raw);
    return ConfigSchema.parse(parsedJson);
  } catch (err: any) {
    // Missing config → defaults.
    if (err?.code === "ENOENT") return getDefaultConfig();

    // Invalid JSON or schema → raise a friendly error so `reset` or `onboard` can recover.
    const message = err?.message ? String(err.message) : String(err);
    throw new ConfigError(`Invalid config at ${configPath}: ${message}`);
  }
}

export async function saveConfig(
  config: GenieCeoConfig,
  workspaceRoot: string = getWorkspaceRoot()
): Promise<void> {
  const configPath = getConfigPath(workspaceRoot);
  await mkdir(path.dirname(configPath), { recursive: true });
  const normalized = ConfigSchema.parse(config);
  await writeFile(configPath, JSON.stringify(normalized, null, 2) + "\n", "utf8");
}

