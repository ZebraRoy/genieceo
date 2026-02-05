import { mkdir, writeFile, access } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Workspace Manager
 * Handles initialization and management of the workspace directory
 */

export class WorkspaceManager {
  private workspacePath: string;

  constructor(workspacePath?: string) {
    this.workspacePath = workspacePath || join(homedir(), '.genieceo', 'workspace');
  }

  /**
   * Initialize workspace with directory structure
   */
  async init(): Promise<void> {
    try {
      // Create main workspace directory
      if (!existsSync(this.workspacePath)) {
        await mkdir(this.workspacePath, { recursive: true });
      }

      // Create subdirectories
      const subdirs = [
        'skills',
        'files',
      ];

      for (const subdir of subdirs) {
        const path = join(this.workspacePath, subdir);
        if (!existsSync(path)) {
          await mkdir(path, { recursive: true });
        }
      }

      // Create AGENTS.md if it doesn't exist
      const agentsPath = join(this.workspacePath, 'AGENTS.md');
      if (!existsSync(agentsPath)) {
        await writeFile(agentsPath, this.getDefaultAgentsContent());
      }
    } catch (error) {
      throw new Error(`Failed to initialize workspace: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Get workspace root path
   */
  getWorkspacePath(): string {
    return this.workspacePath;
  }

  /**
   * Get custom skills directory path
   */
  getSkillsPath(): string {
    return join(this.workspacePath, 'skills');
  }

  /**
   * Get working files directory path
   */
  getFilesPath(): string {
    return join(this.workspacePath, 'files');
  }

  /**
   * Get AGENTS.md path
   */
  getAgentsFilePath(): string {
    return join(this.workspacePath, 'AGENTS.md');
  }

  /**
   * Check if workspace is initialized
   */
  async isInitialized(): Promise<boolean> {
    try {
      await access(this.workspacePath);
      await access(join(this.workspacePath, 'skills'));
      await access(join(this.workspacePath, 'files'));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get default AGENTS.md content
   */
  private getDefaultAgentsContent(): string {
    return `# genieceo Agent Configuration

## Identity

You are **genieceo**, an AI agent CLI assistant designed to help users with various tasks including:

- Reading and writing files
- Executing shell commands safely
- Searching the web for information
- Breaking down complex tasks using subagents
- Learning new skills through the skill system

## Guidelines

1. **Be helpful and efficient**: Focus on solving the user's problem directly
2. **Use tools wisely**: Choose the right tool for each task
3. **Safety first**: Never execute dangerous commands without user confirmation
4. **Learn and adapt**: Use skills to handle specialized tasks effectively
5. **Delegate complex tasks**: Use subagents for independent work that can run in parallel

## Workspace

Your workspace is located at: ${this.workspacePath}

- \`files/\` - Your working directory for file operations
- \`skills/\` - Custom skills you can learn

## Capabilities

You have access to the following core tools:

- **readFile**: Read file contents
- **writeFile**: Create or overwrite files
- **listDir**: List directory contents
- **executeCommand**: Run shell commands (with safety checks)
- **webSearch**: Search the web using multiple providers (Tavily, Brave, or browser fallback)
- **spawnSubagent**: Create background agents for complex subtasks

Remember: You're here to assist and make the user's work easier. Be proactive, thorough, and clear in your communication.
`;
  }
}

// Singleton instance
let workspaceManagerInstance: WorkspaceManager | null = null;

export function getWorkspaceManager(workspacePath?: string): WorkspaceManager {
  if (!workspaceManagerInstance) {
    workspaceManagerInstance = new WorkspaceManager(workspacePath);
  }
  return workspaceManagerInstance;
}
