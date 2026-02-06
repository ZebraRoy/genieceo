import type { Message } from "@mariozechner/pi-ai";

import { createAgentRuntime, runAgentTurn } from "../agent/runner.js";
import type { AgentRuntime } from "../agent/runner.js";
import type { InboundMessage } from "../plugins/types.js";
import { JsonlSessionStore } from "./session-store.js";

type SendFn = (opts: { conversationKey: string; text: string }) => Promise<void>;

/**
 * Serializes processing per conversationKey, loads/persists JSONL sessions,
 * and runs the existing GenieCEO agent loop to produce replies.
 */
export class GatewayMessageRouter {
  private locks = new Map<string, Promise<void>>();
  private sessionStore: JsonlSessionStore;

  constructor(private runtime: AgentRuntime, private send: SendFn) {
    this.sessionStore = new JsonlSessionStore(runtime.workspaceRoot);
  }

  static async create(opts: { workspaceRoot: string; invocationCwd?: string; send: SendFn }): Promise<GatewayMessageRouter> {
    const runtime = await createAgentRuntime({ workspaceRoot: opts.workspaceRoot, invocationCwd: opts.invocationCwd });
    return new GatewayMessageRouter(runtime, opts.send);
  }

  async emitInbound(msg: InboundMessage): Promise<void> {
    const prev = this.locks.get(msg.conversationKey) ?? Promise.resolve();
    const next = prev
      .catch(() => {
        // Swallow previous errors so the queue continues.
      })
      .then(() => this.processInbound(msg))
      .finally(() => {
        // Only clear if we are still the tail promise.
        if (this.locks.get(msg.conversationKey) === next) this.locks.delete(msg.conversationKey);
      });

    this.locks.set(msg.conversationKey, next);
    await next;
  }

  private async processInbound(msg: InboundMessage): Promise<void> {
    const messages: Message[] = await this.sessionStore.load(msg.conversationPathParts, { maxLines: 2000 });

    const { assistantText, appendedMessages } = await runAgentTurn({
      runtime: this.runtime,
      messages,
      userText: msg.text,
    });

    await this.sessionStore.appendMany(msg.conversationPathParts, appendedMessages as any);

    if (assistantText) {
      await this.send({ conversationKey: msg.conversationKey, text: assistantText });
    }
  }
}

