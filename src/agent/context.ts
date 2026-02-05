import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { Config } from '../types';
import { SkillLoader } from '../skills/loader';
import { ToolRegistry } from '../tools/base';

/**
 * Context Builder
 * Assembles system prompt from workspace files, skills, and tool descriptions
 */
export class ContextBuilder {
  private config: Config;
  private skillLoader: SkillLoader;
  private toolRegistry: ToolRegistry;

  constructor(config: Config, skillLoader: SkillLoader, toolRegistry: ToolRegistry) {
    this.config = config;
    this.skillLoader = skillLoader;
    this.toolRegistry = toolRegistry;
  }

  /**
   * Build complete system prompt
   */
  async buildSystemPrompt(): Promise<string> {
    const sections: string[] = [];

    // 1. Core identity
    sections.push(this.getCoreIdentity());

    // 2. AGENTS.md content (if exists)
    const agentsContent = await this.getAgentsContent();
    if (agentsContent) {
      sections.push('## Agent Configuration\n\n' + agentsContent);
    }

    // 3. Always-loaded skills
    const alwaysSkills = await this.getAlwaysSkills();
    if (alwaysSkills) {
      sections.push('## Core Skills\n\n' + alwaysSkills);
    }

    // 4. Skills summary
    const skillsSummary = await this.getSkillsSummary();
    if (skillsSummary) {
      sections.push('## Available Skills\n\n' + skillsSummary);
    }

    // 5. Tool descriptions
    sections.push(this.getToolDescriptions());

    return sections.join('\n\n---\n\n');
  }

  /**
   * Get core identity section
   */
  private getCoreIdentity(): string {
    const now = new Date();
    return `# genieceo - AI Agent Assistant

You are **genieceo**, an ultra-lightweight AI agent CLI assistant.

**Current Time**: ${now.toLocaleString()}
**Workspace**: ${this.config.workspace}
**Model**: ${this.config.model}

Your purpose is to assist users with tasks by:
- Reading and writing files
- Executing shell commands safely
- Searching the web for information
- Delegating complex tasks to subagents
- Learning and applying skills

Be helpful, efficient, and proactive. Always prioritize safety when executing commands.`;
  }

  /**
   * Get AGENTS.md content from workspace
   */
  private async getAgentsContent(): Promise<string | null> {
    try {
      const agentsPath = join(this.config.workspace, 'AGENTS.md');
      if (existsSync(agentsPath)) {
        return await readFile(agentsPath, 'utf-8');
      }
    } catch (error) {
      // Ignore errors, file is optional
    }
    return null;
  }

  /**
   * Get always-loaded skills (full content)
   */
  private async getAlwaysSkills(): Promise<string | null> {
    try {
      const alwaysSkills = await this.skillLoader.getAlwaysSkills();
      if (alwaysSkills.length === 0) {
        return null;
      }

      const skillContents = alwaysSkills.map(skill => {
        return `### ${skill.name}\n\n${skill.content}`;
      });

      return skillContents.join('\n\n');
    } catch (error) {
      return null;
    }
  }

  /**
   * Get skills summary (XML format for easy parsing)
   */
  private async getSkillsSummary(): Promise<string | null> {
    try {
      const summary = await this.skillLoader.buildSkillsSummary();
      return summary;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get tool descriptions
   */
  private getToolDescriptions(): string {
    const tools = this.toolRegistry.getAll();
    
    if (tools.length === 0) {
      return '## Available Tools\n\nNo tools available.';
    }

    const toolDescriptions = tools.map(tool => {
      return `- **${tool.name}**: ${tool.description}`;
    });

    return `## Available Tools

You have access to the following tools:

${toolDescriptions.join('\n')}

Use these tools to complete tasks efficiently. The Vercel AI SDK will automatically handle tool calling - just specify which tool you want to use and provide the required parameters.`;
  }
}
