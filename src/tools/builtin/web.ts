import type { Tool } from "@mariozechner/pi-ai";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { htmlToText } from "html-to-text";
import * as cheerio from "cheerio";

import { webSearch } from "../../websearch/index.js";
import type { ToolExecutionContext } from "../types.js";

export function registerWebTools(
  registry: { register: (tool: Tool, handler: (args: any) => Promise<string>) => void },
  ctx: ToolExecutionContext
) {
  registry.register(
    {
      name: "web_search",
      description: "Search the web using configured providers (Brave/Tavily/DuckDuckGo fallback).",
      parameters: Type.Object({
        query: Type.String({ minLength: 1, description: "Search query." }),
        count: Type.Optional(Type.Number({ minimum: 1, maximum: 20, description: "Number of results (1-20)." })),
      }),
    },
    async (args) => {
      const query = String(args.query ?? "").trim();
      const count = typeof args.count === "number" ? args.count : 5;
      const resp = await webSearch(ctx.config, { query, count });
      return JSON.stringify(resp, null, 2);
    }
  );

  registry.register(
    {
      name: "web_fetch",
      description: "Fetch a URL and extract readable text.",
      parameters: Type.Object({
        url: Type.String({ minLength: 1, description: "URL to fetch." }),
        extractMode: Type.Optional(StringEnum(["text", "markdown"], { default: "text" })),
        maxChars: Type.Optional(Type.Number({ minimum: 1000, maximum: 200000, description: "Max output chars." })),
      }),
    },
    async (args) => {
      const url = String(args.url ?? "").trim();
      const maxChars = typeof args.maxChars === "number" ? args.maxChars : 50000;

      const res = await fetch(url, { headers: { "User-Agent": "GenieCEO/0.1 (cli)", Accept: "text/html,*/*" } });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return `Error: fetch failed: ${res.status} ${res.statusText}\n${text}`.slice(0, maxChars);
      }

      const contentType = res.headers.get("content-type") ?? "";
      const raw = await res.text();

      let extracted = raw;
      if (contentType.includes("text/html") || raw.includes("<html") || raw.includes("<body")) {
        const $ = cheerio.load(raw);
        const title = $("title").first().text().trim();
        const text = htmlToText($.html("body") || $.html(), {
          wordwrap: false,
          selectors: [{ selector: "a", options: { ignoreHref: true } }],
        });
        extracted = (title ? `${title}\n\n` : "") + text.trim();
      }

      if (extracted.length > maxChars) extracted = extracted.slice(0, maxChars) + "\n\n[truncated]";
      return extracted;
    }
  );
}

