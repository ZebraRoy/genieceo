/**
 * StaffManager - Manages staff processes
 * 
 * Staff are flexible agents (api-builder, debugger, security-auditor, etc.)
 * that work on tasks and return condensed summaries to GenieCEO.
 * 
 * Context Engineering:
 * - Each staff has isolated 200K context
 * - Returns <= 2K token summary to GenieCEO
 * - Saves detailed work to plan files
 * - Updates shared context.md with 3-line summary
 */

import { Config, StaffDefinition, StaffProcess } from '../../types';
import { StaffDefinitionLoader } from '../../memory/staff-loader';
import { GenieCEOMemoryStore } from '../../memory/ceo';
import { ContextManager } from '../../memory/context-manager';
import { DailyLogSystem } from '../../memory/daily-log';
import { ContextCompactionService } from '../../memory/compaction';
import { ToolRegistry } from '../../tools/base';
import { SkillLoader } from '../../skills/loader';
import { SubagentManager } from '../subagent';

export class StaffManager {
  private staffLoader: StaffDefinitionLoader;
  private ceoMemory: GenieCEOMemoryStore;
  private contextManager: ContextManager;
  private dailyLog: DailyLogSystem;
  private compactionService: ContextCompactionService;
  private config: Config;
  private toolRegistry: ToolRegistry;
  private skillLoader: SkillLoader;
  private subagentManager: SubagentManager;

  constructor(
    staffLoader: StaffDefinitionLoader,
    ceoMemory: GenieCEOMemoryStore,
    contextManager: ContextManager,
    dailyLog: DailyLogSystem,
    compactionService: ContextCompactionService,
    config: Config,
    toolRegistry: ToolRegistry,
    skillLoader: SkillLoader
  ) {
    this.staffLoader = staffLoader;
    this.ceoMemory = ceoMemory;
    this.contextManager = contextManager;
    this.dailyLog = dailyLog;
    this.compactionService = compactionService;
    this.config = config;
    this.toolRegistry = toolRegistry;
    this.skillLoader = skillLoader;
    
    // Initialize subagent manager for spawning staff
    this.subagentManager = new SubagentManager(config, toolRegistry, skillLoader);
  }

  // ============================================================================
  // Staff Definition Management
  // ============================================================================

  /**
   * Define a new staff type
   */
  async defineStaff(def: StaffDefinition): Promise<void> {
    await this.staffLoader.saveDefinition(def);
    
    await this.dailyLog.log({
      timestamp: new Date(),
      type: 'decision',
      actor: 'genieceo',
      content: `Defined new staff: ${def.name}`,
      metadata: { staffName: def.name },
    });
  }

  /**
   * Get staff definition
   */
  getStaffDefinition(name: string): StaffDefinition | undefined {
    return this.staffLoader.getDefinition(name);
  }

  /**
   * Get all staff definitions
   */
  getAllStaffDefinitions(): StaffDefinition[] {
    return this.staffLoader.getAllDefinitions();
  }

  /**
   * Delete a staff definition
   */
  async deleteStaffDefinition(name: string): Promise<void> {
    await this.staffLoader.deleteDefinition(name);
  }

  // ============================================================================
  // Staff Process Management
  // ============================================================================

  /**
   * Spawn a staff member to work on a task
   */
  async spawnStaff(
    staffName: string,
    task: string,
    options?: {
      readPlanFiles?: string[]; // Plan files to read
      contextHints?: string; // Additional context
    }
  ): Promise<StaffProcess> {
    const definition = this.staffLoader.getDefinition(staffName);
    
    if (!definition) {
      throw new Error(`Staff "${staffName}" not found. Use defineStaff to create it.`);
    }

    // Check if this staff is already working
    if (this.ceoMemory.isStaffWorking(staffName)) {
      throw new Error(`Staff "${staffName}" is already working on a task`);
    }

    // Generate process ID
    const processId = this.generateProcessId(staffName);

    // Create process object
    const process: StaffProcess = {
      id: processId,
      staffName,
      status: 'spawning',
      task,
      spawnedAt: new Date(),
    };

    // Add to memory
    this.ceoMemory.addActiveProcess(process);

    // Log the spawn
    await this.dailyLog.log({
      timestamp: new Date(),
      type: 'decision',
      actor: 'genieceo',
      content: `Spawned staff "${staffName}" for task: ${task.slice(0, 100)}...`,
      metadata: { processId, staffName },
    });

    // Prepare the full task prompt with context engineering instructions
    const fullTask = await this.prepareStaffTask(definition, task, options);

    // Update status to working
    this.ceoMemory.updateProcessStatus(processId, { status: 'working' });

    // Run the staff process (async)
    this.runStaffProcess(process, definition, fullTask).catch(error => {
      this.ceoMemory.updateProcessStatus(processId, {
        status: 'failed',
        error: error.message,
        completedAt: new Date(),
      });
    });

    return process;
  }

  /**
   * Wait for a staff process to complete and get result
   */
  async waitForCompletion(processId: string, timeoutMs: number = 300000): Promise<string> {
    const startTime = Date.now();
    
    while (true) {
      const process = this.ceoMemory.getProcess(processId);
      
      if (!process) {
        throw new Error(`Process ${processId} not found`);
      }

      if (process.status === 'completed') {
        return process.result || 'Task completed (no result returned)';
      }

      if (process.status === 'failed') {
        throw new Error(`Staff process failed: ${process.error}`);
      }

      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(`Timeout waiting for process ${processId}`);
      }

      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Get active staff processes
   */
  getActiveProcesses(): StaffProcess[] {
    return this.ceoMemory.getActiveProcesses();
  }

  /**
   * Check if a staff member is working
   */
  isStaffWorking(staffName: string): boolean {
    return this.ceoMemory.isStaffWorking(staffName);
  }

  // ============================================================================
  // Internal Helpers
  // ============================================================================

  /**
   * Prepare the full task prompt with context engineering instructions
   */
  private async prepareStaffTask(
    definition: StaffDefinition,
    task: string,
    options?: any
  ): Promise<string> {
    const maxTokens = definition.maxSummaryTokens || 2000;
    const savePlan = definition.savePlanFile !== false;

    // Read current context
    let contextContent = '';
    try {
      contextContent = await this.contextManager.readContext();
    } catch {
      // Context doesn't exist yet
      contextContent = '(No shared context yet)';
    }

    // Read plan files if specified
    let planFilesContent = '';
    if (options?.readPlanFiles && options.readPlanFiles.length > 0) {
      const plans = await Promise.all(
        options.readPlanFiles.map(async (name: string) => {
          try {
            const content = await this.contextManager.readPlan(name);
            return `## Plan: ${name}\n\n${content}\n`;
          } catch {
            return `## Plan: ${name}\n\n(Not found)\n`;
          }
        })
      );
      planFilesContent = plans.join('\n---\n\n');
    }

    // Build the full prompt
    const fullPrompt = `${definition.prompt}

# YOUR CURRENT TASK

${task}

${options?.contextHints ? `\n# ADDITIONAL CONTEXT\n\n${options.contextHints}\n` : ''}

# SHARED CONTEXT (Read for current project state)

${contextContent}

${planFilesContent ? `\n# RELATED PLANS\n\n${planFilesContent}\n` : ''}

# CONTEXT ENGINEERING WORKFLOW (CRITICAL)

You MUST follow this workflow:

1. **Understand Context**: Read the shared context and related plans above
2. **Do Deep Work**: Perform your task thoroughly (you have a dedicated 200K context window)
${savePlan ? `3. **Save Detailed Plan**: Write your detailed findings/work to \`docs/tasks/${definition.name}-plan.md\`` : ''}
4. **Update Shared Context**: Add a 3-line summary to \`docs/tasks/context.md\` under section "## ${definition.name}"
5. **Return Summary**: Return a **${maxTokens}-token summary** to GenieCEO with:
   - What you accomplished (high-level)
   - Key findings
   - Important notes
   ${savePlan ? `- End with: "Detailed plan saved to ${definition.name}-plan.md. Read for full details."` : ''}

**CRITICAL**: Your final response MUST be under ${maxTokens} tokens. Put ALL detailed work in the plan file.

Begin your work now.`;

    return fullPrompt;
  }

  /**
   * Run the staff process using subagent manager
   */
  private async runStaffProcess(
    process: StaffProcess,
    definition: StaffDefinition,
    fullTask: string
  ): Promise<void> {
    try {
      // Spawn as subagent
      const result = await this.subagentManager.spawn(fullTask);

      // Validate summary length (rough estimate: 4 chars = 1 token)
      const estimatedTokens = Math.ceil(result.length / 4);
      const maxTokens = definition.maxSummaryTokens || 2000;

      if (estimatedTokens > maxTokens * 1.2) {
        console.warn(`Staff ${process.staffName} returned ${estimatedTokens} tokens (limit: ${maxTokens})`);
      }

      // Update process
      this.ceoMemory.updateProcessStatus(process.id, {
        status: 'completed',
        result,
        summaryTokens: estimatedTokens,
        completedAt: new Date(),
      });

      // Log completion
      await this.dailyLog.log({
        timestamp: new Date(),
        type: 'task_result',
        actor: process.id,
        content: `Completed: ${result.slice(0, 200)}...`,
        metadata: {
          processId: process.id,
          staffName: process.staffName,
          summaryTokens: estimatedTokens,
        },
      });

    } catch (error) {
      this.ceoMemory.updateProcessStatus(process.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      });

      await this.dailyLog.log({
        timestamp: new Date(),
        type: 'task_result',
        actor: process.id,
        content: `Failed: ${error instanceof Error ? error.message : error}`,
        metadata: {
          processId: process.id,
          staffName: process.staffName,
        },
      });
    }
  }

  /**
   * Validate that summary is within token limits
   */
  private async validateSummaryLength(
    result: string,
    maxTokens: number
  ): Promise<string> {
    const estimatedTokens = Math.ceil(result.length / 4);
    
    if (estimatedTokens <= maxTokens) {
      return result;
    }

    // Summary is too long, truncate it
    console.warn(`Summary exceeded ${maxTokens} tokens (${estimatedTokens}), truncating...`);
    
    const maxChars = maxTokens * 4;
    const truncated = result.slice(0, maxChars) + '\n\n[Summary truncated - check plan file for full details]';
    
    return truncated;
  }

  /**
   * Generate unique process ID
   */
  private generateProcessId(staffName: string): string {
    const random = Math.random().toString(36).slice(2, 6);
    return `${staffName}-${random}`;
  }

  /**
   * Cleanup old completed processes
   */
  cleanupOldProcesses(): void {
    this.ceoMemory.cleanupCompletedProcesses();
  }
}
