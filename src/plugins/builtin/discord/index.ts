import type {
  ChannelAdapter,
  ChannelPluginContext,
  ChannelPluginManifest,
  ChannelPluginModule,
  InboundAttachment,
  InboundMessage,
  OutboundAttachment,
} from "../../types.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getMediaDir } from "../../../workspace/paths.js";

type DiscordConfig = {
  enabled?: boolean;
  botToken?: string;
  webhookSecret?: string;
  downloadMedia?: boolean;
  mediaDir?: string;
  maxDownloadBytes?: number;
};

type DiscordUser = {
  id: string;
  username: string;
  discriminator: string;
  bot?: boolean;
};

type DiscordGetUserResponse = DiscordUser;

function getByPath(obj: any, pathStr: string): any {
  const parts = pathStr
    .split(".")
    .map((p) => p.trim())
    .filter(Boolean);
  let cur: any = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

async function discordApi<T>(
  botToken: string,
  method: string,
  endpoint: string,
  payload?: any,
): Promise<T> {
  const url = `https://discord.com/api/v10${endpoint}`;
  const res = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bot ${botToken}`,
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const text = await res.text().catch(() => "");
  if (!res.ok)
    throw new Error(
      `Discord API ${endpoint} failed: ${res.status} ${res.statusText}: ${text}`.slice(
        0,
        1000,
      ),
    );
  return JSON.parse(text) as T;
}

async function discordApiForm<T>(
  botToken: string,
  method: string,
  endpoint: string,
  form: FormData,
): Promise<T> {
  const url = `https://discord.com/api/v10${endpoint}`;
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bot ${botToken}`,
      // IMPORTANT: do not set content-type; fetch will add correct boundary.
    } as any,
    body: form as any,
  });
  const text = await res.text().catch(() => "");
  if (!res.ok)
    throw new Error(
      `Discord API ${endpoint} failed: ${res.status} ${res.statusText}: ${text}`.slice(
        0,
        1000,
      ),
    );
  return text ? (JSON.parse(text) as T) : ({} as T);
}

function header(
  reqHeaders: Record<string, any>,
  name: string,
): string | undefined {
  const v = reqHeaders[name.toLowerCase()];
  if (Array.isArray(v)) return v[0];
  if (typeof v === "string") return v;
  return undefined;
}

function normalizeDiscordMessage(event: any): {
  channelId?: string;
  userId?: string;
  text?: string;
} {
  const channelId =
    event?.channel_id != null ? String(event.channel_id) : undefined;
  const userId =
    event?.author?.id != null ? String(event.author.id) : undefined;
  const text = typeof event?.content === "string" ? event.content : undefined;
  return { channelId, userId, text };
}

function sanitizeFilename(name: string): string {
  const s = String(name ?? "").trim();
  if (!s) return "file";
  return s
    .replace(/[\/\\]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "_")
    .replace(/[:*?"<>|]/g, "_")
    .slice(0, 200);
}

function resolveMediaDir(workspaceRoot: string, mediaDir?: string): string {
  const raw = String(mediaDir ?? "").trim();
  if (!raw) return getMediaDir(workspaceRoot);
  if (raw.startsWith("~/")) return path.join(os.homedir(), raw.slice(2));
  if (path.isAbsolute(raw)) return raw;
  return path.join(workspaceRoot, raw);
}

export const manifest: ChannelPluginManifest = {
  name: "discord",
  type: "channel",
  entry: "./index.js",
  webhookPaths: ["/webhooks/discord"],
  configKey: "channels.discord",
};

export async function createChannelAdapter(
  ctx: ChannelPluginContext,
): Promise<ChannelAdapter> {
  const cfg = (getByPath(ctx.config, manifest.configKey) ??
    {}) as DiscordConfig;
  const botToken = String(cfg.botToken ?? "").trim();
  if (!botToken) {
    throw new Error(
      "Discord plugin enabled but channels.discord.botToken is missing in ~/.genieceo/config.json",
    );
  }

  const me = await discordApi<DiscordGetUserResponse>(
    botToken,
    "GET",
    "/users/@me",
  );
  if (!me.id) throw new Error("Discord getUser failed (invalid bot token?)");
  const botId = String(me.id);

  const secret = String(cfg.webhookSecret ?? "").trim();
  const downloadMedia = cfg.downloadMedia !== false;
  const mediaDir = String(cfg.mediaDir ?? "").trim() || undefined;
  const maxDownloadBytes =
    typeof cfg.maxDownloadBytes === "number" && Number.isFinite(cfg.maxDownloadBytes) && cfg.maxDownloadBytes > 0
      ? Math.floor(cfg.maxDownloadBytes)
      : 20 * 1024 * 1024;
  const dedupeLastMessageId = new Map<string, string>(); // conversationKey -> last message_id

  async function emit(event: any): Promise<void> {
    const { channelId, userId, text } = normalizeDiscordMessage(event);
    if (!channelId) return;

    // Ignore messages from the bot itself
    if (userId === botId) return;

    const conversationKey = `discord:${botId}:${channelId}`;
    const messageId = typeof event?.id === "string" ? event.id : undefined;
    if (messageId) {
      const last = dedupeLastMessageId.get(conversationKey);
      if (last === messageId) return;
      dedupeLastMessageId.set(conversationKey, messageId);
    }

    const conversationPathParts = [
      "discord",
      `bot-${botId}`,
      `channel-${channelId}`,
    ];

    const attachments: InboundAttachment[] = [];
    const rawAtts = Array.isArray(event?.attachments) ? event.attachments : [];
    if (downloadMedia && rawAtts.length > 0) {
      const baseDir = resolveMediaDir(ctx.workspaceRoot, mediaDir);
      const dir = path.join(baseDir, ...conversationPathParts, "inbound");
      await mkdir(dir, { recursive: true });

      for (const a of rawAtts) {
        const url = typeof a?.url === "string" ? a.url : "";
        if (!url) continue;
        const filename = sanitizeFilename(typeof a?.filename === "string" ? a.filename : "");
        const contentType = typeof a?.content_type === "string" ? a.content_type : undefined;
        const sizeBytes = typeof a?.size === "number" ? a.size : undefined;
        if (typeof sizeBytes === "number" && sizeBytes > maxDownloadBytes) {
          attachments.push({
            kind: contentType?.startsWith("image/")
              ? "image"
              : contentType?.startsWith("audio/")
                ? "audio"
                : contentType?.startsWith("video/")
                  ? "video"
                  : "file",
            path: "",
            mimeType: contentType,
            originalName: filename || undefined,
            sizeBytes,
            source: { discord: { url, skipped: "too_large" } },
          });
          continue;
        }

        try {
          const res = await fetch(url, { method: "GET" });
          if (!res.ok) continue;
          const buf = new Uint8Array(await res.arrayBuffer());
          if (buf.byteLength > maxDownloadBytes) {
            attachments.push({
              kind: contentType?.startsWith("image/")
                ? "image"
                : contentType?.startsWith("audio/")
                  ? "audio"
                  : contentType?.startsWith("video/")
                    ? "video"
                    : "file",
              path: "",
              mimeType: contentType,
              originalName: filename || undefined,
              sizeBytes: buf.byteLength,
              source: { discord: { url, skipped: "too_large" } },
            });
            continue;
          }
          const stamp = new Date().toISOString().replace(/[:.]/g, "-");
          const outName = sanitizeFilename(`${stamp}-${filename || "attachment"}`);
          const outPath = path.join(dir, outName);
          await writeFile(outPath, buf);

          attachments.push({
            kind: contentType?.startsWith("image/")
              ? "image"
              : contentType?.startsWith("audio/")
                ? "audio"
                : contentType?.startsWith("video/")
                  ? "video"
                  : "file",
            path: outPath,
            mimeType: contentType,
            originalName: filename || undefined,
            sizeBytes: buf.byteLength,
            source: { discord: { url } },
          });
        } catch (e) {
          ctx.logger?.errorWith("discord attachment download failed", e, {
            channel: "discord",
            conversationKey,
            url,
          });
        }
      }
    } else if (!downloadMedia && rawAtts.length > 0) {
      for (const a of rawAtts) {
        const url = typeof a?.url === "string" ? a.url : "";
        const filename = typeof a?.filename === "string" ? a.filename : undefined;
        const contentType = typeof a?.content_type === "string" ? a.content_type : undefined;
        const sizeBytes = typeof a?.size === "number" ? a.size : undefined;
        attachments.push({
          kind: contentType?.startsWith("image/")
            ? "image"
            : contentType?.startsWith("audio/")
              ? "audio"
              : contentType?.startsWith("video/")
                ? "video"
                : "file",
          path: "",
          mimeType: contentType,
          originalName: filename,
          sizeBytes,
          source: { discord: { url, skipped: "download_disabled" } },
        });
      }
    }

    const textParts = [String(text ?? "").trim()].filter(Boolean);
    if (attachments.length > 0) {
      const lines = attachments.map((a) =>
        a.path
          ? `[attachment] ${a.kind}: ${a.originalName ? `${a.originalName} ` : ""}saved to ${a.path}`
          : `[attachment] ${a.kind}: ${a.originalName ? `${a.originalName} ` : ""}(not downloaded)`,
      );
      textParts.push(lines.join("\n"));
    }
    const finalText = textParts.join("\n\n").trim();
    if (!finalText) return;

    const inbound: InboundMessage = {
      channel: "discord",
      conversationKey,
      conversationPathParts,
      userId,
      text: finalText,
      attachments: attachments.length ? attachments : undefined,
      raw: event,
    };

    await ctx.emitInbound(inbound);
  }

  const adapter: ChannelAdapter = {
    name: "discord",
    registerRoutes(router) {
      router.post("/webhooks/discord", async (req) => {
        if (secret) {
          const got = header(req.headers as any, "x-discord-webhook-secret");
          if (!got || got !== secret) {
            return {
              status: 401,
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ ok: false }),
            };
          }
        }

        const event = req.bodyJson ?? null;

        // Handle Discord gateway events (MESSAGE_CREATE type)
        if (event?.t === "MESSAGE_CREATE") {
          void emit(event.d).catch((e) => {
            ctx.logger?.errorWith("discord inbound emit failed", e, {
              channel: "discord",
              t: String(event?.t ?? ""),
              id: typeof event?.d?.id === "string" ? event.d.id : undefined,
              hasText: Boolean(normalizeDiscordMessage(event.d).text),
            });
          });
        }

        return {
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ok: true }),
        };
      });
    },
    async send(msg) {
      // conversationKey: discord:<botId>:<channelId>
      const parts = String(msg.conversationKey).split(":");
      const channelId = parts.length >= 3 ? parts.slice(2).join(":") : "";
      if (!channelId) throw new Error("Discord send: invalid conversationKey");

      const text = String(msg.text ?? "");
      const outboundAtts = Array.isArray((msg as any)?.attachments)
        ? ((msg as any).attachments as OutboundAttachment[])
        : [];

      if (outboundAtts.length > 0) {
        const form = new FormData();
        form.append(
          "payload_json",
          JSON.stringify({
            content: text,
          }),
        );

        for (let i = 0; i < outboundAtts.length; i++) {
          const a = outboundAtts[i]!;
          const p = String(a?.path ?? "").trim();
          if (!p) continue;
          const buf = await readFile(p);
          const filename =
            String(a?.filename ?? "").trim() || path.basename(p) || "file";
          const mimeType =
            String(a?.mimeType ?? "").trim() || "application/octet-stream";
          form.append(
            `files[${i}]`,
            new Blob([buf], { type: mimeType }),
            filename,
          );
        }

        await discordApiForm(botToken, "POST", `/channels/${channelId}/messages`, form);
        return;
      }

      await discordApi(botToken, "POST", `/channels/${channelId}/messages`, {
        content: text,
      });
    },
  };

  return adapter;
}

export const plugin: ChannelPluginModule = { manifest, createChannelAdapter };
