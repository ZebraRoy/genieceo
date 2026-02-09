import type {
  ChannelAdapter,
  ChannelPluginContext,
  ChannelPluginManifest,
  ChannelPluginModule,
  InboundMessage,
} from "../../types.js";

type TelegramConfig = {
  enabled?: boolean;
  botToken?: string;
  webhookSecretToken?: string;
};

type TelegramGetMeResponse = {
  ok: boolean;
  result?: { id: number; username?: string };
};

type TelegramSendMessageResponse = {
  ok: boolean;
  description?: string;
};

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

async function telegramApi<T>(
  botToken: string,
  method: string,
  payload?: any,
): Promise<T> {
  const url = `https://api.telegram.org/bot${botToken}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const text = await res.text().catch(() => "");
  if (!res.ok)
    throw new Error(
      `Telegram API ${method} failed: ${res.status} ${res.statusText}: ${text}`.slice(
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

function normalizeTextUpdate(update: any): {
  chatId?: string;
  userId?: string;
  text?: string;
} {
  const msg = update?.message ?? update?.edited_message;
  const chatId = msg?.chat?.id != null ? String(msg.chat.id) : undefined;
  const userId = msg?.from?.id != null ? String(msg.from.id) : undefined;
  const text = typeof msg?.text === "string" ? msg.text : undefined;
  return { chatId, userId, text };
}

export const manifest: ChannelPluginManifest = {
  name: "telegram",
  type: "channel",
  entry: "./index.js",
  webhookPaths: ["/webhooks/telegram"],
  configKey: "channels.telegram",
};

export async function createChannelAdapter(
  ctx: ChannelPluginContext,
): Promise<ChannelAdapter> {
  const cfg = (getByPath(ctx.config, manifest.configKey) ??
    {}) as TelegramConfig;
  const botToken = String(cfg.botToken ?? "").trim();
  if (!botToken) {
    throw new Error(
      "Telegram plugin enabled but channels.telegram.botToken is missing in ~/.genieceo/config.json",
    );
  }

  const me = await telegramApi<TelegramGetMeResponse>(botToken, "getMe");
  if (!me.ok || !me.result?.id)
    throw new Error("Telegram getMe failed (invalid bot token?)");
  const botId = String(me.result.id);

  const secret = String(cfg.webhookSecretToken ?? "").trim();
  const dedupeLastUpdateId = new Map<string, number>(); // conversationKey -> last update_id

  async function emit(update: any): Promise<void> {
    const { chatId, userId, text } = normalizeTextUpdate(update);
    if (!chatId || !text) return;

    const conversationKey = `telegram:${botId}:${chatId}`;
    const updateId =
      typeof update?.update_id === "number" ? update.update_id : undefined;
    if (typeof updateId === "number") {
      const last = dedupeLastUpdateId.get(conversationKey);
      if (typeof last === "number" && updateId <= last) return;
      dedupeLastUpdateId.set(conversationKey, updateId);
    }

    const inbound: InboundMessage = {
      channel: "telegram",
      conversationKey,
      conversationPathParts: ["telegram", `bot-${botId}`, `chat-${chatId}`],
      userId,
      text,
      raw: update,
    };

    await ctx.emitInbound(inbound);
  }

  const adapter: ChannelAdapter = {
    name: "telegram",
    registerRoutes(router) {
      router.post("/webhooks/telegram", async (req) => {
        if (secret) {
          const got = header(
            req.headers as any,
            "x-telegram-bot-api-secret-token",
          );
          if (!got || got !== secret) {
            return {
              status: 401,
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ ok: false }),
            };
          }
        }

        const update = req.bodyJson ?? null;
        // Don’t block the webhook response on agent execution.
        void emit(update).catch(() => {});

        return {
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ok: true }),
        };
      });
    },
    async send(msg) {
      // conversationKey: telegram:<botId>:<chatId>
      const parts = String(msg.conversationKey).split(":");
      const chatId = parts.length >= 3 ? parts.slice(2).join(":") : "";
      if (!chatId) throw new Error("Telegram send: invalid conversationKey");

      const resp = await telegramApi<TelegramSendMessageResponse>(
        botToken,
        "sendMessage",
        {
          chat_id: chatId,
          text: msg.text,
        },
      );
      if (!resp.ok)
        throw new Error(
          `Telegram sendMessage failed: ${resp.description ?? "unknown error"}`,
        );
    },
  };

  return adapter;
}

export const plugin: ChannelPluginModule = { manifest, createChannelAdapter };
