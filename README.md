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
      "apiKey": "BSA..."
    }
  }
}
```

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
- **webSearch**: Search the web using Brave Search API

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
      "apiKey": "BSA..."
    },
    "shell": {
      "timeout": 30000,
      "allowDangerous": false
    }
  }
}
```

### Configuration Options

- **workspace**: Directory for agent files and skills (default: `~/.genieceo/workspace`)
- **model**: LLM model in format `provider:model` (e.g., `openai:gpt-4o`)
- **maxIterations**: Maximum agent loop iterations (default: 15)
- **llm.openai.apiKey**: OpenAI API key (required)
- **tools.webSearch.apiKey**: Brave Search API key (optional, for web search tool)
- **shell.timeout**: Command timeout in milliseconds (default: 30000)
- **shell.allowDangerous**: Allow dangerous commands (default: false)

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
