# GenieCEO Integration Examples

This directory contains examples for integrating GenieCEO with various external platforms.

## Prerequisites

Before running any integration, start the GenieCEO webhook server:

```bash
genieceo serve --port 3000 --auth-token "your-secret-token"
```

## Available Integrations

### 1. Line Bot (`line-bot.js`)

Integrate GenieCEO with Line Messaging API.

**Setup:**
```bash
# Install dependencies
npm install express @line/bot-sdk

# Set environment variables
export LINE_CHANNEL_ACCESS_TOKEN="your-line-channel-access-token"
export LINE_CHANNEL_SECRET="your-line-channel-secret"
export GENIECEO_WEBHOOK_URL="http://localhost:3000/webhook"
export GENIECEO_AUTH_TOKEN="your-secret-token"

# Run
node line-bot.js
```

**For local testing:**
```bash
# Terminal 1: Start GenieCEO
genieceo serve --port 3000 --auth-token "your-secret-token"

# Terminal 2: Start Line bot
node line-bot.js

# Terminal 3: Expose with ngrok
ngrok http 8080

# Set Line webhook URL to: https://your-ngrok-url.ngrok.io/line-webhook
```

### 2. Slack Bot (`slack-bot.js`)

Integrate GenieCEO with Slack using Socket Mode.

**Setup:**
```bash
# Install dependencies
npm install @slack/bolt

# Set environment variables
export SLACK_BOT_TOKEN="xoxb-your-bot-token"
export SLACK_APP_TOKEN="xapp-your-app-token"
export SLACK_SIGNING_SECRET="your-signing-secret"
export GENIECEO_WEBHOOK_URL="http://localhost:3000/chat"
export GENIECEO_AUTH_TOKEN="your-secret-token"

# Run
node slack-bot.js
```

**Features:**
- Responds to `@mentions`
- Slash command: `/genieceo`
- Maintains conversation context per channel

### 3. Discord Bot (`discord-bot.js`)

Integrate GenieCEO with Discord.

**Setup:**
```bash
# Install dependencies
npm install discord.js

# Set environment variables
export DISCORD_BOT_TOKEN="your-discord-bot-token"
export GENIECEO_WEBHOOK_URL="http://localhost:3000/chat"
export GENIECEO_AUTH_TOKEN="your-secret-token"

# Run
node discord-bot.js
```

**Usage:**
```
!genieceo help me build a web application
!genieceo analyze this code and suggest improvements
```

## Architecture

All integrations follow this pattern:

```
External Platform (Line/Slack/Discord)
    ↓ (message from user)
Integration Bot (Node.js)
    ↓ (HTTP POST)
GenieCEO Webhook Server
    ↓ (process with AI)
GenieCEO Agent
    ↓ (response)
Integration Bot
    ↓ (formatted message)
External Platform (reply to user)
```

## Endpoints

### `/webhook` - Simple request/response
Use for one-off tasks without conversation history.

```javascript
fetch('http://localhost:3000/webhook', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-token'
  },
  body: JSON.stringify({
    message: 'your task',
    source: 'platform-name',
    userId: 'user-id'
  })
});
```

### `/chat` - Conversation with history
Use for multi-turn conversations with context.

```javascript
fetch('http://localhost:3000/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-token'
  },
  body: JSON.stringify({
    message: 'your message',
    sessionId: 'unique-session-id',
    userId: 'user-id'
  })
});
```

## Security Best Practices

1. **Always use authentication:**
   ```bash
   genieceo serve --auth-token "$(openssl rand -hex 32)"
   ```

2. **Use environment variables** for secrets (never hardcode)

3. **Use HTTPS** in production (deploy behind nginx/caddy)

4. **Validate inputs** on the integration bot side

5. **Rate limiting** is built into the webhook server (100 req/15min per IP)

## Production Deployment

### Using Docker

```dockerfile
# Dockerfile for integration bot
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
CMD ["node", "your-bot.js"]
```

### Using PM2

```bash
# Install PM2
npm install -g pm2

# Start GenieCEO webhook server
pm2 start --name genieceo-webhook -- genieceo serve --port 3000 --auth-token "your-token"

# Start integration bot
pm2 start line-bot.js --name line-bot

# Save process list
pm2 save

# Setup startup script
pm2 startup
```

### Using systemd

```ini
# /etc/systemd/system/genieceo-webhook.service
[Unit]
Description=GenieCEO Webhook Server
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/home/your-user/genieceo
ExecStart=/usr/local/bin/genieceo serve --port 3000 --auth-token "your-token"
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable genieceo-webhook
sudo systemctl start genieceo-webhook
```

## Troubleshooting

### Connection refused
- Check if webhook server is running: `curl http://localhost:3000/health`
- Verify port is correct
- Check firewall settings

### Authentication failed
- Verify auth token matches in both server and client
- Check Authorization header format: `Bearer your-token`

### Slow responses
- Check GenieCEO context budget: `curl http://localhost:3000/status`
- Consider using async pattern for long tasks
- Use staff to delegate heavy work

### Rate limited
- Built-in: 100 requests per 15 minutes per IP
- Add your own rate limiting on integration bot side if needed

## Additional Resources

- [GenieCEO Documentation](../../README.md)
- [Integration Skill](../../src/skills/builtin/integration/SKILL.md)
- [Line Messaging API Docs](https://developers.line.biz/en/docs/messaging-api/)
- [Slack Bolt Documentation](https://slack.dev/bolt-js/)
- [Discord.js Guide](https://discordjs.guide/)
