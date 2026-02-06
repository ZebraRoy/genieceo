#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init';
import { statusCommand } from './commands/status';
import { onboardCommand } from './commands/onboard';
import { ceoCommand } from './commands/ceo';
import { serveCommand } from './commands/serve';
import { pluginCommand } from './commands/plugin';

const program = new Command();

program
  .name('genieceo')
  .description('AI CEO Agent - Manage your development workflow with an autonomous agent')
  .version('0.1.0');

// Init command
program
  .command('init')
  .description('Initialize workspace and configuration')
  .action(async () => {
    await initCommand();
  });

// Onboard command
program
  .command('onboard')
  .description('Interactive setup wizard for LLM and web search configuration')
  .action(async () => {
    await onboardCommand();
  });

// Status command
program
  .command('status')
  .description('Show configuration and workspace status')
  .action(async () => {
    await statusCommand();
  });

// Chat command
program
  .command('chat')
  .description('Interactive chat with GenieCEO agent')
  .option('-m, --message <text>', 'Send a single message instead of interactive mode')
  .action(async (options) => {
    await ceoCommand(options);
  });

// Serve command
program
  .command('serve')
  .description('Start the webhook server')
  .option('-p, --port <number>', 'Port to listen on (default: 3000)')
  .option('-t, --auth-token <token>', 'Authentication token for requests')
  .action(async (options) => {
    await serveCommand(options);
  });

// Plugin command
program
  .command('plugin')
  .description('Manage integration plugins')
  .argument('<action>', 'Action: list, install, uninstall, reload')
  .argument('[name]', 'Plugin name')
  .option('-c, --code <code>', 'Plugin code (for install)')
  .action(async (action, name, options) => {
    await pluginCommand({ action, name, code: options.code });
  });

// Parse arguments
program.parse(process.argv);
