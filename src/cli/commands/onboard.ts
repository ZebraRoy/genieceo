import chalk from 'chalk';
import * as readline from 'readline';
import { getConfigManager } from '../../config/manager';
import { LLMProvider } from '../../providers/llm';
import { getProviders } from '@mariozechner/pi-ai';
import type { ConfigType } from '../../config/schema';

/**
 * Onboarding command
 * Interactive setup for LLM and web search configuration
 */
export async function onboardCommand(): Promise<void> {
  console.log(chalk.blue.bold('\n👋 Welcome to genieceo onboarding!\n'));
  console.log(chalk.gray('This wizard will help you configure your AI agent.\n'));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const configManager = getConfigManager();
    let config = await configManager.load();

    // Step 1: Configure LLM Provider
    console.log(chalk.cyan.bold('Step 1: LLM Configuration'));
    console.log(chalk.gray('─'.repeat(50)));
    config = await configureLLM(rl, config);

    // Step 2: Health check LLM
    console.log(chalk.cyan.bold('\nStep 2: LLM Health Check'));
    console.log(chalk.gray('─'.repeat(50)));
    await healthCheckLLM(config);

    // Step 3: Configure Web Search
    console.log(chalk.cyan.bold('\nStep 3: Web Search Configuration'));
    console.log(chalk.gray('─'.repeat(50)));
    config = await configureWebSearch(rl, config);

    // Save final configuration
    await configManager.save(config);

    // Success message
    console.log(chalk.green.bold('\n✨ Onboarding complete!'));
    console.log(chalk.gray('\nYour configuration has been saved to:'));
    console.log(chalk.gray(`  ${configManager.getConfigPath()}`));
    console.log(chalk.gray('\nNext steps:'));
    console.log(chalk.gray('  • Run: genieceo chat'));
    console.log(chalk.gray('  • Or: genieceo chat -m "your message"'));
    console.log(chalk.gray('  • Check status: genieceo status\n'));

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
  console.log(chalk.gray('\nAvailable LLM providers:'));
  availableProviders.forEach((provider, index) => {
    console.log(chalk.gray(`  ${index + 1}. ${provider}`));
  });

  // Ask for provider
  const provider = await question(
    rl,
    chalk.white(`\nSelect a provider [${availableProviders.join('/')}] (default: openai): `)
  );
  const selectedProvider = provider.trim().toLowerCase() || 'openai';

  if (!availableProviders.includes(selectedProvider)) {
    throw new Error(`Invalid provider. Choose from: ${availableProviders.join(', ')}`);
  }

  // Ask for API key
  const currentKey = selectedProvider === 'openai' 
    ? config.llm.openai.apiKey 
    : config.llm.anthropic?.apiKey || '';
  
  const keyPrompt = currentKey 
    ? `Enter ${selectedProvider} API key (press Enter to keep current): `
    : `Enter ${selectedProvider} API key: `;

  const apiKey = await question(rl, chalk.white(keyPrompt));
  const finalApiKey = apiKey.trim() || currentKey;

  if (!finalApiKey) {
    throw new Error('API key is required');
  }

  // Update config with API key
  if (selectedProvider === 'openai') {
    config.llm.openai.apiKey = finalApiKey;
  } else if (selectedProvider === 'anthropic') {
    config.llm.anthropic = { apiKey: finalApiKey };
  }

  console.log(chalk.green('✓ API key saved'));

  // Get available models for the provider
  const tempLLMProvider = new LLMProvider(config);
  const models = tempLLMProvider.getAvailableModels(selectedProvider as any);

  if (models.length === 0) {
    console.log(chalk.yellow('⚠️  Could not fetch models for this provider'));
    
    // Ask user to manually input model
    const modelInput = await question(
      rl,
      chalk.white(`\nEnter model ID (e.g., gpt-4o, claude-3-5-sonnet-20241022): `)
    );
    
    if (!modelInput.trim()) {
      throw new Error('Model ID is required');
    }
    
    config.model = `${selectedProvider}:${modelInput.trim()}`;
  } else {
    // Display available models
    console.log(chalk.gray('\nAvailable models:'));
    models.forEach((model, index) => {
      console.log(chalk.gray(`  ${index + 1}. ${model.id}${model.name ? ` - ${model.name}` : ''}`));
    });

    // Ask for model selection
    const defaultModel = models[0].id;
    const modelInput = await question(
      rl,
      chalk.white(`\nSelect model [enter model ID or number] (default: ${defaultModel}): `)
    );

    let selectedModel: string;
    const input = modelInput.trim();
    
    if (!input) {
      selectedModel = defaultModel;
    } else if (/^\d+$/.test(input)) {
      // User entered a number
      const index = parseInt(input) - 1;
      if (index >= 0 && index < models.length) {
        selectedModel = models[index].id;
      } else {
        throw new Error(`Invalid model number. Choose 1-${models.length}`);
      }
    } else {
      // User entered model ID directly
      selectedModel = input;
    }

    config.model = `${selectedProvider}:${selectedModel}`;
  }

  console.log(chalk.green(`✓ Model set to: ${config.model}`));

  return config;
}

/**
 * Health check LLM configuration
 */
async function healthCheckLLM(config: ConfigType): Promise<void> {
  console.log(chalk.gray('\nTesting LLM connection...'));

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
    console.log(chalk.gray('Making a test API call...'));
    
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
    console.log(chalk.gray(`  Response: ${response.text.slice(0, 100)}${response.text.length > 100 ? '...' : ''}`));
    console.log(chalk.gray(`  Tokens used: ${response.usage.totalTokens}`));
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
  console.log(chalk.gray('\nWeb search providers:'));
  console.log(chalk.gray('  1. auto - Try Tavily, then Brave, then browser (recommended)'));
  console.log(chalk.gray('  2. tavily - Tavily Search API (requires API key)'));
  console.log(chalk.gray('  3. brave - Brave Search API (requires API key)'));
  console.log(chalk.gray('  4. browser - Free browser-based search (no API key needed)'));

  const provider = await question(
    rl,
    chalk.white('\nSelect web search provider [auto/tavily/brave/browser] (default: auto): ')
  );
  const selectedProvider = provider.trim().toLowerCase() || 'auto';

  if (!['auto', 'tavily', 'brave', 'browser'].includes(selectedProvider)) {
    throw new Error('Invalid provider. Choose from: auto, tavily, brave, browser');
  }

  config.tools.webSearch.provider = selectedProvider as any;
  console.log(chalk.green(`✓ Web search provider set to: ${selectedProvider}`));

  // Configure API keys based on selection
  if (selectedProvider === 'tavily' || selectedProvider === 'auto') {
    const currentKey = config.tools.webSearch.tavily?.apiKey || '';
    const skipTavily = selectedProvider === 'auto' 
      ? await question(rl, chalk.white('\nConfigure Tavily API? [y/N]: '))
      : 'y';

    if (skipTavily.toLowerCase() === 'y' || selectedProvider === 'tavily') {
      const keyPrompt = currentKey
        ? 'Enter Tavily API key (press Enter to keep current): '
        : 'Enter Tavily API key (get one at https://tavily.com): ';

      const apiKey = await question(rl, chalk.white(keyPrompt));
      const finalKey = apiKey.trim() || currentKey;

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
    const skipBrave = selectedProvider === 'auto'
      ? await question(rl, chalk.white('\nConfigure Brave API? [y/N]: '))
      : 'y';

    if (skipBrave.toLowerCase() === 'y' || selectedProvider === 'brave') {
      const keyPrompt = currentKey
        ? 'Enter Brave API key (press Enter to keep current): '
        : 'Enter Brave API key (get one at https://brave.com/search/api): ';

      const apiKey = await question(rl, chalk.white(keyPrompt));
      const finalKey = apiKey.trim() || currentKey;

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
