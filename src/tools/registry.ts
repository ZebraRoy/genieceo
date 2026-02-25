import type { Tool } from "@mariozechner/pi-ai";
import type { HookRuntime } from "../hooks/runtime.js";
import type { ToolExecutionMetadata } from "../hooks/types.js";

export type ToolHandler = (args: any) => Promise<string>;

export class ToolRegistry {
  private tools = new Map<string, { tool: Tool; handler: ToolHandler }>();
  private hooks?: HookRuntime;
  private workspaceRoot: string;

  constructor(opts?: { workspaceRoot?: string }) {
    this.workspaceRoot = String(opts?.workspaceRoot ?? "");
  }

  setHooks(hooks: HookRuntime | undefined): void {
    this.hooks = hooks;
  }

  register(tool: Tool, handler: ToolHandler): void {
    this.tools.set(tool.name, { tool, handler });
  }

  list(): Tool[] {
    return Array.from(this.tools.values()).map((t) => t.tool);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  async execute(name: string, args: any, metadata?: ToolExecutionMetadata): Promise<string> {
    const entry = this.tools.get(name);
    if (!entry) return `Error: unknown tool '${name}'`;
    const scope: "agent" | "subagent" | "memory_flush" | "gateway" | "system" = metadata?.scope ?? "system";
    const runId = metadata?.runId;
    const channel = metadata?.channel;
    const conversationKey = metadata?.conversationKey;
    const workspaceRoot = metadata?.workspaceRoot ?? this.workspaceRoot;
    const runtime = this.hooks;

    if (runtime?.enabled) {
      await runtime.emit({
        name: "tool.execute.before",
        timestampMs: Date.now(),
        workspaceRoot,
        scope: scope as any,
        runId,
        channel,
        conversationKey,
        data: {
          toolName: name,
          args: args ?? {},
          metadata,
        },
      }).catch(() => {});
    }

    try {
      const out = await entry.handler(args ?? {});
      if (runtime?.enabled) {
        await runtime.emit({
          name: "tool.execute.after",
          timestampMs: Date.now(),
          workspaceRoot,
          scope: scope as any,
          runId,
          channel,
          conversationKey,
          data: {
            toolName: name,
            args: args ?? {},
            result: out,
            metadata,
          },
        }).catch(() => {});
      }
      return out;
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : String(e);
      if (runtime?.enabled) {
        await runtime.emit({
          name: "tool.execute.error",
          timestampMs: Date.now(),
          workspaceRoot,
          scope: scope as any,
          runId,
          channel,
          conversationKey,
          data: {
            toolName: name,
            args: args ?? {},
            errorMessage: msg,
            metadata,
          },
        }).catch(() => {});
      }
      return `Error executing '${name}': ${msg}`;
    }
  }
}

