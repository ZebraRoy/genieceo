/**
 * Plugin System Types
 * 
 * Defines the interface for GenieCEO plugins
 */

export interface PluginMetadata {
  name: string;
  version: string;
  description: string;
  author?: string;
  dependencies?: string[];
}

export interface PluginContext {
  config: any;
  workspace: string;
  agent: any;
}

export interface Plugin {
  metadata: PluginMetadata;
  
  /**
   * Called when plugin is loaded
   */
  initialize(context: PluginContext): Promise<void>;
  
  /**
   * Called when plugin is unloaded
   */
  cleanup?(): Promise<void>;
  
  /**
   * Handle incoming messages (for integration plugins)
   */
  handleMessage?(message: any): Promise<any>;
  
  /**
   * Register custom tools
   */
  getTools?(): any[];
  
  /**
   * Register custom endpoints (for webhook plugins)
   */
  getEndpoints?(): PluginEndpoint[];
}

export interface PluginEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  handler: (req: any, res: any) => Promise<void>;
}

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  main: string;
  dependencies?: Record<string, string>;
}
