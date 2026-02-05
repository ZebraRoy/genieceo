# Web Search System

## Overview

genieceo's web search system supports multiple providers with automatic fallback, ensuring search functionality is always available to users regardless of their API key configuration or payment preferences.

## Architecture

### Provider Hierarchy

When using `provider: "auto"` (default), the system tries providers in this order:

1. **Tavily** (if API key configured)
   - High-quality, AI-optimized search
   - Free tier: 1,000 searches/month
   - Best overall quality

2. **Brave** (if API key configured)
   - Premium search API
   - Requires payment
   - Good quality but costly

3. **Browser Fallback** (always available)
   - DuckDuckGo HTML scraping
   - No API key needed
   - Free and always works
   - Basic quality but reliable

### Provider Selection

Users can explicitly select a provider:

```json
{
  "tools": {
    "webSearch": {
      "provider": "tavily"  // or "brave", "browser", "auto"
    }
  }
}
```

## Implementation Details

### File Structure

- **`src/tools/web.ts`**: Main web search implementation
  - `createWebSearchTool()`: Tool factory function
  - `searchWithTavily()`: Tavily API implementation
  - `searchWithBrave()`: Brave API implementation
  - `searchWithBrowser()`: DuckDuckGo HTML scraping

### API Implementations

#### Tavily Search

```typescript
POST https://api.tavily.com/search
Content-Type: application/json

{
  "api_key": "tvly-...",
  "query": "search query",
  "max_results": 5,
  "search_depth": "basic",
  "include_answer": false
}
```

Response format:
```json
{
  "results": [
    {
      "title": "Page title",
      "url": "https://...",
      "content": "Page snippet"
    }
  ]
}
```

#### Brave Search

```typescript
GET https://api.search.brave.com/res/v1/web/search?q=query&count=5
Headers:
  X-Subscription-Token: BSA...
  Accept: application/json
```

Response format:
```json
{
  "web": {
    "results": [
      {
        "title": "Page title",
        "url": "https://...",
        "description": "Page snippet"
      }
    ]
  }
}
```

#### Browser Fallback (DuckDuckGo)

```typescript
GET https://html.duckduckgo.com/html/?q=query
Headers:
  User-Agent: Mozilla/5.0 (compatible; genieceo/1.0)
```

Response: HTML page with search results that are parsed using regex.

### Unified Response Format

All providers return a consistent format:

```typescript
{
  success: boolean;
  provider: 'brave' | 'tavily' | 'browser';
  query: string;
  results: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
  total: number;
  note?: string;  // Optional note for browser fallback
  error?: string;  // If success is false
}
```

## Configuration

### Config Schema

```typescript
tools: {
  webSearch: {
    provider?: 'auto' | 'brave' | 'tavily' | 'browser';
    brave?: {
      apiKey: string;
    };
    tavily?: {
      apiKey: string;
    };
    // Legacy support
    apiKey?: string;
  }
}
```

### Migration Handling

The config manager automatically migrates legacy configs:

```typescript
// Old format (auto-migrated)
{
  "tools": {
    "webSearch": {
      "apiKey": "BSA..."
    }
  }
}

// Migrated to
{
  "tools": {
    "webSearch": {
      "provider": "auto",
      "brave": {
        "apiKey": "BSA..."
      }
    }
  }
}
```

## Error Handling

### Auto Mode
- If a provider fails, the system automatically tries the next provider
- Errors are logged to console but don't stop the search
- Browser fallback ensures search always returns results

### Specific Provider Mode
- If the selected provider fails, the error is returned to the agent
- No automatic fallback to other providers
- User must fix the configuration or switch providers

## Usage Examples

### From Agent

```typescript
// The agent calls the tool like this:
{
  "name": "webSearch",
  "parameters": {
    "query": "latest TypeScript features",
    "count": 5
  }
}
```

### From CLI

```bash
genieceo chat -m "Search for the latest TypeScript features"
```

## Testing

### Check Configuration

```bash
genieceo status
```

Output shows:
```
Web Search Provider: auto
  Tavily: ✓ Configured
  Brave: ○ Not configured
  Browser (fallback): ✓ Always available
```

### Test Specific Provider

```bash
# Edit config to set provider: "browser"
genieceo chat -m "Search for TypeScript"
```

### Test Auto Fallback

Remove all API keys and search should still work with browser fallback.

## Performance Considerations

### API Latency
- Tavily: ~500-1500ms
- Brave: ~300-1000ms
- Browser: ~1000-2000ms (HTML parsing overhead)

### Rate Limits
- Tavily free tier: 1,000 searches/month
- Brave: Depends on plan
- Browser: No rate limits (respectful usage)

### Caching
Currently not implemented. Future enhancement could cache results for repeated queries.

## Security

### API Keys
- Stored in `~/.genieceo/config.json`
- Never logged or exposed
- Masked in status output (only first 8 and last 4 chars shown)

### HTML Scraping
- Browser fallback only makes GET requests to DuckDuckGo
- No JavaScript execution
- Safe regex-based parsing
- No data sent to third parties

## Future Enhancements

Potential improvements:

1. **Additional Providers**
   - Google Custom Search API
   - Bing Search API
   - SearXNG instances

2. **Caching Layer**
   - Cache results for repeated queries
   - Configurable TTL

3. **Advanced Browser Search**
   - Integration with Vercel's agent-browser
   - JavaScript rendering for dynamic content
   - Screenshot capture

4. **Search Quality**
   - Result ranking/filtering
   - Duplicate detection
   - Domain filtering

5. **Monitoring**
   - Usage statistics
   - Provider performance metrics
   - Failure rate tracking

## Troubleshooting

### Search Always Uses Browser Fallback

**Symptoms**: All searches show `provider: "browser"` even with API keys configured

**Possible causes**:
1. API keys are invalid or expired
2. API keys are not in the correct config location
3. Provider is explicitly set to "browser"

**Solution**:
```bash
genieceo status  # Check API key status
# Edit config to verify keys are in correct location
```

### Search Returns No Results

**Symptoms**: `results: []` in response

**Possible causes**:
1. Query too specific or unusual
2. Provider having issues
3. Network connectivity problems

**Solution**:
- Try a different, more common query
- Switch to different provider
- Check network connection

### API Key Errors

**Symptoms**: Errors like "API key not configured" or "401 Unauthorized"

**Possible causes**:
1. API key missing from config
2. API key format incorrect
3. API key expired or invalid

**Solution**:
```bash
# Verify API key format:
# Tavily: tvly-...
# Brave: BSA...

genieceo status  # Check configuration
# Edit config file to fix API keys
```

## Contributing

When adding a new search provider:

1. Add provider config to types and schema
2. Implement search function in `src/tools/web.ts`
3. Add to provider hierarchy in `createWebSearchTool()`
4. Update documentation
5. Add tests
6. Update status command to show new provider

## Resources

- [Tavily API Documentation](https://docs.tavily.com)
- [Brave Search API Documentation](https://brave.com/search/api)
- [DuckDuckGo HTML](https://html.duckduckgo.com)
