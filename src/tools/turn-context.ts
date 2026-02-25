import { AsyncLocalStorage } from "node:async_hooks";

import type { OutboundMessage } from "../plugins/types.js";
import type { HookRuntime } from "../hooks/runtime.js";
import type { ToolExecutionMetadata } from "../hooks/types.js";

export type ToolTurnContext = {
  /**
   * If present, tools may queue outbound messages back to the user.
   * This is only set when running inside a message channel (gateway).
   */
  queueOutbound?: (msg: OutboundMessage) => void;
  /**
   * The current conversation key (e.g. "telegram:bot123:chat456").
   * Only set when running inside a message channel (gateway).
   */
  conversationKey?: string;
  /**
   * Channel identifier for the current surface (e.g. "telegram", "discord", "line", "cli").
   */
  channel?: string;
  /**
   * Optional hook runtime active for this turn.
   */
  hooks?: HookRuntime;
  /**
   * Logical run identifier for this turn.
   */
  runId?: string;
  /**
   * Optional execution metadata for the currently running tool.
   */
  toolExecMeta?: ToolExecutionMetadata;
};

const storage = new AsyncLocalStorage<ToolTurnContext>();

export function getToolTurnContext(): ToolTurnContext | undefined {
  return storage.getStore();
}

export async function runWithToolTurnContext<T>(
  ctx: ToolTurnContext,
  fn: () => Promise<T>,
): Promise<T> {
  return await storage.run(ctx, fn);
}

