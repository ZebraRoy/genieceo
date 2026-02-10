import type { GenieCeoConfig } from "../config/schema.js";
import type { ToolExecutionContext } from "./types.js";
import { ToolRegistry } from "./registry.js";
import { registerFileTools } from "./builtin/files.js";
import { registerChannelTools } from "./builtin/channel.js";
import { registerShellTools } from "./builtin/shell.js";
import { registerServiceTools } from "./builtin/services.js";
import { registerWebTools } from "./builtin/web.js";
import { registerSubagentTools } from "./builtin/subagents.js";
import { registerAudioTools } from "./builtin/audio.js";

export function createToolRegistry(ctx: ToolExecutionContext): ToolRegistry {
  const reg = new ToolRegistry();
  registerFileTools(reg, ctx);
  registerWebTools(reg, ctx);
  registerShellTools(reg, ctx);
  registerServiceTools(reg, ctx);
  registerChannelTools(reg, ctx);
  registerAudioTools(reg, ctx);
  registerSubagentTools(reg, ctx);
  return reg;
}

export type ToolCallLike = {
  id: string;
  name: string;
  arguments: any;
};

export async function executeToolCall(registry: ToolRegistry, call: ToolCallLike): Promise<string> {
  return await registry.execute(call.name, call.arguments);
}

