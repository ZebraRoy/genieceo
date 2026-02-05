import { 
  getModel, 
  getProviders, 
  getModels,
  complete, 
  Context,
  Tool,
  AssistantMessage,
  type KnownProvider
} from '@mariozechner/pi-ai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Config } from '../types';

/**
 * LLM Provider using @mariozechner/pi-ai
 * Provides unified interface for multiple LLM providers with automatic model discovery
 */
export class LLMProvider {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Get the appropriate model instance based on config
   */
  private getModelInstance() {
    const [provider, modelId] = this.config.model.split(':');

    if (!modelId) {
      throw new Error('Invalid model format. Use "provider:model" (e.g., "openai:gpt-4o")');
    }

    try {
      // pi-ai automatically handles model discovery and validation
      return getModel(provider as any, modelId);
    } catch (error) {
      throw new Error(`Failed to get model ${this.config.model}: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): string[] {
    return getProviders();
  }

  /**
   * Get available models for a provider
   */
  getAvailableModels(provider: string): Array<{ id: string; name: string }> {
    try {
      // Validate provider exists
      const availableProviders = getProviders() as string[];
      if (!availableProviders.includes(provider)) {
        return [];
      }
      // Safe cast: we validated the provider exists in the providers list
      // @ts-ignore - provider is validated to exist in the providers list
      const models = getModels(provider);
      return models.map(m => ({ id: m.id, name: m.name }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Generate text with automatic tool calling
   */
  async generate(
    messages: any[],
    tools: Record<string, any>,
    maxSteps?: number
  ): Promise<{
    text: string;
    toolCalls: any[];
    toolResults: any[];
    finishReason: string;
    usage: any;
  }> {
    try {
      const model = this.getModelInstance();
      
      // Convert tools to pi-ai format
      const piTools: Tool[] = Object.entries(tools).map(([name, tool]) => {
        // Convert Zod schema to JSON Schema if it's a Zod object
        let parameters = tool.parameters || {};
        if (parameters && typeof parameters === 'object' && '_def' in parameters) {
          // This is a Zod schema, convert it to JSON Schema
          const jsonSchema = zodToJsonSchema(parameters as any, { 
            $refStrategy: 'none',
            target: 'openApi3'
          });
          // Remove the top-level $schema property as it's not needed
          const { $schema, ...schemaWithoutMeta } = jsonSchema as any;
          parameters = schemaWithoutMeta;
        }
        
        return {
          name,
          description: tool.description || '',
          parameters,
        };
      });

      // Convert messages to pi-ai Context format
      const context: Context = {
        messages: messages.map(msg => {
          if (typeof msg.content === 'string') {
            return {
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
            };
          }
          return msg;
        }),
        tools: piTools.length > 0 ? piTools : undefined,
      };

      // Get API key based on provider
      const [provider] = this.config.model.split(':');
      const apiKey = this.getApiKey(provider);

      // Use complete() for synchronous generation
      const response: AssistantMessage = await complete(model, context, {
        apiKey,
      });

      // Extract text from response
      const textBlocks = response.content.filter(block => block.type === 'text');
      const text = textBlocks.map(block => (block as any).text).join('\n');

      // Extract tool calls
      const toolCalls = response.content
        .filter(block => block.type === 'toolCall')
        .map(block => {
          const toolCall = block as any;
          return {
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            args: toolCall.arguments,
          };
        });

      return {
        text,
        toolCalls,
        toolResults: [], // pi-ai handles tool results separately
        finishReason: response.stopReason,
        usage: {
          promptTokens: response.usage.input,
          completionTokens: response.usage.output,
          totalTokens: response.usage.input + response.usage.output,
        },
      };
    } catch (error) {
      throw new Error(`LLM generation failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Get API key for provider
   */
  private getApiKey(provider: string): string {
    switch (provider) {
      case 'openai':
        return this.config.llm.openai.apiKey;
      case 'anthropic':
        return this.config.llm.anthropic?.apiKey || '';
      default:
        throw new Error(`No API key configured for provider: ${provider}`);
    }
  }

  /**
   * Validate configuration
   */
  validateConfig(): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const [provider, modelId] = this.config.model.split(':');

    if (!provider || !modelId) {
      errors.push('Model must be in format "provider:model"');
    }

    // Check if provider exists (only validate if we have a provider string)
    if (provider) {
      const availableProviders = getProviders() as string[];
      if (!availableProviders.includes(provider)) {
        errors.push(`Unknown provider: ${provider}. Available: ${availableProviders.join(', ')}`);
      }
    }

    // Check API key
    if (provider === 'openai' && !this.config.llm.openai.apiKey) {
      errors.push('OpenAI API key is required');
    }

    if (provider === 'anthropic' && !this.config.llm.anthropic?.apiKey) {
      errors.push('Anthropic API key is required but not configured');
    }

    // Validate model exists for provider (only if provider is valid)
    if (provider) {
      const availableProviders = getProviders() as string[];
      if (availableProviders.includes(provider)) {
        try {
          const availableModels = this.getAvailableModels(provider);
          const modelExists = availableModels.some(m => m.id === modelId);
          if (availableModels.length > 0 && !modelExists) {
            errors.push(`Model ${modelId} not found for provider ${provider}. Available models: ${availableModels.map(m => m.id).join(', ')}`);
          }
        } catch (error) {
          // Ignore model validation errors if provider is not configured
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
