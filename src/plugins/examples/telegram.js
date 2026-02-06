/**
 * Example Plugin: Telegram Integration
 * 
 * This is an example of how to create a plugin for GenieCEO
 */

class TelegramPlugin {
  metadata = {
    name: 'telegram',
    version: '1.0.0',
    description: 'Telegram bot integration',
    author: 'GenieCEO',
    dependencies: ['node-telegram-bot-api'],
  };

  constructor() {
    this.context = null;
    this.bot = null;
  }

  async initialize(context) {
    this.context = context;
    
    // Get Telegram config
    const config = context.config?.plugins?.telegram;
    if (!config || !config.botToken) {
      console.log('ℹ️  Telegram plugin: No bot token configured');
      return;
    }

    try {
      // Dynamic import to avoid dependency issues
      const TelegramBot = require('node-telegram-bot-api');
      
      // Initialize bot
      this.bot = new TelegramBot(config.botToken, { polling: true });
      
      // Handle messages
      this.bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;
        
        if (!text) return;
        
        try {
          // Send to GenieCEO
          const response = await this.context.agent.run(text);
          
          // Reply to user
          await this.bot.sendMessage(chatId, response);
          
        } catch (error) {
          await this.bot.sendMessage(chatId, 'Sorry, I encountered an error.');
          console.error('Telegram error:', error);
        }
      });
      
      console.log('✓ Telegram bot started');
      
    } catch (error) {
      console.error('Failed to initialize Telegram plugin:', error);
      console.log('Install dependency: npm install node-telegram-bot-api');
    }
  }

  async cleanup() {
    if (this.bot) {
      await this.bot.stopPolling();
      console.log('✓ Telegram bot stopped');
    }
  }

  async handleMessage(message) {
    // This method is called by the webhook server if configured
    return {
      success: true,
      response: 'Telegram plugin received message',
    };
  }
}

module.exports = new TelegramPlugin();
