import { join } from 'path';
import type { Config } from '../types';
import { ToolRegistry } from '../tools/base';
import { readFileTool, writeFileTool, listDirTool } from '../tools/filesystem';
import { createExecuteCommandTool } from '../tools/shell';
import { createWebSearchTool } from '../tools/web';
import { spawnSubagentTool } from '../tools/spawn';
import { SkillLoader } from '../skills/loader';
import { AgentLoop } from './loop';
import { SubagentManager } from './subagent';

/**
 * Initialize and create an agent instance with all tools and skills
 */
export async function createAgent(config: Config): Promise<AgentLoop> {
  // Initialize tool registry
  const toolRegistry = new ToolRegistry();

  // Register filesystem tools
  toolRegistry.register(readFileTool);
  toolRegistry.register(writeFileTool);
  toolRegistry.register(listDirTool);

  // Register shell tool (config-dependent)
  toolRegistry.register(createExecuteCommandTool(config));

  // Register web search tool (config-dependent)
  toolRegistry.register(createWebSearchTool(config));

  // Initialize skill loader
  const builtinSkillsPath = join(__dirname, '..', 'skills', 'builtin');
  const workspaceSkillsPath = join(config.workspace, 'skills');
  const skillLoader = new SkillLoader(builtinSkillsPath, workspaceSkillsPath);

  // Load skills
  await skillLoader.loadSkills();

  // Initialize subagent manager
  const subagentManager = new SubagentManager(config, toolRegistry, skillLoader);

  // Register spawn tool with subagent manager
  const spawnTool = {
    ...spawnSubagentTool,
    execute: async (params: { task: string; context?: string }) => {
      return await subagentManager.spawn(params.task, params.context);
    },
  };
  toolRegistry.register(spawnTool);

  // Create agent loop
  const agent = new AgentLoop(config, toolRegistry, skillLoader);

  return agent;
}

export { AgentLoop } from './loop';
export { SubagentManager } from './subagent';
export { ContextBuilder } from './context';
