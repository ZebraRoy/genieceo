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
- `genieceo status`
  - Shows whether the gateway is reachable and lists managed services (PIDs)
- `genieceo gateway`
  - Runs the long-lived gateway daemon (HTTP webhooks + message channels)
  - Loads channel plugins (built-in + `~/.genieceo/plugins/*`)
- `genieceo reset [--all]`
  - Restores prompt templates under `~/.genieceo/prompts/`
  - With `--all`, also resets `~/.genieceo/config.json`

### Debugging / Observability

- **CLI streaming output**: `genieceo chat` streams intermediate model output by default.
  - Disable streaming: `GENIECEO_STREAM=0 genieceo chat`
- **Gateway logs**: `genieceo gateway` writes JSON logs to `~/.genieceo/logs/gateway.log`.
  - Increase verbosity: `GENIECEO_DEBUG=1 genieceo gateway` (or `GENIECEO_LOG_LEVEL=debug`)
- **Tool progress**: gateway logs include `tool start` / `tool end` with durations so you can see what long task it’s doing.

### Workspace layout

`~/.genieceo/`

- `config.json`: LLM + web search settings
- `prompts/`: prompt files loaded into the system prompt
  - `IDENTITY.md`, `AGENTS.md`, `SOUL.md`, `USER.md`, `TOOLS.md`
- `sessions/`: chat sessions saved as JSONL
- `media/`: downloaded inbound channel attachments (images/voice/video/files)
- `services/`: managed long-running services (PID + metadata JSON)
- `logs/`: gateway logs (and future logs)
- `plugins/`: channel plugins loaded by `genieceo gateway`

### Config example

```json
{
  "version": 2,
  "llm": {
    "activeProfile": "openai",
    "profiles": {
      "openai:gpt-4o-mini": {
        "provider": "openai",
        "model": "gpt-4o-mini",
        "apiKey": "sk-..."
      },
      "openai:gpt-5-mini": {
        "provider": "openai",
        "model": "gpt-5-mini",
        "apiKey": "sk-..."
      },
      "anthropic": {
        "provider": "anthropic",
        "model": "claude-3-5-haiku-20241022",
        "apiKey": "sk-ant-..."
      }
    },
    "maxImageBytes": 2097152
  },
  "webSearch": {
    "order": ["brave", "tavily", "duckduckgo"],
    "braveApiKey": "BSA-...",
    "tavilyApiKey": "tvly-..."
  },
  "gateway": {
    "host": "127.0.0.1",
    "port": 3000,
    "autostartServices": []
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "123456:ABC-DEF...",
      "webhookSecretToken": "a-random-secret",
      "publicDomain": "https://xxxx.trycloudflare.com",
      "downloadMedia": true,
      "maxDownloadBytes": 20971520
    },
    "discord": {
      "enabled": true,
      "botToken": "YOUR_DISCORD_BOT_TOKEN",
      "webhookSecret": "optional-webhook-secret",
      "downloadMedia": true,
      "maxDownloadBytes": 20971520
    },
    "line": {
      "enabled": true,
      "channelAccessToken": "YOUR_LINE_CHANNEL_ACCESS_TOKEN",
      "channelSecret": "YOUR_LINE_CHANNEL_SECRET"
    }
  },
  "execution": {
    "shell": {
      "enabled": true,
      "allowedRoots": ["~/.genieceo"]
    }
  }
}
```

### Gateway + Channel webhooks (local daemon + tunnel)

Channel webhooks (Telegram, Discord, Line) require a **public HTTPS** URL. If you run `genieceo gateway` on your local machine, you’ll need a tunnel.

- Start the gateway:

```bash
genieceo gateway
```

- Expose it publicly (example: Cloudflare Tunnel):

```bash
cloudflared tunnel --url http://127.0.0.1:3000
```

Take the public URL Cloudflare prints (example: `https://xxxx.trycloudflare.com`).

#### Telegram Setup

1. Create a bot via [@BotFather](https://t.me/botfather) on Telegram
2. Use `/newbot` command to create a bot and get your bot token
3. Run `genieceo onboard` and select "Channels" setup step:
   - Enter your bot token
   - Enter a webhook secret token (optional but recommended)
   - Enter your public domain URL (e.g., `https://xxxx.trycloudflare.com`)
   - The onboard process will automatically register the webhook with Telegram

Alternatively, manually set the webhook URL using the Bot API:

```bash
export BOT_TOKEN="123456:ABC-DEF..."
export PUBLIC_BASE_URL="https://xxxx.trycloudflare.com"
export SECRET_TOKEN="a-random-secret"

curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H "content-type: application/json" \
  -d "{\"url\":\"${PUBLIC_BASE_URL}/webhooks/telegram\",\"secret_token\":\"${SECRET_TOKEN}\"}"
```

The gateway verifies `X-Telegram-Bot-Api-Secret-Token` if you set `channels.telegram.webhookSecretToken` (optional but recommended).

You can also set `channels.telegram.parse_mode` to control outgoing formatting (`HTML` or `MarkdownV2`; legacy `Markdown` is also supported).

Inbound attachments (Telegram / Discord):

- GenieCEO can download inbound attachments (images, voice, videos, documents) into `~/.genieceo/media/`.
- Telegram/Discord configs support:
  - `downloadMedia`: `true` (default) to download attachments
  - `mediaDir`: override the media directory (absolute path or relative to `~/.genieceo/`)
  - `maxDownloadBytes`: cap per attachment (default: 20MB)

Image understanding (vision models):

- If your active model supports image input, GenieCEO will embed up to 4 inbound images into the prompt (base64).
- Control per-image cap with `llm.maxImageBytes` (default is conservative).

#### Discord Setup

1. Create a Discord bot at https://discord.com/developers/applications
2. Enable "Message Content Intent" in Bot settings
3. Configure the bot token in `~/.genieceo/config.json` under `channels.discord.botToken`
4. Set up Discord interactions endpoint in your app settings to `${PUBLIC_BASE_URL}/webhooks/discord`
5. Invite the bot to your server with proper permissions (Read Messages, Send Messages)

#### Line Setup

1. Create a Line Messaging API channel at https://developers.line.biz/console/
2. Get the Channel Access Token and Channel Secret
3. Configure them in `~/.genieceo/config.json` under `channels.line`
4. Set the webhook URL in Line Console to `${PUBLIC_BASE_URL}/webhooks/line`

The gateway verifies Line webhook signatures automatically using the channel secret.

### Always-on gateway (launchd/systemd templates)

To run the gateway continuously:

- **macOS**: see `docs/supervisor/macos-launchagent.plist`
- **Linux**: see `docs/supervisor/linux-systemd-user.service`

Both templates run `genieceo gateway`, restart on crash, and append logs to `~/.genieceo/logs/`.

Quickstart (macOS):

1. Copy `docs/supervisor/macos-launchagent.plist` to `~/Library/LaunchAgents/io.genieceo.gateway.plist`
2. Edit the file to set the correct `genieceo` path (`which genieceo`) and your home directory
3. Load it:

```bash
launchctl load -w ~/Library/LaunchAgents/io.genieceo.gateway.plist
launchctl list | grep genieceo
```

Quickstart (Linux):

1. Copy `docs/supervisor/linux-systemd-user.service` to `~/.config/systemd/user/genieceo-gateway.service`
2. Edit the `ExecStart` path if needed (`which genieceo`)
3. Enable + start:

```bash
systemctl --user daemon-reload
systemctl --user enable --now genieceo-gateway.service
systemctl --user status genieceo-gateway.service
```

### Channel plugins (skills-like “just files”)

Channel plugins are folders under `~/.genieceo/plugins/<name>/`.

Each plugin provides:

- `plugin.json` (manifest)
- `index.js` (entry; compiled JS; loaded via dynamic `import()`)

Enable/configure the plugin by adding a block under `channels.<name>` in `~/.genieceo/config.json` (convention: `{ "enabled": true, ... }`).

### Notes

- Provider/model discovery and tool calling are powered by `@mariozechner/pi-ai` (pi-mono). See its docs at [`pi.dev`](https://buildwithpi.ai/).
