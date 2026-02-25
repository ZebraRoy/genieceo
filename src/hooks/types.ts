import type { AgentLoopEvent } from "../llm/pi-ai-adapter.js";

export type HookScope = "agent" | "subagent" | "memory_flush" | "gateway" | "system";

export type HookEventBase = {
  name: string;
  timestampMs: number;
  workspaceRoot: string;
  scope: HookScope;
  runId?: string;
  channel?: string;
  conversationKey?: string;
};

export type SubagentMetadata = {
  name: string;
  profileUsed?: string;
  parentToolCallId?: string;
};

export type ToolExecutionMetadata = {
  workspaceRoot?: string;
  runId?: string;
  scope?: HookScope;
  channel?: string;
  conversationKey?: string;
  iteration?: number;
  toolCallId?: string;
  subagent?: SubagentMetadata;
};

export type AgentLoopHookEvent = HookEventBase & {
  name: `agent.loop.${AgentLoopEvent["type"]}`;
  scope: "agent";
  data: { event: AgentLoopEvent };
};

export type SubagentLoopHookEvent = HookEventBase & {
  name: `subagent.loop.${AgentLoopEvent["type"]}`;
  scope: "subagent";
  data: { event: AgentLoopEvent; subagent: SubagentMetadata };
};

export type ToolLifecycleBeforeEvent = HookEventBase & {
  name: "tool.execute.before";
  data: {
    toolName: string;
    args: any;
    metadata?: ToolExecutionMetadata;
  };
};

export type ToolLifecycleAfterEvent = HookEventBase & {
  name: "tool.execute.after";
  data: {
    toolName: string;
    args: any;
    result: string;
    metadata?: ToolExecutionMetadata;
  };
};

export type ToolLifecycleErrorEvent = HookEventBase & {
  name: "tool.execute.error";
  data: {
    toolName: string;
    args: any;
    errorMessage: string;
    metadata?: ToolExecutionMetadata;
  };
};

export type GatewayInboundEvent = HookEventBase & {
  name: "gateway.inbound.received" | "gateway.inbound.processed" | "gateway.inbound.error";
  scope: "gateway";
  data: Record<string, any>;
};

export type GatewayOutboundEvent = HookEventBase & {
  name: "gateway.outbound.send" | "gateway.outbound.sent" | "gateway.outbound.error";
  scope: "gateway";
  data: Record<string, any>;
};

export type SessionLifecycleEvent = HookEventBase & {
  name: "session.load" | "session.append" | "session.append_many" | "session.clear";
  scope: "gateway";
  data: Record<string, any>;
};

export type MemoryFlushEvent = HookEventBase & {
  name: "memory.flush.start" | "memory.flush.end" | "memory.flush.error" | "memory.flush.loop";
  scope: "memory_flush";
  data: Record<string, any>;
};

export type MemoryStoreEvent = HookEventBase & {
  name: "memory.store.read" | "memory.store.write";
  data: Record<string, any>;
};

export type ShellCommandEvent = HookEventBase & {
  name: "shell.command.start" | "shell.command.end" | "shell.command.error";
  data: Record<string, any>;
};

export type ServiceLifecycleEvent = HookEventBase & {
  name: "service.lifecycle.start" | "service.lifecycle.ensure" | "service.lifecycle.stop" | "service.lifecycle.error";
  data: Record<string, any>;
};

export type HookErrorEvent = HookEventBase & {
  name: "hook.error";
  data: {
    message: string;
    sourceEventName: string;
  };
};

export type GenieHookEvent =
  | AgentLoopHookEvent
  | SubagentLoopHookEvent
  | ToolLifecycleBeforeEvent
  | ToolLifecycleAfterEvent
  | ToolLifecycleErrorEvent
  | GatewayInboundEvent
  | GatewayOutboundEvent
  | SessionLifecycleEvent
  | MemoryFlushEvent
  | MemoryStoreEvent
  | ShellCommandEvent
  | ServiceLifecycleEvent
  | HookErrorEvent;

export type HookHandlerContext = {
  workspaceRoot: string;
};

export type GenieHookHandler = (event: GenieHookEvent, context: HookHandlerContext) => void | Promise<void>;

export type GenieHookModule =
  | GenieHookHandler
  | { onEvent: GenieHookHandler }
  | { createHookHandler: (ctx: HookHandlerContext) => GenieHookHandler | { onEvent: GenieHookHandler } | Array<GenieHookHandler | { onEvent: GenieHookHandler }> };
