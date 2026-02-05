/**
 * LongTermMemory - Persistent knowledge storage
 * 
 * Stores important learnings, patterns, and preferences in workspace/memory/MEMORY.md
 * Organized by sections for easy retrieval
 */

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

export class LongTermMemory {
  private memoryPath: string; // workspace/memory/MEMORY.md

  constructor(workspacePath: string) {
    this.memoryPath = path.join(workspacePath, 'memory', 'MEMORY.md');
  }

  /**
   * Read entire memory file
   */
  async read(): Promise<string> {
    try {
      return await readFile(this.memoryPath, 'utf-8');
    } catch (error) {
      // File doesn't exist, initialize it
      await this.initialize();
      return await readFile(this.memoryPath, 'utf-8');
    }
  }

  /**
   * Append content to a section
   * If section doesn't exist, creates it
   */
  async append(section: string, content: string): Promise<void> {
    try {
      await mkdir(path.dirname(this.memoryPath), { recursive: true });
      
      const currentMemory = await this.read();
      const sectionHeader = `## ${section}`;
      
      // Check if section exists
      const sectionRegex = new RegExp(`## ${section}\\n([\\s\\S]*?)(?=\\n## |$)`, 'm');
      const match = currentMemory.match(sectionRegex);
      
      let newMemory: string;
      if (match) {
        // Append to existing section
        const existingContent = match[1].trim();
        const newContent = existingContent 
          ? `${existingContent}\n\n${content.trim()}`
          : content.trim();
        
        newMemory = currentMemory.replace(
          sectionRegex,
          `${sectionHeader}\n\n${newContent}\n`
        );
      } else {
        // Create new section
        newMemory = currentMemory.trim() + `\n\n${sectionHeader}\n\n${content.trim()}\n`;
      }
      
      await writeFile(this.memoryPath, newMemory, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to append to memory: ${error}`);
    }
  }

  /**
   * Update a section (replace existing content)
   */
  async updateSection(section: string, content: string): Promise<void> {
    try {
      await mkdir(path.dirname(this.memoryPath), { recursive: true });
      
      const currentMemory = await this.read();
      const sectionHeader = `## ${section}`;
      
      // Check if section exists
      const sectionRegex = new RegExp(`## ${section}\\n([\\s\\S]*?)(?=\\n## |$)`, 'm');
      const match = currentMemory.match(sectionRegex);
      
      let newMemory: string;
      if (match) {
        // Replace existing section
        newMemory = currentMemory.replace(
          sectionRegex,
          `${sectionHeader}\n\n${content.trim()}\n`
        );
      } else {
        // Create new section
        newMemory = currentMemory.trim() + `\n\n${sectionHeader}\n\n${content.trim()}\n`;
      }
      
      await writeFile(this.memoryPath, newMemory, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to update memory section: ${error}`);
    }
  }

  /**
   * Search memory for content matching query
   * Simple case-insensitive search
   */
  async search(query: string): Promise<string> {
    try {
      const memory = await this.read();
      const lines = memory.split('\n');
      const results: string[] = [];
      
      const lowerQuery = query.toLowerCase();
      let currentSection = '';
      
      for (const line of lines) {
        if (line.startsWith('## ')) {
          currentSection = line.replace('## ', '');
        }
        
        if (line.toLowerCase().includes(lowerQuery)) {
          results.push(`[${currentSection}] ${line}`);
        }
      }
      
      if (results.length === 0) {
        return `No results found for "${query}"`;
      }
      
      return `# Search Results for "${query}"\n\n${results.join('\n')}`;
    } catch (error) {
      return `Search failed: ${error}`;
    }
  }

  /**
   * Get a specific section
   */
  async getSection(section: string): Promise<string> {
    try {
      const memory = await this.read();
      const sectionRegex = new RegExp(`## ${section}\\n([\\s\\S]*?)(?=\\n## |$)`, 'm');
      const match = memory.match(sectionRegex);
      
      if (match) {
        return match[1].trim();
      }
      
      return `Section "${section}" not found`;
    } catch (error) {
      return `Failed to get section: ${error}`;
    }
  }

  /**
   * List all sections
   */
  async listSections(): Promise<string[]> {
    try {
      const memory = await this.read();
      const matches = memory.match(/^## (.+)$/gm);
      
      if (!matches) return [];
      
      return matches.map(m => m.replace('## ', ''));
    } catch (error) {
      return [];
    }
  }

  /**
   * Initialize memory file with template
   */
  private async initialize(): Promise<void> {
    await mkdir(path.dirname(this.memoryPath), { recursive: true });
    
    const template = `# Long-term Memory

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
`;
    
    await writeFile(this.memoryPath, template, 'utf-8');
  }

  /**
   * Clear a specific section
   */
  async clearSection(section: string): Promise<void> {
    await this.updateSection(section, '(Empty)');
  }

  /**
   * Delete a section entirely
   */
  async deleteSection(section: string): Promise<void> {
    try {
      const memory = await this.read();
      const sectionRegex = new RegExp(`\\n## ${section}\\n[\\s\\S]*?(?=\\n## |$)`, 'm');
      const newMemory = memory.replace(sectionRegex, '');
      await writeFile(this.memoryPath, newMemory, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to delete section: ${error}`);
    }
  }

  /**
   * Get memory file path
   */
  getMemoryPath(): string {
    return this.memoryPath;
  }

  /**
   * Backup memory to a timestamped file
   */
  async backup(): Promise<string> {
    try {
      const memory = await this.read();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = this.memoryPath.replace('.md', `-backup-${timestamp}.md`);
      await writeFile(backupPath, memory, 'utf-8');
      return backupPath;
    } catch (error) {
      throw new Error(`Failed to backup memory: ${error}`);
    }
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<{
    sections: number;
    totalLines: number;
    totalChars: number;
  }> {
    try {
      const memory = await this.read();
      const sections = await this.listSections();
      const lines = memory.split('\n');
      
      return {
        sections: sections.length,
        totalLines: lines.length,
        totalChars: memory.length,
      };
    } catch (error) {
      return { sections: 0, totalLines: 0, totalChars: 0 };
    }
  }
}
