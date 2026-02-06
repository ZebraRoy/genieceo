/**
 * Example Plugin: Discord Integration
 * 
 * Shows how to create a Discord bot plugin
 */

import type { Plugin, PluginContext } from '../types';

class DiscordPlugin implements Plugin {
  metadata = {
    name: 'discord',
    version: '1.0.0',
    description: 'Discord bot integration',
    author: 'GenieCEO',
    dependencies: ['discord.js'],
  };

  private context!: PluginContext;
  private client?: any;
  private prefix = '!genieceo';

  async initialize(context: PluginContext): Promise<void> {
    this.context = context;
    
    // Get Discord config
    const config = context.config?.plugins?.discord;
    if (!config || !config.botToken) {
      console.log('ℹ️  Discord plugin: No bot token configured');
      return;
    }

    if (config.prefix) {
      this.prefix = config.prefix;
    }

    try {
      // Dynamic import
      const { Client, GatewayIntentBits } = require('discord.js');
      
      // Initialize client
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
        ],
      });
      
      // Handle ready
      this.client.once('ready', () => {
        console.log(`✓ Discord bot logged in as ${this.client.user.tag}`);
      });
      
      // Handle messages
      this.client.on('messageCreate', async (message: any) => {
        // Ignore bot messages
        if (message.author.bot) return;
        
        // Check for prefix
        if (!message.content.startsWith(this.prefix)) return;
        
        // Extract command
        const userMessage = message.content.slice(this.prefix.length).trim();
        
        if (!userMessage) {
          await message.reply(`Please provide a message. Example: \`${this.prefix} help me\``);
          return;
        }
        
        // Show typing indicator
        await message.channel.sendTyping();
        
        try {
          // Send to GenieCEO
          const response = await this.context.agent.run(userMessage);
          
          // Discord has 2000 char limit, split if needed
          if (response.length <= 2000) {
            await message.reply(response);
          } else {
            const chunks = response.match(/[\s\S]{1,1900}/g) || [];
            for (const chunk of chunks) {
              await message.channel.send(chunk);
            }
          }
          
        } catch (error) {
          await message.reply('❌ Sorry, I encountered an error.');
          console.error('Discord error:', error);
        }
      });
      
      // Login
      await this.client.login(config.botToken);
      
    } catch (error) {
      console.error('Failed to initialize Discord plugin:', error);
      console.log('Install dependency: npm install discord.js');
    }
  }

  async cleanup(): Promise<void> {
    if (this.client) {
      await this.client.destroy();
      console.log('✓ Discord bot disconnected');
    }
  }
}

export default new DiscordPlugin();
