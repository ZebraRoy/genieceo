#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init';
import { chatCommand } from './commands/chat';
import { statusCommand } from './commands/status';

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

// Chat command
program
  .command('chat')
  .description('Start interactive chat or send a single message')
  .option('-m, --message <text>', 'Send a single message instead of interactive mode')
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
