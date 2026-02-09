import type {
  ChannelAdapter,
  ChannelPluginContext,
  ChannelPluginManifest,
  ChannelPluginModule,
  InboundMessage,
} from "../../types.js";
import { createHmac } from "node:crypto";

type LineConfig = {
  enabled?: boolean;
  channelAccessToken?: string;
  channelSecret?: string;
};

type LineProfile = {
  userId: string;
  displayName: string;
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

async function lineApi<T>(
  accessToken: string,
  method: string,
  endpoint: string,
  payload?: any,
): Promise<T> {
  const url = `https://api.line.me/v2${endpoint}`;
  const res = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const text = await res.text().catch(() => "");
  if (!res.ok)
    throw new Error(
      `Line API ${endpoint} failed: ${res.status} ${res.statusText}: ${text}`.slice(
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

function validateLineSignature(
  body: string,
  secret: string,
  signature: string,
): boolean {
  const hash = createHmac("sha256", secret).update(body).digest("base64");
  return hash === signature;
}

function normalizeLineMessage(event: any): {
  source?: string;
  userId?: string;
  text?: string;
} {
  if (event?.type !== "message" || event?.message?.type !== "text") {
    return {};
  }

  const userId =
    event?.source?.userId != null ? String(event.source.userId) : undefined;
  const text =
    typeof event?.message?.text === "string" ? event.message.text : undefined;

  // Source can be user, group, or room
  let source: string | undefined;
  if (event?.source?.type === "user") {
    source = `user:${userId}`;
  } else if (event?.source?.type === "group") {
    source = `group:${event.source.groupId}`;
  } else if (event?.source?.type === "room") {
    source = `room:${event.source.roomId}`;
  }

  return { source, userId, text };
}

export const manifest: ChannelPluginManifest = {
  name: "line",
  type: "channel",
  entry: "./index.js",
  webhookPaths: ["/webhooks/line"],
  configKey: "channels.line",
};

export async function createChannelAdapter(
  ctx: ChannelPluginContext,
): Promise<ChannelAdapter> {
  const cfg = (getByPath(ctx.config, manifest.configKey) ?? {}) as LineConfig;
  const accessToken = String(cfg.channelAccessToken ?? "").trim();
  const channelSecret = String(cfg.channelSecret ?? "").trim();

  if (!accessToken) {
    throw new Error(
      "Line plugin enabled but channels.line.channelAccessToken is missing in ~/.genieceo/config.json",
    );
  }
  if (!channelSecret) {
    throw new Error(
      "Line plugin enabled but channels.line.channelSecret is missing in ~/.genieceo/config.json",
    );
  }

  // Test the token by getting bot info
  try {
    await lineApi(accessToken, "GET", "/bot/info");
  } catch (e: any) {
    throw new Error(`Line bot info failed (invalid token?): ${e.message}`);
  }

  const dedupeLastMessageId = new Map<string, string>(); // conversationKey -> last message_id

  async function emit(event: any): Promise<void> {
    const { source, userId, text } = normalizeLineMessage(event);
    if (!source || !text) return;

    const conversationKey = `line:${source}`;
    const messageId =
      typeof event?.message?.id === "string" ? event.message.id : undefined;
    if (messageId) {
      const last = dedupeLastMessageId.get(conversationKey);
      if (last === messageId) return;
      dedupeLastMessageId.set(conversationKey, messageId);
    }

    const inbound: InboundMessage = {
      channel: "line",
      conversationKey,
      conversationPathParts: ["line", source.replace(":", "-")],
      userId,
      text,
      raw: event,
    };

    await ctx.emitInbound(inbound);
  }

  const adapter: ChannelAdapter = {
    name: "line",
    registerRoutes(router) {
      router.post("/webhooks/line", async (req) => {
        // Verify Line signature
        const signature = header(req.headers as any, "x-line-signature");
        if (!signature) {
          return {
            status: 401,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ error: "Missing signature" }),
          };
        }

        const body = req.bodyRaw ?? "";
        if (!validateLineSignature(body, channelSecret, signature)) {
          return {
            status: 401,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ error: "Invalid signature" }),
          };
        }

        const webhook = req.bodyJson ?? null;

        // Handle Line webhook events
        if (webhook?.events && Array.isArray(webhook.events)) {
          for (const event of webhook.events) {
            void emit(event).catch((e) => {
              ctx.logger?.errorWith("line inbound emit failed", e, {
                channel: "line",
                type: typeof event?.type === "string" ? event.type : undefined,
                messageId: typeof event?.message?.id === "string" ? event.message.id : undefined,
                hasText: Boolean(normalizeLineMessage(event).text),
              });
            });
          }
        }

        return {
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ok: true }),
        };
      });
    },
    async send(msg) {
      // conversationKey: line:user:<userId> or line:group:<groupId> or line:room:<roomId>
      const parts = String(msg.conversationKey).split(":");
      if (parts.length < 3 || parts[0] !== "line") {
        throw new Error("Line send: invalid conversationKey");
      }

      const sourceType = parts[1]; // user, group, or room
      const sourceId = parts.slice(2).join(":");

      let replyTo: string;
      if (sourceType === "user") {
        replyTo = sourceId;
      } else if (sourceType === "group") {
        replyTo = sourceId;
      } else if (sourceType === "room") {
        replyTo = sourceId;
      } else {
        throw new Error(`Line send: unsupported source type ${sourceType}`);
      }

      // Use push message API (works for user, group, and room)
      await lineApi(accessToken, "POST", "/bot/message/push", {
        to: replyTo,
        messages: [{ type: "text", text: msg.text }],
      });
    },
  };

  return adapter;
}

export const plugin: ChannelPluginModule = { manifest, createChannelAdapter };
