#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init';
import { statusCommand } from './commands/status';
import { onboardCommand } from './commands/onboard';
import { ceoCommand } from './commands/ceo';

const program = new Command();

program
  .name('genieceo')
  .description('AI CEO Agent - Manage your development workflow with an autonomous agent')
  .version('0.1.0')
  .option('-m, --message <text>', 'Send a single message to the CEO agent')
  .action(async (options) => {
    // Default action: start CEO agent
    await ceoCommand(options);
  });

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

// Parse arguments
program.parse(process.argv);
