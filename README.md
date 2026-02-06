## GenieCEO

`genieceo` is a global CLI agent that keeps an evolving workspace under `~/.genieceo`.

### Install (dev)

```bash
pnpm install
pnpm run build
node dist/cli.js --help
```

### Install (global)

After publishing to npm:

```bash
pnpm add -g genieceo
genieceo --help
```

### Commands

- `genieceo onboard`
  - Interactive setup wizard (space to toggle, enter to confirm)
  - Writes `~/.genieceo/config.json` (LLM + web search)
- `genieceo chat`
  - Loads prompt files from `~/.genieceo/prompts/`
  - Chats with the configured model via `@mariozechner/pi-ai`
  - Executes tool calls (file tools + web tools) and persists the session to JSONL
- `genieceo reset [--all]`
  - Restores prompt templates under `~/.genieceo/prompts/`
  - With `--all`, also resets `~/.genieceo/config.json`

### Workspace layout

`~/.genieceo/`

- `config.json`: LLM + web search settings
- `prompts/`: prompt files loaded into the system prompt
  - `IDENTITY.md`, `AGENTS.md`, `SOUL.md`, `USER.md`, `TOOLS.md`
- `sessions/`: chat sessions saved as JSONL
- `logs/`: reserved for future use

### Config example

```json
{
  "version": 2,
  "llm": {
    "activeProfile": "openai",
    "profiles": {
      "openai:gpt-4o-mini": { "provider": "openai", "model": "gpt-4o-mini", "apiKey": "sk-..." },
      "openai:gpt-5-mini": { "provider": "openai", "model": "gpt-5-mini", "apiKey": "sk-..." },
      "anthropic": { "provider": "anthropic", "model": "claude-3-5-haiku-20241022", "apiKey": "sk-ant-..." }
    }
  },
  "webSearch": {
    "order": ["brave", "tavily", "duckduckgo"],
    "braveApiKey": "BSA-...",
    "tavilyApiKey": "tvly-..."
  }
}
```

### Notes

- Provider/model discovery and tool calling are powered by `@mariozechner/pi-ai` (pi-mono). See its docs at [`pi.dev`](https://buildwithpi.ai/).

