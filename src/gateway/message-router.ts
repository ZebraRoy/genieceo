import type { Message } from "@mariozechner/pi-ai";
import { randomUUID } from "node:crypto";

import { createAgentRuntime, runAgentTurn } from "../agent/runner.js";
import type { AgentRuntime } from "../agent/runner.js";
import type { InboundMessage, OutboundMessage } from "../plugins/types.js";
import { JsonlSessionStore } from "./session-store.js";
import type { Logger } from "../logging/logger.js";

type SendFn = (opts: OutboundMessage) => Promise<void>;

/**
 * Serializes processing per conversationKey, loads/persists JSONL sessions,
 * and runs the existing GenieCEO agent loop to produce replies.
 */
export class GatewayMessageRouter {
  private locks = new Map<string, Promise<void>>();
  private sessionStore: JsonlSessionStore;

  constructor(private runtime: AgentRuntime, private send: SendFn, private logger?: Logger) {
    this.sessionStore = new JsonlSessionStore(runtime.workspaceRoot, runtime.hooks);
  }

  setRuntime(runtime: AgentRuntime): void {
    this.runtime = runtime;
    this.sessionStore = new JsonlSessionStore(runtime.workspaceRoot, runtime.hooks);
  }

  static async create(opts: {
    workspaceRoot: string;
    invocationCwd?: string;
    send: SendFn;
    logger?: Logger;
  }): Promise<GatewayMessageRouter> {
    const runtime = await createAgentRuntime({ workspaceRoot: opts.workspaceRoot, invocationCwd: opts.invocationCwd });
    return new GatewayMessageRouter(runtime, opts.send, opts.logger);
  }

  async emitInbound(msg: InboundMessage): Promise<void> {
    const prev = this.locks.get(msg.conversationKey) ?? Promise.resolve();
    const next = prev
      .catch((e) => {
        // Swallow previous errors so the queue continues, but log them.
        this.logger?.errorWith("previous inbound processing failed (swallowed)", e, {
          conversationKey: msg.conversationKey,
          channel: msg.channel,
        });
      })
      .then(() => this.processInbound(msg))
      .finally(() => {
        // Only clear if we are still the tail promise.
        if (this.locks.get(msg.conversationKey) === next) this.locks.delete(msg.conversationKey);
      });

    this.locks.set(msg.conversationKey, next);
    await next;
  }

  private parseControlCommand(text: string): "reset" | null {
    const t = String(text ?? "").trim();
    if (!t) return null;
    const first = t.split(/\s+/)[0]?.toLowerCase() ?? "";
    // Telegram may send "/reset@BotName"
    const cmd = first.split("@")[0];
    if (cmd === "/reset" || cmd === "/clear") return "reset";
    return null;
  }

  private async processInbound(msg: InboundMessage): Promise<void> {
    const runId = randomUUID();
    const t0 = Date.now();
    if (this.runtime.hooks.enabled) {
      await this.runtime.hooks.emit({
        name: "gateway.inbound.received",
        timestampMs: t0,
        workspaceRoot: this.runtime.workspaceRoot,
        scope: "gateway",
        runId,
        channel: msg.channel,
        conversationKey: msg.conversationKey,
        data: {
          textLen: msg.text?.length ?? 0,
          attachments: Array.isArray(msg.attachments) ? msg.attachments.length : 0,
        },
      });
    }
    this.logger?.info("inbound message", {
      channel: msg.channel,
      conversationKey: msg.conversationKey,
      textLen: msg.text?.length ?? 0,
      attachments: Array.isArray(msg.attachments) ? msg.attachments.length : 0,
    });
    const control = this.parseControlCommand(msg.text);
    if (control === "reset") {
      await this.sessionStore.clear(msg.conversationPathParts, {
        runId,
        channel: msg.channel,
        conversationKey: msg.conversationKey,
      });
      if (this.runtime.hooks.enabled) {
        await this.runtime.hooks.emit({
          name: "gateway.outbound.send",
          timestampMs: Date.now(),
          workspaceRoot: this.runtime.workspaceRoot,
          scope: "gateway",
          runId,
          channel: msg.channel,
          conversationKey: msg.conversationKey,
          data: { textLen: 46, attachments: 0 },
        });
      }
      await this.send({
        conversationKey: msg.conversationKey,
        text: "Conversation cleared. Start a new topic anytime.",
      });
      if (this.runtime.hooks.enabled) {
        await this.runtime.hooks.emit({
          name: "gateway.outbound.sent",
          timestampMs: Date.now(),
          workspaceRoot: this.runtime.workspaceRoot,
          scope: "gateway",
          runId,
          channel: msg.channel,
          conversationKey: msg.conversationKey,
          data: { textLen: 46, attachments: 0 },
        });
      }
      return;
    }

    try {
      const messages: Message[] = await this.sessionStore.load(msg.conversationPathParts, {
        maxLines: 2000,
        runId,
        channel: msg.channel,
        conversationKey: msg.conversationKey,
      });

      const { assistantText, appendedMessages, outboundMessages } = await runAgentTurn({
        runtime: this.runtime,
        messages,
        userText: msg.text,
        attachments: msg.attachments,
        conversationKey: msg.conversationKey,
        conversation: {
          channel: msg.channel,
        },
        stream: false,
        onEvent: (ev) => {
          if (ev.type === "model_start") {
            this.logger?.debug("model start", {
              channel: msg.channel,
              conversationKey: msg.conversationKey,
              iteration: ev.iteration,
              provider: ev.provider,
              modelId: ev.modelId,
            });
          } else if (ev.type === "model_done") {
            this.logger?.debug("model done", {
              channel: msg.channel,
              conversationKey: msg.conversationKey,
              iteration: ev.iteration,
              reason: ev.reason,
            });
          } else if (ev.type === "tool_execute_start") {
            this.logger?.info("tool start", {
              channel: msg.channel,
              conversationKey: msg.conversationKey,
              tool: ev.toolName,
              toolCallId: ev.toolCallId,
              iteration: ev.iteration,
              arguments: ev.arguments,
            });
          } else if (ev.type === "tool_execute_end") {
            this.logger?.info("tool end", {
              channel: msg.channel,
              conversationKey: msg.conversationKey,
              tool: ev.toolName,
              durationMs: ev.durationMs,
              isError: ev.isError,
            });
          } else if (ev.type === "error") {
            this.logger?.warn("agent loop error", {
              channel: msg.channel,
              conversationKey: msg.conversationKey,
              message: ev.message,
            });
          }
        },
      });

      await this.sessionStore.appendMany(msg.conversationPathParts, appendedMessages as any, {
        runId,
        channel: msg.channel,
        conversationKey: msg.conversationKey,
      });

      if (assistantText) {
        if (this.runtime.hooks.enabled) {
          await this.runtime.hooks.emit({
            name: "gateway.outbound.send",
            timestampMs: Date.now(),
            workspaceRoot: this.runtime.workspaceRoot,
            scope: "gateway",
            runId,
            channel: msg.channel,
            conversationKey: msg.conversationKey,
            data: { textLen: assistantText.length, attachments: 0 },
          });
        }
        await this.send({ conversationKey: msg.conversationKey, text: assistantText });
        if (this.runtime.hooks.enabled) {
          await this.runtime.hooks.emit({
            name: "gateway.outbound.sent",
            timestampMs: Date.now(),
            workspaceRoot: this.runtime.workspaceRoot,
            scope: "gateway",
            runId,
            channel: msg.channel,
            conversationKey: msg.conversationKey,
            data: { textLen: assistantText.length, attachments: 0 },
          });
        }
      } else {
        this.logger?.warn("assistant produced no text", {
          channel: msg.channel,
          conversationKey: msg.conversationKey,
        });
      }

      if (Array.isArray(outboundMessages) && outboundMessages.length > 0) {
        for (const out of outboundMessages) {
          if (!out) continue;
          // Enforce conversation key to avoid cross-chat sends.
          const text = String((out as any)?.text ?? "");
          const attachments = Array.isArray((out as any)?.attachments) ? (out as any).attachments : undefined;
          if (this.runtime.hooks.enabled) {
            await this.runtime.hooks.emit({
              name: "gateway.outbound.send",
              timestampMs: Date.now(),
              workspaceRoot: this.runtime.workspaceRoot,
              scope: "gateway",
              runId,
              channel: msg.channel,
              conversationKey: msg.conversationKey,
              data: { textLen: text.length, attachments: Array.isArray(attachments) ? attachments.length : 0 },
            });
          }
          await this.send({
            conversationKey: msg.conversationKey,
            text,
            attachments,
          });
          if (this.runtime.hooks.enabled) {
            await this.runtime.hooks.emit({
              name: "gateway.outbound.sent",
              timestampMs: Date.now(),
              workspaceRoot: this.runtime.workspaceRoot,
              scope: "gateway",
              runId,
              channel: msg.channel,
              conversationKey: msg.conversationKey,
              data: { textLen: text.length, attachments: Array.isArray(attachments) ? attachments.length : 0 },
            });
          }
        }
      }
      if (this.runtime.hooks.enabled) {
        await this.runtime.hooks.emit({
          name: "gateway.inbound.processed",
          timestampMs: Date.now(),
          workspaceRoot: this.runtime.workspaceRoot,
          scope: "gateway",
          runId,
          channel: msg.channel,
          conversationKey: msg.conversationKey,
          data: { durationMs: Math.max(0, Date.now() - t0) },
        });
      }
    } catch (e) {
      if (this.runtime.hooks.enabled) {
        await this.runtime.hooks.emit({
          name: "gateway.inbound.error",
          timestampMs: Date.now(),
          workspaceRoot: this.runtime.workspaceRoot,
          scope: "gateway",
          runId,
          channel: msg.channel,
          conversationKey: msg.conversationKey,
          data: { error: e instanceof Error ? e.message : String(e) },
        });
      }
      this.logger?.errorWith("failed to process inbound", e, {
        channel: msg.channel,
        conversationKey: msg.conversationKey,
      });
      // Best-effort user-facing signal.
      try {
        if (this.runtime.hooks.enabled) {
          await this.runtime.hooks.emit({
            name: "gateway.outbound.error",
            timestampMs: Date.now(),
            workspaceRoot: this.runtime.workspaceRoot,
            scope: "gateway",
            runId,
            channel: msg.channel,
            conversationKey: msg.conversationKey,
            data: { reason: "processing_failed" },
          });
        }
        await this.send({
          conversationKey: msg.conversationKey,
          text: "Internal error while processing your message. Please check gateway logs.",
        });
      } catch (sendErr) {
        this.logger?.errorWith("failed to send error message", sendErr, {
          channel: msg.channel,
          conversationKey: msg.conversationKey,
        });
      }
    } finally {
      this.logger?.info("inbound done", {
        channel: msg.channel,
        conversationKey: msg.conversationKey,
        durationMs: Math.max(0, Date.now() - t0),
      });
    }
  }
}

