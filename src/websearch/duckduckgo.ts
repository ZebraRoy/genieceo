import type { WebSearchResponse, WebSearchResult } from "./types.js";

export async function duckDuckGoSearch(opts: { query: string; count: number }): Promise<WebSearchResponse> {
  const url = new URL("https://api.duckduckgo.com/");
  url.searchParams.set("q", opts.query);
  url.searchParams.set("format", "json");
  url.searchParams.set("no_redirect", "1");
  url.searchParams.set("no_html", "1");

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DuckDuckGo search failed: ${res.status} ${res.statusText} ${text}`.trim());
  }

  const data: any = await res.json();
  const results: WebSearchResult[] = [];

  // Prefer Results array when present (not always).
  const direct: any[] = data?.Results ?? [];
  for (const r of direct) {
    const title = String(r?.Text ?? "");
    const url = String(r?.FirstURL ?? "");
    if (title && url) results.push({ title, url });
  }

  // Fallback to RelatedTopics (can be nested).
  const related: any[] = data?.RelatedTopics ?? [];
  const flatten = (arr: any[]) => {
    for (const t of arr) {
      if (t?.Topics && Array.isArray(t.Topics)) flatten(t.Topics);
      const title = String(t?.Text ?? "");
      const url = String(t?.FirstURL ?? "");
      if (title && url) results.push({ title, url });
    }
  };
  flatten(related);

  return { provider: "duckduckgo", results: results.slice(0, Math.max(1, opts.count)) };
}

