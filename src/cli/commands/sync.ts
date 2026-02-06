import chalk from 'chalk';
import { getConfigManager } from '../../config/manager';
import { getWorkspaceManager } from '../../workspace/manager';
import { copyFile, readdir, mkdir, access } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

interface SyncCommandOptions {
  force?: boolean;
  skills?: boolean;
  templates?: boolean;
}

/**
 * Sync command
 * Updates workspace with latest built-in skills and templates
 */
export async function syncCommand(options: SyncCommandOptions = {}): Promise<void> {
  console.log(chalk.blue.bold('\n🔄 Syncing workspace...\n'));

  try {
    const configManager = getConfigManager();
    const config = await configManager.load();
    const workspaceManager = getWorkspaceManager(config.workspace);

    // Check if workspace is initialized
    const isInitialized = await workspaceManager.isInitialized();
    if (!isInitialized) {
      console.log(chalk.yellow('⚠️  Workspace not initialized. Run: genieceo init'));
      process.exit(1);
    }

    const syncAll = !options.skills && !options.templates;
    let syncedCount = 0;

    // Sync built-in skills
    if (syncAll || options.skills) {
      const skillsCount = await syncBuiltinSkills(
        workspaceManager.getSkillsPath(),
        options.force || false
      );
      syncedCount += skillsCount;
    }

    // Sync template files (AGENTS.md, TOOLS.md, etc.)
    if (syncAll || options.templates) {
      const templatesCount = await syncTemplateFiles(
        workspaceManager.getWorkspacePath(),
        options.force || false
      );
      syncedCount += templatesCount;
    }

    if (syncedCount === 0) {
      console.log(chalk.green('✓ Everything is up to date!'));
    } else {
      console.log(chalk.green(`\n✓ Synced ${syncedCount} file${syncedCount === 1 ? '' : 's'}`));
    }

    console.log(chalk.gray('\nWorkspace location: ' + workspaceManager.getWorkspacePath()));
    console.log(chalk.blue.bold('\n✨ Sync complete!\n'));

  } catch (error) {
    console.error(chalk.red('\n✗ Sync failed:'));
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

/**
 * Sync built-in skills to workspace
 */
async function syncBuiltinSkills(workspaceSkillsPath: string, force: boolean): Promise<number> {
  // Try dist folder first, then fall back to src folder (for development)
  let builtinSkillsPath = join(__dirname, '..', '..', 'skills', 'builtin');
  
  if (!existsSync(builtinSkillsPath)) {
    // Try source directory (for development or when running from source)
    builtinSkillsPath = join(__dirname, '..', '..', '..', 'src', 'skills', 'builtin');
  }
  
  if (!existsSync(builtinSkillsPath)) {
    console.log(chalk.yellow('⚠️  No built-in skills found in package'));
    return 0;
  }

  let syncedCount = 0;
  const entries = await readdir(builtinSkillsPath, { withFileTypes: true });

  console.log(chalk.blue('Syncing built-in skills...'));

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const skillName = entry.name;
      const sourceSkillPath = join(builtinSkillsPath, skillName, 'SKILL.md');
      const targetSkillDir = join(workspaceSkillsPath, skillName);
      const targetSkillPath = join(targetSkillDir, 'SKILL.md');

      if (!existsSync(sourceSkillPath)) {
        continue;
      }

      // Create target directory if it doesn't exist
      if (!existsSync(targetSkillDir)) {
        await mkdir(targetSkillDir, { recursive: true });
      }

      // Copy skill file if it doesn't exist or force is enabled
      const shouldCopy = force || !existsSync(targetSkillPath);
      
      if (shouldCopy) {
        await copyFile(sourceSkillPath, targetSkillPath);
        console.log(chalk.green(`  ✓ ${skillName}`));
        syncedCount++;
      } else {
        console.log(chalk.gray(`  - ${skillName} (already exists, use --force to overwrite)`));
      }
    }
  }

  return syncedCount;
}

/**
 * Sync template files (AGENTS.md, TOOLS.md, IDENTITY.md)
 */
async function syncTemplateFiles(workspacePath: string, force: boolean): Promise<number> {
  // Try dist folder first, then fall back to src folder (for development)
  let templatesDir = join(__dirname, '..', '..', 'templates');
  const templateFiles = ['AGENTS.md', 'TOOLS.md', 'IDENTITY.md'];
  
  if (!existsSync(templatesDir)) {
    // Try source directory (for development or when running from source)
    templatesDir = join(__dirname, '..', '..', '..', 'src', 'templates');
  }
  
  if (!existsSync(templatesDir)) {
    console.log(chalk.yellow('⚠️  No templates found in package'));
    return 0;
  }

  let syncedCount = 0;
  console.log(chalk.blue('Syncing template files...'));

  for (const filename of templateFiles) {
    const sourcePath = join(templatesDir, filename);
    const targetPath = join(workspacePath, filename);

    if (!existsSync(sourcePath)) {
      continue;
    }

    const shouldCopy = force || !existsSync(targetPath);

    if (shouldCopy) {
      await copyFile(sourcePath, targetPath);
      console.log(chalk.green(`  ✓ ${filename}`));
      syncedCount++;
    } else {
      console.log(chalk.gray(`  - ${filename} (already exists, use --force to overwrite)`));
    }
  }

  return syncedCount;
}
