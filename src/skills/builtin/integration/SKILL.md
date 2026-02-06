---
name: integration
description: Integrate external applications with GenieCEO via HTTP webhooks, REST API, plugins, or programmatic access. Use when setting up integrations with messaging platforms (Line, Slack, Discord), webhooks, CI/CD pipelines, or when the user asks how to trigger GenieCEO from external systems.
metadata:
  always: false
---

# GenieCEO Integration

This skill covers all methods for integrating external applications with GenieCEO.

## Quick Decision Tree

**For messaging platforms (Telegram, Discord, etc):**
→ Use **Plugin System** (generate and install plugins)

**For webhooks from external services:**
→ Use **Webhook Server** (genieceo serve)

**For tight Node.js integration:**
→ Use **Programmatic Access** (import genieceo)

**For one-off automation:**
→ Use **CLI** (genieceo -m "task")

## Available Integration Methods

### 1. Plugin System (Best for Messaging Platforms)

**When to use:** Adding Telegram, Discord, Slack, or any platform-specific integration.

**How it works:** Generate and install plugins that run inside GenieCEO:

```bash
# User asks you to create a plugin
User: "Create a Telegram bot integration"

# You generate the plugin code, then:
executeCommand('genieceo plugin install telegram --code "generated-code"')

# User builds and reloads (no restart!)
User runs: npm run build && genieceo plugin reload
```

**Key features:**

- ✅ Hot reload (no restart)
- ✅ You can generate plugins on-demand
- ✅ Platform-specific logic encapsulated
- ✅ Access to full agent context

**Plugin template:**

```typescript
import type { Plugin, PluginContext } from "genieceo/plugins";

class MyIntegrationPlugin implements Plugin {
  metadata = {
    name: "my-integration",
    version: "1.0.0",
    description: "Integration with XYZ platform",
  };

  async initialize(context: PluginContext) {
    // Setup platform connection
    // context.agent.run() to execute tasks
    // context.config for configuration
  }

  async cleanup() {
    // Clean up connections
  }
}

export default new MyIntegrationPlugin();
```

**When user asks to integrate with a messaging platform:**

1. Generate plugin code based on platform's SDK
2. Install it: `genieceo plugin install <name> --code "..."`
3. Provide config instructions
4. Tell user: `npm run build && genieceo plugin reload`

See `PLUGIN_SYSTEM.md` for complete documentation.

### 2. HTTP Webhook Server (Best for HTTP Webhooks)

Start the webhook server to receive HTTP requests:

```bash
genieceo serve --port 3000
```

This starts an HTTP server that exposes endpoints for external systems to interact with GenieCEO.

#### Available Endpoints

**POST /webhook** - Execute tasks via webhook

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"message": "Your task here", "source": "line", "userId": "user123"}'
```

Response:

```json
{
  "success": true,
  "response": "Agent's response to your task",
  "timestamp": "2026-02-05T10:30:00Z"
}
```

**POST /chat** - Interactive chat endpoint

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, what can you do?", "sessionId": "unique-session-id"}'
```

**GET /health** - Health check

```bash
curl http://localhost:3000/health
```

**GET /status** - Get agent status and statistics

```bash
curl http://localhost:3000/status
```

#### Configuration Options

```bash
# Specify port
genieceo serve --port 8080

# Enable authentication
genieceo serve --auth-token "your-secret-token"

# With authentication, include token in requests
curl -X POST http://localhost:3000/webhook \
  -H "Authorization: Bearer your-secret-token" \
  -H "Content-Type: application/json" \
  -d '{"message": "task"}'
```

### 2. Messaging Platform Integration

#### Line Integration

**Setup Line webhook:**

1. Start the webhook server:

```bash
genieceo serve --port 3000
```

2. In Line Developers Console:
   - Create a Messaging API channel
   - Set webhook URL: `https://your-domain.com/webhook` (use ngrok for local testing)
   - Enable webhook

3. Create a Line webhook handler staff:

```
defineStaff({
  name: "line-webhook-handler",
  description: "Process Line webhook events and respond to users"
})
```

4. Forward Line webhooks to GenieCEO:

```javascript
// In your Line webhook handler
const response = await fetch("http://localhost:3000/webhook", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    message: lineEvent.message.text,
    source: "line",
    userId: lineEvent.source.userId,
  }),
});
```

#### Slack Integration

Similar to Line, but use Slack's Events API:

```javascript
// Slack event handler
app.event("message", async ({ event, client }) => {
  const response = await fetch("http://localhost:3000/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: event.text,
      source: "slack",
      userId: event.user,
      channelId: event.channel,
    }),
  });

  const result = await response.json();
  await client.chat.postMessage({
    channel: event.channel,
    text: result.response,
  });
});
```

#### Discord Integration

```javascript
// Discord bot handler
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const response = await fetch("http://localhost:3000/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: message.content,
      source: "discord",
      userId: message.author.id,
      channelId: message.channel.id,
    }),
  });

  const result = await response.json();
  await message.reply(result.response);
});
```

### 3. CI/CD Integration

#### GitHub Actions

```yaml
# .github/workflows/genieceo.yml
name: GenieCEO Task
on:
  issues:
    types: [labeled]

jobs:
  process:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger GenieCEO
        run: |
          curl -X POST ${{ secrets.GENIECEO_WEBHOOK_URL }} \
            -H "Authorization: Bearer ${{ secrets.GENIECEO_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d "{\"message\": \"Analyze issue #${{ github.event.issue.number }}\", \"source\": \"github\"}"
```

#### GitLab CI

```yaml
# .gitlab-ci.yml
trigger_genieceo:
  script:
    - |
      curl -X POST ${GENIECEO_WEBHOOK_URL} \
        -H "Authorization: Bearer ${GENIECEO_TOKEN}" \
        -H "Content-Type: application/json" \
        -d '{"message": "Deploy to production", "source": "gitlab"}'
```

### 4. Programmatic Access (Node.js)

For tight integration, import GenieCEO directly:

```javascript
import { createGenieCEOAgent } from "genieceo";
import { getConfigManager } from "genieceo/config";

// Load config
const configManager = getConfigManager();
const config = await configManager.load();

// Create agent
const agent = await createGenieCEOAgent(config);

// Execute task
const response = await agent.run("Build a REST API for blog posts");
console.log(response);
```

### 5. Scheduled Tasks

#### Using Cron

```bash
# Add to crontab
0 9 * * * curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"message": "Generate daily report", "source": "cron"}'
```

#### Using Node.js Scheduler

```javascript
import cron from "node-cron";

// Run every day at 9 AM
cron.schedule("0 9 * * *", async () => {
  await fetch("http://localhost:3000/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Generate daily analytics report",
      source: "scheduler",
    }),
  });
});
```

## Best Practices

### Security

1. **Always use authentication** in production:

```bash
genieceo serve --auth-token "$(openssl rand -hex 32)"
```

2. **Use HTTPS** in production (deploy behind nginx/caddy)

3. **Rate limiting**: The server includes basic rate limiting (100 req/15min per IP)

4. **Validate inputs**: Server validates all incoming requests

### Performance

1. **Long-running tasks**: Use async responses

```javascript
// Client-side polling pattern
const taskResponse = await fetch("/webhook", {
  method: "POST",
  body: JSON.stringify({ message: "complex task", async: true }),
});

const { taskId } = await taskResponse.json();

// Poll for result
while (true) {
  const status = await fetch(`/task/${taskId}`);
  const result = await status.json();
  if (result.completed) break;
  await new Promise((r) => setTimeout(r, 1000));
}
```

2. **Use staff for heavy work**: Delegate to staff to keep context clean

### Monitoring

1. **Check health endpoint**:

```bash
curl http://localhost:3000/health
```

2. **View service logs**:

```bash
# If running as a service
listServices()
viewServiceLogs("genieceo-webhook-xxxx")
```

3. **Monitor via status endpoint**:

```bash
curl http://localhost:3000/status
```

## Common Integration Patterns

### Pattern 1: Request-Response (Synchronous)

Simple synchronous webhook for quick tasks:

```javascript
const result = await fetch("http://localhost:3000/webhook", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: "simple task" }),
});
```

### Pattern 2: Async Task Queue

For long-running tasks, use async pattern with callbacks:

```javascript
// Submit task
await fetch("http://localhost:3000/webhook", {
  method: "POST",
  body: JSON.stringify({
    message: "complex analysis task",
    callbackUrl: "https://your-app.com/callback",
  }),
});

// GenieCEO will POST results to callbackUrl when done
```

### Pattern 3: Streaming Responses

For real-time updates:

```javascript
const response = await fetch("http://localhost:3000/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: "task", stream: true }),
});

const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  console.log(new TextDecoder().decode(value));
}
```

## Troubleshooting

### Server won't start

Check if port is already in use:

```bash
lsof -i :3000
```

Use a different port:

```bash
genieceo serve --port 8080
```

### Webhooks not working

1. Check server is running: `curl http://localhost:3000/health`
2. Verify authentication token matches
3. Check firewall/network settings
4. Use ngrok for local testing: `ngrok http 3000`

### Slow responses

1. Check context budget: `viewContextBudget()`
2. Use staff for heavy tasks to avoid bloating context
3. Consider async pattern for long tasks

## Quick Start Examples

### Example 1: Line Bot Integration

```bash
# Terminal 1: Start webhook server
genieceo serve --port 3000 --auth-token "my-secret"

# Terminal 2: Use ngrok for public URL
ngrok http 3000

# Set Line webhook URL to: https://xxx.ngrok.io/webhook
# Add Authorization header: Bearer my-secret
```

### Example 2: Slack Command Integration

```javascript
// Slack app endpoint
app.command("/genieceo", async ({ command, ack, respond }) => {
  await ack();

  const response = await fetch("http://localhost:3000/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer your-token",
    },
    body: JSON.stringify({
      message: command.text,
      source: "slack",
      userId: command.user_id,
    }),
  });

  const result = await response.json();
  await respond(result.response);
});
```

### Example 3: GitHub Issue Automation

```bash
# When issue is labeled "genieceo-analyze"
curl -X POST http://your-server:3000/webhook \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"message\": \"Analyze GitHub issue and provide suggestions\",
    \"source\": \"github\",
    \"metadata\": {
      \"issueNumber\": \"$ISSUE_NUMBER\",
      \"repository\": \"$REPO_NAME\"
    }
  }"
```

## Summary

The webhook server (`genieceo serve`) is the recommended way to integrate external applications with GenieCEO. It provides:

- ✅ HTTP endpoints for easy integration
- ✅ Authentication and rate limiting
- ✅ Session management for multi-turn conversations
- ✅ Health monitoring and status endpoints
- ✅ Support for async/long-running tasks

For production deployments, always use authentication, HTTPS, and proper monitoring.
