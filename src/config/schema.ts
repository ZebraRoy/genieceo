import { z } from 'zod';
import { homedir } from 'os';
import { join } from 'path';

/**
 * Zod schema for configuration validation
 */

export const ConfigSchema = z.object({
  workspace: z.string().default(join(homedir(), '.genieceo', 'workspace')),
  model: z.string().default('openai:gpt-4o'),
  maxIterations: z.number().int().positive().default(15),
  llm: z.object({
    openai: z.object({
      apiKey: z.string(),
    }),
    anthropic: z.object({
      apiKey: z.string(),
    }).optional(),
  }),
  tools: z.object({
    webSearch: z.object({
      apiKey: z.string().optional(),
    }).default({}),
    shell: z.object({
      timeout: z.number().int().positive().default(30000),
      allowDangerous: z.boolean().default(false),
    }).default({
      timeout: 30000,
      allowDangerous: false,
    }),
  }).default({
    webSearch: {},
    shell: {
      timeout: 30000,
      allowDangerous: false,
    },
  }),
});

export type ConfigType = z.infer<typeof ConfigSchema>;

/**
 * Create default configuration
 */
export function createDefaultConfig(): Partial<ConfigType> {
  return {
    workspace: join(homedir(), '.genieceo', 'workspace'),
    model: 'openai:gpt-4o',
    maxIterations: 15,
    llm: {
      openai: {
        apiKey: '',
      },
    },
    tools: {
      webSearch: {},
      shell: {
        timeout: 30000,
        allowDangerous: false,
      },
    },
  };
}
