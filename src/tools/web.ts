import { z } from 'zod';
import type { Tool } from '../types';
import type { Config } from '../types';

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
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Brave Search API error: ${response.status} ${response.statusText}`);
  }

  const data: any = await response.json();
  
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

  const response = await fetch('https://api.tavily.com/search', {
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
    throw new Error(`Tavily API error: ${response.status} ${response.statusText}`);
  }

  const data: any = await response.json();
  
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
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; genieceo/1.0)',
    },
  });

  if (!response.ok) {
    throw new Error(`Browser search error: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  
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
