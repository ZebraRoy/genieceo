import { z } from 'zod';
import type { Tool } from '../types';

/**
 * Spawn Subagent Tool
 * Creates a background agent for complex tasks
 * Implementation will be completed by SubagentManager
 */
export const spawnSubagentTool: Tool = {
  name: 'spawnSubagent',
  description: 'Spawn a background subagent to handle a complex task independently. The subagent will work on the task and report back when complete. Use this for tasks that can be done in parallel or require focused attention.',
  parameters: z.object({
    task: z.string().describe('Clear description of the task for the subagent to complete'),
    context: z.string().optional().describe('Additional context or information the subagent needs'),
  }),
  execute: async (params: { task: string; context?: string }) => {
    // This will be implemented by SubagentManager
    // For now, return a placeholder
    throw new Error('spawnSubagent tool needs to be initialized with SubagentManager');
  },
};
