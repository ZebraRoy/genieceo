/**
 * StaffDefinitionLoader - Loads flexible staff definitions from markdown
 * 
 * Staff definitions are stored in workspace/memory/staff/ as .md files
 * Format:
 * ---
 * name: api-builder
 * description: Builds Express.js/Fastify API servers...
 * model: inherit
 * allowedTools: [readFile, writeFile, ...]
 * maxSummaryTokens: 2000
 * savePlanFile: true
 * ---
 * 
 * [Markdown content becomes the system prompt]
 */

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { StaffDefinition } from '../types';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
const mkdir = promisify(fs.mkdir);
const unlink = promisify(fs.unlink);

export class StaffDefinitionLoader {
  private basePath: string; // workspace/memory/staff/
  private cache: Map<string, StaffDefinition> = new Map();

  constructor(workspacePath: string) {
    this.basePath = path.join(workspacePath, 'memory', 'staff');
  }

  /**
   * Load all staff definitions from disk
   */
  async loadDefinitions(): Promise<void> {
    try {
      // Ensure directory exists
      await mkdir(this.basePath, { recursive: true });

      // Read all .md files
      const files = await readdir(this.basePath);
      const mdFiles = files.filter(f => f.endsWith('.md'));

      this.cache.clear();

      for (const file of mdFiles) {
        try {
          const filePath = path.join(this.basePath, file);
          const content = await readFile(filePath, 'utf-8');
          const definition = this.parseMarkdown(content, file);
          
          this.validateDefinition(definition);
          this.cache.set(definition.name, definition);
        } catch (error) {
          console.warn(`Failed to load staff definition from ${file}:`, error);
        }
      }

      console.log(`Loaded ${this.cache.size} staff definition(s)`);
    } catch (error) {
      console.warn('Failed to load staff definitions:', error);
    }
  }

  /**
   * Get a specific staff definition by name
   */
  getDefinition(name: string): StaffDefinition | undefined {
    return this.cache.get(name);
  }

  /**
   * Get all loaded staff definitions
   */
  getAllDefinitions(): StaffDefinition[] {
    return Array.from(this.cache.values());
  }

  /**
   * Save a new staff definition to disk
   */
  async saveDefinition(def: StaffDefinition): Promise<void> {
    this.validateDefinition(def);

    const filename = `${def.name}.md`;
    const filePath = path.join(this.basePath, filename);

    // Build frontmatter
    const frontmatter = {
      name: def.name,
      description: def.description,
      model: def.model || 'inherit',
      ...(def.allowedTools && { allowedTools: def.allowedTools }),
      ...(def.readonly !== undefined && { readonly: def.readonly }),
      maxSummaryTokens: def.maxSummaryTokens || 2000,
      savePlanFile: def.savePlanFile !== false,
    };

    // Convert to YAML-like format
    const yamlLines = Object.entries(frontmatter).map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}: [${value.join(', ')}]`;
      } else if (typeof value === 'boolean') {
        return `${key}: ${value}`;
      } else if (typeof value === 'number') {
        return `${key}: ${value}`;
      } else {
        return `${key}: ${value}`;
      }
    });

    const content = `---
${yamlLines.join('\n')}
---

${def.prompt}
`;

    await writeFile(filePath, content, 'utf-8');
    
    // Update cache
    this.cache.set(def.name, def);
  }

  /**
   * Delete a staff definition
   */
  async deleteDefinition(name: string): Promise<void> {
    const filename = `${name}.md`;
    const filePath = path.join(this.basePath, filename);

    try {
      await unlink(filePath);
      this.cache.delete(name);
    } catch (error) {
      throw new Error(`Failed to delete staff definition "${name}": ${error}`);
    }
  }

  /**
   * Reload all definitions from disk
   */
  async reload(): Promise<void> {
    await this.loadDefinitions();
  }

  /**
   * Validate staff definition
   */
  private validateDefinition(def: StaffDefinition): void {
    if (!def.name) {
      throw new Error('Staff definition must have a name');
    }

    if (!def.description) {
      throw new Error('Staff definition must have a description');
    }

    if (!def.prompt) {
      throw new Error('Staff definition must have a prompt');
    }

    // Check description length (should be < 200 tokens, roughly 800 chars)
    if (def.description.length > 1000) {
      console.warn(`Staff "${def.name}" description is long (${def.description.length} chars). Keep under 200 tokens (~800 chars) for better performance.`);
    }

    // Check name format (lowercase, hyphens only)
    if (!/^[a-z0-9-]+$/.test(def.name)) {
      throw new Error('Staff name must be lowercase with hyphens only (e.g., "api-builder")');
    }

    // Validate maxSummaryTokens
    if (def.maxSummaryTokens && def.maxSummaryTokens > 3000) {
      console.warn(`Staff "${def.name}" maxSummaryTokens is high (${def.maxSummaryTokens}). Consider keeping under 2000 for context efficiency.`);
    }
  }

  /**
   * Parse markdown file with frontmatter
   */
  private parseMarkdown(content: string, filename: string): StaffDefinition {
    // Extract frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    
    if (!frontmatterMatch) {
      throw new Error(`Invalid format in ${filename}: Missing frontmatter`);
    }

    const [, frontmatterStr, prompt] = frontmatterMatch;
    
    // Parse frontmatter (simple YAML parser)
    const frontmatter: any = {};
    const lines = frontmatterStr.split('\n');
    
    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        
        // Parse value
        if (value.startsWith('[') && value.endsWith(']')) {
          // Array
          frontmatter[key] = value
            .slice(1, -1)
            .split(',')
            .map(v => v.trim());
        } else if (value === 'true' || value === 'false') {
          // Boolean
          frontmatter[key] = value === 'true';
        } else if (/^\d+$/.test(value)) {
          // Number
          frontmatter[key] = parseInt(value, 10);
        } else {
          // String
          frontmatter[key] = value;
        }
      }
    }

    return {
      name: frontmatter.name,
      description: frontmatter.description,
      prompt: prompt.trim(),
      model: frontmatter.model,
      allowedTools: frontmatter.allowedTools,
      readonly: frontmatter.readonly,
      maxSummaryTokens: frontmatter.maxSummaryTokens,
      savePlanFile: frontmatter.savePlanFile,
    };
  }

  /**
   * Get base path for staff definitions
   */
  getBasePath(): string {
    return this.basePath;
  }

  /**
   * Check if a staff definition exists
   */
  hasDefinition(name: string): boolean {
    return this.cache.has(name);
  }

  /**
   * Get staff names that match a pattern
   */
  findByPattern(pattern: string): StaffDefinition[] {
    const regex = new RegExp(pattern, 'i');
    return Array.from(this.cache.values()).filter(
      def => regex.test(def.name) || regex.test(def.description)
    );
  }
}
