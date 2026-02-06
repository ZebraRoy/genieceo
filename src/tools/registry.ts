import type { Tool } from "@mariozechner/pi-ai";

export type ToolHandler = (args: any) => Promise<string>;

export class ToolRegistry {
  private tools = new Map<string, { tool: Tool; handler: ToolHandler }>();

  register(tool: Tool, handler: ToolHandler): void {
    this.tools.set(tool.name, { tool, handler });
  }

  list(): Tool[] {
    return Array.from(this.tools.values()).map((t) => t.tool);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  async execute(name: string, args: any): Promise<string> {
    const entry = this.tools.get(name);
    if (!entry) return `Error: unknown tool '${name}'`;
    try {
      return await entry.handler(args ?? {});
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : String(e);
      return `Error executing '${name}': ${msg}`;
    }
  }
}

