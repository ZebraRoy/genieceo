import { ensureWorkspace } from "../workspace/bootstrap.js";
import { getConfigPath, getWorkspaceRoot } from "../workspace/paths.js";

import { GatewayRouter } from "../gateway/router.js";
import { startGatewayServer } from "../gateway/server.js";
import { loadConfig } from "../config/store.js";
import { GatewayMessageRouter } from "../gateway/message-router.js";
import { createAgentRuntime } from "../agent/runner.js";
import { discoverExternalChannelPlugins, loadAllChannelPlugins } from "../plugins/loader.js";
import type { ChannelAdapter } from "../plugins/types.js";
import { plugin as builtinTelegramPlugin } from "../plugins/builtin/telegram/index.js";
import { plugin as builtinDiscordPlugin } from "../plugins/builtin/discord/index.js";
import { plugin as builtinLinePlugin } from "../plugins/builtin/line/index.js";
import { ensureServiceRunning } from "../services/manager.js";
import path from "node:path";
import { stat } from "node:fs/promises";
import { createLogger } from "../logging/logger.js";
import { getLogsDir } from "../workspace/paths.js";

export async function runGateway(): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  await ensureWorkspace(workspaceRoot);

  let config = await loadConfig(workspaceRoot);
  const host = config.gateway.host;
  const port = config.gateway.port;

  const logger = createLogger({
    workspaceRoot,
    scope: "gateway",
    logFile: path.join(getLogsDir(workspaceRoot), "gateway.log"),
  });

  const router = new GatewayRouter();
  const adapters = new Map<string, ChannelAdapter>();
  const webhookPathsByPlugin = new Map<string, string[]>();

  const msgRouter = await GatewayMessageRouter.create({
    workspaceRoot,
    invocationCwd: workspaceRoot,
    logger,
    send: async ({ conversationKey, text, attachments }) => {
      const channel = String(conversationKey).split(":")[0];
      const adapter = adapters.get(channel);
      if (!adapter) throw new Error(`No adapter registered for channel '${channel}'`);
      logger.info("outbound send", {
        channel,
        conversationKey,
        textLen: text?.length ?? 0,
        attachments: Array.isArray(attachments) ? attachments.length : 0,
      });
      await adapter.send({ conversationKey, text: String(text ?? ""), attachments });
      logger.info("outbound sent", { channel, conversationKey });
    },
  });

  const builtinPlugins = [builtinTelegramPlugin, builtinDiscordPlugin, builtinLinePlugin];
  const reloadState = { busy: false };

  async function ensureAutostartServices(activeConfig: any): Promise<void> {
    const autostart = Array.isArray((activeConfig.gateway as any)?.autostartServices)
      ? (activeConfig.gateway as any).autostartServices
      : [];
    if (autostart.length === 0) return;
    console.log(`Autostart services: ${autostart.join(", ")}`);
    for (const name of autostart) {
      const svc = String(name ?? "").trim();
      if (!svc) continue;
      try {
        const rec = await ensureServiceRunning({ workspaceRoot, invocationCwd: workspaceRoot, config: activeConfig }, svc);
        console.log(`- ${svc}: running (pid ${rec.pid})`);
        logger.info("autostart service running", { service: svc, pid: rec.pid });
      } catch (e: any) {
        const msg = e?.message ? String(e.message) : String(e);
        console.log(`- ${svc}: failed to start: ${msg}`);
        logger.errorWith("autostart service failed", e, { service: svc });
      }
    }
  }

  function disablePluginWebhooks(paths: string[]): void {
    for (const p of paths) {
      if (!p || typeof p !== "string") continue;
      router.post(p, async () => ({
        status: 503,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "plugin_disabled" }),
      }));
    }
  }

  async function reloadGatewayRuntimeAndPlugins(reason: "startup" | "hot-reload"): Promise<void> {
    if (reloadState.busy) return;
    reloadState.busy = true;
    try {
      const nextConfig = await loadConfig(workspaceRoot);
      if (reason !== "startup") {
        if (nextConfig.gateway.host !== config.gateway.host || nextConfig.gateway.port !== config.gateway.port) {
          logger.warn("gateway host/port changed; restart required for listener changes", {
            host: config.gateway.host,
            port: config.gateway.port,
            nextHost: nextConfig.gateway.host,
            nextPort: nextConfig.gateway.port,
          });
        }
      }

      try {
        const nextRuntime = await createAgentRuntime({ workspaceRoot, invocationCwd: workspaceRoot });
        msgRouter.setRuntime(nextRuntime);
      } catch (e) {
        logger.errorWith("failed to reload agent runtime; keeping previous runtime", e);
      }

      const plugins = await loadAllChannelPlugins({
        workspaceRoot,
        pluginsDir: nextConfig.gateway.pluginsDir,
        builtin: builtinPlugins,
      });
      const enabledNames = new Set<string>();

      for (const p of plugins) {
        const name = p.manifest.name;
        const cfg = getByPath(nextConfig as any, p.manifest.configKey);
        const enabled = Boolean(cfg?.enabled);
        const webhookPaths = Array.isArray(p.manifest.webhookPaths) ? p.manifest.webhookPaths.map((x) => String(x)) : [];

        if (!enabled) {
          adapters.delete(name);
          webhookPathsByPlugin.set(name, webhookPaths);
          disablePluginWebhooks(webhookPaths);
          continue;
        }

        try {
          const adapter = await p.module.createChannelAdapter({
            workspaceRoot,
            config: nextConfig,
            emitInbound: async (msg) => await msgRouter.emitInbound(msg),
            logger: logger.child(`channel.${name}`),
          });
          await adapter.registerRoutes(router);
          adapters.set(name, adapter);
          webhookPathsByPlugin.set(name, webhookPaths);
          enabledNames.add(name);
        } catch (e) {
          logger.errorWith("failed to create/reload channel adapter", e, { plugin: name });
        }
      }

      for (const [name, paths] of webhookPathsByPlugin.entries()) {
        if (enabledNames.has(name)) continue;
        adapters.delete(name);
        disablePluginWebhooks(paths);
      }

      await ensureAutostartServices(nextConfig);
      config = nextConfig;
      if (reason === "hot-reload") logger.info("gateway runtime/plugins hot-reloaded");
    } finally {
      reloadState.busy = false;
    }
  }

  await reloadGatewayRuntimeAndPlugins("startup");

  router.get("/health", async () => ({
    status: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ok: true, channels: Array.from(adapters.keys()).sort() }),
  }));

  const { address } = await startGatewayServer({ host, port, router, logger: logger.child("http") });
  const actual = address ? `${address.address}:${address.port}` : `${host}:${port}`;
  console.log(`Gateway listening on http://${actual}`);
  console.log("Press Ctrl+C to stop.");
  logger.info("gateway listening", { url: `http://${actual}` });

  const hotReloadEnabled = Boolean((config.gateway as any)?.hotReload?.enabled ?? true);
  const hotReloadIntervalMs = Number((config.gateway as any)?.hotReload?.intervalMs ?? 2000);
  if (hotReloadEnabled) {
    let fingerprint = await computeHotReloadFingerprint({
      workspaceRoot,
      pluginsDir: config.gateway.pluginsDir,
    });
    logger.info("gateway hot-reload enabled", { intervalMs: hotReloadIntervalMs });
    const timer = setInterval(async () => {
      try {
        const nextFingerprint = await computeHotReloadFingerprint({
          workspaceRoot,
          pluginsDir: config.gateway.pluginsDir,
        });
        if (nextFingerprint === fingerprint) return;
        await reloadGatewayRuntimeAndPlugins("hot-reload");
        fingerprint = nextFingerprint;
      } catch (e) {
        logger.errorWith("gateway hot-reload tick failed", e);
      }
    }, Math.max(500, hotReloadIntervalMs));
    timer.unref();
  }

  // Keep process alive (server is keeping the event loop open).
}

async function computeHotReloadFingerprint(opts: { workspaceRoot: string; pluginsDir?: string }): Promise<string> {
  const parts: string[] = [];
  const cfgStat = await stat(getConfigPath(opts.workspaceRoot)).catch(() => null);
  parts.push(`config:${cfgStat ? Math.floor(cfgStat.mtimeMs) : 0}`);
  parts.push(`pluginsDir:${String(opts.pluginsDir ?? "")}`);

  const discovered = await discoverExternalChannelPlugins({
    workspaceRoot: opts.workspaceRoot,
    pluginsDir: opts.pluginsDir,
  });
  discovered.sort((a, b) => a.dir.localeCompare(b.dir));
  for (const p of discovered) {
    const manifestPath = path.join(p.dir, "plugin.json");
    const entryAbs = path.resolve(p.dir, p.manifest.entry);
    const manifestMtime = await stat(manifestPath).then((s) => Math.floor(s.mtimeMs)).catch(() => 0);
    const entryMtime = await stat(entryAbs).then((s) => Math.floor(s.mtimeMs)).catch(() => 0);
    parts.push(`${p.manifest.name}|${manifestMtime}|${entryMtime}|${p.manifest.entry}`);
  }
  return parts.join("\n");
}

function getByPath(obj: any, pathStr: string): any {
  const parts = pathStr.split(".").map((p) => p.trim()).filter(Boolean);
  let cur: any = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

