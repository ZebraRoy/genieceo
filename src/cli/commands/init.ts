import chalk from 'chalk';
import { getConfigManager } from '../../config/manager';
import { getWorkspaceManager } from '../../workspace/manager';

/**
 * Initialize command
 * Sets up workspace and creates default configuration
 */
export async function initCommand(): Promise<void> {
  console.log(chalk.blue.bold('\n🚀 Initializing genieceo...\n'));

  try {
    // Initialize config
    const configManager = getConfigManager();
    const config = await configManager.load();
    
    console.log(chalk.green('✓') + ' Configuration loaded/created');
    console.log(chalk.gray(`  Location: ${configManager.getConfigPath()}`));

    // Initialize workspace
    const workspaceManager = getWorkspaceManager(config.workspace);
    await workspaceManager.init();
    
    console.log(chalk.green('✓') + ' Workspace initialized');
    console.log(chalk.gray(`  Location: ${workspaceManager.getWorkspacePath()}`));

    // Validate configuration
    const validation = await configManager.validate();
    
    if (!validation.valid) {
      console.log(chalk.yellow('\n⚠️  Configuration warnings:'));
      validation.errors?.forEach(error => {
        console.log(chalk.yellow(`  • ${error}`));
      });
      
      console.log(chalk.gray('\nTo fix:'));
      console.log(chalk.gray('  1. Edit config: ' + configManager.getConfigPath()));
      console.log(chalk.gray('  2. Set environment variable: GENIECEO_LLM_OPENAI_API_KEY'));
    } else {
      console.log(chalk.green('\n✓ Configuration is valid'));
    }

    console.log(chalk.blue.bold('\n✨ genieceo is ready!'));
    console.log(chalk.gray('\nNext steps:'));
    console.log(chalk.gray('  • Run: genieceo chat'));
    console.log(chalk.gray('  • Or: genieceo chat -m "your message"'));
    console.log(chalk.gray('  • Check status: genieceo status\n'));

  } catch (error) {
    console.error(chalk.red('✗ Initialization failed:'));
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
