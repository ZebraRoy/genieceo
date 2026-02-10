export function renderAssistantText(msg: any): string {
  const content = msg?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const b of content) {
      if (!b) continue;
      if (b.type === "text" && typeof b.text === "string") parts.push(b.text);
      else if (typeof (b as any).text === "string") parts.push(String((b as any).text));
    }
    return parts.join("").trim();
  }
  // Extremely defensive fallback.
  if (content && typeof content === "object" && typeof (content as any).text === "string") return String((content as any).text).trim();
  return "";
}

