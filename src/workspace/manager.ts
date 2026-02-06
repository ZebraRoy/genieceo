import { mkdir, writeFile, access, copyFile, readFile } from 'fs/promises';
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
        'plugins',            // Dynamic plugins
        'docs/tasks',         // Shared context and plans (GenieCEO)
        'memory/staff',       // Staff definitions (GenieCEO)
        'memory/ceo',         // GenieCEO memory store
        'memory/daily',       // Daily logs
        'memory/services/logs', // Service logs
      ];

      for (const subdir of subdirs) {
        const path = join(this.workspacePath, subdir);
        if (!existsSync(path)) {
          await mkdir(path, { recursive: true });
        }
      }

      // Copy bootstrap files from templates (if they don't exist)
      await this.initializeBootstrapFiles();

      // Initialize GenieCEO memory files
      await this.initializeGenieCEOMemory();
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
   * Initialize GenieCEO memory files
   */
  private async initializeGenieCEOMemory(): Promise<void> {
    // Initialize context.md
    const contextMdPath = join(this.workspacePath, 'docs', 'tasks', 'context.md');
    if (!existsSync(contextMdPath)) {
      await writeFile(
        contextMdPath,
        `# Shared Context

This file contains high-level summaries from staff.
GenieCEO reads this for quick context. Detailed work is in *-plan.md files.

---

`
      );
    }

    // Initialize MEMORY.md
    const memoryPath = join(this.workspacePath, 'memory', 'MEMORY.md');
    if (!existsSync(memoryPath)) {
      await writeFile(
        memoryPath,
        `# Long-term Memory

This file stores important learnings, patterns, and preferences that persist across sessions.

## User Preferences

(Will be filled over time)

## Staff Patterns

(Will be filled over time)

## Service Patterns

(Will be filled over time)

## Important Learnings

(Will be filled over time)

## Project Context

(Will be filled over time)

## Best Practices

(Will be filled over time)
`
      );
    }
  }

  /**
   * Initialize bootstrap files from templates
   * Users can customize these files to change agent behavior
   */
  private async initializeBootstrapFiles(): Promise<void> {
    const bootstrapFiles = ['AGENTS.md', 'TOOLS.md', 'IDENTITY.md'];
    const templatesDir = join(__dirname, '..', 'templates');

    for (const filename of bootstrapFiles) {
      const targetPath = join(this.workspacePath, filename);
      
      // Only create if doesn't exist (preserve user customizations)
      if (!existsSync(targetPath)) {
        const templatePath = join(templatesDir, filename);
        
        try {
          // Try to copy from template
          if (existsSync(templatePath)) {
            await copyFile(templatePath, targetPath);
          } else {
            // Fallback to basic content if template missing
            await writeFile(targetPath, this.getBasicBootstrapContent(filename));
          }
        } catch (error) {
          // If copy fails, create basic version
          await writeFile(targetPath, this.getBasicBootstrapContent(filename));
        }
      }
    }
  }

  /**
   * Get basic bootstrap content (fallback if templates are missing)
   */
  private getBasicBootstrapContent(filename: string): string {
    if (filename === 'AGENTS.md') {
      return `# Agent Guidelines

You are genieceo, a helpful AI agent. Be concise, accurate, and proactive.

Edit this file to customize agent behavior.
`;
    } else if (filename === 'TOOLS.md') {
      return `# Available Tools

Documentation for genieceo tools.

Edit this file to add tool documentation.
`;
    } else if (filename === 'IDENTITY.md') {
      return `# Identity & Personality

You are genieceo - an AI agent assistant.

Edit this file to customize personality and style.
`;
    }
    return `# ${filename}\n\nCustomize this file.`;
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
