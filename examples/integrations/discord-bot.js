/**
 * Discord Bot Integration Example
 * 
 * This example shows how to integrate GenieCEO with Discord
 * 
 * Prerequisites:
 * - GenieCEO webhook server running: genieceo serve --port 3000 --auth-token "your-secret"
 * - Discord bot token and application
 * - Bot permissions: Send Messages, Read Message History
 */

const { Client, GatewayIntentBits } = require('discord.js');

// Discord config
const discordConfig = {
  token: process.env.DISCORD_BOT_TOKEN || 'your-bot-token',
  prefix: '!genieceo',
};

// GenieCEO config
const genieCEOConfig = {
  webhookUrl: process.env.GENIECEO_WEBHOOK_URL || 'http://localhost:3000/chat',
  authToken: process.env.GENIECEO_AUTH_TOKEN || 'your-secret',
};

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Bot ready
client.once('ready', () => {
  console.log(`✅ Discord bot logged in as ${client.user.tag}`);
  console.log(`\nSetup instructions:`);
  console.log(`1. Start GenieCEO webhook server:`);
  console.log(`   genieceo serve --port 3000 --auth-token "${genieCEOConfig.authToken}"`);
  console.log(`\n2. Invite bot to your Discord server`);
  console.log(`\n3. Test by sending:`);
  console.log(`   ${discordConfig.prefix} help me build a web app\n`);
});

// Handle messages
client.on('messageCreate', async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Check for prefix
  if (!message.content.startsWith(discordConfig.prefix)) return;

  // Extract command
  const userMessage = message.content.slice(discordConfig.prefix.length).trim();
  
  if (!userMessage) {
    await message.reply('Please provide a message. Example: `!genieceo help me with this task`');
    return;
  }

  console.log(`[Discord] Message from ${message.author.tag}: ${userMessage}`);

  // Show typing indicator
  await message.channel.sendTyping();

  try {
    // Send to GenieCEO
    const response = await fetch(genieCEOConfig.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${genieCEOConfig.authToken}`,
      },
      body: JSON.stringify({
        message: userMessage,
        source: 'discord',
        userId: message.author.id,
        sessionId: `discord-${message.channel.id}`, // Channel-based conversation
        metadata: {
          guildId: message.guild?.id,
          channelId: message.channel.id,
        },
      }),
    });

    const result = await response.json();

    if (result.success) {
      // Discord has a 2000 character limit, split if necessary
      const responseText = result.response;
      if (responseText.length <= 2000) {
        await message.reply(responseText);
      } else {
        // Split into chunks
        const chunks = responseText.match(/[\s\S]{1,1900}/g) || [];
        for (const chunk of chunks) {
          await message.channel.send(chunk);
        }
      }
    } else {
      await message.reply('❌ Sorry, I encountered an error. Please try again.');
    }
  } catch (error) {
    console.error('[Discord] Error:', error);
    await message.reply('❌ I am currently unavailable. Please try again later.');
  }
});

// Login
client.login(discordConfig.token);
