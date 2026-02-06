import type { WebSearchResponse, WebSearchResult } from "./types.js";

export async function braveSearch(opts: {
  apiKey: string;
  query: string;
  count: number;
}): Promise<WebSearchResponse> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", opts.query);
  url.searchParams.set("count", String(Math.max(1, Math.min(20, opts.count))));

  const res = await fetch(url, {
    headers: {
      "X-Subscription-Token": opts.apiKey,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Brave search failed: ${res.status} ${res.statusText} ${text}`.trim());
  }

  const data: any = await res.json();
  const items: any[] = data?.web?.results ?? [];
  const results: WebSearchResult[] = items
    .map((it) => ({
      title: String(it?.title ?? ""),
      url: String(it?.url ?? ""),
      snippet: it?.description ? String(it.description) : undefined,
    }))
    .filter((r) => r.title && r.url);

  return { provider: "brave", results };
}

