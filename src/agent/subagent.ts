import { randomBytes } from 'crypto';
import type { Config } from '../types';
import { ToolRegistry } from '../tools/base';
import { SkillLoader } from '../skills/loader';
import { AgentLoop } from './loop';

/**
 * Subagent Manager
 * Handles spawning and managing background agents for complex tasks
 */
export class SubagentManager {
  private config: Config;
  private toolRegistry: ToolRegistry;
  private skillLoader: SkillLoader;
  private activeSubagents: Map<string, Promise<string>> = new Map();

  constructor(
    config: Config,
    toolRegistry: ToolRegistry,
    skillLoader: SkillLoader
  ) {
    this.config = config;
    this.toolRegistry = toolRegistry;
    this.skillLoader = skillLoader;
  }

  /**
   * Spawn a subagent to handle a task
   */
  async spawn(task: string, context?: string): Promise<string> {
    const taskId = this.generateTaskId();
    
    // Construct full task description
    const fullTask = context 
      ? `${task}\n\nAdditional Context:\n${context}`
      : task;

    // Start subagent in background
    const subagentPromise = this.runSubagent(taskId, fullTask);
    this.activeSubagents.set(taskId, subagentPromise);

    // Handle completion (don't await here)
    subagentPromise
      .then(result => {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🤖 Subagent ${taskId} Completed`);
        console.log(`${'='.repeat(60)}`);
        console.log(result);
        console.log(`${'='.repeat(60)}\n`);
        this.activeSubagents.delete(taskId);
      })
      .catch(error => {
        console.error(`\n❌ Subagent ${taskId} Failed: ${error.message}\n`);
        this.activeSubagents.delete(taskId);
      });

    return `✓ Subagent ${taskId} spawned for task: "${task.substring(0, 100)}${task.length > 100 ? '...' : ''}"`;
  }

  /**
   * Run a subagent
   */
  private async runSubagent(taskId: string, task: string): Promise<string> {
    // Create a tool registry without the spawn tool (prevent recursive spawning)
    const subagentTools = new ToolRegistry();
    
    // Copy all tools except spawn
    for (const tool of this.toolRegistry.getAll()) {
      if (tool.name !== 'spawnSubagent') {
        subagentTools.register(tool);
      }
    }

    // Create subagent with reduced iterations
    const subagentConfig: Config = {
      ...this.config,
      maxIterations: Math.min(10, this.config.maxIterations),
    };

    const subagent = new AgentLoop(
      subagentConfig,
      subagentTools,
      this.skillLoader
    );

    // Run the subagent
    try {
      const result = await subagent.run(task);
      return result;
    } catch (error) {
      throw new Error(`Subagent execution failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Generate a unique task ID
   */
  private generateTaskId(): string {
    return randomBytes(4).toString('hex');
  }

  /**
   * Get active subagent count
   */
  getActiveCount(): number {
    return this.activeSubagents.size;
  }

  /**
   * Wait for all subagents to complete
   */
  async waitForAll(): Promise<void> {
    if (this.activeSubagents.size === 0) {
      return;
    }

    await Promise.allSettled(Array.from(this.activeSubagents.values()));
  }
}
