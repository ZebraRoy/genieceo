/**
 * Example Plugin: Custom Webhook Endpoint
 * 
 * Shows how to add custom endpoints to the webhook server
 */

import type { Plugin, PluginContext, PluginEndpoint } from '../types';

class CustomEndpointPlugin implements Plugin {
  metadata = {
    name: 'custom-endpoint',
    version: '1.0.0',
    description: 'Adds custom webhook endpoints',
    author: 'GenieCEO',
  };

  private context!: PluginContext;

  async initialize(context: PluginContext): Promise<void> {
    this.context = context;
    console.log('✓ Custom endpoint plugin loaded');
  }

  /**
   * Register custom endpoints
   */
  getEndpoints(): PluginEndpoint[] {
    return [
      {
        method: 'POST',
        path: '/custom/task',
        handler: async (req, res) => {
          const { task, priority } = req.body;
          
          // Process based on priority
          const message = priority === 'high' 
            ? `URGENT: ${task}` 
            : task;
          
          const response = await this.context.agent.run(message);
          
          res.json({
            success: true,
            response,
            priority,
            processedAt: new Date().toISOString(),
          });
        },
      },
      {
        method: 'GET',
        path: '/custom/ping',
        handler: async (req, res) => {
          res.json({
            message: 'Custom endpoint is alive!',
            plugin: this.metadata.name,
            version: this.metadata.version,
          });
        },
      },
    ];
  }
}

export default new CustomEndpointPlugin();
