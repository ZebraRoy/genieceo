# Onboarding Guide

The `genieceo onboard` command provides an interactive setup wizard to help you configure your AI agent.

## Quick Start

```bash
genieceo onboard
```

This will guide you through setting up:
1. **LLM Provider** - Select and configure your language model provider
2. **Health Check** - Verify your LLM setup with a real API call
3. **Web Search** - Configure web search capabilities

## Step-by-Step Walkthrough

### Step 1: LLM Configuration

The wizard will help you:

1. **Select a Provider**
   - Choose from available providers (OpenAI, Anthropic, Google, etc.)
   - Default: OpenAI
   - Providers are automatically discovered via `@mariozechner/pi-ai`

2. **Enter API Key**
   - Provide your API key for the selected provider
   - If a key already exists, you can press Enter to keep it
   - Keys are stored securely in `~/.genieceo/config.json`

3. **Select a Model**
   - The wizard automatically fetches available models for your provider
   - You can select by number or enter the model ID directly
   - Example models:
     - OpenAI: `gpt-4o`, `gpt-4-turbo`, `gpt-3.5-turbo`
     - Anthropic: `claude-3-5-sonnet-20241022`, `claude-3-opus-20240229`

### Step 2: Health Check

The wizard performs a health check to ensure your LLM is configured correctly:

1. **Configuration Validation**
   - Checks that the provider exists
   - Verifies API key format
   - Validates model availability

2. **Test API Call**
   - Makes a simple API request to verify connectivity
   - Shows the response and token usage
   - If the test fails, you'll see a detailed error message

Example output:
```
✓ Configuration validated
✓ LLM health check passed
  Response: Hello! I am working correctly.
  Tokens used: 23
```

### Step 3: Web Search Configuration

Configure web search capabilities:

1. **Select Provider**
   - `auto` (recommended) - Tries providers in order: Tavily → Brave → Browser
   - `tavily` - Use Tavily Search API only
   - `brave` - Use Brave Search API only
   - `browser` - Use free browser-based search (no API key needed)

2. **Configure API Keys**
   - For `auto` mode: Optionally configure Tavily and/or Brave
   - For specific providers: Enter the required API key
   - Browser mode requires no API key

#### Getting API Keys

**Tavily (Recommended)**
- Website: https://tavily.com
- Free tier: 1,000 searches/month
- Best for: AI agent applications with high-quality results

**Brave Search**
- Website: https://brave.com/search/api
- Note: Now requires payment
- Best for: Privacy-focused search

**Browser Mode**
- No API key needed
- Uses DuckDuckGo HTML search
- Good enough for most use cases

## Configuration File

The onboard command saves your configuration to `~/.genieceo/config.json`:

```json
{
  "workspace": "~/.genieceo/workspace",
  "model": "openai:gpt-4o",
  "maxIterations": 15,
  "llm": {
    "openai": {
      "apiKey": "sk-proj-..."
    },
    "anthropic": {
      "apiKey": "sk-ant-..."
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

## Common Issues

### Issue: "Failed to get model"

**Solution:** Check that your API key is correct and has access to the selected model.

### Issue: "LLM health check failed"

**Possible causes:**
- Invalid API key
- Network connectivity issues
- Insufficient API credits
- Rate limiting

**Solution:** Verify your API key and check your provider's dashboard for account status.

### Issue: "Could not fetch models for this provider"

**Solution:** You can manually enter the model ID. Check your provider's documentation for available models.

### Issue: Web search not working

**Solution:** 
- For `auto` mode: Configure at least one API provider (Tavily or Brave)
- For specific providers: Verify your API key is correct
- For `browser` mode: Check your internet connection

## Re-running Onboard

You can run `genieceo onboard` multiple times to:
- Switch providers
- Update API keys
- Change models
- Reconfigure web search

Existing configuration values will be shown, and you can press Enter to keep them.

## Manual Configuration

If you prefer to edit the configuration manually:

```bash
# Open the config file
vim ~/.genieceo/config.json

# Or use your preferred editor
code ~/.genieceo/config.json
```

After manual edits, verify your configuration:

```bash
genieceo status
```

## Next Steps

After completing onboarding:

```bash
# Start a chat
genieceo chat

# Send a single message
genieceo chat -m "What is 2+2?"

# Check status
genieceo status
```

## Security Notes

- API keys are stored in plain text in `~/.genieceo/config.json`
- Ensure proper file permissions: `chmod 600 ~/.genieceo/config.json`
- Never commit your config file to version control
- Keep your API keys secure and rotate them regularly

## Troubleshooting

### Enable Debug Mode

Set environment variable for detailed logging:

```bash
DEBUG=genieceo:* genieceo onboard
```

### Reset Configuration

To start fresh:

```bash
rm -rf ~/.genieceo
genieceo init
genieceo onboard
```

## Support

For issues or questions:
- GitHub Issues: https://github.com/yourusername/genieceo/issues
- Documentation: https://github.com/yourusername/genieceo#readme
