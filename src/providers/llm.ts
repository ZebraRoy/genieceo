import { generateText, CoreMessage, CoreTool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { Config } from '../types';

/**
 * LLM Provider using Vercel AI SDK
 * Provides unified interface for multiple LLM providers
 */
export class LLMProvider {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Get the appropriate model instance based on config
   */
  private getModel() {
    const [provider, model] = this.config.model.split(':');

    if (!model) {
      throw new Error('Invalid model format. Use "provider:model" (e.g., "openai:gpt-4o")');
    }

    switch (provider) {
      case 'openai':
        // Create OpenAI provider instance with API key
        const openaiProvider = createOpenAI({
          apiKey: this.config.llm.openai.apiKey,
        });
        return openaiProvider(model);
      case 'anthropic':
        // Future implementation when anthropic is added
        if (!this.config.llm.anthropic?.apiKey) {
          throw new Error('Anthropic API key not configured');
        }
        throw new Error('Anthropic provider not yet implemented. Install @ai-sdk/anthropic to enable.');
      default:
        throw new Error(`Unknown provider: ${provider}. Supported providers: openai`);
    }
  }

  /**
   * Generate text with automatic tool calling
   */
  async generate(
    messages: CoreMessage[],
    tools: Record<string, CoreTool>,
    maxSteps?: number
  ): Promise<{
    text: string;
    toolCalls: any[];
    toolResults: any[];
    finishReason: string;
    usage: any;
  }> {
    try {
      const result = await generateText({
        model: this.getModel(),
        messages,
        tools,
        maxSteps: maxSteps || this.config.maxIterations,
      });

      return {
        text: result.text,
        toolCalls: result.toolCalls || [],
        toolResults: result.toolResults || [],
        finishReason: result.finishReason,
        usage: result.usage,
      };
    } catch (error) {
      throw new Error(`LLM generation failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Validate configuration
   */
  validateConfig(): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const [provider, model] = this.config.model.split(':');

    if (!provider || !model) {
      errors.push('Model must be in format "provider:model"');
    }

    if (provider === 'openai' && !this.config.llm.openai.apiKey) {
      errors.push('OpenAI API key is required');
    }

    if (provider === 'anthropic' && !this.config.llm.anthropic?.apiKey) {
      errors.push('Anthropic API key is required but not configured');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
