import path from "node:path";

export class PathSafetyError extends Error {
  name = "PathSafetyError";
}

export function resolveWithinWorkspace(workspaceRoot: string, userPath: string): string {
  const workspace = path.resolve(workspaceRoot);
  const resolved = path.resolve(workspace, userPath);

  if (resolved === workspace) return resolved;
  if (!resolved.startsWith(workspace + path.sep)) {
    throw new PathSafetyError(`Path escapes workspace: ${userPath}`);
  }
  return resolved;
}

