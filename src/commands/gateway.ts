import { ensureWorkspace } from "../workspace/bootstrap.js";
import { getWorkspaceRoot } from "../workspace/paths.js";

import { GatewayRouter } from "../gateway/router.js";
import { startGatewayServer } from "../gateway/server.js";
import { loadConfig } from "../config/store.js";
import { GatewayMessageRouter } from "../gateway/message-router.js";
import { loadAllChannelPlugins } from "../plugins/loader.js";
import type { ChannelAdapter } from "../plugins/types.js";
import { plugin as builtinTelegramPlugin } from "../plugins/builtin/telegram/index.js";
import { plugin as builtinDiscordPlugin } from "../plugins/builtin/discord/index.js";
import { plugin as builtinLinePlugin } from "../plugins/builtin/line/index.js";
import { ensureServiceRunning } from "../services/manager.js";
import path from "node:path";
import { createLogger } from "../logging/logger.js";
import { getLogsDir } from "../workspace/paths.js";

export async function runGateway(): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  await ensureWorkspace(workspaceRoot);

  const config = await loadConfig(workspaceRoot);
  const host = config.gateway.host;
  const port = config.gateway.port;
  const autostart = Array.isArray((config.gateway as any)?.autostartServices) ? (config.gateway as any).autostartServices : [];

  const logger = createLogger({
    workspaceRoot,
    scope: "gateway",
    logFile: path.join(getLogsDir(workspaceRoot), "gateway.log"),
  });

  if (autostart.length > 0) {
    console.log(`Autostart services: ${autostart.join(", ")}`);
    for (const name of autostart) {
      const svc = String(name ?? "").trim();
      if (!svc) continue;
      try {
        const rec = await ensureServiceRunning({ workspaceRoot, invocationCwd: workspaceRoot, config }, svc);
        console.log(`- ${svc}: running (pid ${rec.pid})`);
        logger.info("autostart service running", { service: svc, pid: rec.pid });
      } catch (e: any) {
        const msg = e?.message ? String(e.message) : String(e);
        console.log(`- ${svc}: failed to start: ${msg}`);
        logger.errorWith("autostart service failed", e, { service: svc });
      }
    }
  }

  const router = new GatewayRouter();
  const adapters = new Map<string, ChannelAdapter>();

  const msgRouter = await GatewayMessageRouter.create({
    workspaceRoot,
    invocationCwd: workspaceRoot,
    logger,
    send: async ({ conversationKey, text }) => {
      const channel = String(conversationKey).split(":")[0];
      const adapter = adapters.get(channel);
      if (!adapter) throw new Error(`No adapter registered for channel '${channel}'`);
      logger.info("outbound send", { channel, conversationKey, textLen: text?.length ?? 0 });
      await adapter.send({ conversationKey, text });
      logger.info("outbound sent", { channel, conversationKey });
    },
  });

  router.get("/health", async () => ({
    status: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ok: true, channels: Array.from(adapters.keys()).sort() }),
  }));

  const plugins = await loadAllChannelPlugins({
    workspaceRoot,
    pluginsDir: config.gateway.pluginsDir,
    builtin: [builtinTelegramPlugin, builtinDiscordPlugin, builtinLinePlugin],
  });
  for (const p of plugins) {
    // Skip disabled plugins (by convention, configKey points to {enabled: boolean}).
    const cfg = getByPath(config as any, p.manifest.configKey);
    const enabled = Boolean(cfg?.enabled);
    if (!enabled) continue;

    const adapter = await p.module.createChannelAdapter({
      workspaceRoot,
      config,
      emitInbound: async (msg) => await msgRouter.emitInbound(msg),
      logger: logger.child(`channel.${p.manifest.name}`),
    });

    await adapter.registerRoutes(router);
    adapters.set(p.manifest.name, adapter);
  }

  const { address } = await startGatewayServer({ host, port, router, logger: logger.child("http") });
  const actual = address ? `${address.address}:${address.port}` : `${host}:${port}`;
  console.log(`Gateway listening on http://${actual}`);
  console.log("Press Ctrl+C to stop.");
  logger.info("gateway listening", { url: `http://${actual}` });

  // Keep process alive (server is keeping the event loop open).
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

