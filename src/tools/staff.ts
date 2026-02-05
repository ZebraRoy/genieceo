/**
 * Staff Management Tools
 * Tools for defining, spawning, and managing staff
 */

import { z } from 'zod';
import { ToolRegistry } from './base';
import { StaffManager } from '../agent/staff/manager';
import { ContextManager } from '../memory/context-manager';
import { GenieCEOMemoryStore } from '../memory/ceo';
import { DailyLogSystem } from '../memory/daily-log';

export function registerStaffTools(
  registry: ToolRegistry,
  staffManager: StaffManager,
  contextManager: ContextManager,
  ceoMemory: GenieCEOMemoryStore,
  dailyLog: DailyLogSystem
) {
  // Define staff
  registry.register({
    name: 'defineStaff',
    description: 'Define a new staff type. Staff can be anything: api-builder, debugger, security-auditor, deployer, etc. No rigid roles - define based on actual needs.',
    parameters: z.object({
      name: z.string().describe('Staff name (lowercase-with-hyphens, e.g., "api-builder")'),
      description: z
        .string()
        .max(800)
        .describe('Brief description under 200 tokens. GenieCEO reads this when choosing staff.'),
      prompt: z.string().describe('Full system prompt for this staff member'),
      model: z.string().optional().describe('"fast" | "inherit" | specific model'),
      allowedTools: z.array(z.string()).optional().describe('Tool restrictions'),
      readonly: z.boolean().optional().describe('Prevent writes (for analysis-only staff)'),
    }),
    async execute(params) {
      if (params.description.length > 800) {
        return `❌ Description too long (${params.description.length} chars). Keep under 200 tokens (~800 chars) for better performance.`;
      }

      // Validate name format
      if (!/^[a-z0-9-]+$/.test(params.name)) {
        return '❌ Staff name must be lowercase with hyphens only (e.g., "api-builder")';
      }

      const definition = {
        name: params.name,
        description: params.description,
        prompt: params.prompt,
        model: params.model || 'inherit',
        allowedTools: params.allowedTools,
        readonly: params.readonly,
        maxSummaryTokens: 2000,
        savePlanFile: true,
      };

      await staffManager.defineStaff(definition);

      return `✓ Staff "${params.name}" defined successfully

You can now spawn this staff with:
spawnStaff({ staffName: "${params.name}", task: "..." })

Remember: Staff return condensed summaries (~2K tokens) and save detailed work to plan files.`;
    },
  });

  // Spawn staff
  registry.register({
    name: 'spawnStaff',
    description: 'Spawn a staff member to work on a task. Staff will return a condensed summary while saving detailed work to plan files.',
    parameters: z.object({
      staffName: z.string().describe('Staff name (e.g., "api-builder")'),
      task: z.string().describe('Task description'),
      readPlans: z
        .array(z.string())
        .optional()
        .describe('Plan files to read (e.g., ["api-builder", "debugger"])'),
      contextHints: z.string().optional().describe('Additional context for the staff'),
    }),
    async execute(params) {
      const def = staffManager.getStaffDefinition(params.staffName);
      
      if (!def) {
        const available = staffManager
          .getAllStaffDefinitions()
          .map(d => `- ${d.name}: ${d.description}`)
          .join('\n');
        
        return `❌ Staff "${params.staffName}" not defined.

Available staff:
${available || '(None defined yet. Use defineStaff to create one.)'}`;
      }

      // Check if already working
      if (staffManager.isStaffWorking(params.staffName)) {
        return `❌ Staff "${params.staffName}" is already working on a task. Wait for completion or use a different staff member.`;
      }

      try {
        const process = await staffManager.spawnStaff(params.staffName, params.task, {
          readPlanFiles: params.readPlans,
          contextHints: params.contextHints,
        });

        return `✓ Spawned "${params.staffName}" successfully

Process ID: ${process.id}
Status: ${process.status}
Task: ${params.task.slice(0, 100)}${params.task.length > 100 ? '...' : ''}

Staff is now working. Use waitForStaff to get the result when complete.`;
      } catch (error) {
        return `❌ Failed to spawn staff: ${error instanceof Error ? error.message : error}`;
      }
    },
  });

  // Wait for staff completion
  registry.register({
    name: 'waitForStaff',
    description: 'Wait for a staff member to complete their task and get the condensed summary result.',
    parameters: z.object({
      processId: z.string().describe('Staff process ID'),
      timeoutSeconds: z.number().optional().describe('Timeout in seconds (default: 300)'),
    }),
    async execute(params) {
      try {
        const timeoutMs = (params.timeoutSeconds || 300) * 1000;
        const result = await staffManager.waitForCompletion(params.processId, timeoutMs);

        await dailyLog.log({
          timestamp: new Date(),
          type: 'task_result',
          actor: params.processId,
          content: result.slice(0, 200) + (result.length > 200 ? '...' : ''),
        });

        return result;
        
      } catch (error) {
        return `❌ Error: ${error instanceof Error ? error.message : error}`;
      }
    },
  });

  // Check staff status
  registry.register({
    name: 'checkStaffStatus',
    description: 'Check the status of active staff processes',
    parameters: z.object({
      processId: z.string().optional().describe('Specific process ID (optional)'),
    }),
    async execute(params) {
      if (params.processId) {
        const process = ceoMemory.getProcess(params.processId);
        
        if (!process) {
          return `❌ No process found: ${params.processId}`;
        }

        return `# Process: ${process.id}

**Staff**: ${process.staffName}
**Status**: ${process.status}
**Task**: ${process.task}
**Spawned**: ${process.spawnedAt.toISOString()}
${process.completedAt ? `**Completed**: ${process.completedAt.toISOString()}` : ''}
${process.summaryTokens ? `**Summary Tokens**: ${process.summaryTokens}` : ''}
${process.planFilePath ? `**Plan File**: ${process.planFilePath}` : ''}

${process.result ? `**Result**:\n${process.result}` : ''}
${process.error ? `**Error**:\n${process.error}` : ''}`;
      }

      // List all active processes
      const processes = ceoMemory.getActiveProcesses();
      
      if (processes.length === 0) {
        return 'No active staff processes';
      }

      const lines = processes.map(p => {
        const status = p.status === 'completed' ? '✓' : p.status === 'failed' ? '❌' : '⏳';
        return `${status} ${p.id} (${p.staffName}): ${p.status}
   Task: ${p.task.slice(0, 60)}${p.task.length > 60 ? '...' : ''}
   Spawned: ${p.spawnedAt.toISOString()}`;
      });

      return `# Active Staff Processes (${processes.length})\n\n${lines.join('\n\n')}`;
    },
  });

  // List staff types
  registry.register({
    name: 'listStaffTypes',
    description: 'List all defined staff types',
    parameters: z.object({}),
    async execute() {
      const definitions = staffManager.getAllStaffDefinitions();
      
      if (definitions.length === 0) {
        return `No staff defined yet.

Use defineStaff to create flexible staff members based on your needs:
- api-builder: Researches APIs AND builds servers
- debugger: Analyzes issues AND fixes code
- security-auditor: Scans vulnerabilities AND applies patches
- documentation-writer: Understands code AND writes docs
- deployment-specialist: Prepares AND deploys applications
- ...whatever you need!

Remember: All staff return ~2K token summaries and save detailed work to files.`;
      }

      const lines = definitions.map(d => {
        return `**${d.name}**
${d.description}

Model: ${d.model || 'inherit'}
${d.readonly ? 'Read-only: Yes' : ''}
${d.allowedTools ? `Tools: ${d.allowedTools.join(', ')}` : 'Tools: All'}
Summary limit: ${d.maxSummaryTokens || 2000} tokens
`;
      });

      return `# Defined Staff (${definitions.length})\n\n${lines.join('\n---\n\n')}`;
    },
  });

  // Read staff plan
  registry.register({
    name: 'readStaffPlan',
    description: 'Read detailed plan from a staff member. Use when the summary is not enough and you need full implementation details.',
    parameters: z.object({
      staffName: z.string().describe('Staff name (e.g., "api-builder")'),
    }),
    async execute(params) {
      try {
        const plan = await contextManager.readPlan(params.staffName);
        return plan;
      } catch {
        const plans = await contextManager.listPlans();
        return `❌ No plan found for "${params.staffName}".

Available plans:
${plans.map(p => `- ${p}`).join('\n') || '(None)'}`;
      }
    },
  });

  // List available plans
  registry.register({
    name: 'listStaffPlans',
    description: 'List all available staff plan files',
    parameters: z.object({}),
    async execute() {
      const plans = await contextManager.listPlans();
      
      if (plans.length === 0) {
        return 'No staff plans available yet. Plans are created when staff complete their work.';
      }

      return `# Available Staff Plans (${plans.length})

${plans.map(p => `- ${p} (use readStaffPlan to view)`).join('\n')}

Plans contain detailed work that staff performed. Summaries are kept under 2K tokens, but plans have full details.`;
    },
  });

  // View context budget
  registry.register({
    name: 'viewContextBudget',
    description: 'Check GenieCEO context token usage and budget',
    parameters: z.object({}),
    async execute() {
      const budget = ceoMemory.getContextBudget();
      const percentage = ((budget.genieCEOCurrentTokens / budget.genieCEOMaxTokens) * 100).toFixed(1);
      const remaining = budget.genieCEOMaxTokens - budget.genieCEOCurrentTokens;

      return `# Context Budget

**Current Usage**: ${budget.genieCEOCurrentTokens} / ${budget.genieCEOMaxTokens} tokens (${percentage}%)
**Remaining**: ${remaining} tokens
**Compactions**: ${budget.compactionCount}
${budget.lastCompactionAt ? `**Last Compaction**: ${budget.lastCompactionAt.toISOString()}` : ''}

${budget.genieCEOCurrentTokens > 45000 ? '⚠️  **Warning**: Approaching limit! Auto-compaction will trigger at 45K tokens.' : budget.genieCEOCurrentTokens > 40000 ? '⚠️  Context usage is high. Consider compaction soon.' : '✓ Context usage is healthy'}

**Context Engineering Strategy**:
- Staff return ~2K summaries (not full 200K context)
- Detailed work saved to plan files
- Auto-compaction at 45K tokens
- Read plans only when you need full details`;
    },
  });

  // Read shared context
  registry.register({
    name: 'readSharedContext',
    description: 'Read the shared context file that contains high-level summaries from all staff',
    parameters: z.object({}),
    async execute() {
      try {
        const context = await contextManager.readContext();
        return context;
      } catch (error) {
        return `Failed to read shared context: ${error}`;
      }
    },
  });
}
