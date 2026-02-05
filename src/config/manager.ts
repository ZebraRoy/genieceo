import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { ConfigSchema, ConfigType, createDefaultConfig } from './schema';

/**
 * Configuration Manager
 * Handles loading, saving, and validation of configuration
 */

export class ConfigManager {
  private configPath: string;
  private config: ConfigType | null = null;

  constructor(configPath?: string) {
    this.configPath = configPath || join(homedir(), '.genieceo', 'config.json');
  }

  /**
   * Get the configuration path
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Load configuration from file
   */
  async load(): Promise<ConfigType> {
    if (this.config) {
      return this.config;
    }

    try {
      if (existsSync(this.configPath)) {
        const content = await readFile(this.configPath, 'utf-8');
        const rawConfig = JSON.parse(content);
        
        // Apply environment variable overrides
        this.applyEnvOverrides(rawConfig);
        
        // Validate and parse with Zod
        this.config = ConfigSchema.parse(rawConfig);
        return this.config;
      } else {
        // Create default config if file doesn't exist
        return await this.createDefault();
      }
    } catch (error) {
      throw new Error(`Failed to load config: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Create default configuration file
   */
  async createDefault(): Promise<ConfigType> {
    const defaultConfig = createDefaultConfig();
    
    // Ensure directory exists
    const dir = dirname(this.configPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    // Save to file
    await writeFile(this.configPath, JSON.stringify(defaultConfig, null, 2));
    
    // Validate and parse
    this.config = ConfigSchema.parse(defaultConfig);
    return this.config;
  }

  /**
   * Save configuration to file
   */
  async save(config: ConfigType): Promise<void> {
    const dir = dirname(this.configPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    await writeFile(this.configPath, JSON.stringify(config, null, 2));
    this.config = config;
  }

  /**
   * Update specific config values
   */
  async update(updates: Partial<ConfigType>): Promise<ConfigType> {
    const current = await this.load();
    const updated = { ...current, ...updates };
    await this.save(updated);
    return updated;
  }

  /**
   * Apply environment variable overrides
   */
  private applyEnvOverrides(config: any): void {
    // LLM API keys
    if (process.env.GENIECEO_LLM_OPENAI_API_KEY) {
      if (!config.llm) config.llm = {};
      if (!config.llm.openai) config.llm.openai = {};
      config.llm.openai.apiKey = process.env.GENIECEO_LLM_OPENAI_API_KEY;
    }

    if (process.env.GENIECEO_LLM_ANTHROPIC_API_KEY) {
      if (!config.llm) config.llm = {};
      if (!config.llm.anthropic) config.llm.anthropic = {};
      config.llm.anthropic.apiKey = process.env.GENIECEO_LLM_ANTHROPIC_API_KEY;
    }

    // Tool settings
    if (process.env.GENIECEO_TOOLS_WEBSEARCH_API_KEY) {
      if (!config.tools) config.tools = {};
      if (!config.tools.webSearch) config.tools.webSearch = {};
      config.tools.webSearch.apiKey = process.env.GENIECEO_TOOLS_WEBSEARCH_API_KEY;
    }

    // Model
    if (process.env.GENIECEO_MODEL) {
      config.model = process.env.GENIECEO_MODEL;
    }

    // Workspace
    if (process.env.GENIECEO_WORKSPACE) {
      config.workspace = process.env.GENIECEO_WORKSPACE;
    }
  }

  /**
   * Validate configuration
   */
  async validate(): Promise<{ valid: boolean; errors?: string[] }> {
    try {
      const config = await this.load();
      
      const errors: string[] = [];

      // Check for required API keys
      if (!config.llm.openai.apiKey) {
        errors.push('OpenAI API key is required');
      }

      // Validate model format
      if (!config.model.includes(':')) {
        errors.push('Model must be in format "provider:model" (e.g., "openai:gpt-4o")');
      }

      return {
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }
}

// Singleton instance
let configManagerInstance: ConfigManager | null = null;

export function getConfigManager(configPath?: string): ConfigManager {
  if (!configManagerInstance) {
    configManagerInstance = new ConfigManager(configPath);
  }
  return configManagerInstance;
}
