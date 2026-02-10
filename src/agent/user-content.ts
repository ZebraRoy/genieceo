import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Model } from "@mariozechner/pi-ai";

import type { InboundAttachment } from "../plugins/types.js";
import type { GenieCeoConfig } from "../config/schema.js";

function guessImageMimeType(p: string): string {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "image/jpeg";
}

export async function buildUserContent(opts: {
  model: Model<any>;
  config: GenieCeoConfig;
  userText: string;
  attachments?: InboundAttachment[];
}): Promise<{
  modelContent: string | Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;
  sessionText: string;
}> {
  const baseText = String(opts.userText ?? "").trim();
  const atts = Array.isArray(opts.attachments) ? opts.attachments : [];
  if (atts.length === 0) return { modelContent: baseText, sessionText: baseText };

  const lines: string[] = [];
  for (const a of atts) {
    const name = a.originalName ? ` (${a.originalName})` : "";
    const mt = a.mimeType ? ` ${a.mimeType}` : "";
    const sz = typeof a.sizeBytes === "number" ? ` ${a.sizeBytes}B` : "";
    if (a.path) lines.push(`- ${a.kind}${name}${mt}${sz}: ${a.path}`);
    else lines.push(`- ${a.kind}${name}${mt}${sz}: [not downloaded]`);
  }

  const sessionText = [baseText, "Attachments:", ...lines].filter(Boolean).join("\n");

  const modelInputs: string[] = Array.isArray((opts.model as any)?.input) ? ((opts.model as any).input as string[]) : [];
  const supportsImages = modelInputs.includes("image");
  if (!supportsImages) return { modelContent: sessionText, sessionText };

  const maxImages = 4;
  const maxImageBytes =
    typeof (opts.config as any)?.llm?.maxImageBytes === "number"
      ? Math.floor((opts.config as any).llm.maxImageBytes)
      : 2 * 1024 * 1024; // 2MB per image

  const blocks: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [
    { type: "text", text: sessionText },
  ];

  let embedded = 0;
  for (const a of atts) {
    if (embedded >= maxImages) break;
    if (a.kind !== "image" || !a.path) continue;
    try {
      const buf = await readFile(a.path);
      if (buf.byteLength > maxImageBytes) continue;
      const mimeType = a.mimeType && a.mimeType.startsWith("image/") ? a.mimeType : guessImageMimeType(a.path);
      blocks.push({ type: "image", data: buf.toString("base64"), mimeType });
      embedded++;
    } catch {
      // best-effort only
    }
  }

  return { modelContent: blocks, sessionText };
}

