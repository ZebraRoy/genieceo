import type { AssistantMessage, Context, Message, Model, Tool } from "@mariozechner/pi-ai";

import type { GenieCeoConfig } from "../config/schema.js";
import { loadConfig } from "../config/store.js";
import { completeWithToolLoop, DEFAULT_MAX_TOOL_ITERATIONS, getActiveLlmProfile, getModelForProfile } from "../llm/pi-ai-adapter.js";
import { createToolRegistry } from "../tools/index.js";
import type { ToolRegistry } from "../tools/registry.js";
import { loadSystemPrompt } from "../workspace/bootstrap.js";
import { getLogsDir, getServicesDir, getWorkspaceRoot } from "../workspace/paths.js";
import { defaultShellAllowedRoots, normalizeFileAccessMode } from "../tools/path-access.js";

export type AgentRuntime = {
  workspaceRoot: string;
  invocationCwd: string;
  config: GenieCeoConfig;
  profileName: string;
  provider: string;
  modelId: string;
  apiKey?: string;
  model: Model<any>;
  tools: Tool[];
  toolRegistry: ToolRegistry;
};

export type ConversationContext = {
  /**
   * The communication surface (e.g. "telegram", "discord", "line", "cli").
   */
  channel?: string;
};

export function renderAssistantText(msg: any): string {
  const parts = (msg?.content ?? []).filter((b: any) => b?.type === "text").map((b: any) => String(b.text ?? ""));
  return parts.join("").trim();
}

export async function createAgentRuntime(opts?: {
  workspaceRoot?: string;
  invocationCwd?: string;
}): Promise<AgentRuntime> {
  const workspaceRoot = opts?.workspaceRoot ?? getWorkspaceRoot();
  const invocationCwd = opts?.invocationCwd ?? process.cwd();

  const config = await loadConfig(workspaceRoot);
  const { name: profileName, profile } = getActiveLlmProfile(config);
  const model = getModelForProfile(profile);

  const toolRegistry = createToolRegistry({ workspaceRoot, invocationCwd, config });
  const tools = toolRegistry.list() as Tool[];

  return {
    workspaceRoot,
    invocationCwd,
    config,
    profileName,
    provider: profile.provider,
    modelId: profile.model,
    apiKey: profile.apiKey,
    model,
    tools,
    toolRegistry,
  };
}

function renderRuntimeContext(runtime: AgentRuntime): string {
  const fileAccessMode = normalizeFileAccessMode((runtime.config as any)?.execution?.fileAccessMode);
  const shellAccessMode = normalizeFileAccessMode((runtime.config as any)?.execution?.shellAccessMode);
  const shellEnabled = Boolean((runtime.config as any)?.execution?.shell?.enabled);
  const configuredShellRoots = Array.isArray((runtime.config as any)?.execution?.shell?.allowedRoots)
    ? ((runtime.config as any).execution.shell.allowedRoots as string[])
    : [];

  const effectiveShellRoots = defaultShellAllowedRoots({
    workspaceRoot: runtime.workspaceRoot,
    invocationCwd: runtime.invocationCwd,
    mode: shellAccessMode,
    configuredRoots: configuredShellRoots,
  });

  const lines = [
    "## RUNTIME_CONTEXT",
    "",
    "These facts describe the **actual** GenieCEO runtime for this conversation. Treat them as ground truth.",
    "",
    `- workspaceRoot: ${runtime.workspaceRoot}`,
    `- servicesDir: ${getServicesDir(runtime.workspaceRoot)}`,
    `- logsDir: ${getLogsDir(runtime.workspaceRoot)}`,
    `- invocationCwd (project scope base): ${runtime.invocationCwd}`,
    `- execution.fileAccessMode: ${fileAccessMode}`,
    `- execution.shell.enabled: ${shellEnabled ? "true" : "false"}`,
    `- execution.shellAccessMode: ${shellAccessMode}`,
    `- execution.shell.allowedRoots (configured): ${configuredShellRoots.length ? configuredShellRoots.join(", ") : "[empty]"}`,
    `- run_command allowed roots (effective): ${effectiveShellRoots.join(", ")}`,
    `- max tool-call iterations per turn: ${DEFAULT_MAX_TOOL_ITERATIONS}`,
    `- gateway reload behavior: no hot reload (plugin/config changes require gateway restart)`,
  ];

  return lines.join("\n");
}

function renderConversationContext(ctx?: ConversationContext): string {
  if (!ctx) return "";
  const channel = ctx.channel ? String(ctx.channel) : "";
  if (!channel) return "";

  const lines = [
    "## CHANNEL_CONTEXT",
    "",
    "These facts describe how the user is talking to you right now.",
    "",
    `- channel: ${channel}`,
  ].filter(Boolean);

  return lines.join("\n");
}

export async function runAgentTurn(opts: {
  runtime: AgentRuntime;
  messages: Message[];
  userText: string;
  nowMs?: number;
  conversation?: ConversationContext;
}): Promise<{ assistant: AssistantMessage; assistantText: string; appendedMessages: Message[] }> {
  const nowMs = typeof opts.nowMs === "number" ? opts.nowMs : Date.now();

  const baseSystemPrompt = await loadSystemPrompt(opts.runtime.workspaceRoot);
  const convo = renderConversationContext(opts.conversation);
  const systemPrompt = `${baseSystemPrompt}\n\n---\n\n${renderRuntimeContext(opts.runtime)}${convo ? `\n\n---\n\n${convo}` : ""}`;

  const context: Context = {
    systemPrompt,
    messages: opts.messages,
    tools: opts.runtime.tools,
  };

  const startLen = context.messages.length;
  const userMsg: Message = { role: "user", content: opts.userText, timestamp: nowMs } as any;
  context.messages.push(userMsg);

  // Refresh system prompt each turn (skills/templates may have changed on disk).
  const refreshedBase = await loadSystemPrompt(opts.runtime.workspaceRoot);
  const refreshedConvo = renderConversationContext(opts.conversation);
  context.systemPrompt = `${refreshedBase}\n\n---\n\n${renderRuntimeContext(opts.runtime)}${
    refreshedConvo ? `\n\n---\n\n${refreshedConvo}` : ""
  }`;

  const assistant = await completeWithToolLoop({
    apiKey: opts.runtime.apiKey,
    model: opts.runtime.model,
    context,
    tools: opts.runtime.tools,
    registry: opts.runtime.toolRegistry,
  });

  const appendedMessages = context.messages.slice(startLen) as any;
  const assistantText = renderAssistantText(assistant);
  return { assistant, assistantText, appendedMessages };
}

