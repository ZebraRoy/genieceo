import {
  complete,
  getModel,
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

export class LlmConfigError extends Error {
  name = "LlmConfigError";
}

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
}): Promise<AssistantMessage> {
  const maxIterations = opts.maxIterations ?? 20;

  opts.context.tools = opts.tools;

  for (let i = 0; i < maxIterations; i++) {
    const assistant = await complete(opts.model, opts.context, {
      apiKey: opts.apiKey,
    });
    opts.context.messages.push(assistant);

    const toolCalls = assistant.content.filter((b): b is ToolCall => b.type === "toolCall");
    if (toolCalls.length === 0) return assistant;

    for (const call of toolCalls) {
      let validatedArgs: any = call.arguments;
      try {
        validatedArgs = validateToolCall(opts.tools, call);
      } catch (e: any) {
        const msg = e?.message ? String(e.message) : String(e);
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

      const resultText = await opts.registry.execute(call.name, validatedArgs);
      const isError = resultText.startsWith("Error:");

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

  throw new Error(`Max tool iterations reached (${maxIterations}).`);
}

