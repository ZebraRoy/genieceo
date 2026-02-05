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
  const skillLoader = new SkillLoader(builtinSkillsPath, workspaceSkillsPath, config);

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

/**
 * Create GenieCEO agent with multi-agent system capabilities
 */
export async function createGenieCEOAgent(config: Config): Promise<AgentLoop> {
  // Import GenieCEO-specific modules
  const { GenieCEOMemoryStore } = await import('../memory/ceo');
  const { StaffDefinitionLoader } = await import('../memory/staff-loader');
  const { ContextManager } = await import('../memory/context-manager');
  const { DailyLogSystem } = await import('../memory/daily-log');
  const { LongTermMemory } = await import('../memory/long-term');
  const { LLMProvider } = await import('../providers/llm');
  const { ContextCompactionService } = await import('../memory/compaction');
  const { StaffManager } = await import('./staff/manager');
  const { ServiceManager } = await import('./service/manager');
  const { registerStaffTools } = await import('../tools/staff');
  const { registerServiceTools } = await import('../tools/service');
  const { registerMemoryTools } = await import('../tools/memory');

  // Initialize memory systems
  const ceoMemory = new GenieCEOMemoryStore(config.workspace);
  await ceoMemory.load();

  const staffLoader = new StaffDefinitionLoader(config.workspace);
  await staffLoader.loadDefinitions();

  const contextManager = new ContextManager(config.workspace);
  await contextManager.ensureDirectories();

  const dailyLog = new DailyLogSystem(config.workspace);
  const longTermMemory = new LongTermMemory(config.workspace);

  const llmProvider = new LLMProvider(config);
  const compactionService = new ContextCompactionService(
    ceoMemory,
    contextManager,
    llmProvider
  );

  // Initialize tool registry
  const toolRegistry = new ToolRegistry();

  // Register standard tools
  toolRegistry.register(readFileTool);
  toolRegistry.register(writeFileTool);
  toolRegistry.register(listDirTool);
  toolRegistry.register(createExecuteCommandTool(config));
  toolRegistry.register(createWebSearchTool(config));

  // Initialize skill loader
  const builtinSkillsPath = join(__dirname, '..', 'skills', 'builtin');
  const workspaceSkillsPath = join(config.workspace, 'skills');
  const skillLoader = new SkillLoader(builtinSkillsPath, workspaceSkillsPath, config);
  await skillLoader.loadSkills();

  // Create staff manager
  const staffManager = new StaffManager(
    staffLoader,
    ceoMemory,
    contextManager,
    dailyLog,
    compactionService,
    config,
    toolRegistry,
    skillLoader
  );

  // Create service manager
  const serviceManager = new ServiceManager(
    ceoMemory,
    dailyLog,
    config.workspace
  );

  // Start service health monitoring
  serviceManager.startMonitoring(30000); // Every 30s

  // Register GenieCEO tools
  registerStaffTools(toolRegistry, staffManager, contextManager, ceoMemory, dailyLog);
  registerServiceTools(toolRegistry, serviceManager, dailyLog);
  registerMemoryTools(toolRegistry, ceoMemory, longTermMemory);

  // Build system prompt
  const staffList = staffLoader
    .getAllDefinitions()
    .map(d => `- **${d.name}**: ${d.description}`)
    .join('\n');
  
  const runningServices = serviceManager.getRunningServices();
  const servicesList = runningServices.length > 0
    ? runningServices.map(s => `- ${s.name} (${s.id}): ${s.type} on port ${s.port || 'N/A'}`).join('\n')
    : '(None)';

  const budget = ceoMemory.getContextBudget();

  const systemPrompt = `# You are GenieCEO

An empowered multi-agent system that analyzes, builds, and runs applications.

## Context Engineering

**Your goal**: Keep your context clean (<50K tokens) while accomplishing complex tasks.

**How**: Delegate deep work to staff. They return ~2K summaries. Detailed work stays in files.

**Example**: Staff reads 80K tokens of code → returns 2K summary → you get 40x context savings

## Your Staff

${staffList || '(No staff defined - create as needed with defineStaff)'}

**Staff are flexible**: Create whatever you need - api-builder, debugger, security-auditor, deployer, etc.

## Service Management

**You can create and run applications**:
- Build web servers, APIs, webhooks, daemons
- Start them with startService (they keep running)
- Monitor health, view logs, restart if crashed
- Manage multiple services simultaneously

**Running Services (${runningServices.length})**:
${servicesList}

## Workflow

**For complex tasks**:
1. Define or spawn staff to handle deep work
2. Wait for completion (get ~2K summary)
3. Read plan files if you need full details
4. If building applications, use startService to run them
5. Curate learnings to long-term memory

**For simple tasks**:
- Handle directly (no staff overhead needed)

**Token Budget**: ${budget.genieCEOCurrentTokens} / ${budget.genieCEOMaxTokens}
- Check with: viewContextBudget
- Auto-compaction at 45K tokens

## Available Tools

**Staff Management**:
- defineStaff: Create new staff (api-builder, debugger, etc.)
- spawnStaff: Start staff on task
- waitForStaff: Get completion summary
- checkStaffStatus, listStaffTypes
- readStaffPlan: Read detailed findings

**Service Management**:
- startService: Run web servers, APIs, webhooks, daemons
- stopService, restartService
- listServices, checkServiceHealth
- viewServiceLogs: Debug services

**Memory**:
- remember/recall: Working memory (use sparingly)
- curateMemory: Save to long-term
- readLongTermMemory, searchMemory

**Standard**: readFile, writeFile, listDir, executeCommand, webSearch, etc.

## Guidelines

1. **Delegate deep work** - Staff keep your context clean
2. **Read plan files** - Get full details when summaries need more depth
3. **Build applications** - Use staff + services together
4. **Monitor services** - Check health, view logs regularly
5. **Handle simple tasks directly** - Use your tools for straightforward work
6. **Curate patterns** - Save learnings to long-term memory`;

  // Create agent loop with custom hooks
  const agent = new AgentLoop(config, toolRegistry, skillLoader);

  // Override system prompt
  (agent as any).systemPrompt = systemPrompt;

  // Add cleanup hook
  const originalRun = agent.run.bind(agent);
  agent.run = async function(userMessage: string) {
    try {
      const result = await originalRun(userMessage);
      
      // Save memory after each run
      await ceoMemory.save();

      // Auto-compact if needed
      if (ceoMemory.shouldCompact()) {
        console.log('\n⚠️  Context approaching limit, auto-compacting...');
        const messages = await ceoMemory.getRecentMessages(100);
        await compactionService.compactMessages(messages);
        ceoMemory.recordCompaction();
        console.log('✓ Context compacted\n');
      }

      return result;
    } catch (error) {
      await ceoMemory.save();
      throw error;
    }
  };

  // Add reference to managers for CLI access
  (agent as any).ceoMemory = ceoMemory;
  (agent as any).serviceManager = serviceManager;
  (agent as any).staffManager = staffManager;

  return agent;
}

export { AgentLoop } from './loop';
export { SubagentManager } from './subagent';
export { ContextBuilder } from './context';
