import type {
  ChannelAdapter,
  ChannelPluginContext,
  ChannelPluginManifest,
  ChannelPluginModule,
  InboundMessage,
} from "../../types.js";

type DiscordConfig = {
  enabled?: boolean;
  botToken?: string;
  webhookSecret?: string;
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
  const dedupeLastMessageId = new Map<string, string>(); // conversationKey -> last message_id

  async function emit(event: any): Promise<void> {
    const { channelId, userId, text } = normalizeDiscordMessage(event);
    if (!channelId || !text) return;

    // Ignore messages from the bot itself
    if (userId === botId) return;

    const conversationKey = `discord:${botId}:${channelId}`;
    const messageId = typeof event?.id === "string" ? event.id : undefined;
    if (messageId) {
      const last = dedupeLastMessageId.get(conversationKey);
      if (last === messageId) return;
      dedupeLastMessageId.set(conversationKey, messageId);
    }

    const inbound: InboundMessage = {
      channel: "discord",
      conversationKey,
      conversationPathParts: [
        "discord",
        `bot-${botId}`,
        `channel-${channelId}`,
      ],
      userId,
      text,
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
          void emit(event.d).catch(() => {});
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

      await discordApi(botToken, "POST", `/channels/${channelId}/messages`, {
        content: msg.text,
      });
    },
  };

  return adapter;
}

export const plugin: ChannelPluginModule = { manifest, createChannelAdapter };
