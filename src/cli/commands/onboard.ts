import chalk from 'chalk';
import * as readline from 'readline';
import { checkbox, input, select } from '@inquirer/prompts';
import { getConfigManager } from '../../config/manager';
import { LLMProvider } from '../../providers/llm';
import { getProviders } from '@mariozechner/pi-ai';
import type { ConfigType } from '../../config/schema';

/**
 * Onboarding command
 * Interactive setup for LLM and web search configuration
 */
export async function onboardCommand(): Promise<void> {
  console.log(chalk.cyan.bold('\n👋 Welcome to genieceo onboarding!\n'));
  console.log(chalk.white('This wizard will help you configure your AI agent.\n'));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const configManager = getConfigManager();
    let config = await configManager.load();

    // Step 1: Configure LLM Provider
    console.log(chalk.cyan.bold('Step 1: LLM Configuration'));
    console.log(chalk.white('─'.repeat(50)));
    config = await configureLLM(rl, config);

    // Step 2: Health check LLM
    console.log(chalk.cyan.bold('\nStep 2: LLM Health Check'));
    console.log(chalk.white('─'.repeat(50)));
    await healthCheckLLM(config);

    // Step 3: Configure Web Search
    console.log(chalk.cyan.bold('\nStep 3: Web Search Configuration'));
    console.log(chalk.white('─'.repeat(50)));
    config = await configureWebSearch(rl, config);

    // Save final configuration
    await configManager.save(config);

    // Success message
    console.log(chalk.green.bold('\n✨ Onboarding complete!'));
    console.log(chalk.white('\nYour configuration has been saved to:'));
    console.log(chalk.white(`  ${configManager.getConfigPath()}`));
    console.log(chalk.white('\nNext steps:'));
    console.log(chalk.white('  • Run: genieceo'));
    console.log(chalk.white('  • Or: genieceo -m "your message"'));
    console.log(chalk.white('  • Check status: genieceo status\n'));

    rl.close();
  } catch (error) {
    rl.close();
    console.error(chalk.red('\n✗ Onboarding failed:'));
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

/**
 * Configure LLM provider
 */
async function configureLLM(
  rl: readline.Interface,
  config: ConfigType
): Promise<ConfigType> {
  // Get available providers
  const availableProviders = getProviders() as string[];
  
  // Multi-select providers to configure
  const selectedProviders = await checkbox({
    message: 'Select providers to configure (Space to select, Enter to continue):',
    choices: availableProviders.map((provider) => ({
      name: provider,
      value: provider,
      checked: false,
    })),
    required: true,
    theme: {
      style: {
        // High contrast colors for WCAG AA compliance
        highlight: chalk.cyan,  // Cyan on black has good contrast
        description: chalk.white,
      },
    },
  });

  // Configure API keys for each selected provider
  for (const provider of selectedProviders) {
    console.log(chalk.cyan(`\nConfiguring ${provider}...`));
    
    // Get current API key
    const currentKey = provider === 'openai' 
      ? config.llm.openai.apiKey 
      : config.llm.anthropic?.apiKey || '';
    
    const keyPrompt = currentKey 
      ? `Enter ${provider} API key (press Enter to keep current):`
      : `Enter ${provider} API key:`;

    const apiKey = await input({
      message: keyPrompt,
      default: currentKey ? '***hidden***' : undefined,
      theme: {
        style: {
          message: chalk.white,
          answer: chalk.green,
        },
      },
    });

    // Only update if not the hidden placeholder
    const finalApiKey = apiKey === '***hidden***' ? currentKey : apiKey.trim();

    if (!finalApiKey) {
      throw new Error(`API key is required for ${provider}`);
    }

    // Update config with API key
    if (provider === 'openai') {
      config.llm.openai.apiKey = finalApiKey;
    } else if (provider === 'anthropic') {
      config.llm.anthropic = { apiKey: finalApiKey };
    }

    console.log(chalk.green(`✓ ${provider} API key saved`));
  }

  // Now select which provider's models to browse
  const primaryProvider = await select({
    message: 'Select primary provider for model selection:',
    choices: selectedProviders.map((provider) => ({
      name: provider,
      value: provider,
    })),
    theme: {
      style: {
        highlight: chalk.cyan,
        description: chalk.white,
      },
    },
  });

  // Get available models for the primary provider
  const tempLLMProvider = new LLMProvider(config);
  const models = tempLLMProvider.getAvailableModels(primaryProvider as any);

  if (models.length === 0) {
    console.log(chalk.yellow('⚠️  Could not fetch models for this provider'));
    
    // Ask user to manually input model
    const modelInput = await input({
      message: `Enter model ID (e.g., gpt-4o, claude-3-5-sonnet-20241022):`,
      required: true,
      theme: {
        style: {
          message: chalk.white,
          answer: chalk.green,
        },
      },
    });
    
    config.model = `${primaryProvider}:${modelInput.trim()}`;
  } else {
    // Multi-select models to view, then pick one as primary
    const selectedModels = await checkbox({
      message: 'Select models you want to use (Space to select, Enter to continue):',
      choices: models.map((model) => ({
        name: `${model.id}${model.name ? ` - ${model.name}` : ''}`,
        value: model.id,
        checked: false,
      })),
      required: true,
      theme: {
        style: {
          highlight: chalk.cyan,
          description: chalk.white,
        },
      },
    });

    // If multiple models selected, ask which one should be the default
    let primaryModel: string;
    if (selectedModels.length > 1) {
      primaryModel = await select({
        message: 'Select the default model to use:',
        choices: selectedModels.map((modelId) => ({
          name: modelId,
          value: modelId,
        })),
        theme: {
          style: {
            highlight: chalk.cyan,
            description: chalk.white,
          },
        },
      });
    } else {
      primaryModel = selectedModels[0];
    }

    config.model = `${primaryProvider}:${primaryModel}`;
  }

  console.log(chalk.green(`✓ Model set to: ${config.model}`));

  return config;
}

/**
 * Health check LLM configuration
 */
async function healthCheckLLM(config: ConfigType): Promise<void> {
  console.log(chalk.white('\nTesting LLM connection...'));

  const llmProvider = new LLMProvider(config);

  // Validate configuration
  const validation = llmProvider.validateConfig();
  if (!validation.valid) {
    console.log(chalk.red('✗ Configuration validation failed:'));
    validation.errors?.forEach(error => {
      console.log(chalk.red(`  • ${error}`));
    });
    throw new Error('LLM configuration is invalid');
  }

  console.log(chalk.green('✓ Configuration validated'));

  // Try a simple generation
  try {
    console.log(chalk.white('Making a test API call...'));
    
    const response = await llmProvider.generate(
      [
        {
          role: 'user',
          content: 'Say "Hello! I am working correctly." if you can read this.',
        },
      ],
      {},
      1
    );

    console.log(chalk.green('✓ LLM health check passed'));
    console.log(chalk.white(`  Response: ${response.text.slice(0, 100)}${response.text.length > 100 ? '...' : ''}`));
    console.log(chalk.white(`  Tokens used: ${response.usage.totalTokens}`));
  } catch (error) {
    console.log(chalk.red('✗ LLM health check failed'));
    throw new Error(`LLM test failed: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Configure web search tool
 */
async function configureWebSearch(
  rl: readline.Interface,
  config: ConfigType
): Promise<ConfigType> {
  const selectedProvider = await select({
    message: 'Select web search provider:',
    choices: [
      {
        name: 'auto - Try Tavily, then Brave, then browser (recommended)',
        value: 'auto',
        description: 'Automatically fallback through available providers',
      },
      {
        name: 'tavily - Tavily Search API',
        value: 'tavily',
        description: 'Requires API key from https://tavily.com',
      },
      {
        name: 'brave - Brave Search API',
        value: 'brave',
        description: 'Requires API key from https://brave.com/search/api',
      },
      {
        name: 'browser - Free browser-based search',
        value: 'browser',
        description: 'No API key needed, but may have limited results',
      },
    ],
    theme: {
      style: {
        highlight: chalk.cyan,
        description: chalk.white,
      },
    },
  });

  config.tools.webSearch.provider = selectedProvider as any;
  console.log(chalk.green(`✓ Web search provider set to: ${selectedProvider}`));

  // Configure API keys based on selection
  if (selectedProvider === 'tavily' || selectedProvider === 'auto') {
    const currentKey = config.tools.webSearch.tavily?.apiKey || '';
    
    const shouldConfigureTavily = selectedProvider === 'tavily' || 
      await select({
        message: 'Configure Tavily API?',
        choices: [
          { name: 'Yes', value: true },
          { name: 'No', value: false },
        ],
        theme: {
          style: {
            highlight: chalk.cyan,
          },
        },
      });

    if (shouldConfigureTavily) {
      const keyPrompt = currentKey
        ? 'Enter Tavily API key (press Enter to keep current):'
        : 'Enter Tavily API key (get one at https://tavily.com):';

      const apiKey = await input({
        message: keyPrompt,
        default: currentKey ? '***hidden***' : undefined,
        theme: {
          style: {
            message: chalk.white,
            answer: chalk.green,
          },
        },
      });

      const finalKey = apiKey === '***hidden***' ? currentKey : apiKey.trim();

      if (finalKey) {
        config.tools.webSearch.tavily = { apiKey: finalKey };
        console.log(chalk.green('✓ Tavily API key saved'));
      } else if (selectedProvider === 'tavily') {
        throw new Error('Tavily API key is required when using tavily provider');
      }
    }
  }

  if (selectedProvider === 'brave' || selectedProvider === 'auto') {
    const currentKey = config.tools.webSearch.brave?.apiKey || '';
    
    const shouldConfigureBrave = selectedProvider === 'brave' || 
      await select({
        message: 'Configure Brave API?',
        choices: [
          { name: 'Yes', value: true },
          { name: 'No', value: false },
        ],
        theme: {
          style: {
            highlight: chalk.cyan,
          },
        },
      });

    if (shouldConfigureBrave) {
      const keyPrompt = currentKey
        ? 'Enter Brave API key (press Enter to keep current):'
        : 'Enter Brave API key (get one at https://brave.com/search/api):';

      const apiKey = await input({
        message: keyPrompt,
        default: currentKey ? '***hidden***' : undefined,
        theme: {
          style: {
            message: chalk.white,
            answer: chalk.green,
          },
        },
      });

      const finalKey = apiKey === '***hidden***' ? currentKey : apiKey.trim();

      if (finalKey) {
        config.tools.webSearch.brave = { apiKey: finalKey };
        console.log(chalk.green('✓ Brave API key saved'));
      } else if (selectedProvider === 'brave') {
        throw new Error('Brave API key is required when using brave provider');
      }
    }
  }

  if (selectedProvider === 'browser') {
    console.log(chalk.yellow('ℹ️  Browser-based search requires no API key but may have limited results'));
  }

  return config;
}

/**
 * Helper function to ask a question and return the answer
 */
function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}
