import type { AssistantMessage, Context, Message, Model, Tool } from "@mariozechner/pi-ai";

import type { GenieCeoConfig } from "../config/schema.js";
import { loadConfig } from "../config/store.js";
import {
  completeWithToolLoop,
  DEFAULT_MAX_TOOL_ITERATIONS,
  type AgentLoopEvent,
  getActiveLlmProfile,
  getModelForProfile,
} from "../llm/pi-ai-adapter.js";
import { createToolRegistry } from "../tools/index.js";
import type { ToolRegistry } from "../tools/registry.js";
import { loadSystemPrompt } from "../workspace/bootstrap.js";
import { getLogsDir, getServicesDir, getWorkspaceRoot } from "../workspace/paths.js";
import { defaultShellAllowedRoots, normalizeFileAccessMode } from "../tools/path-access.js";
import type { InboundAttachment, OutboundMessage } from "../plugins/types.js";
import { runWithToolTurnContext } from "../tools/turn-context.js";
import { buildUserContent } from "./user-content.js";
import { renderAssistantText } from "./render.js";

type MemoryFlushState = {
  lastFlushedAtMs: number;
  lastChars: number;
  lastMessages: number;
};

const memoryFlushState = new Map<string, MemoryFlushState>();

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

function estimateMessagesSize(messages: Message[]): { chars: number; messages: number } {
  let chars = 0;
  for (const m of messages) {
    try {
      chars += JSON.stringify(m ?? null).length;
    } catch {
      // best-effort only
    }
  }
  return { chars, messages: messages.length };
}

async function maybeRunMemoryFlush(opts: {
  runtime: AgentRuntime;
  messages: Message[];
  nowMs: number;
  conversationKey?: string;
  conversation?: ConversationContext;
}): Promise<void> {
  const cfg: any = (opts.runtime.config as any)?.memory?.flush ?? {};
  const enabled = cfg.enabled !== false;
  if (!enabled) return;

  const softThresholdChars =
    typeof cfg.softThresholdChars === "number" ? cfg.softThresholdChars : 120_000;
  const softThresholdMessages =
    typeof cfg.softThresholdMessages === "number" ? cfg.softThresholdMessages : 80;
  const deltaChars = typeof cfg.deltaChars === "number" ? cfg.deltaChars : 25_000;
  const deltaMessages = typeof cfg.deltaMessages === "number" ? cfg.deltaMessages : 20;
  const minIntervalMs = typeof cfg.minIntervalMs === "number" ? cfg.minIntervalMs : 5 * 60 * 1000;
  const maxToolIterations = typeof cfg.maxToolIterations === "number" ? cfg.maxToolIterations : 6;

  const stats = estimateMessagesSize(opts.messages);
  const shouldConsider = stats.chars >= softThresholdChars || stats.messages >= softThresholdMessages;
  if (!shouldConsider) return;

  const key = opts.conversationKey
    ? `conv:${String(opts.conversationKey)}`
    : `conv:${String(opts.conversation?.channel ?? "cli")}:no-key`;
  const prev = memoryFlushState.get(key);
  if (prev) {
    if (opts.nowMs - prev.lastFlushedAtMs < minIntervalMs) return;
    const grownEnough =
      stats.chars >= prev.lastChars + deltaChars || stats.messages >= prev.lastMessages + deltaMessages;
    if (!grownEnough) return;
  }

  // Only allow memory tools during the flush turn.
  const memoryTools = opts.runtime.tools.filter((t) => t.name.startsWith("memory_"));
  if (memoryTools.length === 0) return;

  const baseSystemPrompt = await loadSystemPrompt(opts.runtime.workspaceRoot);
  const convo = renderConversationContext(opts.conversation);
  const systemPrompt = `${baseSystemPrompt}\n\n---\n\n${renderRuntimeContext(opts.runtime, opts.nowMs)}${
    convo ? `\n\n---\n\n${convo}` : ""
  }\n\n---\n\n## MEMORY_FLUSH\n\nYou are running a **silent internal memory flush** (OpenClaw-style). The user must NOT see any output from this turn.\n\nYour job:\n- Write any durable facts/preferences/decisions worth keeping into memory using ONLY the memory tools.\n- Use \`memory_append\` with layer='long_term' for durable facts/preferences.\n- Use \`memory_append\` with layer='daily' for short-term notes for today.\n- If there is nothing to store, do NOT call any tool and respond with exactly: NO_REPLY\n\nHard rules:\n- Do not call any tool except: memory_append, memory_get, memory_list.\n- Do not send messages to the user.\n`;

  const ctx: Context = {
    systemPrompt,
    messages: opts.messages.slice(),
    tools: memoryTools,
  };
  ctx.messages.push({
    role: "user",
    content:
      "Session nearing compaction. Store durable memories now. If nothing to store, reply NO_REPLY.",
    timestamp: opts.nowMs,
  } as any);

  try {
    await runWithToolTurnContext(
      { channel: opts.conversation?.channel ? String(opts.conversation.channel) : undefined, conversationKey: opts.conversationKey ? String(opts.conversationKey) : undefined },
      async () => {
        await completeWithToolLoop({
          apiKey: opts.runtime.apiKey,
          model: opts.runtime.model,
          context: ctx,
          tools: memoryTools,
          registry: opts.runtime.toolRegistry,
          stream: false,
          maxIterations: maxToolIterations,
        });
      },
    );
  } catch {
    // Best-effort only; never fail the user turn due to flush.
  } finally {
    memoryFlushState.set(key, {
      lastFlushedAtMs: opts.nowMs,
      lastChars: stats.chars,
      lastMessages: stats.messages,
    });
  }
}

function renderRuntimeContext(runtime: AgentRuntime, nowMs: number): string {
  const nowIsoUtc = new Date(nowMs).toISOString();
  const todayUtc = nowIsoUtc.slice(0, 10);
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

  const maxToolIterationsText = typeof DEFAULT_MAX_TOOL_ITERATIONS === "number" ? String(DEFAULT_MAX_TOOL_ITERATIONS) : "unlimited";
  const lines = [
    "## RUNTIME_CONTEXT",
    "",
    "These facts describe the **actual** GenieCEO runtime for this conversation. Treat them as ground truth.",
    "",
    `- nowUtc: ${nowIsoUtc}`,
    `- todayUtc: ${todayUtc}`,
    `- timezone: UTC`,
    `- workspaceRoot: ${runtime.workspaceRoot}`,
    `- servicesDir: ${getServicesDir(runtime.workspaceRoot)}`,
    `- logsDir: ${getLogsDir(runtime.workspaceRoot)}`,
    `- invocationCwd (project scope base): ${runtime.invocationCwd}`,
    `- execution.fileAccessMode: ${fileAccessMode}`,
    `- execution.shell.enabled: ${shellEnabled ? "true" : "false"}`,
    `- execution.shellAccessMode: ${shellAccessMode}`,
    `- execution.shell.allowedRoots (configured): ${configuredShellRoots.length ? configuredShellRoots.join(", ") : "[empty]"}`,
    `- run_command allowed roots (effective): ${effectiveShellRoots.join(", ")}`,
    `- max tool-call iterations per turn: ${maxToolIterationsText}`,
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
  attachments?: InboundAttachment[];
  nowMs?: number;
  /**
   * Stable conversation key (only present when running via gateway/message channels).
   */
  conversationKey?: string;
  conversation?: ConversationContext;
  stream?: boolean;
  onEvent?: (event: AgentLoopEvent) => void;
}): Promise<{ assistant: AssistantMessage; assistantText: string; appendedMessages: Message[]; outboundMessages: OutboundMessage[] }> {
  const nowMs = typeof opts.nowMs === "number" ? opts.nowMs : Date.now();

  // OpenClaw-style pre-compaction memory flush: silent internal turn.
  await maybeRunMemoryFlush({
    runtime: opts.runtime,
    messages: opts.messages,
    nowMs,
    conversationKey: opts.conversationKey,
    conversation: opts.conversation,
  });

  const baseSystemPrompt = await loadSystemPrompt(opts.runtime.workspaceRoot);
  const convo = renderConversationContext(opts.conversation);
  const systemPrompt = `${baseSystemPrompt}\n\n---\n\n${renderRuntimeContext(opts.runtime, nowMs)}${convo ? `\n\n---\n\n${convo}` : ""}`;

  const context: Context = {
    systemPrompt,
    messages: opts.messages,
    tools: opts.runtime.tools,
  };

  const startLen = context.messages.length;
  const { modelContent, sessionText } = await buildUserContent({
    model: opts.runtime.model,
    config: opts.runtime.config,
    userText: opts.userText,
    attachments: opts.attachments,
  });

  // Push multimodal content for the model, but persist a text-only representation in sessions.
  const userMsgForModel: Message = { role: "user", content: modelContent as any, timestamp: nowMs } as any;
  const userMsgForSession: Message = { role: "user", content: sessionText, timestamp: nowMs } as any;
  context.messages.push(userMsgForModel);

  // Refresh system prompt each turn (skills/templates may have changed on disk).
  const refreshedBase = await loadSystemPrompt(opts.runtime.workspaceRoot);
  const refreshedConvo = renderConversationContext(opts.conversation);
  context.systemPrompt = `${refreshedBase}\n\n---\n\n${renderRuntimeContext(opts.runtime, nowMs)}${
    refreshedConvo ? `\n\n---\n\n${refreshedConvo}` : ""
  }`;

  const outboundMessages: OutboundMessage[] = [];
  const turnCtx: Parameters<typeof runWithToolTurnContext>[0] = {
    channel: opts.conversation?.channel ? String(opts.conversation.channel) : undefined,
  };
  if (opts.conversationKey) {
    turnCtx.conversationKey = String(opts.conversationKey);
    turnCtx.queueOutbound = (m) => outboundMessages.push(m);
  }

  const assistant = await runWithToolTurnContext(turnCtx, async () => {
    return await completeWithToolLoop({
      apiKey: opts.runtime.apiKey,
      model: opts.runtime.model,
      context,
      tools: opts.runtime.tools,
      registry: opts.runtime.toolRegistry,
      stream: Boolean(opts.stream),
      onEvent: opts.onEvent,
    });
  });

  const appendedMessages = context.messages.slice(startLen) as any;
  if (appendedMessages.length > 0 && appendedMessages[0]?.role === "user") {
    appendedMessages[0] = userMsgForSession;
  }
  const assistantText = renderAssistantText(assistant);
  return { assistant, assistantText, appendedMessages, outboundMessages };
}

