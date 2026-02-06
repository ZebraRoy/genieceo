# genieceo 🐱

**Ultra-lightweight AI agent CLI assistant** inspired by [nanobot](https://github.com/HKUDS/nanobot)

genieceo is a powerful yet minimalist AI agent that helps you with tasks through natural language. It features a workspace for persistent memory, a skill system for specialized capabilities, and a subagent system for handling complex tasks in parallel.

## ✨ Features

- 🪶 **Lightweight**: Clean TypeScript codebase, easy to understand and extend
- 🛠️ **Rich Toolset**: File operations, shell commands, web search, and more
- 🎯 **Skill System**: Teach the agent new capabilities through markdown files
- 🤖 **Subagents**: Delegate complex tasks to background agents
- 🔄 **Provider-Agnostic**: Uses @mariozechner/pi-ai - supports 15+ providers with automatic model discovery
- 💾 **Workspace**: Persistent workspace for files, skills, and configuration
- 🧞 **NEW: GenieCEO Mode** - Multi-agent system with context engineering and service management
- 🔌 **Integration Support** - Webhook server for Line, Slack, Discord, and other external integrations

## 🆕 GenieCEO Multi-Agent Mode

Start GenieCEO chat for advanced capabilities:

```bash
genieceo chat
```

**Key Features:**
- **Context Engineering**: Staff return ≤2K summaries from 200K context (40x savings)
- **Flexible Staff**: Define any staff (api-builder, debugger, security-auditor)
- **Service Management**: Build and run web servers, APIs, webhooks
- **Smart Memory**: Auto-compaction, long-term knowledge, daily logs

**Quick Example:**
```
"Define an api-builder staff that creates REST APIs"
"Spawn api-builder to build a blog API"
"Start the API as a service on port 3000"
```

See [GENIECEO_BUILD_SUMMARY.md](GENIECEO_BUILD_SUMMARY.md) and [examples/](examples/) for details.

## 🔌 Integration & Webhooks

GenieCEO runs as a webhook server by default for external integrations:

```bash
# Start webhook server (default behavior)
genieceo --port 3000 --auth-token "your-secret-token"

# Or explicitly
genieceo -p 3000 -t "your-secret-token"
```

**Available endpoints:**
- `POST /webhook` - Execute tasks from external systems
- `POST /chat` - Interactive chat with session management
- `GET /health` - Health check
- `GET /status` - Server statistics

**Example integration:**
```javascript
// Trigger GenieCEO from Line, Slack, Discord, etc.
const response = await fetch('http://localhost:3000/webhook', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-secret-token'
  },
  body: JSON.stringify({
    message: 'Build a REST API for blog posts',
    source: 'line',
    userId: 'user123'
  })
});
```

**Integration examples:**
- [Line Bot Integration](examples/integrations/line-bot.js)
- [Slack Bot Integration](examples/integrations/slack-bot.js)
- [Discord Bot Integration](examples/integrations/discord-bot.js)

See [Integration Examples](examples/integrations/) for complete setup guides.

## 📦 Installation

### From npm (coming soon)

```bash
npm install -g genieceo
```

### From source (development)

```bash
git clone https://github.com/yourusername/genieceo.git
cd genieceo
npm install
npm run build
npm link
```

## 🚀 Quick Start

### 1. Initialize

```bash
genieceo init
```

This creates:
- Configuration file at `~/.genieceo/config.json`
- Workspace directory at `~/.genieceo/workspace/`

### 2. Configure

#### Option A: Interactive Setup (Recommended)

Run the onboarding wizard to configure everything step-by-step:

```bash
genieceo onboard
```

The wizard will guide you through:
- **LLM Configuration**: Select provider (OpenAI, Anthropic, etc.) and enter API key
- **Model Selection**: Choose from available models for your provider
- **Health Check**: Verify your LLM setup is working correctly
- **Web Search**: Configure search providers (Tavily, Brave, or browser-based)

#### Option B: Manual Configuration

Edit `~/.genieceo/config.json` to add your API keys:

```json
{
  "workspace": "~/.genieceo/workspace",
  "model": "openai:gpt-4o",
  "maxIterations": 15,
  "llm": {
    "openai": {
      "apiKey": "sk-..."
    }
  },
  "tools": {
    "webSearch": {
      "provider": "auto",
      "tavily": {
        "apiKey": "tvly-..."
      },
      "brave": {
        "apiKey": "BSA..."
      }
    }
  }
}
```

**Note:** Web search will work even without API keys by using the browser fallback. However, for better results, configure at least one search provider (Tavily or Brave).

### 3. Chat!

**Single message:**
```bash
genieceo chat -m "What is 2+2?"
```

**Interactive mode:**
```bash
genieceo chat
```

## 🛠️ Available Tools

genieceo comes with powerful built-in tools:

### File Operations
- **readFile**: Read file contents
- **writeFile**: Create or overwrite files
- **listDir**: List directory contents

### Shell
- **executeCommand**: Run shell commands (with safety checks)

### Web
- **webSearch**: Search the web using multiple providers (Tavily, Brave, or browser fallback)

### Subagents
- **spawnSubagent**: Create background agents for complex tasks

## 🎯 Skills

Skills teach the agent how to handle specialized tasks. Built-in skills:

- **planning**: Break down complex tasks systematically
- **debugging**: Debug code and systems methodically
- **coding**: Best practices for writing quality code

### Adding Custom Skills

Create a skill in `~/.genieceo/workspace/skills/`:

```
~/.genieceo/workspace/skills/
└── myskill/
    └── SKILL.md
```

**SKILL.md format:**
```markdown
---
name: myskill
description: What this skill does
metadata:
  always: false
  requires:
    bins: []
    config: []
---

# My Skill

Detailed instructions for the agent on how to use this skill...
```

The `requires.config` field specifies config paths that must be set (e.g., `["llm.openai.apiKey", "tools.webSearch.apiKey"]`).

## 🔧 Configuration

Configuration file: `~/.genieceo/config.json`

All configuration is managed through this file. No environment variables are used.

```json
{
  "workspace": "~/.genieceo/workspace",
  "model": "openai:gpt-4o",
  "maxIterations": 15,
  "llm": {
    "openai": {
      "apiKey": "sk-..."
    }
  },
  "tools": {
    "webSearch": {
      "provider": "auto",
      "tavily": {
        "apiKey": "tvly-..."
      },
      "brave": {
        "apiKey": "BSA..."
      }
    },
    "shell": {
      "timeout": 30000,
      "allowDangerous": false
    }
  }
}
```

### Configuration Options

#### Core Settings
- **workspace**: Directory for agent files and skills (default: `~/.genieceo/workspace`)
- **model**: LLM model in format `provider:model` (e.g., `openai:gpt-4o`)
- **maxIterations**: Maximum agent loop iterations (default: 15)

#### LLM Configuration
- **llm.openai.apiKey**: OpenAI API key (required)

#### Web Search Configuration
- **tools.webSearch.provider**: Search provider to use (options: `auto`, `brave`, `tavily`, `browser`)
  - `auto` (default): Tries providers in order (Tavily → Brave → Browser)
  - `brave`: Use Brave Search API only
  - `tavily`: Use Tavily Search API only
  - `browser`: Use browser-based fallback only (free, no API key needed)
- **tools.webSearch.tavily.apiKey**: Tavily API key (optional but recommended)
  - Get your free API key at [tavily.com](https://tavily.com)
  - Free tier: 1,000 searches/month
  - Recommended for best search quality
- **tools.webSearch.brave.apiKey**: Brave Search API key (optional)
  - Note: Brave now requires payment
  - Get API key at [brave.com/search/api](https://brave.com/search/api)

**Browser Fallback**: If no API keys are configured, web search automatically uses a browser-based fallback (DuckDuckGo HTML). This works out-of-the-box with no configuration needed.

#### Shell Configuration
- **shell.timeout**: Command timeout in milliseconds (default: 30000)
- **shell.allowDangerous**: Allow dangerous commands (default: false)

## 🔍 Web Search

genieceo supports multiple web search providers with automatic fallback:

### Search Providers

1. **Tavily** (Recommended)
   - High-quality search results optimized for AI agents
   - Free tier: 1,000 searches/month
   - Get API key: [tavily.com](https://tavily.com)
   - Config: `tools.webSearch.tavily.apiKey`

2. **Brave Search**
   - Premium search API (now requires payment)
   - Get API key: [brave.com/search/api](https://brave.com/search/api)
   - Config: `tools.webSearch.brave.apiKey`

3. **Browser Fallback** (Always Available)
   - Free, no API key required
   - Uses DuckDuckGo HTML search
   - Automatically used when no API keys configured
   - Good enough for most use cases

### Configuration Examples

**Auto mode** (tries providers in order):
```json
{
  "tools": {
    "webSearch": {
      "provider": "auto",
      "tavily": { "apiKey": "tvly-..." }
    }
  }
}
```

**Specific provider**:
```json
{
  "tools": {
    "webSearch": {
      "provider": "tavily",
      "tavily": { "apiKey": "tvly-..." }
    }
  }
}
```

**Browser-only** (no API key needed):
```json
{
  "tools": {
    "webSearch": {
      "provider": "browser"
    }
  }
}
```

**Note**: The config format shown above is the current format. If you're using an older development version with `tools.webSearch.apiKey`, update to the new nested format shown in the examples.

## 🤖 Using Subagents

Subagents run in the background and handle tasks independently:

```bash
genieceo -m "Spawn a subagent to research the history of AI, while you create a summary document"
```

The agent will:
1. Spawn a background subagent for research
2. Continue with creating the summary
3. Integrate the research results when the subagent completes

## 📚 Examples

### File Operations

```bash
genieceo chat -m "Create a hello.txt file with 'Hello, World!'"
```

### Web Search

```bash
genieceo chat -m "Search for the latest TypeScript features and summarize them"
```

### Shell Commands

```bash
genieceo chat -m "List all JavaScript files in the current directory"
```

### Complex Task with Subagents

```bash
genieceo chat -m "Create a Node.js web server with Express. Spawn subagents to create routes, middleware, and tests in parallel"
```

## 🎨 CLI Commands

### `genieceo`
Start webhook server for external integrations (default)

**Options:**
- `-p, --port <number>` - Port to listen on (default: 3000)
- `-t, --auth-token <token>` - Authentication token for requests (recommended)

**Example:**
```bash
genieceo --port 8080 --auth-token "my-secret-token"
```

### `genieceo chat`
Interactive chat with GenieCEO agent

**Options:**
- `-m, --message <text>` - Send single message instead of interactive mode

**Example:**
```bash
genieceo chat
genieceo chat -m "Build a REST API"
```

### `genieceo init`
Initialize workspace and configuration

### `genieceo onboard`
Interactive setup wizard for configuring LLM and web search

This command guides you through:
- **LLM Provider Selection**: Choose from available providers (OpenAI, Anthropic, Google, etc.)
- **API Key Configuration**: Enter your API keys securely
- **Model Selection**: Pick from available models for your provider
- **Health Check**: Test your LLM configuration with a real API call
- **Web Search Setup**: Configure search providers (Tavily, Brave, or browser-based)

**Example:**
```bash
genieceo onboard
```

### `genieceo status`
Show configuration and workspace status

### `genieceo plugin`
Manage integration plugins

**Example:**
```bash
genieceo plugin list
genieceo plugin reload
```

## 🏗️ Architecture

```
genieceo/
├── src/
│   ├── cli/            # CLI interface
│   ├── agent/          # Agent loop, context, subagents
│   ├── tools/          # Tool implementations
│   ├── skills/         # Skill system & built-in skills
│   ├── workspace/      # Workspace management
│   ├── config/         # Configuration system
│   └── providers/      # LLM provider (@mariozechner/pi-ai)
```

## 🔄 Switching LLM Providers

genieceo uses @mariozechner/pi-ai, which provides:
- **Automatic model discovery** - no hardcoded model lists
- **15+ providers** - OpenAI, Anthropic, Google, Azure, Bedrock, Mistral, Groq, xAI, OpenRouter, and more
- **Cross-provider handoffs** - switch models mid-conversation
- **Unified interface** - same API for all providers

### Available Providers

To see all available providers and their models:

```bash
# The library automatically discovers all available models at runtime
# Simply configure your provider and model in config.json
```

To use a different provider, simply update your config:

```json
{
  "model": "anthropic:claude-3-5-sonnet-20241022",
  "llm": {
    "anthropic": {
      "apiKey": "sk-ant-..."
    }
  }
}
```

**Supported providers (examples):**
- **OpenAI**: `openai:gpt-4o`, `openai:gpt-4o-mini`, `openai:o1`
- **Anthropic**: `anthropic:claude-3-5-sonnet-20241022`, `anthropic:claude-3-5-haiku-20241022`
- **Google**: `google:gemini-2.0-flash-exp`, `google:gemini-1.5-pro`
- **Mistral**: `mistral:mistral-large-latest`, `mistral:mistral-small-latest`
- **Groq**: `groq:llama-3.3-70b-versatile`, `groq:mixtral-8x7b-32768`
- **xAI**: `xai:grok-beta`
- **OpenRouter**: `openrouter:anthropic/claude-3.5-sonnet`
- **Azure OpenAI**: Configure via environment variables
- **Amazon Bedrock**: `bedrock:anthropic.claude-3-5-sonnet-20241022-v2:0`
- **Cerebras**: `cerebras:llama3.3-70b`
- **And 15+ more!**

The model list is automatically discovered from each provider's API, so you always have access to the latest models without updating genieceo.

## 🛡️ Safety

- **Command blocking**: Dangerous commands (rm -rf, format, etc.) are blocked by default
- **Workspace isolation**: Agent works in `~/.genieceo/workspace/files/` by default
- **Timeout limits**: Commands have 30s timeout (configurable)
- **API key security**: Keys stored in config file with restricted permissions

## 🤝 Contributing

Contributions welcome! The codebase is intentionally small and readable.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📝 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

Inspired by [nanobot](https://github.com/HKUDS/nanobot) - the ultra-lightweight Clawdbot alternative

## 📞 Support

- Issues: [GitHub Issues](https://github.com/yourusername/genieceo/issues)
- Discussions: [GitHub Discussions](https://github.com/yourusername/genieceo/discussions)

---

Made with ❤️ for developers who want a lightweight, extensible AI agent
