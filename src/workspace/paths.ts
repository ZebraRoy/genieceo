import os from "node:os";
import path from "node:path";

export const GENIECEO_DIRNAME = ".genieceo";

export function getWorkspaceRoot(): string {
  return path.join(os.homedir(), GENIECEO_DIRNAME);
}

export function getPromptsDir(workspaceRoot: string = getWorkspaceRoot()): string {
  return path.join(workspaceRoot, "prompts");
}

export function getSessionsDir(workspaceRoot: string = getWorkspaceRoot()): string {
  return path.join(workspaceRoot, "sessions");
}

export function getLogsDir(workspaceRoot: string = getWorkspaceRoot()): string {
  return path.join(workspaceRoot, "logs");
}

export function getServicesDir(workspaceRoot: string = getWorkspaceRoot()): string {
  return path.join(workspaceRoot, "services");
}

export function getPluginsDir(workspaceRoot: string = getWorkspaceRoot()): string {
  return path.join(workspaceRoot, "plugins");
}

export function getSkillsDir(workspaceRoot: string = getWorkspaceRoot()): string {
  return path.join(workspaceRoot, "skills");
}

export function getSubagentsDir(workspaceRoot: string = getWorkspaceRoot()): string {
  return path.join(workspaceRoot, "subagents");
}

export function getMediaDir(workspaceRoot: string = getWorkspaceRoot()): string {
  return path.join(workspaceRoot, "media");
}

export function getConfigPath(workspaceRoot: string = getWorkspaceRoot()): string {
  return path.join(workspaceRoot, "config.json");
}

