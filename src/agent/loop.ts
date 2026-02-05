import type { Config } from '../types';
import { LLMProvider } from '../providers/llm';
import { ToolRegistry } from '../tools/base';
import { SkillLoader } from '../skills/loader';
import { ContextBuilder } from './context';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Agent Loop
 * Main agent execution logic using @mariozechner/pi-ai
 */
export class AgentLoop {
  private config: Config;
  private llmProvider: LLMProvider;
  private toolRegistry: ToolRegistry;
  private skillLoader: SkillLoader;
  private contextBuilder: ContextBuilder;

  constructor(
    config: Config,
    toolRegistry: ToolRegistry,
    skillLoader: SkillLoader
  ) {
    this.config = config;
    this.llmProvider = new LLMProvider(config);
    this.toolRegistry = toolRegistry;
    this.skillLoader = skillLoader;
    this.contextBuilder = new ContextBuilder(config, skillLoader, toolRegistry);
  }

  /**
   * Run the agent with a user message
   */
  async run(userMessage: string): Promise<string> {
    try {
      // Build system prompt
      const systemPrompt = await this.contextBuilder.buildSystemPrompt();

      // Prepare messages
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userMessage,
        },
      ];

      // Get tools in pi-ai format
      const tools = this.toolRegistry.toPiAiTools();

      // Generate response with automatic tool calling
      const result = await this.llmProvider.generate(
        messages,
        tools,
        this.config.maxIterations
      );

      return result.text;
    } catch (error) {
      throw new Error(`Agent execution failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Run the agent with conversation history
   */
  async runWithHistory(
    userMessage: string,
    history: ChatMessage[]
  ): Promise<{ response: string; updatedHistory: ChatMessage[] }> {
    try {
      // Build system prompt
      const systemPrompt = await this.contextBuilder.buildSystemPrompt();

      // Prepare messages with history
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: systemPrompt,
        },
        ...history,
        {
          role: 'user',
          content: userMessage,
        },
      ];

      // Get tools in pi-ai format
      const tools = this.toolRegistry.toPiAiTools();

      // Generate response with automatic tool calling
      const result = await this.llmProvider.generate(
        messages,
        tools,
        this.config.maxIterations
      );

      // Update history with new exchange
      const updatedHistory = [
        ...history,
        {
          role: 'user' as const,
          content: userMessage,
        },
        {
          role: 'assistant' as const,
          content: result.text,
        },
      ];

      return {
        response: result.text,
        updatedHistory,
      };
    } catch (error) {
      throw new Error(`Agent execution failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Get the tool registry (useful for subagents)
   */
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  /**
   * Get the config
   */
  getConfig(): Config {
    return this.config;
  }
}
