import type { WebSearchResponse, WebSearchResult } from "./types.js";

export async function tavilySearch(opts: {
  apiKey: string;
  query: string;
  count: number;
}): Promise<WebSearchResponse> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      api_key: opts.apiKey,
      query: opts.query,
      max_results: Math.max(1, Math.min(20, opts.count)),
      include_answer: false,
      include_images: false,
      include_raw_content: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Tavily search failed: ${res.status} ${res.statusText} ${text}`.trim());
  }

  const data: any = await res.json();
  const items: any[] = data?.results ?? [];
  const results: WebSearchResult[] = items
    .map((it) => ({
      title: String(it?.title ?? ""),
      url: String(it?.url ?? ""),
      snippet: it?.content ? String(it.content) : undefined,
    }))
    .filter((r) => r.title && r.url);

  return { provider: "tavily", results };
}

