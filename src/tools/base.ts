import { z } from 'zod';
import { tool as createVercelTool } from 'ai';
import type { Tool as ToolType } from '../types';

/**
 * Tool Registry
 * Central registry for all tools with conversion to Vercel AI SDK format
 */

export class ToolRegistry {
  private tools: Map<string, ToolType> = new Map();

  /**
   * Register a tool
   */
  register(tool: ToolType): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): void {
    this.tools.delete(name);
  }

  /**
   * Get a tool by name
   */
  get(name: string): ToolType | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  getAll(): ToolType[] {
    return Array.from(this.tools.values());
  }

  /**
   * Execute a tool by name
   */
  async execute(name: string, params: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    try {
      // Validate parameters with Zod schema
      const validatedParams = tool.parameters.parse(params);
      return await tool.execute(validatedParams);
    } catch (error) {
      throw new Error(`Tool execution failed for ${name}: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Convert to Vercel AI SDK tool format
   */
  toVercelTools(): Record<string, any> {
    const vercelTools: Record<string, any> = {};

    for (const [name, tool] of this.tools) {
      vercelTools[name] = createVercelTool({
        description: tool.description,
        parameters: tool.parameters,
        execute: tool.execute,
      });
    }

    return vercelTools;
  }

  /**
   * Get list of tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }
}

// Global singleton registry
let registryInstance: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!registryInstance) {
    registryInstance = new ToolRegistry();
  }
  return registryInstance;
}
