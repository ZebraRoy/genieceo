import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { Config } from '../types';
import { SkillLoader } from '../skills/loader';
import { ToolRegistry } from '../tools/base';

/**
 * Context Builder
 * Assembles system prompt from workspace files, skills, and tool descriptions
 * Inspired by nanobot's modular bootstrap file system
 */
export class ContextBuilder {
  private config: Config;
  private skillLoader: SkillLoader;
  private toolRegistry: ToolRegistry;

  // Bootstrap files loaded from workspace (if they exist)
  private static BOOTSTRAP_FILES = ['AGENTS.md', 'TOOLS.md', 'IDENTITY.md'];

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

    // 1. Core identity (minimal, essential only)
    sections.push(this.getCoreIdentity());

    // 2. Bootstrap files (AGENTS.md, TOOLS.md, IDENTITY.md)
    const bootstrapContent = await this.getBootstrapFiles();
    if (bootstrapContent) {
      sections.push(bootstrapContent);
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

    // 5. Tool descriptions (brief, details in TOOLS.md if present)
    sections.push(this.getToolDescriptions());

    return sections.join('\n\n---\n\n');
  }

  /**
   * Get core identity section (minimal - details go in bootstrap files)
   */
  private getCoreIdentity(): string {
    const now = new Date();
    const workspacePath = this.config.workspace.replace('~', process.env.HOME || '~');
    
    return `# GenieCEO 🐱

You are GenieCEO, an ultra-lightweight AI agent assistant with a powerful plugin system.

## Current Time
${now.toLocaleString()}

## Workspace
Your workspace is at: ${workspacePath}

**Structure:**
- Bootstrap files: ${workspacePath}/AGENTS.md, TOOLS.md, IDENTITY.md
- Memory: ${workspacePath}/memory/MEMORY.md
- Daily logs: ${workspacePath}/memory/YYYY-MM-DD.md
- Skills: ${workspacePath}/skills/{skill-name}/SKILL.md
- Plugin examples: ${workspacePath}/plugins/examples/ (discord.js, telegram.js)
- Services: Managed via startService/stopService tools

## Your Capabilities

You have access to tools for:
- **File operations** - Read, write, list files
- **Shell commands** - Execute system commands with safety checks
- **Web search** - Find current information online
- **Subagent delegation** - Spawn background agents for complex tasks
- **Skills** - Load specialized capabilities on-demand
- **Memory** - Persistent storage across sessions

## Plugin System (IMPORTANT)

**You are a plugin runtime.** When users ask to integrate with platforms (Line, Telegram, Discord, etc.):
1. Read plugin examples: \`readFile('${workspacePath}/plugins/examples/discord.js')\`
2. Generate JavaScript plugins using platform SDKs (adapt from examples)
3. Install them: \`genieceo plugin install <name> --code "..."\`
4. Plugins run inside your process with access to agent.run()

**Don't ask about backend stack - YOU ARE the runtime.**

For detailed guidelines, see AGENTS.md, TOOLS.md, and IDENTITY.md in your workspace.`;
  }

  /**
   * Load all bootstrap files from workspace
   */
  private async getBootstrapFiles(): Promise<string | null> {
    const parts: string[] = [];

    for (const filename of ContextBuilder.BOOTSTRAP_FILES) {
      try {
        const filePath = join(this.config.workspace, filename);
        if (existsSync(filePath)) {
          const content = await readFile(filePath, 'utf-8');
          parts.push(`## ${filename}\n\n${content}`);
        }
      } catch (error) {
        // Ignore errors, files are optional
      }
    }

    return parts.length > 0 ? parts.join('\n\n') : null;
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
