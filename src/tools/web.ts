import { z } from 'zod';
import type { Tool } from '../types';
import type { Config } from '../types';

/**
 * Web Search Tool
 * Searches the web using Brave Search API
 */
export function createWebSearchTool(config: Config): Tool {
  return {
    name: 'webSearch',
    description: 'Search the web using Brave Search. Returns relevant web pages with titles, URLs, and snippets.',
    parameters: z.object({
      query: z.string().describe('Search query'),
      count: z.number().int().min(1).max(20).default(5).optional().describe('Number of results to return (default: 5, max: 20)'),
    }),
    execute: async (params: { query: string; count?: number }) => {
      const apiKey = config.tools.webSearch.apiKey;
      
      if (!apiKey) {
        return {
          success: false,
          error: 'Brave Search API key not configured. Set GENIECEO_TOOLS_WEBSEARCH_API_KEY or add to config.',
          query: params.query,
        };
      }

      try {
        const count = params.count || 5;
        const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(params.query)}&count=${count}`;
        
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
          query: params.query,
          results,
          total: results.length,
        };
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
