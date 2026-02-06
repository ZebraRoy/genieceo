/**
 * Plugin Manager
 * 
 * Manages dynamic loading/unloading of plugins
 * Allows GenieCEO to add integrations without restarting
 */

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import type { Plugin, PluginContext, PluginManifest } from './types';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private pluginsPath: string;
  private context: PluginContext;

  constructor(workspacePath: string, context: PluginContext) {
    this.pluginsPath = path.join(workspacePath, 'plugins');
    this.context = context;
  }

  /**
   * Initialize plugin system
   */
  async initialize(): Promise<void> {
    // Ensure plugins directory exists
    await mkdir(this.pluginsPath, { recursive: true });
    
    // Load all existing plugins
    await this.loadAll();
  }

  /**
   * Install a plugin from source code
   */
  async install(name: string, code: string, manifest?: PluginManifest): Promise<void> {
    try {
      const pluginDir = path.join(this.pluginsPath, name);
      
      // Create plugin directory
      await mkdir(pluginDir, { recursive: true });
      
      // Write plugin code
      const mainFile = path.join(pluginDir, 'index.ts');
      await writeFile(mainFile, code);
      
      // Write manifest
      const manifestPath = path.join(pluginDir, 'plugin.json');
      const pluginManifest: PluginManifest = manifest || {
        name,
        version: '1.0.0',
        description: `Plugin: ${name}`,
        main: 'index.ts',
      };
      await writeFile(manifestPath, JSON.stringify(pluginManifest, null, 2));
      
      console.log(`✓ Plugin ${name} installed at ${pluginDir}`);
      console.log(`  Note: Run 'npm run build' to compile TypeScript plugins`);
      
    } catch (error) {
      throw new Error(`Failed to install plugin ${name}: ${error}`);
    }
  }

  /**
   * Load a plugin by name
   */
  async load(name: string): Promise<void> {
    try {
      const pluginDir = path.join(this.pluginsPath, name);
      const manifestPath = path.join(pluginDir, 'plugin.json');
      
      // Read manifest
      const manifestContent = await readFile(manifestPath, 'utf-8');
      const manifest: PluginManifest = JSON.parse(manifestContent);
      
      // Determine file to load (prefer compiled .js over .ts)
      const jsFile = path.join(pluginDir, 'index.js');
      const tsFile = path.join(pluginDir, 'index.ts');
      
      let pluginPath: string;
      if (fs.existsSync(jsFile)) {
        pluginPath = jsFile;
      } else if (fs.existsSync(tsFile)) {
        console.warn(`⚠️  Plugin ${name} is TypeScript. Run 'npm run build' to compile it.`);
        return;
      } else {
        throw new Error(`Plugin main file not found: ${manifest.main}`);
      }
      
      // Clear require cache for hot reload
      delete require.cache[require.resolve(pluginPath)];
      
      // Load plugin
      const pluginModule = require(pluginPath);
      const plugin: Plugin = pluginModule.default || pluginModule;
      
      // Initialize plugin
      await plugin.initialize(this.context);
      
      // Store plugin
      this.plugins.set(name, plugin);
      
      console.log(`✓ Plugin ${name} loaded`);
      
    } catch (error) {
      console.error(`✗ Failed to load plugin ${name}:`, error);
      throw error;
    }
  }

  /**
   * Unload a plugin
   */
  async unload(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} not loaded`);
    }
    
    // Call cleanup if available
    if (plugin.cleanup) {
      await plugin.cleanup();
    }
    
    // Remove from registry
    this.plugins.delete(name);
    
    console.log(`✓ Plugin ${name} unloaded`);
  }

  /**
   * Reload a plugin (unload + load)
   */
  async reload(name: string): Promise<void> {
    if (this.plugins.has(name)) {
      await this.unload(name);
    }
    await this.load(name);
  }

  /**
   * Load all plugins from plugins directory
   */
  async loadAll(): Promise<void> {
    try {
      const entries = await readdir(this.pluginsPath);
      
      for (const entry of entries) {
        const entryPath = path.join(this.pluginsPath, entry);
        const stats = await stat(entryPath);
        
        if (stats.isDirectory()) {
          try {
            await this.load(entry);
          } catch (error) {
            console.error(`Failed to load plugin ${entry}:`, error);
          }
        }
      }
      
    } catch (error) {
      // Plugins directory doesn't exist yet
      if ((error as any).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Reload all plugins
   */
  async reloadAll(): Promise<void> {
    const pluginNames = Array.from(this.plugins.keys());
    
    // Unload all
    for (const name of pluginNames) {
      await this.unload(name);
    }
    
    // Load all
    await this.loadAll();
    
    console.log(`✓ Reloaded ${pluginNames.length} plugins`);
  }

  /**
   * Get a loaded plugin
   */
  get(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * List all loaded plugins
   */
  list(): Array<{ name: string; metadata: any }> {
    return Array.from(this.plugins.entries()).map(([name, plugin]) => ({
      name,
      metadata: plugin.metadata,
    }));
  }

  /**
   * Check if plugin is loaded
   */
  has(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Get all plugin endpoints (for webhook server)
   */
  getAllEndpoints(): Array<{ pluginName: string; endpoint: any }> {
    const endpoints: Array<{ pluginName: string; endpoint: any }> = [];
    
    for (const [name, plugin] of this.plugins) {
      if (plugin.getEndpoints) {
        const pluginEndpoints = plugin.getEndpoints();
        for (const endpoint of pluginEndpoints) {
          endpoints.push({ pluginName: name, endpoint });
        }
      }
    }
    
    return endpoints;
  }

  /**
   * Get all plugin tools (for agent)
   */
  getAllTools(): Array<{ pluginName: string; tool: any }> {
    const tools: Array<{ pluginName: string; tool: any }> = [];
    
    for (const [name, plugin] of this.plugins) {
      if (plugin.getTools) {
        const pluginTools = plugin.getTools();
        for (const tool of pluginTools) {
          tools.push({ pluginName: name, tool });
        }
      }
    }
    
    return tools;
  }
}
