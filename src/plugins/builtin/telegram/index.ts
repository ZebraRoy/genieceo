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
  /**
   * Telegram Bot API parse mode for outgoing messages.
   * Supported: "HTML", "MarkdownV2", legacy "Markdown".
   *
   * Config supports both keys for convenience:
   * - channels.telegram.parse_mode (preferred; matches Telegram API)
   * - channels.telegram.parseMode (legacy/camelCase)
   */
  parse_mode?: "HTML" | "MarkdownV2" | "Markdown" | (string & {});
  parseMode?: "HTML" | "MarkdownV2" | "Markdown" | (string & {});
};

type TelegramGetMeResponse = {
  ok: boolean;
  result?: { id: number; username?: string };
};

type TelegramSendMessageResponse = {
  ok: boolean;
  description?: string;
};

type TelegramSendDocumentResponse = {
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
  body?: BodyInit,
  headers?: Record<string, string>,
): Promise<T> {
  const url = `https://api.telegram.org/bot${botToken}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body,
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

async function telegramApiJson<T>(
  botToken: string,
  method: string,
  payload?: any,
): Promise<T> {
  return telegramApi<T>(
    botToken,
    method,
    payload ? JSON.stringify(payload) : undefined,
    payload ? { "content-type": "application/json" } : undefined,
  );
}

async function telegramApiForm<T>(
  botToken: string,
  method: string,
  form: FormData,
): Promise<T> {
  // IMPORTANT: do not set content-type; fetch will add correct boundary.
  return telegramApi<T>(botToken, method, form);
}

const TELEGRAM_MAX_MESSAGE_CHARS = 4096;
const TELEGRAM_CHUNK_CHARS = 4000; // small buffer to reduce boundary surprises
const TELEGRAM_MAX_CAPTION_CHARS = 1024;

function splitTelegramText(text: string, limit = TELEGRAM_CHUNK_CHARS) {
  const chunks: string[] = [];
  let remaining = text ?? "";
  while (remaining.length > limit) {
    const head = remaining.slice(0, limit);
    const cutCandidates = [
      head.lastIndexOf("\n\n"),
      head.lastIndexOf("\n"),
      head.lastIndexOf(" "),
    ].filter((n) => n >= 0);
    const bestCut = Math.max(...cutCandidates, -1);
    const cut = bestCut >= Math.floor(limit * 0.5) ? bestCut : limit;
    const part = remaining.slice(0, cut).trimEnd();
    chunks.push(part.length ? part : remaining.slice(0, limit));
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.length) chunks.push(remaining);
  return chunks;
}

function clampCaption(text: string, max = TELEGRAM_MAX_CAPTION_CHARS) {
  const t = String(text ?? "");
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function isTelegramMessageTooLongError(err: unknown) {
  const msg = String((err as any)?.message ?? err ?? "");
  return (
    msg.includes("message is too long") ||
    msg.includes("MESSAGE_TOO_LONG") ||
    msg.includes("Bad Request: message is too long")
  );
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
  const parseModeRaw = String(
    (cfg.parse_mode ?? cfg.parseMode ?? "") as any,
  ).trim();
  const parseMode = parseModeRaw || undefined;
  if (
    parseMode &&
    parseMode !== "HTML" &&
    parseMode !== "MarkdownV2" &&
    parseMode !== "Markdown"
  ) {
    throw new Error(
      `Telegram plugin config error: channels.telegram.parse_mode must be one of HTML | MarkdownV2 | Markdown (got '${parseMode}')`,
    );
  }
  const dedupeLastUpdateId = new Map<string, number>(); // conversationKey -> last update_id

  async function sendMessageText(chatId: string, text: string): Promise<void> {
    // Attempt with parse_mode; if Telegram rejects entity parsing, retry without it.
    const payloadWithParseMode = {
      chat_id: chatId,
      text,
      ...(parseMode ? { parse_mode: parseMode } : {}),
    };

    try {
      const resp = await telegramApiJson<TelegramSendMessageResponse>(
        botToken,
        "sendMessage",
        payloadWithParseMode,
      );
      if (!resp.ok)
        throw new Error(
          `Telegram sendMessage failed: ${resp.description ?? "unknown error"}`,
        );
      return;
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const maybeParseError =
        msg.includes("can't parse entities") ||
        msg.includes("parse entities");
      if (!parseMode || !maybeParseError) throw e;

      const resp = await telegramApiJson<TelegramSendMessageResponse>(
        botToken,
        "sendMessage",
        { chat_id: chatId, text },
      );
      if (!resp.ok)
        throw new Error(
          `Telegram sendMessage failed: ${resp.description ?? "unknown error"}`,
        );
    }
  }

  async function sendMessageAsFile(chatId: string, text: string): Promise<void> {
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    const filename = `genieceo-message-${stamp}.txt`;

    const caption = clampCaption(
      `Message exceeded Telegram’s ${TELEGRAM_MAX_MESSAGE_CHARS}-character limit; sent as file instead.`,
    );

    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", caption);
    form.append(
      "document",
      new Blob([text], { type: "text/plain;charset=utf-8" }),
      filename,
    );

    const resp = await telegramApiForm<TelegramSendDocumentResponse>(
      botToken,
      "sendDocument",
      form,
    );
    if (!resp.ok)
      throw new Error(
        `Telegram sendDocument failed: ${resp.description ?? "unknown error"}`,
      );
  }

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
        void emit(update).catch((e) => {
          ctx.logger?.errorWith("telegram inbound emit failed", e, {
            channel: "telegram",
            update_id:
              typeof update?.update_id === "number"
                ? update.update_id
                : undefined,
            hasText: Boolean(normalizeTextUpdate(update).text),
          });
        });

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

      const text = String(msg.text ?? "");
      if (text.length <= TELEGRAM_MAX_MESSAGE_CHARS) {
        try {
          await sendMessageText(chatId, text);
          return;
        } catch (e) {
          // Telegram counts entities/UTF in ways that can surprise; treat length
          // failures as retryable with chunking/file.
          if (!isTelegramMessageTooLongError(e)) throw e;
        }
      }

      // For very long responses, Telegram will reject sendMessage; use chunking for
      // moderately long text (better UX), and fall back to a file for huge output
      // or if parse_mode makes safe chunking ambiguous.
      const chunks = splitTelegramText(text, TELEGRAM_CHUNK_CHARS);
      const shouldSendAsFile =
        Boolean(parseMode) || chunks.length > 8 || text.length > 50_000;

      if (shouldSendAsFile) {
        await sendMessageAsFile(chatId, text);
        return;
      }

      for (const chunk of chunks) {
        if (!chunk) continue;
        await sendMessageText(chatId, chunk);
      }
    },
  };

  return adapter;
}

export const plugin: ChannelPluginModule = { manifest, createChannelAdapter };
