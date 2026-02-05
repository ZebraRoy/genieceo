import { readFile, readdir } from 'fs/promises';
import { join, resolve } from 'path';
import { existsSync } from 'fs';
import type { Skill, Config } from '../types';

/**
 * Parse markdown frontmatter
 */
function parseFrontmatter(content: string): { metadata: any; content: string } {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { metadata: {}, content };
  }

  const frontmatter = match[1];
  const body = match[2];

  // Simple YAML parser (handles basic cases)
  const metadata: any = {};
  const lines = frontmatter.split('\n');
  let currentKey = '';

  for (const line of lines) {
    if (line.trim().startsWith('-')) continue;
    
    const colonIndex = line.indexOf(':');
    if (colonIndex > -1) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      
      if (value) {
        currentKey = key;
        metadata[key] = value;
      }
    }
  }

  return { metadata, content: body };
}

/**
 * Skill Loader
 * Loads skills from built-in and workspace directories
 */
export class SkillLoader {
  private builtinSkillsPath: string;
  private workspaceSkillsPath: string;
  private skillsCache: Map<string, Skill> = new Map();
  private config?: Config;

  constructor(builtinSkillsPath: string, workspaceSkillsPath: string, config?: Config) {
    this.builtinSkillsPath = builtinSkillsPath;
    this.workspaceSkillsPath = workspaceSkillsPath;
    this.config = config;
  }

  /**
   * Set the config for checking skill requirements
   */
  setConfig(config: Config): void {
    this.config = config;
  }

  /**
   * Load all skills from builtin and workspace
   */
  async loadSkills(): Promise<Skill[]> {
    const skills: Skill[] = [];

    // Load built-in skills
    if (existsSync(this.builtinSkillsPath)) {
      const builtinSkills = await this.loadSkillsFromDir(this.builtinSkillsPath);
      skills.push(...builtinSkills);
    }

    // Load workspace skills (override built-in if same name)
    if (existsSync(this.workspaceSkillsPath)) {
      const workspaceSkills = await this.loadSkillsFromDir(this.workspaceSkillsPath);
      
      // Remove built-in skills that are overridden
      const workspaceNames = new Set(workspaceSkills.map(s => s.name));
      const filteredBuiltin = skills.filter(s => !workspaceNames.has(s.name));
      
      skills.length = 0;
      skills.push(...filteredBuiltin, ...workspaceSkills);
    }

    // Cache skills
    this.skillsCache.clear();
    for (const skill of skills) {
      this.skillsCache.set(skill.name, skill);
    }

    return skills;
  }

  /**
   * Load skills from a directory
   */
  private async loadSkillsFromDir(dirPath: string): Promise<Skill[]> {
    const skills: Skill[] = [];

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = join(dirPath, entry.name, 'SKILL.md');
          if (existsSync(skillPath)) {
            const skill = await this.loadSkillFile(skillPath);
            if (skill) {
              skills.push(skill);
            }
          }
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be read
    }

    return skills;
  }

  /**
   * Load a single skill file
   */
  private async loadSkillFile(path: string): Promise<Skill | null> {
    try {
      const content = await readFile(path, 'utf-8');
      const { metadata, content: body } = parseFrontmatter(content);

      return {
        name: metadata.name || 'unknown',
        description: metadata.description || '',
        content: body.trim(),
        metadata: metadata.metadata,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get a specific skill by name
   */
  async getSkill(name: string): Promise<Skill | null> {
    if (this.skillsCache.size === 0) {
      await this.loadSkills();
    }

    return this.skillsCache.get(name) || null;
  }

  /**
   * Get skills marked as always-loaded
   */
  async getAlwaysSkills(): Promise<Skill[]> {
    if (this.skillsCache.size === 0) {
      await this.loadSkills();
    }

    return Array.from(this.skillsCache.values()).filter(
      skill => skill.metadata?.always === true
    );
  }

  /**
   * Build XML summary of available skills
   */
  async buildSkillsSummary(): Promise<string> {
    if (this.skillsCache.size === 0) {
      await this.loadSkills();
    }

    const skills = Array.from(this.skillsCache.values());
    
    if (skills.length === 0) {
      return 'No skills available. Use readFile to load skill content when needed.';
    }

    const skillEntries = skills.map(skill => {
      const available = this.checkSkillRequirements(skill);
      const status = available ? 'available' : 'unavailable';
      
      let entry = `  <skill name="${skill.name}" status="${status}">
    <description>${skill.description}</description>`;

      if (!available && skill.metadata?.requires) {
        const missing: string[] = [];
        if (skill.metadata.requires.bins) {
          missing.push(`bins: ${skill.metadata.requires.bins.join(', ')}`);
        }
        if (skill.metadata.requires.config) {
          missing.push(`config: ${skill.metadata.requires.config.join(', ')}`);
        }
        entry += `\n    <missing>${missing.join('; ')}</missing>`;
      }

      entry += '\n  </skill>';
      return entry;
    });

    return `<skills>
${skillEntries.join('\n')}
</skills>

To use a skill, read its content with: readFile({path: "workspace/skills/{skill-name}/SKILL.md"})`;
  }

  /**
   * Check if skill requirements are met
   */
  private checkSkillRequirements(skill: Skill): boolean {
    if (!skill.metadata?.requires) {
      return true;
    }

    // Check for required binaries (simplified - just returns true for now)
    // In production, you'd use 'which' or similar to check
    if (skill.metadata.requires.bins && skill.metadata.requires.bins.length > 0) {
      // For now, assume all bins are available
    }

    // Check for required config values
    if (skill.metadata.requires.config && this.config) {
      for (const configPath of skill.metadata.requires.config) {
        // Navigate the config object using dot notation
        const value = this.getConfigValue(configPath);
        if (!value) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Get a config value by path (e.g., 'llm.openai.apiKey')
   */
  private getConfigValue(path: string): any {
    if (!this.config) {
      return undefined;
    }

    const keys = path.split('.');
    let value: any = this.config;

    for (const key of keys) {
      if (value === undefined || value === null) {
        return undefined;
      }
      value = value[key];
    }

    return value;
  }
}
