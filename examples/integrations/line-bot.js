/**
 * Line Bot Integration Example
 * 
 * This example shows how to integrate GenieCEO with Line Messaging API
 * 
 * Prerequisites:
 * - GenieCEO webhook server running: genieceo serve --port 3000 --auth-token "your-secret"
 * - Line Developers account and Messaging API channel
 * - ngrok or similar for local testing: ngrok http 3000
 */

const express = require('express');
const { Client, middleware } = require('@line/bot-sdk');

// Line config
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || 'your-channel-access-token',
  channelSecret: process.env.LINE_CHANNEL_SECRET || 'your-channel-secret',
};

// GenieCEO config
const genieCEOConfig = {
  webhookUrl: process.env.GENIECEO_WEBHOOK_URL || 'http://localhost:3000/webhook',
  authToken: process.env.GENIECEO_AUTH_TOKEN || 'your-secret',
};

// Initialize Line client
const lineClient = new Client(lineConfig);
const app = express();

// Line webhook endpoint
app.post('/line-webhook', middleware(lineConfig), async (req, res) => {
  try {
    const events = req.body.events;
    
    await Promise.all(events.map(async (event) => {
      // Only handle text messages
      if (event.type !== 'message' || event.message.type !== 'text') {
        return null;
      }

      const userMessage = event.message.text;
      const userId = event.source.userId;

      console.log(`[Line] Message from ${userId}: ${userMessage}`);

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
            source: 'line',
            userId: userId,
          }),
        });

        const result = await response.json();

        if (result.success) {
          // Reply to user
          await lineClient.replyMessage(event.replyToken, {
            type: 'text',
            text: result.response,
          });
        } else {
          // Send error message
          await lineClient.replyMessage(event.replyToken, {
            type: 'text',
            text: 'Sorry, I encountered an error processing your request.',
          });
        }
      } catch (error) {
        console.error('[Line] Error:', error);
        await lineClient.replyMessage(event.replyToken, {
          type: 'text',
          text: 'Sorry, I am currently unavailable. Please try again later.',
        });
      }
    }));

    res.status(200).send('OK');
  } catch (error) {
    console.error('[Line] Webhook error:', error);
    res.status(500).send('Internal Error');
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Line bot server running on port ${PORT}`);
  console.log(`\nSetup instructions:`);
  console.log(`1. Start GenieCEO webhook server:`);
  console.log(`   genieceo serve --port 3000 --auth-token "${genieCEOConfig.authToken}"`);
  console.log(`\n2. Start ngrok (for local testing):`);
  console.log(`   ngrok http ${PORT}`);
  console.log(`\n3. Set Line webhook URL to:`);
  console.log(`   https://your-ngrok-url.ngrok.io/line-webhook`);
  console.log(`\n4. Test by sending a message to your Line bot!\n`);
});
