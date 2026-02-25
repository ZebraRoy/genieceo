import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { getPluginsDir } from "../workspace/paths.js";
import type { ChannelPluginManifest, ChannelPluginModule } from "./types.js";

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

export type LoadedChannelPlugin = {
  source: "builtin" | "external";
  rootDir?: string; // external only
  manifest: ChannelPluginManifest;
  module: ChannelPluginModule;
};

export async function discoverExternalChannelPlugins(opts: {
  workspaceRoot: string;
  pluginsDir?: string;
}): Promise<{ dir: string; manifest: ChannelPluginManifest }[]> {
  const pluginsDir = opts.pluginsDir ? String(opts.pluginsDir) : getPluginsDir(opts.workspaceRoot);
  const entries = await readdir(pluginsDir, { withFileTypes: true }).catch(() => []);
  const out: { dir: string; manifest: ChannelPluginManifest }[] = [];

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const dir = path.join(pluginsDir, ent.name);
    const manifestPath = path.join(dir, "plugin.json");
    const raw = await readFile(manifestPath, "utf8").catch(() => "");
    if (!raw.trim()) continue;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") continue;
      if (parsed.type !== "channel") continue;
      if (typeof parsed.name !== "string" || !parsed.name.trim()) continue;
      if (typeof parsed.entry !== "string" || !parsed.entry.trim()) continue;
      if (typeof parsed.configKey !== "string" || !parsed.configKey.trim()) continue;
      out.push({ dir, manifest: parsed as ChannelPluginManifest });
    } catch {
      continue;
    }
  }

  return out;
}

export async function loadExternalChannelPlugin(rootDir: string, manifest: ChannelPluginManifest): Promise<LoadedChannelPlugin | null> {
  if (!(await isDirectory(rootDir))) return null;
  const entryAbs = path.resolve(rootDir, manifest.entry);
  const entryStat = await stat(entryAbs).catch(() => null);
  if (!entryStat || !entryStat.isFile()) return null;
  const version = Math.floor(entryStat.mtimeMs);
  const entryUrl = `${pathToFileURL(entryAbs).toString()}?v=${version}`;

  let mod: any;
  try {
    mod = await import(entryUrl);
  } catch {
    return null;
  }

  const create = mod?.createChannelAdapter;
  if (typeof create !== "function") return null;

  // Allow the plugin to export its own manifest, but default to the file manifest.
  const exportedManifest = mod?.manifest && typeof mod.manifest === "object" ? (mod.manifest as any) : null;
  const finalManifest = { ...manifest, ...(exportedManifest ?? {}) } as ChannelPluginManifest;

  const module: ChannelPluginModule = {
    manifest: finalManifest,
    createChannelAdapter: create,
  };

  return { source: "external", rootDir, manifest: finalManifest, module };
}

export async function loadAllChannelPlugins(opts: {
  workspaceRoot: string;
  pluginsDir?: string;
  builtin?: ChannelPluginModule[];
}): Promise<LoadedChannelPlugin[]> {
  const out: LoadedChannelPlugin[] = [];

  for (const b of opts.builtin ?? []) {
    out.push({ source: "builtin", manifest: b.manifest, module: b });
  }

  const discovered = await discoverExternalChannelPlugins({ workspaceRoot: opts.workspaceRoot, pluginsDir: opts.pluginsDir });
  for (const d of discovered) {
    const loaded = await loadExternalChannelPlugin(d.dir, d.manifest);
    if (loaded) out.push(loaded);
  }

  return out;
}

