import os from "node:os";
import path from "node:path";

export type FileAccessMode = "protected" | "free";
export type FileScope = "workspace" | "project" | "tmp";

export function expandHome(p: string): string {
  const s = String(p ?? "").trim();
  if (s === "~") return os.homedir();
  if (s.startsWith("~/") || s.startsWith("~\\")) return path.join(os.homedir(), s.slice(2));
  return s;
}

export function isWithinRoot(rootAbs: string, targetAbs: string): boolean {
  const root = path.resolve(expandHome(rootAbs));
  const target = path.resolve(expandHome(targetAbs));
  if (target === root) return true;
  return target.startsWith(root + path.sep);
}

export function normalizeFileAccessMode(v: unknown): FileAccessMode {
  return v === "protected" ? "protected" : "free";
}

export function resolveFileToolPath(opts: {
  workspaceRoot: string;
  invocationCwd: string;
  mode: FileAccessMode;
  scope: FileScope;
  userPath: string;
}): string {
  const workspaceRootAbs = path.resolve(expandHome(opts.workspaceRoot));
  const invocationCwdAbs = path.resolve(expandHome(opts.invocationCwd));
  const tmpRootAbs = path.join(workspaceRootAbs, "tmp");

  const raw = expandHome(String(opts.userPath ?? ""));
  const resolvedRawAbs = path.isAbsolute(raw)
    ? path.resolve(raw)
    : (() => {
        const base =
          opts.scope === "workspace" ? workspaceRootAbs : opts.scope === "project" ? invocationCwdAbs : tmpRootAbs;
        return path.resolve(base, raw);
      })();

  if (opts.mode === "protected") {
    // In protected mode, absolute paths are only allowed if they land in either
    // the GenieCEO workspace or the invocation cwd.
    if (path.isAbsolute(raw)) {
      if (isWithinRoot(workspaceRootAbs, resolvedRawAbs) || isWithinRoot(invocationCwdAbs, resolvedRawAbs)) {
        return resolvedRawAbs;
      }
      throw new Error(`Path is not allowed in protected mode: ${opts.userPath}`);
    }

    // For relative paths, enforce that they stay within the chosen scope root.
    const scopeRoot =
      opts.scope === "workspace" ? workspaceRootAbs : opts.scope === "project" ? invocationCwdAbs : tmpRootAbs;
    if (!isWithinRoot(scopeRoot, resolvedRawAbs)) {
      throw new Error(`Path escapes ${opts.scope} scope in protected mode: ${opts.userPath}`);
    }
  }

  return resolvedRawAbs;
}

export function defaultShellAllowedRoots(opts: {
  workspaceRoot: string;
  invocationCwd: string;
  mode: FileAccessMode;
  configuredRoots: string[];
}): string[] {
  const configured = Array.isArray(opts.configuredRoots) ? opts.configuredRoots : [];
  if (configured.length > 0) return configured.map((r) => path.resolve(expandHome(r)));

  if (opts.mode === "free") {
    // filesystem root, e.g. "/" (macOS/Linux) or "C:\\" (Windows)
    return [path.parse(path.resolve(expandHome(opts.invocationCwd))).root];
  }

  return [path.resolve(expandHome(opts.workspaceRoot)), path.resolve(expandHome(opts.invocationCwd))];
}

