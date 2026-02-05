/**
 * Shared TypeScript types for genieceo
 */

export interface Config {
  workspace: string;
  model: string;
  maxIterations: number;
  llm: {
    openai: {
      apiKey: string;
    };
    anthropic?: {
      apiKey: string;
    };
  };
  tools: {
    webSearch: {
      apiKey?: string;
    };
    shell: {
      timeout: number;
      allowDangerous: boolean;
    };
  };
}

export interface Skill {
  name: string;
  description: string;
  content: string;
  metadata?: {
    always?: boolean;
    requires?: {
      bins?: string[];
      config?: string[]; // Config paths like 'llm.openai.apiKey' or 'tools.webSearch.apiKey'
    };
  };
}

export interface Tool {
  name: string;
  description: string;
  parameters: any; // Zod schema
  execute(params: any): Promise<any>;
}
