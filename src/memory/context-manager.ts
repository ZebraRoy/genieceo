/**
 * ContextManager - File-based memory for staff coordination
 * 
 * Manages `docs/tasks/` directory where:
 * - context.md: Contains high-level summaries from staff (3-line updates)
 * - *-plan.md: Detailed staff work (full implementation details)
 * 
 * Pattern:
 * 1. Staff reads context.md for current state
 * 2. Does deep work (isolated 200K context)
 * 3. Saves detailed findings to [staff-name]-plan.md
 * 4. Updates context.md with 3-line summary
 * 5. Returns <= 2K token summary to GenieCEO
 */

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const access = promisify(fs.access);
const readdir = promisify(fs.readdir);

export class ContextManager {
  private tasksPath: string; // workspace/docs/tasks/
  private contextFilePath: string;

  constructor(workspacePath: string) {
    this.tasksPath = path.join(workspacePath, 'docs', 'tasks');
    this.contextFilePath = path.join(this.tasksPath, 'context.md');
  }

  /**
   * Ensure required directories exist
   */
  async ensureDirectories(): Promise<void> {
    try {
      await mkdir(this.tasksPath, { recursive: true });
      
      // Initialize context.md if it doesn't exist
      try {
        await access(this.contextFilePath);
      } catch {
        await this.initializeContext();
      }
    } catch (error) {
      throw new Error(`Failed to create directories: ${error}`);
    }
  }

  /**
   * Initialize context.md with template
   */
  private async initializeContext(): Promise<void> {
    const template = `# Shared Context

This file contains high-level summaries from staff.
GenieCEO reads this for quick context. Detailed work is in *-plan.md files.

---

`;
    await writeFile(this.contextFilePath, template, 'utf-8');
  }

  /**
   * Read the entire context.md file
   */
  async readContext(): Promise<string> {
    try {
      return await readFile(this.contextFilePath, 'utf-8');
    } catch (error) {
      // If file doesn't exist, initialize and return empty
      await this.initializeContext();
      return await readFile(this.contextFilePath, 'utf-8');
    }
  }

  /**
   * Update a specific section in context.md
   * Creates or replaces ## Section Name
   */
  async updateContext(section: string, content: string): Promise<void> {
    const currentContext = await this.readContext();
    const sectionHeader = `## ${section}`;
    
    // Check if section exists
    const sectionRegex = new RegExp(`## ${section}\\n([\\s\\S]*?)(?=\\n## |$)`, 'm');
    const match = currentContext.match(sectionRegex);
    
    let newContext: string;
    if (match) {
      // Replace existing section
      newContext = currentContext.replace(
        sectionRegex,
        `${sectionHeader}\n\n${content.trim()}\n`
      );
    } else {
      // Append new section
      newContext = currentContext.trim() + `\n\n${sectionHeader}\n\n${content.trim()}\n`;
    }
    
    await writeFile(this.contextFilePath, newContext, 'utf-8');
  }

  /**
   * Append content to context.md (for unstructured updates)
   */
  async appendContext(content: string): Promise<void> {
    const currentContext = await this.readContext();
    const newContext = currentContext.trim() + '\n\n' + content.trim() + '\n';
    await writeFile(this.contextFilePath, newContext, 'utf-8');
  }

  /**
   * Clear context.md (reset to template)
   */
  async clearContext(): Promise<void> {
    await this.initializeContext();
  }

  /**
   * Save detailed plan for a staff member
   * Returns the file path
   */
  async savePlan(staffName: string, content: string): Promise<string> {
    const planPath = this.getPlanPath(staffName);
    
    // Add timestamp header
    const timestamp = new Date().toISOString();
    const planContent = `# ${staffName} - Detailed Plan

**Generated**: ${timestamp}

---

${content}
`;
    
    await writeFile(planPath, planContent, 'utf-8');
    return planPath;
  }

  /**
   * Read detailed plan for a staff member
   */
  async readPlan(staffName: string): Promise<string> {
    const planPath = this.getPlanPath(staffName);
    try {
      return await readFile(planPath, 'utf-8');
    } catch (error) {
      throw new Error(`No plan found for staff "${staffName}"`);
    }
  }

  /**
   * List all available plan files
   * Returns array of staff names (without -plan.md suffix)
   */
  async listPlans(): Promise<string[]> {
    try {
      const files = await readdir(this.tasksPath);
      return files
        .filter(f => f.endsWith('-plan.md'))
        .map(f => f.replace('-plan.md', ''));
    } catch (error) {
      return [];
    }
  }

  /**
   * Get plan file path for a staff member
   */
  getPlanPath(staffName: string): string {
    return path.join(this.tasksPath, `${staffName}-plan.md`);
  }

  /**
   * Get context.md file path
   */
  getContextPath(): string {
    return this.contextFilePath;
  }

  /**
   * Check if a plan exists for a staff member
   */
  async planExists(staffName: string): Promise<boolean> {
    try {
      await access(this.getPlanPath(staffName));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a plan file
   */
  async deletePlan(staffName: string): Promise<void> {
    const planPath = this.getPlanPath(staffName);
    try {
      await promisify(fs.unlink)(planPath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  }

  /**
   * Archive old plans (move to archive subdirectory)
   * Useful for keeping tasks directory clean
   */
  async archivePlans(staffNames: string[]): Promise<void> {
    const archivePath = path.join(this.tasksPath, 'archive');
    await mkdir(archivePath, { recursive: true });
    
    for (const staffName of staffNames) {
      const planPath = this.getPlanPath(staffName);
      const archiveFile = path.join(
        archivePath,
        `${staffName}-${Date.now()}.md`
      );
      
      try {
        await promisify(fs.rename)(planPath, archiveFile);
      } catch (error) {
        // Ignore if file doesn't exist
      }
    }
  }
}
