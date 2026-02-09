import type { GenieCeoConfig } from "../config/schema.js";
import type { WebSearchProvider, WebSearchResponse } from "./types.js";
import { braveSearch } from "./brave.js";
import { tavilySearch } from "./tavily.js";
import { duckDuckGoSearch } from "./duckduckgo.js";

export type WebSearchOptions = {
  query: string;
  count?: number;
};

export async function webSearch(config: GenieCeoConfig, opts: WebSearchOptions): Promise<WebSearchResponse> {
  const count = Math.max(1, Math.min(20, opts.count ?? 5));
  const order = (config.webSearch.order ?? ["brave", "tavily", "duckduckgo"]) as WebSearchProvider[];

  let lastErr: unknown;

  for (const provider of order) {
    try {
      if (provider === "brave") {
        const apiKey = config.webSearch.braveApiKey;
        if (!apiKey) throw new Error("Missing Brave API key");
        return await braveSearch({ apiKey, query: opts.query, count });
      }

      if (provider === "tavily") {
        const apiKey = config.webSearch.tavilyApiKey;
        if (!apiKey) throw new Error("Missing Tavily API key");
        return await tavilySearch({ apiKey, query: opts.query, count });
      }

      if (provider === "duckduckgo") {
        return await duckDuckGoSearch({ query: opts.query, count });
      }
    } catch (e) {
      lastErr = e;
      continue;
    }
  }

  throw new Error(`All web search providers failed. Last error: ${String((lastErr as any)?.message ?? lastErr)}`);
}

