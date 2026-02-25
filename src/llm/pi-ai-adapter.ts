import {
  complete,
  getModel,
  stream,
  validateToolCall,
  type AssistantMessage,
  type Context,
  type Model,
  type Tool,
  type ToolCall,
  type ToolResultMessage,
} from "@mariozechner/pi-ai";

import type { GenieCeoConfig, LlmProfile } from "../config/schema.js";
import type { ToolRegistry } from "../tools/registry.js";
import { getToolTurnContext } from "../tools/turn-context.js";

export class LlmConfigError extends Error {
  name = "LlmConfigError";
}

/**
 * Default tool-loop cap per turn.
 *
 * If undefined, the tool loop runs until the model stops emitting tool calls
 * (i.e. token/context limits become the practical bound).
 */
export const DEFAULT_MAX_TOOL_ITERATIONS: number | undefined = undefined;

export type AgentLoopEvent =
  | { type: "model_start"; iteration: number; provider: string; modelId: string }
  | { type: "model_text_start"; iteration: number; contentIndex: number }
  | { type: "model_text_delta"; iteration: number; contentIndex: number; delta: string }
  | { type: "model_text_end"; iteration: number; contentIndex: number; text: string }
  | { type: "model_toolcall_start"; iteration: number; contentIndex: number }
  | { type: "model_toolcall_end"; iteration: number; contentIndex: number; toolName: string; arguments: any }
  | { type: "model_done"; iteration: number; reason: string }
  | { type: "tool_execute_start"; iteration: number; toolName: string; toolCallId: string; arguments: any }
  | { type: "tool_execute_end"; iteration: number; toolName: string; toolCallId: string; durationMs: number; isError: boolean }
  | { type: "error"; iteration: number; message: string };

export function getActiveLlmProfile(config: GenieCeoConfig): { name: string; profile: LlmProfile } {
  const llm = config.llm;
  const active = llm.activeProfile;
  if (!active) {
    throw new LlmConfigError("No active LLM profile configured. Run `genieceo onboard`.");
  }
  const profile = llm.profiles?.[active];
  if (!profile) {
    throw new LlmConfigError(`Active LLM profile '${active}' not found. Run \`genieceo onboard\`.`);
  }
  return { name: active, profile };
}

export function getModelForProfile(profile: LlmProfile): Model<any> {
  const m = getModel(profile.provider as any, profile.model as any) as any;
  if (profile.apiBase) return { ...m, baseUrl: profile.apiBase };
  return m;
}

export async function completeWithToolLoop(opts: {
  apiKey?: string;
  model: Model<any>;
  context: Context;
  tools: Tool[];
  registry: ToolRegistry;
  maxIterations?: number;
  stream?: boolean;
  onEvent?: (event: AgentLoopEvent) => void;
}): Promise<AssistantMessage> {
  const maxIterations = opts.maxIterations ?? DEFAULT_MAX_TOOL_ITERATIONS;

  opts.context.tools = opts.tools;

  for (let i = 0; ; i++) {
    if (typeof maxIterations === "number" && i >= maxIterations) {
      throw new Error(`Max tool iterations reached (${maxIterations}).`);
    }
    opts.onEvent?.({
      type: "model_start",
      iteration: i,
      provider: String((opts.model as any)?.provider ?? ""),
      modelId: String((opts.model as any)?.id ?? ""),
    });

    const assistant = await (async (): Promise<AssistantMessage> => {
      if (!opts.stream) {
        return await complete(opts.model, opts.context, { apiKey: opts.apiKey });
      }

      const s = stream(opts.model, opts.context, { apiKey: opts.apiKey });
      for await (const ev of s as any) {
        try {
          if (ev?.type === "text_start") {
            opts.onEvent?.({ type: "model_text_start", iteration: i, contentIndex: Number(ev.contentIndex ?? -1) });
          } else if (ev?.type === "text_delta") {
            opts.onEvent?.({
              type: "model_text_delta",
              iteration: i,
              contentIndex: Number(ev.contentIndex ?? -1),
              delta: String(ev.delta ?? ""),
            });
          } else if (ev?.type === "text_end") {
            opts.onEvent?.({
              type: "model_text_end",
              iteration: i,
              contentIndex: Number(ev.contentIndex ?? -1),
              text: String(ev.content ?? ""),
            });
          } else if (ev?.type === "toolcall_start") {
            opts.onEvent?.({ type: "model_toolcall_start", iteration: i, contentIndex: Number(ev.contentIndex ?? -1) });
          } else if (ev?.type === "toolcall_end") {
            const toolCall = ev.toolCall;
            opts.onEvent?.({
              type: "model_toolcall_end",
              iteration: i,
              contentIndex: Number(ev.contentIndex ?? -1),
              toolName: String(toolCall?.name ?? ""),
              arguments: toolCall?.arguments ?? {},
            });
          } else if (ev?.type === "done") {
            opts.onEvent?.({ type: "model_done", iteration: i, reason: String(ev.reason ?? "") });
          } else if (ev?.type === "error") {
            const msg = ev?.error?.errorMessage ? String(ev.error.errorMessage) : String(ev?.error ?? ev);
            opts.onEvent?.({ type: "error", iteration: i, message: msg });
          }
        } catch {
          // best-effort only
        }
      }

      return await (s as any).result();
    })();
    opts.context.messages.push(assistant);

    const toolCalls = assistant.content.filter((b): b is ToolCall => b.type === "toolCall");
    if (toolCalls.length === 0) return assistant;

    for (const call of toolCalls) {
      let validatedArgs: any = call.arguments;
      try {
        validatedArgs = validateToolCall(opts.tools, call);
      } catch (e: any) {
        const msg = e?.message ? String(e.message) : String(e);
        opts.onEvent?.({ type: "error", iteration: i, message: `tool validation failed for '${call.name}': ${msg}` });
        const toolResult: ToolResultMessage = {
          role: "toolResult",
          toolCallId: call.id,
          toolName: call.name,
          content: [{ type: "text", text: msg }],
          isError: true,
          timestamp: Date.now(),
        };
        opts.context.messages.push(toolResult);
        continue;
      }

      opts.onEvent?.({
        type: "tool_execute_start",
        iteration: i,
        toolName: call.name,
        toolCallId: call.id,
        arguments: validatedArgs ?? {},
      });
      const t0 = Date.now();
      const turn = getToolTurnContext();
      const prevMeta = turn?.toolExecMeta;
      if (turn) {
        turn.toolExecMeta = {
          ...(prevMeta ?? {}),
          runId: turn.runId,
          scope: prevMeta?.scope ?? (turn ? "agent" : "system"),
          channel: turn.channel,
          conversationKey: turn.conversationKey,
          iteration: i,
          toolCallId: call.id,
          subagent: prevMeta?.subagent,
        };
      }
      const resultText = await (async () => {
        try {
          return await opts.registry.execute(call.name, validatedArgs, {
            runId: turn?.runId,
            scope: turn?.toolExecMeta?.scope ?? (turn ? "agent" : "system"),
            channel: turn?.channel,
            conversationKey: turn?.conversationKey,
            iteration: i,
            toolCallId: call.id,
            subagent: turn?.toolExecMeta?.subagent,
          });
        } finally {
          if (turn) turn.toolExecMeta = prevMeta;
        }
      })();
      const isError = resultText.startsWith("Error:");
      opts.onEvent?.({
        type: "tool_execute_end",
        iteration: i,
        toolName: call.name,
        toolCallId: call.id,
        durationMs: Math.max(0, Date.now() - t0),
        isError,
      });

      const toolResult: ToolResultMessage = {
        role: "toolResult",
        toolCallId: call.id,
        toolName: call.name,
        content: [{ type: "text", text: resultText }],
        isError,
        timestamp: Date.now(),
      };
      opts.context.messages.push(toolResult);
    }
  }
}

