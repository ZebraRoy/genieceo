import type { AssistantMessage, Context, Message, Model, Tool } from "@mariozechner/pi-ai";
import { readFile } from "node:fs/promises";
import path from "node:path";

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
import type { InboundAttachment } from "../plugins/types.js";

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
  const content = msg?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const b of content) {
      if (!b) continue;
      if (b.type === "text" && typeof b.text === "string") parts.push(b.text);
      else if (typeof (b as any).text === "string") parts.push(String((b as any).text));
    }
    return parts.join("").trim();
  }
  // Extremely defensive fallback.
  if (content && typeof content === "object" && typeof (content as any).text === "string") return String((content as any).text).trim();
  return "";
}

function guessImageMimeType(p: string): string {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "image/jpeg";
}

async function buildUserContent(opts: {
  runtime: AgentRuntime;
  userText: string;
  attachments?: InboundAttachment[];
}): Promise<{
  modelContent: string | Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;
  sessionText: string;
}> {
  const baseText = String(opts.userText ?? "").trim();
  const atts = Array.isArray(opts.attachments) ? opts.attachments : [];
  if (atts.length === 0) return { modelContent: baseText, sessionText: baseText };

  const lines: string[] = [];
  for (const a of atts) {
    const name = a.originalName ? ` (${a.originalName})` : "";
    const mt = a.mimeType ? ` ${a.mimeType}` : "";
    const sz = typeof a.sizeBytes === "number" ? ` ${a.sizeBytes}B` : "";
    if (a.path) lines.push(`- ${a.kind}${name}${mt}${sz}: ${a.path}`);
    else lines.push(`- ${a.kind}${name}${mt}${sz}: [not downloaded]`);
  }

  const sessionText = [baseText, "Attachments:", ...lines].filter(Boolean).join("\n");

  const modelInputs: string[] = Array.isArray((opts.runtime.model as any)?.input)
    ? ((opts.runtime.model as any).input as string[])
    : [];
  const supportsImages = modelInputs.includes("image");
  if (!supportsImages) return { modelContent: sessionText, sessionText };

  const maxImages = 4;
  const maxImageBytes =
    typeof (opts.runtime.config as any)?.llm?.maxImageBytes === "number"
      ? Math.floor((opts.runtime.config as any).llm.maxImageBytes)
      : 2 * 1024 * 1024; // 2MB per image

  const blocks: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [
    { type: "text", text: sessionText },
  ];

  let embedded = 0;
  for (const a of atts) {
    if (embedded >= maxImages) break;
    if (a.kind !== "image" || !a.path) continue;
    try {
      const buf = await readFile(a.path);
      if (buf.byteLength > maxImageBytes) continue;
      const mimeType = a.mimeType && a.mimeType.startsWith("image/") ? a.mimeType : guessImageMimeType(a.path);
      blocks.push({ type: "image", data: buf.toString("base64"), mimeType });
      embedded++;
    } catch {
      // best-effort only
    }
  }

  return { modelContent: blocks, sessionText };
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
  attachments?: InboundAttachment[];
  nowMs?: number;
  conversation?: ConversationContext;
  stream?: boolean;
  onEvent?: (event: AgentLoopEvent) => void;
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
  const { modelContent, sessionText } = await buildUserContent({
    runtime: opts.runtime,
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
  context.systemPrompt = `${refreshedBase}\n\n---\n\n${renderRuntimeContext(opts.runtime)}${
    refreshedConvo ? `\n\n---\n\n${refreshedConvo}` : ""
  }`;

  const assistant = await completeWithToolLoop({
    apiKey: opts.runtime.apiKey,
    model: opts.runtime.model,
    context,
    tools: opts.runtime.tools,
    registry: opts.runtime.toolRegistry,
    stream: Boolean(opts.stream),
    onEvent: opts.onEvent,
  });

  const appendedMessages = context.messages.slice(startLen) as any;
  if (appendedMessages.length > 0 && appendedMessages[0]?.role === "user") {
    appendedMessages[0] = userMsgForSession;
  }
  const assistantText = renderAssistantText(assistant);
  return { assistant, assistantText, appendedMessages };
}

