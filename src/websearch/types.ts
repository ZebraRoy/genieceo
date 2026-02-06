export type WebSearchProvider = "brave" | "tavily" | "duckduckgo";

export type WebSearchResult = {
  title: string;
  url: string;
  snippet?: string;
};

export type WebSearchResponse = {
  provider: WebSearchProvider;
  results: WebSearchResult[];
};

