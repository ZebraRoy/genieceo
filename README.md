# genieceo 🐱

**Ultra-lightweight AI agent CLI assistant** inspired by [nanobot](https://github.com/HKUDS/nanobot)

genieceo is a powerful yet minimalist AI agent that helps you with tasks through natural language. It features a workspace for persistent memory, a skill system for specialized capabilities, and a subagent system for handling complex tasks in parallel.

## ✨ Features

- 🪶 **Lightweight**: Clean TypeScript codebase, easy to understand and extend
- 🛠️ **Rich Toolset**: File operations, shell commands, web search, and more
- 🎯 **Skill System**: Teach the agent new capabilities through markdown files
- 🤖 **Subagents**: Delegate complex tasks to background agents
- 🔄 **Provider-Agnostic**: Uses Vercel AI SDK - easily switch between OpenAI, Anthropic, etc.
- 💾 **Workspace**: Persistent workspace for files, skills, and configuration

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
genieceo chat -m "Spawn a subagent to research the history of AI, while you create a summary document"
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

### `genieceo init`
Initialize workspace and configuration

### `genieceo chat`
Start interactive chat mode

**Options:**
- `-m, --message <text>` - Send single message instead of interactive mode

### `genieceo status`
Show configuration and workspace status

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
│   └── providers/      # LLM provider (Vercel AI SDK)
```

## 🔄 Switching LLM Providers

genieceo uses Vercel AI SDK, making it easy to switch providers:

**Current:** OpenAI only

**Coming soon:** Anthropic, Google, and more

To add a new provider:
1. Install the SDK: `npm install @ai-sdk/anthropic`
2. Update `src/providers/llm.ts`
3. Set model in config: `"anthropic:claude-3-5-sonnet-20241022"`

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
