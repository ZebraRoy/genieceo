# GenieCEO Plugin System

The plugin system allows GenieCEO to dynamically load integrations without restarting. Perfect for adding new messaging platforms, webhooks, or custom endpoints on-demand.

## Features

- ✅ **Hot reload** - Add/update plugins without restarting
- ✅ **Type-safe** - Full TypeScript support
- ✅ **Isolated** - Plugins run in their own context
- ✅ **Flexible** - Support for tools, endpoints, and message handlers
- ✅ **Easy to create** - Simple interface to implement

## Quick Start

### 1. List Plugins

```bash
genieceo plugin list
```

### 2. Ask GenieCEO to Generate a Plugin

```
User: "Create a Telegram integration plugin for me"

GenieCEO: [Generates plugin code]
"I've created a Telegram plugin. To install it:
1. genieceo plugin install telegram --code '[generated code]'
2. npm run build
3. genieceo plugin reload
4. Configure bot token in ~/.genieceo/config.json"
```

### 3. Reload Plugins

```bash
# Reload all plugins
genieceo plugin reload

# Reload specific plugin
genieceo plugin reload telegram
```

## Plugin Structure

A plugin is a TypeScript/JavaScript module that implements the `Plugin` interface:

```typescript
import type { Plugin, PluginContext } from 'genieceo/plugins';

class MyPlugin implements Plugin {
  metadata = {
    name: 'my-plugin',
    version: '1.0.0',
    description: 'My awesome plugin',
    author: 'Your Name',
  };

  async initialize(context: PluginContext): Promise<void> {
    // Called when plugin loads
    console.log('Plugin initialized!');
  }

  async cleanup(): Promise<void> {
    // Called when plugin unloads
    console.log('Plugin cleaning up...');
  }
}

export default new MyPlugin();
```

## Plugin Types

### 1. Messaging Platform Plugin

Handle messages from external platforms:

```typescript
class TelegramPlugin implements Plugin {
  // ... metadata ...

  async initialize(context: PluginContext): Promise<void> {
    const TelegramBot = require('node-telegram-bot-api');
    const bot = new TelegramBot(config.token, { polling: true });
    
    bot.on('message', async (msg) => {
      // Send to GenieCEO
      const response = await context.agent.run(msg.text);
      
      // Reply to user
      await bot.sendMessage(msg.chat.id, response);
    });
  }
}
```

### 2. Custom Webhook Endpoint

Add custom endpoints to the webhook server:

```typescript
class CustomEndpointPlugin implements Plugin {
  // ... metadata ...

  getEndpoints() {
    return [
      {
        method: 'POST',
        path: '/custom/task',
        handler: async (req, res) => {
          const response = await this.context.agent.run(req.body.task);
          res.json({ success: true, response });
        },
      },
    ];
  }
}
```

### 3. Custom Tools

Add new tools for the agent:

```typescript
class MyToolPlugin implements Plugin {
  // ... metadata ...

  getTools() {
    return [
      {
        name: 'customTool',
        description: 'Does something useful',
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string' },
          },
        },
        execute: async (params) => {
          // Tool logic here
          return { result: 'success' };
        },
      },
    ];
  }
}
```

## Plugin Directory Structure

Plugins are stored in `~/.genieceo/workspace/plugins/`:

```
plugins/
├── telegram/
│   ├── plugin.json       # Manifest
│   ├── index.ts          # Source code
│   └── index.js          # Compiled (after npm run build)
├── discord/
│   ├── plugin.json
│   ├── index.ts
│   └── index.js
└── custom-endpoint/
    ├── plugin.json
    ├── index.ts
    └── index.js
```

## Plugin Manifest (plugin.json)

```json
{
  "name": "telegram",
  "version": "1.0.0",
  "description": "Telegram bot integration",
  "author": "GenieCEO",
  "main": "index.ts",
  "dependencies": {
    "node-telegram-bot-api": "^0.61.0"
  }
}
```

## Configuration

Configure plugins in `~/.genieceo/config.json`:

```json
{
  "plugins": {
    "telegram": {
      "botToken": "123456:ABC...",
      "allowedUsers": ["user1", "user2"]
    },
    "discord": {
      "botToken": "your-discord-token",
      "prefix": "!genieceo"
    }
  }
}
```

## Examples

See `src/plugins/examples/` for complete examples:

- **telegram.ts** - Telegram bot integration
- **discord.ts** - Discord bot integration
- **custom-endpoint.ts** - Custom webhook endpoints

## CLI Commands

```bash
# List all plugins
genieceo plugin list

# Install a plugin (usually done by GenieCEO)
genieceo plugin install <name> --code "plugin code"

# Unload a plugin
genieceo plugin uninstall <name>

# Reload all plugins
genieceo plugin reload

# Reload specific plugin
genieceo plugin reload <name>
```

## Development Workflow

### 1. Generate Plugin with GenieCEO

Ask GenieCEO to create a plugin:

```
"Create a Slack integration plugin with slash commands"
```

GenieCEO will:
1. Generate the plugin code
2. Install it via `plugin install`
3. Provide configuration instructions

### 2. Build

```bash
npm run build
```

This compiles TypeScript plugins to JavaScript.

### 3. Reload

```bash
genieceo plugin reload
```

Plugin is now active without restarting!

### 4. Test

The plugin is automatically loaded by:
- The webhook server (`genieceo serve`)
- The agent (for custom tools)

## Plugin Interface

```typescript
export interface Plugin {
  metadata: PluginMetadata;
  
  // Required: Called when plugin loads
  initialize(context: PluginContext): Promise<void>;
  
  // Optional: Called when plugin unloads
  cleanup?(): Promise<void>;
  
  // Optional: Handle messages (for messaging plugins)
  handleMessage?(message: any): Promise<any>;
  
  // Optional: Provide custom tools
  getTools?(): Tool[];
  
  // Optional: Provide custom endpoints
  getEndpoints?(): PluginEndpoint[];
}
```

## Context Available to Plugins

```typescript
interface PluginContext {
  config: any;           // Global config
  workspace: string;     // Workspace path
  agent: any;            // GenieCEO agent (for executing tasks)
}
```

## Best Practices

### 1. Error Handling

```typescript
async initialize(context: PluginContext) {
  try {
    // Plugin logic
  } catch (error) {
    console.error('Plugin error:', error);
    // Don't throw - allows other plugins to load
  }
}
```

### 2. Dependencies

List dependencies in manifest:

```json
{
  "dependencies": {
    "node-telegram-bot-api": "^0.61.0"
  }
}
```

Users install them with: `npm install`

### 3. Configuration

Check for config before using:

```typescript
const config = context.config?.plugins?.myPlugin;
if (!config) {
  console.log('⚠️  Plugin not configured');
  return;
}
```

### 4. Cleanup

Always cleanup resources:

```typescript
async cleanup() {
  if (this.bot) {
    await this.bot.stop();
  }
  if (this.connection) {
    await this.connection.close();
  }
}
```

## Integration with Webhook Server

Plugins with `getEndpoints()` automatically add routes to the webhook server:

```typescript
// Plugin defines endpoint
getEndpoints() {
  return [{
    method: 'POST',
    path: '/myplugin/webhook',
    handler: async (req, res) => {
      res.json({ success: true });
    }
  }];
}
```

Now available at: `http://localhost:3000/myplugin/webhook`

## Self-Updating

GenieCEO can generate and install plugins for any integration:

```
User: "I need to integrate with Notion API"

GenieCEO:
1. Analyzes Notion API docs
2. Generates a Notion plugin
3. Installs it: genieceo plugin install notion
4. Provides setup instructions
5. Plugin is ready to use!
```

This allows GenieCEO to integrate with ANY system on-demand without code changes.

## Troubleshooting

### Plugin not loading

1. Check if TypeScript is compiled: `npm run build`
2. Check for errors: `genieceo plugin list`
3. Verify plugin.json exists
4. Check plugin code for syntax errors

### Dependencies missing

```bash
cd ~/.genieceo/workspace/plugins/plugin-name
npm install
```

### Hot reload not working

```bash
# Force reload all plugins
genieceo plugin reload
```

## Advanced: Plugin Communication

Plugins can communicate via context:

```typescript
// Plugin A stores data
context.shared = context.shared || {};
context.shared.myData = 'value';

// Plugin B reads data
const data = context.shared?.myData;
```

## Summary

The plugin system enables:
- ✅ **Any integration** - Not limited to pre-built platforms
- ✅ **On-demand** - GenieCEO generates plugins when needed
- ✅ **No restart** - Hot reload for instant updates
- ✅ **User-defined** - Users can create their own plugins
- ✅ **Flexible** - Tools, endpoints, message handlers

This makes GenieCEO truly extensible and able to integrate with any system users need!
