import os from "node:os";
import path from "node:path";

export class PathSafetyError extends Error {
  name = "PathSafetyError";
}

function expandHome(p: string): string {
  const s = String(p ?? "").trim();
  if (s === "~") return os.homedir();
  if (s.startsWith("~/") || s.startsWith("~\\")) return path.join(os.homedir(), s.slice(2));
  return s;
}

export function resolveWithinWorkspace(workspaceRoot: string, userPath: string): string {
  const workspace = path.resolve(expandHome(workspaceRoot));
  const raw = expandHome(String(userPath ?? ""));
  const resolved = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(workspace, raw);

  if (resolved === workspace) return resolved;
  if (!resolved.startsWith(workspace + path.sep)) {
    throw new PathSafetyError(`Path escapes workspace: ${userPath}`);
  }
  return resolved;
}

