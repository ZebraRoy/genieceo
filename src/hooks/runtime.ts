import path from "node:path";
import { stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import type { GenieCeoConfig } from "../config/schema.js";
import type { Logger } from "../logging/logger.js";
import type { GenieHookEvent, GenieHookHandler, GenieHookModule, HookHandlerContext } from "./types.js";

type HookLike = GenieHookHandler | { onEvent: GenieHookHandler };

export type HookRuntime = {
  enabled: boolean;
  emit: (event: GenieHookEvent) => Promise<void>;
};

const disabledRuntime: HookRuntime = {
  enabled: false,
  emit: async () => {},
};

const runtimeCache = new Map<string, HookRuntime>();

function normalizeHooksFromModule(mod: any, ctx: HookHandlerContext): HookLike[] {
  const out: HookLike[] = [];
  const push = (item: unknown) => {
    if (!item) return;
    if (typeof item === "function") {
      out.push(item as GenieHookHandler);
      return;
    }
    if (item && typeof item === "object" && typeof (item as any).onEvent === "function") {
      out.push(item as { onEvent: GenieHookHandler });
    }
  };

  const m = mod as GenieHookModule & { default?: unknown; createHookHandler?: unknown; onEvent?: unknown };
  if (typeof (m as any)?.createHookHandler === "function") {
    const created = (m as any).createHookHandler(ctx);
    if (Array.isArray(created)) {
      for (const x of created) push(x);
    } else {
      push(created);
    }
  }
  push((m as any)?.default);
  push((m as any)?.onEvent);
  return out;
}

async function callWithTimeout<T>(p: Promise<T>, timeoutMs: number): Promise<T> {
  if (!(timeoutMs > 0)) return await p;
  return await new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`hook timed out after ${timeoutMs}ms`)), timeoutMs);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function resolveHandlerPath(workspaceRoot: string, handlerModule: string): string {
  const raw = String(handlerModule ?? "").trim();
  if (!raw) return "";
  if (path.isAbsolute(raw)) return path.resolve(raw);
  return path.resolve(workspaceRoot, raw);
}

function report(logger: Logger | undefined, level: "warn" | "error", msg: string, fields?: Record<string, unknown>): void {
  if (logger) {
    if (level === "error") logger.error(msg, fields);
    else logger.warn(msg, fields);
    return;
  }
  if (level === "error") console.error(`[hooks] ${msg}`, fields ?? {});
  else console.warn(`[hooks] ${msg}`, fields ?? {});
}

export async function createHookRuntime(opts: {
  workspaceRoot: string;
  config: GenieCeoConfig;
  logger?: Logger;
}): Promise<HookRuntime> {
  const hooksCfg: any = (opts.config as any)?.hooks ?? {};
  const enabled = hooksCfg.enabled === true;
  const handlerModule = String(hooksCfg.handlerModule ?? "").trim();
  if (!enabled || !handlerModule) return disabledRuntime;

  const absModule = resolveHandlerPath(opts.workspaceRoot, handlerModule);
  const timeoutMs = typeof hooksCfg.timeoutMs === "number" ? Math.max(0, Math.floor(hooksCfg.timeoutMs)) : 2000;
  const failOpen = hooksCfg.failOpen !== false;
  const cacheKey = [opts.workspaceRoot, absModule, String(timeoutMs), String(failOpen)].join("|");
  const cached = runtimeCache.get(cacheKey);
  if (cached) return cached;

  const ctx: HookHandlerContext = { workspaceRoot: opts.workspaceRoot };
  const reloadCheckIntervalMs = 1000;
  let lastReloadCheckMs = 0;
  let loadedMtimeMs: number | null = null;
  let hooks: HookLike[] = [];

  const loadHandlers = async (mtimeMs?: number): Promise<HookLike[]> => {
    const version = typeof mtimeMs === "number" ? Math.floor(mtimeMs) : Date.now();
    const importUrl = `${pathToFileURL(absModule).href}?v=${version}`;
    const mod = await import(importUrl);
    return normalizeHooksFromModule(mod, ctx);
  };

  const maybeReloadHandlers = async (): Promise<void> => {
    const now = Date.now();
    if (now - lastReloadCheckMs < reloadCheckIntervalMs) return;
    lastReloadCheckMs = now;

    const st = await stat(absModule).catch(() => null);
    if (!st || !st.isFile()) return;
    const mtimeMs = Math.floor(st.mtimeMs);
    if (loadedMtimeMs != null && loadedMtimeMs === mtimeMs) return;

    try {
      const next = await loadHandlers(mtimeMs);
      if (next.length === 0) {
        report(opts.logger, "warn", "hook module loaded but no hook handlers were found", { module: absModule });
        return;
      }
      hooks = next;
      loadedMtimeMs = mtimeMs;
    } catch (err: any) {
      const msg = err?.message ? String(err.message) : String(err);
      report(opts.logger, "warn", "failed to hot-reload hook module", { module: absModule, message: msg });
    }
  };

  try {
    hooks = await loadHandlers();
    if (hooks.length === 0) {
      report(opts.logger, "warn", "hook module loaded but no hook handlers were found", { module: absModule });
      runtimeCache.set(cacheKey, disabledRuntime);
      return disabledRuntime;
    }
    loadedMtimeMs = Math.floor((await stat(absModule).catch(() => null))?.mtimeMs ?? Date.now());

    const runtime: HookRuntime = {
      enabled: true,
      emit: async (event) => {
        await maybeReloadHandlers();
        for (const h of hooks) {
          try {
            const fn = typeof h === "function" ? h : h.onEvent;
            await callWithTimeout(Promise.resolve(fn(event, ctx)), timeoutMs);
          } catch (err: any) {
            const msg = err?.message ? String(err.message) : String(err);
            report(opts.logger, "warn", "hook handler failed", {
              event: event.name,
              module: absModule,
              message: msg,
            });
            if (!failOpen) throw err;
          }
        }
      },
    };
    runtimeCache.set(cacheKey, runtime);
    return runtime;
  } catch (err: any) {
    const msg = err?.message ? String(err.message) : String(err);
    report(opts.logger, "error", "failed to load hook module", { module: absModule, message: msg });
    runtimeCache.set(cacheKey, disabledRuntime);
    return disabledRuntime;
  }
}
