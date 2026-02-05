#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init';
import { chatCommand } from './commands/chat';
import { statusCommand } from './commands/status';
import { onboardCommand } from './commands/onboard';

const program = new Command();

program
  .name('genieceo')
  .description('Ultra-lightweight AI agent CLI assistant')
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

// Chat command
program
  .command('chat')
  .description('Start interactive chat or send a single message')
  .option('-m, --message <text>', 'Send a single message instead of interactive mode')
  .option('--mode <type>', 'Mode: standard or genieceo (default: standard)', 'standard')
  .action(async (options) => {
    await chatCommand(options);
  });

// Status command
program
  .command('status')
  .description('Show configuration and workspace status')
  .action(async () => {
    await statusCommand();
  });

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
