import chalk from 'chalk';
import { getConfigManager } from '../../config/manager';
import { getWorkspaceManager } from '../../workspace/manager';
import { existsSync } from 'fs';

/**
 * Status command
 * Shows configuration and workspace status
 */
export async function statusCommand(): Promise<void> {
  console.log(chalk.blue.bold('\n📊 genieceo Status\n'));

  try {
    // Config status
    const configManager = getConfigManager();
    const configPath = configManager.getConfigPath();
    const configExists = existsSync(configPath);

    console.log(chalk.bold('Configuration:'));
    console.log(`  Location: ${configPath}`);
    console.log(`  Status: ${configExists ? chalk.green('✓ Exists') : chalk.red('✗ Not found')}`);

    if (configExists) {
      const config = await configManager.load();
      console.log(`  Model: ${config.model}`);
      console.log(`  Max Iterations: ${config.maxIterations}`);
      
      // API key status (masked)
      const openaiKey = config.llm.openai.apiKey;
      const hasOpenAI = openaiKey && openaiKey.length > 0;
      console.log(`  OpenAI API Key: ${hasOpenAI ? chalk.green('✓ Set') : chalk.red('✗ Not set')}`);
      
      if (hasOpenAI) {
        const masked = openaiKey.substring(0, 8) + '...' + openaiKey.substring(openaiKey.length - 4);
        console.log(chalk.gray(`    (${masked})`));
      }

      // Web Search Configuration
      const searchProvider = config.tools.webSearch.provider || 'auto';
      console.log(`\n  Web Search Provider: ${chalk.cyan(searchProvider)}`);
      
      // Check legacy config
      const legacyKey = config.tools.webSearch.apiKey;
      if (legacyKey) {
        console.log(chalk.yellow('    ⚠️  Legacy config detected (tools.webSearch.apiKey)'));
        console.log(chalk.yellow('    Consider migrating to tools.webSearch.brave.apiKey or tools.webSearch.tavily.apiKey'));
      }
      
      // Brave Search API key
      const braveKey = config.tools.webSearch.brave?.apiKey || config.tools.webSearch.apiKey;
      const hasBrave = braveKey && braveKey.length > 0;
      console.log(`    Brave: ${hasBrave ? chalk.green('✓ Configured') : chalk.gray('○ Not configured')}`);
      if (hasBrave) {
        const masked = braveKey.substring(0, 8) + '...' + braveKey.substring(braveKey.length - 4);
        console.log(chalk.gray(`      (${masked})`));
      }
      
      // Tavily API key
      const tavilyKey = config.tools.webSearch.tavily?.apiKey;
      const hasTavily = tavilyKey && tavilyKey.length > 0;
      console.log(`    Tavily: ${hasTavily ? chalk.green('✓ Configured') : chalk.gray('○ Not configured')}`);
      if (hasTavily) {
        const masked = tavilyKey.substring(0, 8) + '...' + tavilyKey.substring(tavilyKey.length - 4);
        console.log(chalk.gray(`      (${masked})`));
      }
      
      // Browser fallback
      console.log(`    Browser (fallback): ${chalk.green('✓ Always available')}`);
      
      if (!hasBrave && !hasTavily) {
        console.log(chalk.yellow('    ℹ️  No API-based search configured. Will use browser fallback.'));
        console.log(chalk.yellow('    For better results, configure Tavily or Brave API.'));
      }

      // Validation
      const validation = await configManager.validate();
      if (!validation.valid) {
        console.log(chalk.yellow('\n  Warnings:'));
        validation.errors?.forEach(error => {
          console.log(chalk.yellow(`    • ${error}`));
        });
      }
    }

    // Workspace status
    console.log(chalk.bold('\nWorkspace:'));
    if (configExists) {
      const config = await configManager.load();
      const workspaceManager = getWorkspaceManager(config.workspace);
      const workspacePath = workspaceManager.getWorkspacePath();
      const isInitialized = await workspaceManager.isInitialized();

      console.log(`  Location: ${workspacePath}`);
      console.log(`  Status: ${isInitialized ? chalk.green('✓ Initialized') : chalk.yellow('○ Not initialized')}`);
      
      if (isInitialized) {
        console.log(`  Skills: ${workspaceManager.getSkillsPath()}`);
        console.log(`  Files: ${workspaceManager.getFilesPath()}`);
      }
    } else {
      console.log(chalk.yellow('  Run "genieceo init" to initialize'));
    }

    console.log(chalk.bold('\nTools:'));
    console.log('  • readFile, writeFile, listDir');
    console.log('  • executeCommand (shell)');
    console.log('  • webSearch (multi-provider: Brave, Tavily, Browser)');
    console.log('  • spawnSubagent');

    console.log('');

  } catch (error) {
    console.error(chalk.red('✗ Failed to get status:'));
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
