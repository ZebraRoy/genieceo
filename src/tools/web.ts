import { z } from 'zod';
import { fetch as undiciFetch, Agent } from 'undici';
import type { Tool } from '../types';
import type { Config } from '../types';

// Create a custom agent with better timeout and connection settings
const fetchAgent = new Agent({
  keepAliveTimeout: 4000,
  keepAliveMaxTimeout: 10000,
  connections: 256,
  pipelining: 1,
  connect: {
    timeout: 30000, // 30 second connection timeout
    rejectUnauthorized: true,
  },
});

// Wrapper for fetch with proper timeout and retry logic
async function fetchWithTimeout(url: string | URL, options: any = {}, timeout = 30000, maxRetries = 2): Promise<Response> {
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await undiciFetch(url, {
        ...options,
        signal: controller.signal,
        dispatcher: fetchAgent,
      });
      clearTimeout(timeoutId);
      return response as Response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
      
      // If this is not the last attempt and it's a network error, wait and retry
      if (attempt < maxRetries && (error instanceof TypeError || (error as any).code === 'UND_ERR_CONNECT_TIMEOUT')) {
        // Wait before retrying: 500ms for first retry, 1000ms for second
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
}

/**
 * Web Search Tool
 * Supports multiple search providers: Brave, Tavily, and browser-based search
 */
export function createWebSearchTool(config: Config): Tool {
  return {
    name: 'webSearch',
    description: 'Search the web using configured provider (Brave, Tavily, or browser). Returns relevant web pages with titles, URLs, and snippets.',
    parameters: z.object({
      query: z.string().describe('Search query'),
      count: z.number().int().min(1).max(20).default(5).optional().describe('Number of results to return (default: 5, max: 20)'),
    }),
    execute: async (params: { query: string; count?: number }) => {
      const provider = config.tools.webSearch.provider || 'auto';
      const count = params.count || 5;

      // Auto mode: try providers in order based on availability
      if (provider === 'auto') {
        // Try Tavily first (if configured)
        if (config.tools.webSearch.tavily?.apiKey) {
          try {
            return await searchWithTavily(config, params.query, count);
          } catch (error) {
            console.warn('Tavily search failed, trying next provider:', error);
          }
        }

        // Try Brave (if configured)
        if (config.tools.webSearch.brave?.apiKey) {
          try {
            return await searchWithBrave(config, params.query, count);
          } catch (error) {
            console.warn('Brave search failed, trying next provider:', error);
          }
        }

        // Try browser as last resort
        try {
          return await searchWithBrowser(config, params.query, count);
        } catch (error) {
          return {
            success: false,
            error: 'All search providers failed. Please configure at least one search provider (Tavily or Brave) or ensure browser is available.',
            query: params.query,
          };
        }
      }

      // Specific provider mode
      try {
        switch (provider) {
          case 'brave':
            return await searchWithBrave(config, params.query, count);
          case 'tavily':
            return await searchWithTavily(config, params.query, count);
          case 'browser':
            return await searchWithBrowser(config, params.query, count);
          default:
            return {
              success: false,
              error: `Unknown search provider: ${provider}. Valid options: brave, tavily, browser, auto`,
              query: params.query,
            };
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          query: params.query,
        };
      }
    },
  };
}

/**
 * Search using Brave Search API
 */
async function searchWithBrave(config: Config, query: string, count: number) {
  const apiKey = config.tools.webSearch.brave?.apiKey;
  
  if (!apiKey) {
    throw new Error('Brave Search API key not configured. Add tools.webSearch.brave.apiKey to your config file.');
  }

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
  
  let data: any;
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error response');
      throw new Error(`Brave Search API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    data = await response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message === 'fetch failed') {
      throw new Error(`Network error: Unable to connect to Brave Search API. Check your internet connection and firewall settings. Original error: ${error.message}`);
    }
    throw error;
  }
  
  // Extract web results
  const results = (data.web?.results || []).map((result: any) => ({
    title: result.title,
    url: result.url,
    snippet: result.description,
  }));

  return {
    success: true,
    provider: 'brave',
    query,
    results,
    total: results.length,
  };
}

/**
 * Search using Tavily API
 */
async function searchWithTavily(config: Config, query: string, count: number) {
  const apiKey = config.tools.webSearch.tavily?.apiKey;
  
  if (!apiKey) {
    throw new Error('Tavily API key not configured. Add tools.webSearch.tavily.apiKey to your config file.');
  }

  let data: any;
  try {
    const response = await fetchWithTimeout('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: query,
        max_results: count,
        search_depth: 'basic',
        include_answer: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error response');
      throw new Error(`Tavily API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    data = await response.json();
  } catch (error) {
    // Provide more detailed error information
    if (error instanceof TypeError && error.message === 'fetch failed') {
      throw new Error(`Network error: Unable to connect to Tavily API. Check your internet connection and firewall settings. Original error: ${error.message}`);
    }
    throw error;
  }
  
  // Extract results
  const results = (data.results || []).map((result: any) => ({
    title: result.title,
    url: result.url,
    snippet: result.content,
  }));

  return {
    success: true,
    provider: 'tavily',
    query,
    results,
    total: results.length,
  };
}

/**
 * Search using browser (fallback method)
 * Uses a simple DuckDuckGo HTML scraping approach as fallback
 */
async function searchWithBrowser(config: Config, query: string, count: number) {
  // Use DuckDuckGo HTML as a free fallback
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  
  let html: string;
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; genieceo/1.0)',
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error response');
      throw new Error(`Browser search error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    html = await response.text();
  } catch (error) {
    if (error instanceof TypeError && error.message === 'fetch failed') {
      throw new Error(`Network error: Unable to connect to DuckDuckGo. Check your internet connection and firewall settings. Original error: ${error.message}`);
    }
    throw error;
  }
  
  // Parse DuckDuckGo HTML results (simple regex-based extraction)
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  
  // Match result blocks in DuckDuckGo HTML
  const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([^<]*)</g;
  
  let match;
  let resultCount = 0;
  while ((match = resultRegex.exec(html)) !== null && resultCount < count) {
    const [, url, title, snippet] = match;
    if (url && title) {
      results.push({
        url: url.startsWith('http') ? url : `https://duckduckgo.com${url}`,
        title: title.trim(),
        snippet: snippet?.trim() || '',
      });
      resultCount++;
    }
  }

  return {
    success: true,
    provider: 'browser',
    query,
    results,
    total: results.length,
    note: 'Using browser-based fallback search (DuckDuckGo). For better results, configure Tavily or Brave API.',
  };
}
