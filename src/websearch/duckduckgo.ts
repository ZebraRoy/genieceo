import * as cheerio from "cheerio";
import type { WebSearchResponse, WebSearchResult } from "./types.js";

function clampCount(count: number): number {
  return Math.max(1, Math.min(20, count));
}

function decodeDuckDuckGoRedirect(url: string): string {
  // DuckDuckGo often returns redirect URLs like:
  // https://duckduckgo.com/l/?uddg=<percent-encoded-target>
  try {
    const normalized =
      url.startsWith("//") ? `https:${url}` : url.startsWith("/") ? `https://duckduckgo.com${url}` : url;
    const u = new URL(normalized);
    if (u.hostname.endsWith("duckduckgo.com") && u.pathname.startsWith("/l/")) {
      const uddg = u.searchParams.get("uddg");
      if (uddg) return decodeURIComponent(uddg);
    }
  } catch {
    // ignore
  }
  return url;
}

async function duckDuckGoHtmlSearch(opts: { query: string; count: number }): Promise<WebSearchResult[]> {
  const url = new URL("https://html.duckduckgo.com/html/");
  url.searchParams.set("q", opts.query);

  const res = await fetch(url, {
    headers: {
      Accept: "text/html,*/*",
      "User-Agent": "GenieCEO/0.1 (cli)",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DuckDuckGo HTML search failed: ${res.status} ${res.statusText} ${text}`.trim());
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const results: WebSearchResult[] = [];
  const max = clampCount(opts.count);

  // Typical structure: <a class="result__a" href="...">Title</a>
  // Snippet: <a class="result__snippet">...</a> or <div class="result__snippet">...</div> (varies).
  $(".result").each((_, el) => {
    if (results.length >= max) return;

    const a = $(el).find("a.result__a").first();
    const title = a.text().trim();
    const href = a.attr("href")?.trim() ?? "";
    const snippet =
      $(el).find(".result__snippet").first().text().trim() ||
      $(el).find(".result__snippet").first().attr("title")?.trim() ||
      undefined;

    const url = decodeDuckDuckGoRedirect(href);
    if (title && url) results.push({ title, url, snippet: snippet || undefined });
  });

  // Some variants don't wrap in `.result` reliably; try anchors directly as a fallback.
  if (results.length === 0) {
    $("a.result__a").each((_, el) => {
      if (results.length >= max) return;
      const a = $(el);
      const title = a.text().trim();
      const href = a.attr("href")?.trim() ?? "";
      const url = decodeDuckDuckGoRedirect(href);
      if (title && url) results.push({ title, url });
    });
  }

  return results.slice(0, max);
}

async function duckDuckGoInstantAnswerFallback(opts: { query: string; count: number }): Promise<WebSearchResult[]> {
  // NOTE: This is NOT a full web search. It often returns zero items for regular queries.
  const url = new URL("https://api.duckduckgo.com/");
  url.searchParams.set("q", opts.query);
  url.searchParams.set("format", "json");
  url.searchParams.set("no_redirect", "1");
  url.searchParams.set("no_html", "1");

  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "GenieCEO/0.1 (cli)" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DuckDuckGo IA search failed: ${res.status} ${res.statusText} ${text}`.trim());
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

  return results.slice(0, clampCount(opts.count));
}

export async function duckDuckGoSearch(opts: { query: string; count: number }): Promise<WebSearchResponse> {
  const count = clampCount(opts.count);
  const query = String(opts.query ?? "").trim();

  // Best-effort HTML scraping first (more like real “web search”), then fallback.
  try {
    const results = await duckDuckGoHtmlSearch({ query, count });
    if (results.length > 0) return { provider: "duckduckgo", results };
  } catch {
    // ignore and fall back
  }

  const results = await duckDuckGoInstantAnswerFallback({ query, count });
  return { provider: "duckduckgo", results };
}

