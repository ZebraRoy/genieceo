/**
 * Plugin management commands
 */

import chalk from 'chalk';
import { getConfigManager } from '../../config/manager';
import { PluginManager } from '../../plugins/manager';
import { createGenieCEOAgent } from '../../agent';

interface PluginCommandOptions {
  action: 'list' | 'install' | 'uninstall' | 'reload';
  name?: string;
  code?: string;
}

export async function pluginCommand(options: PluginCommandOptions): Promise<void> {
  try {
    const configManager = getConfigManager();
    const config = await configManager.load();
    
    // Create minimal context for plugin manager
    const agent = await createGenieCEOAgent(config);
    const pluginManager = new PluginManager(config.workspace, {
      config,
      workspace: config.workspace,
      agent,
    });
    
    await pluginManager.initialize();
    
    switch (options.action) {
      case 'list':
        await handleList(pluginManager);
        break;
        
      case 'install':
        if (!options.name) {
          console.error(chalk.red('✗ Plugin name required'));
          process.exit(1);
        }
        await handleInstall(pluginManager, options.name, options.code);
        break;
        
      case 'uninstall':
        if (!options.name) {
          console.error(chalk.red('✗ Plugin name required'));
          process.exit(1);
        }
        await handleUninstall(pluginManager, options.name);
        break;
        
      case 'reload':
        await handleReload(pluginManager, options.name);
        break;
        
      default:
        console.error(chalk.red('✗ Invalid action'));
        process.exit(1);
    }
    
  } catch (error) {
    console.error(chalk.red('\n✗ Error:'));
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

async function handleList(pluginManager: PluginManager): Promise<void> {
  const plugins = pluginManager.list();
  
  if (plugins.length === 0) {
    console.log(chalk.yellow('No plugins installed'));
    console.log(chalk.gray('\nTo install a plugin:'));
    console.log(chalk.gray('  genieceo plugin install <name>'));
    return;
  }
  
  console.log(chalk.blue.bold('\n📦 Installed Plugins:\n'));
  
  for (const plugin of plugins) {
    console.log(chalk.green(`✓ ${plugin.name}`));
    console.log(chalk.gray(`  Version: ${plugin.metadata.version}`));
    console.log(chalk.gray(`  ${plugin.metadata.description}`));
    if (plugin.metadata.author) {
      console.log(chalk.gray(`  Author: ${plugin.metadata.author}`));
    }
    console.log('');
  }
  
  console.log(chalk.gray(`Total: ${plugins.length} plugin${plugins.length === 1 ? '' : 's'}\n`));
}

async function handleInstall(
  pluginManager: PluginManager,
  name: string,
  code?: string
): Promise<void> {
  if (!code) {
    console.error(chalk.red('✗ Plugin code required'));
    console.log(chalk.gray('\nUsage:'));
    console.log(chalk.gray('  genieceo plugin install <name> --code "plugin code here"'));
    console.log(chalk.gray('  OR ask GenieCEO to generate and install a plugin'));
    process.exit(1);
  }
  
  console.log(chalk.blue(`Installing plugin: ${name}...`));
  
  await pluginManager.install(name, code);
  
  console.log(chalk.green(`\n✓ Plugin ${name} installed successfully`));
  console.log(chalk.gray('\nNext steps:'));
  console.log(chalk.gray('  genieceo plugin reload  (to load the plugin)'));
}

async function handleUninstall(pluginManager: PluginManager, name: string): Promise<void> {
  console.log(chalk.blue(`Uninstalling plugin: ${name}...`));
  
  if (pluginManager.has(name)) {
    await pluginManager.unload(name);
  }
  
  console.log(chalk.green(`✓ Plugin ${name} unloaded`));
  console.log(chalk.gray('\nTo remove files, delete:'));
  console.log(chalk.gray(`  ~/.genieceo/workspace/plugins/${name}/`));
}

async function handleReload(pluginManager: PluginManager, name?: string): Promise<void> {
  if (name) {
    console.log(chalk.blue(`Reloading plugin: ${name}...`));
    await pluginManager.reload(name);
    console.log(chalk.green(`✓ Plugin ${name} reloaded`));
  } else {
    console.log(chalk.blue('Reloading all plugins...'));
    await pluginManager.reloadAll();
    console.log(chalk.green('✓ All plugins reloaded'));
  }
}
