import chalk from 'chalk';
import ora from 'ora';
import { getConfigManager } from '../../config/manager';
import { getWorkspaceManager } from '../../workspace/manager';
import { createGenieCEOAgent } from '../../agent';
import { WebhookServer } from '../../server/webhook';

interface ServeOptions {
  port?: string;
  authToken?: string;
}

/**
 * Serve command - Start the webhook server
 */
export async function serveCommand(options: ServeOptions): Promise<void> {
  try {
    // Load configuration
    const configManager = getConfigManager();
    const config = await configManager.load();

    // Validate configuration
    const validation = await configManager.validate();
    if (!validation.valid) {
      console.error(chalk.red('✗ Configuration error:'));
      validation.errors?.forEach(error => {
        console.error(chalk.red(`  • ${error}`));
      });
      console.log(chalk.gray('\nRun "genieceo init" to set up configuration'));
      process.exit(1);
    }

    // Ensure workspace is initialized
    const workspaceManager = getWorkspaceManager(config.workspace);
    const isInitialized = await workspaceManager.isInitialized();
    if (!isInitialized) {
      console.log(chalk.yellow('Workspace not initialized. Initializing now...'));
      await workspaceManager.init();
    }

    // Parse port
    const port = options.port ? parseInt(options.port, 10) : 3000;
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error(chalk.red('✗ Invalid port number'));
      process.exit(1);
    }

    // Create GenieCEO agent
    const spinner = ora('Initializing GenieCEO...').start();
    const agent = await createGenieCEOAgent(config);
    spinner.succeed('GenieCEO initialized');

    // Create webhook server
    const server = new WebhookServer(agent, config, options.authToken);

    // Start server
    spinner.start('Starting webhook server...');
    await server.start(port);
    spinner.succeed('Webhook server started');

    // Handle shutdown
    const shutdown = async () => {
      console.log(chalk.yellow('\n\nShutting down gracefully...'));
      await server.stop();
      console.log(chalk.gray('Goodbye! 👋\n'));
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Keep process alive
    await new Promise(() => {});
  } catch (error) {
    console.error(chalk.red('\n✗ Error:'));
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
