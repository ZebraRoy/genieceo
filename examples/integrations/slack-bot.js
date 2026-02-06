/**
 * Slack Bot Integration Example
 * 
 * This example shows how to integrate GenieCEO with Slack
 * 
 * Prerequisites:
 * - GenieCEO webhook server running: genieceo serve --port 3000 --auth-token "your-secret"
 * - Slack app with Socket Mode enabled
 * - Bot Token Scopes: chat:write, commands, app_mentions:read
 */

const { App } = require('@slack/bolt');

// Slack config
const slackConfig = {
  token: process.env.SLACK_BOT_TOKEN || 'xoxb-your-bot-token',
  appToken: process.env.SLACK_APP_TOKEN || 'xapp-your-app-token',
  signingSecret: process.env.SLACK_SIGNING_SECRET || 'your-signing-secret',
  socketMode: true,
};

// GenieCEO config
const genieCEOConfig = {
  webhookUrl: process.env.GENIECEO_WEBHOOK_URL || 'http://localhost:3000/chat',
  authToken: process.env.GENIECEO_AUTH_TOKEN || 'your-secret',
};

// Initialize Slack app
const app = new App(slackConfig);

// Handle app mentions
app.event('app_mention', async ({ event, client }) => {
  try {
    // Remove bot mention from message
    const message = event.text.replace(/<@[^>]+>/g, '').trim();
    
    console.log(`[Slack] Mention in #${event.channel}: ${message}`);

    // Send to GenieCEO (using chat endpoint for conversation context)
    const response = await fetch(genieCEOConfig.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${genieCEOConfig.authToken}`,
      },
      body: JSON.stringify({
        message,
        source: 'slack',
        userId: event.user,
        sessionId: `slack-${event.channel}`, // Channel-based conversation
      }),
    });

    const result = await response.json();

    if (result.success) {
      // Reply in thread
      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.ts,
        text: result.response,
      });
    } else {
      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.ts,
        text: '❌ Sorry, I encountered an error. Please try again.',
      });
    }
  } catch (error) {
    console.error('[Slack] Error:', error);
    await client.chat.postMessage({
      channel: event.channel,
      thread_ts: event.ts,
      text: '❌ I am currently unavailable. Please try again later.',
    });
  }
});

// Handle slash commands
app.command('/genieceo', async ({ command, ack, respond }) => {
  await ack();

  try {
    const message = command.text;
    console.log(`[Slack] Command from ${command.user_name}: ${message}`);

    // Send to GenieCEO
    const response = await fetch(genieCEOConfig.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${genieCEOConfig.authToken}`,
      },
      body: JSON.stringify({
        message,
        source: 'slack',
        userId: command.user_id,
        sessionId: `slack-${command.user_id}`, // User-based conversation
      }),
    });

    const result = await response.json();

    if (result.success) {
      await respond({
        text: result.response,
        response_type: 'in_channel',
      });
    } else {
      await respond({
        text: '❌ Sorry, I encountered an error. Please try again.',
        response_type: 'ephemeral',
      });
    }
  } catch (error) {
    console.error('[Slack] Command error:', error);
    await respond({
      text: '❌ I am currently unavailable. Please try again later.',
      response_type: 'ephemeral',
    });
  }
});

// Start the app
(async () => {
  await app.start();
  console.log('⚡️ Slack bot is running!');
  console.log(`\nSetup instructions:`);
  console.log(`1. Start GenieCEO webhook server:`);
  console.log(`   genieceo serve --port 3000 --auth-token "${genieCEOConfig.authToken}"`);
  console.log(`\n2. Configure Slack app:`);
  console.log(`   - Enable Socket Mode`);
  console.log(`   - Add Bot Token Scopes: chat:write, commands, app_mentions:read`);
  console.log(`   - Subscribe to app_mention event`);
  console.log(`   - Create slash command: /genieceo`);
  console.log(`\n3. Test by:`);
  console.log(`   - Mentioning the bot: @YourBot help me with this task`);
  console.log(`   - Using slash command: /genieceo build a REST API\n`);
})();
