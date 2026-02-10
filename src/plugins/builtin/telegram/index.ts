import type {
  ChannelAdapter,
  ChannelPluginContext,
  ChannelPluginManifest,
  ChannelPluginModule,
  InboundAttachment,
  InboundMessage,
} from "../../types.js";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getMediaDir } from "../../../workspace/paths.js";

type TelegramConfig = {
  enabled?: boolean;
  botToken?: string;
  webhookSecretToken?: string;
  /**
   * Whether to download inbound media (photos/voice/video/documents) to disk.
   * Default: true.
   */
  downloadMedia?: boolean;
  /**
   * Where to store downloaded media.
   * - If absolute, used as-is.
   * - If relative, resolved under ~/.genieceo (workspaceRoot).
   * Default: ~/.genieceo/media
   */
  mediaDir?: string;
  /**
   * Max bytes to download per attachment (best-effort; based on Telegram file_size and/or response size).
   * Default: 20MB.
   */
  maxDownloadBytes?: number;
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

type TelegramGetFileResponse = {
  ok: boolean;
  description?: string;
  result?: {
    file_id: string;
    file_unique_id: string;
    file_size?: number;
    file_path?: string;
  };
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

function sanitizeFilename(name: string): string {
  const s = String(name ?? "").trim();
  if (!s) return "file";
  // Remove path separators and other unsafe characters.
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

function extFromMime(mimeType?: string): string {
  const mt = String(mimeType ?? "").toLowerCase();
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "audio/ogg": ".ogg",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "application/pdf": ".pdf",
  };
  return map[mt] ?? "";
}

async function downloadTelegramAttachment(opts: {
  botToken: string;
  fileId: string;
  workspaceRoot: string;
  mediaDir?: string;
  conversationPathParts: string[];
  kind: InboundAttachment["kind"];
  mimeType?: string;
  originalName?: string;
  maxDownloadBytes: number;
}): Promise<InboundAttachment | null> {
  const getFileResp = await telegramApiJson<TelegramGetFileResponse>(
    opts.botToken,
    "getFile",
    { file_id: opts.fileId },
  );
  if (!getFileResp.ok || !getFileResp.result?.file_path) {
    return null;
  }

  const filePath = String(getFileResp.result.file_path);
  const fileSize = typeof getFileResp.result.file_size === "number" ? getFileResp.result.file_size : undefined;
  if (typeof fileSize === "number" && fileSize > opts.maxDownloadBytes) {
    return {
      kind: opts.kind,
      path: "",
      mimeType: opts.mimeType,
      originalName: opts.originalName,
      sizeBytes: fileSize,
      source: { telegram: { fileId: opts.fileId, filePath, skipped: "too_large" } },
    };
  }

  const url = `https://api.telegram.org/file/bot${opts.botToken}/${filePath}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > opts.maxDownloadBytes) {
    return {
      kind: opts.kind,
      path: "",
      mimeType: opts.mimeType,
      originalName: opts.originalName,
      sizeBytes: buf.byteLength,
      source: { telegram: { fileId: opts.fileId, filePath, skipped: "too_large" } },
    };
  }

  const baseDir = resolveMediaDir(opts.workspaceRoot, opts.mediaDir);
  const dir = path.join(baseDir, ...opts.conversationPathParts, "inbound");
  await mkdir(dir, { recursive: true });

  const original = sanitizeFilename(opts.originalName ?? "");
  const ext = path.extname(original) || path.extname(filePath) || extFromMime(opts.mimeType);
  const baseName =
    original && original !== "file"
      ? original.replace(/\.[^.]+$/, "")
      : `${opts.kind}-${opts.fileId.slice(0, 16)}`;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outName = sanitizeFilename(`${stamp}-${baseName}${ext || ""}`);
  const outPath = path.join(dir, outName);

  await writeFile(outPath, buf);

  return {
    kind: opts.kind,
    path: outPath,
    mimeType: opts.mimeType,
    originalName: opts.originalName,
    sizeBytes: buf.byteLength,
    source: { telegram: { fileId: opts.fileId, filePath } },
  };
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
  const downloadMedia = cfg.downloadMedia !== false;
  const mediaDir = String(cfg.mediaDir ?? "").trim() || undefined;
  const maxDownloadBytes =
    typeof cfg.maxDownloadBytes === "number" && Number.isFinite(cfg.maxDownloadBytes) && cfg.maxDownloadBytes > 0
      ? Math.floor(cfg.maxDownloadBytes)
      : 20 * 1024 * 1024; // 20MB default
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
    const msg = update?.message ?? update?.edited_message;
    if (!msg) return;
    const chatId = msg?.chat?.id != null ? String(msg.chat.id) : undefined;
    const userId = msg?.from?.id != null ? String(msg.from.id) : undefined;
    const text = typeof msg?.text === "string" ? msg.text : "";
    const caption = typeof msg?.caption === "string" ? msg.caption : "";
    if (!chatId) return;

    const conversationKey = `telegram:${botId}:${chatId}`;
    const updateId =
      typeof update?.update_id === "number" ? update.update_id : undefined;
    if (typeof updateId === "number") {
      const last = dedupeLastUpdateId.get(conversationKey);
      if (typeof last === "number" && updateId <= last) return;
      dedupeLastUpdateId.set(conversationKey, updateId);
    }

    const conversationPathParts = ["telegram", `bot-${botId}`, `chat-${chatId}`];

    // Collect attachments (photos/voice/video/documents/stickers/etc.)
    const attachments: InboundAttachment[] = [];
    const candidates: Array<{
      kind: InboundAttachment["kind"];
      fileId: string;
      mimeType?: string;
      originalName?: string;
      fileSize?: number;
      label: string;
    }> = [];

    // Photo sizes: pick largest.
    if (Array.isArray(msg?.photo) && msg.photo.length > 0) {
      const p = msg.photo[msg.photo.length - 1];
      if (p?.file_id) {
        candidates.push({
          kind: "image",
          fileId: String(p.file_id),
          mimeType: "image/jpeg",
          originalName: undefined,
          fileSize: typeof p.file_size === "number" ? p.file_size : undefined,
          label: "photo",
        });
      }
    }

    // Document
    if (msg?.document?.file_id) {
      candidates.push({
        kind: "file",
        fileId: String(msg.document.file_id),
        mimeType: typeof msg.document.mime_type === "string" ? msg.document.mime_type : undefined,
        originalName: typeof msg.document.file_name === "string" ? msg.document.file_name : undefined,
        fileSize: typeof msg.document.file_size === "number" ? msg.document.file_size : undefined,
        label: "document",
      });
    }

    // Video
    if (msg?.video?.file_id) {
      candidates.push({
        kind: "video",
        fileId: String(msg.video.file_id),
        mimeType: typeof msg.video.mime_type === "string" ? msg.video.mime_type : "video/mp4",
        originalName: typeof msg.video.file_name === "string" ? msg.video.file_name : undefined,
        fileSize: typeof msg.video.file_size === "number" ? msg.video.file_size : undefined,
        label: "video",
      });
    }

    // Voice note (OGG)
    if (msg?.voice?.file_id) {
      candidates.push({
        kind: "audio",
        fileId: String(msg.voice.file_id),
        mimeType: typeof msg.voice.mime_type === "string" ? msg.voice.mime_type : "audio/ogg",
        originalName: undefined,
        fileSize: typeof msg.voice.file_size === "number" ? msg.voice.file_size : undefined,
        label: "voice",
      });
    }

    // Audio file
    if (msg?.audio?.file_id) {
      candidates.push({
        kind: "audio",
        fileId: String(msg.audio.file_id),
        mimeType: typeof msg.audio.mime_type === "string" ? msg.audio.mime_type : undefined,
        originalName: typeof msg.audio.file_name === "string" ? msg.audio.file_name : undefined,
        fileSize: typeof msg.audio.file_size === "number" ? msg.audio.file_size : undefined,
        label: "audio",
      });
    }

    // Animation (GIF/mp4)
    if (msg?.animation?.file_id) {
      candidates.push({
        kind: "file",
        fileId: String(msg.animation.file_id),
        mimeType: typeof msg.animation.mime_type === "string" ? msg.animation.mime_type : undefined,
        originalName: typeof msg.animation.file_name === "string" ? msg.animation.file_name : undefined,
        fileSize: typeof msg.animation.file_size === "number" ? msg.animation.file_size : undefined,
        label: "animation",
      });
    }

    // Sticker (often webp)
    if (msg?.sticker?.file_id) {
      candidates.push({
        kind: "image",
        fileId: String(msg.sticker.file_id),
        mimeType: typeof msg.sticker.mime_type === "string" ? msg.sticker.mime_type : "image/webp",
        originalName: undefined,
        fileSize: typeof msg.sticker.file_size === "number" ? msg.sticker.file_size : undefined,
        label: "sticker",
      });
    }

    if (downloadMedia && candidates.length > 0) {
      for (const c of candidates) {
        try {
          const att = await downloadTelegramAttachment({
            botToken,
            fileId: c.fileId,
            workspaceRoot: ctx.workspaceRoot,
            mediaDir,
            conversationPathParts,
            kind: c.kind,
            mimeType: c.mimeType,
            originalName: c.originalName,
            maxDownloadBytes,
          });
          if (att) attachments.push(att);
        } catch (e) {
          ctx.logger?.errorWith("telegram media download failed", e, {
            channel: "telegram",
            conversationKey,
            kind: c.kind,
            label: c.label,
          });
        }
      }
    } else if (!downloadMedia && candidates.length > 0) {
      // Still surface that there were attachments, just without downloading.
      for (const c of candidates) {
        attachments.push({
          kind: c.kind,
          path: "",
          mimeType: c.mimeType,
          originalName: c.originalName,
          sizeBytes: c.fileSize,
          source: { telegram: { fileId: c.fileId, skipped: "download_disabled", label: c.label } },
        });
      }
    }

    const textParts = [text, caption].map((s) => String(s ?? "").trim()).filter(Boolean);
    if (attachments.length > 0) {
      const lines = attachments.map((a) => {
        if (a.path) {
          return `[attachment] ${a.kind}: ${a.originalName ? `${a.originalName} ` : ""}saved to ${a.path}`;
        }
        const skipped = String((a.source as any)?.telegram?.skipped ?? "unavailable");
        return `[attachment] ${a.kind}: ${a.originalName ? `${a.originalName} ` : ""}(${skipped})`;
      });
      textParts.push(lines.join("\n"));
    }

    const finalText = textParts.join("\n\n").trim();
    if (!finalText) return;

    const inbound: InboundMessage = {
      channel: "telegram",
      conversationKey,
      conversationPathParts,
      userId,
      text: finalText,
      attachments: attachments.length ? attachments : undefined,
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
