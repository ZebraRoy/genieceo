import type { Tool } from "@mariozechner/pi-ai";

import type { SubagentFrontmatter } from "./types.js";

export function filterToolsForSubagent(all: Tool[], fm: Pick<SubagentFrontmatter, "tools" | "disallowedTools">): Tool[] {
  let tools = all.slice();

  // Optional allowlist.
  if (Array.isArray(fm.tools) && fm.tools.length > 0) {
    const allowed = new Set(fm.tools);
    tools = tools.filter((t) => allowed.has(t.name));
  }

  // Optional denylist.
  if (Array.isArray(fm.disallowedTools) && fm.disallowedTools.length > 0) {
    const denied = new Set(fm.disallowedTools);
    tools = tools.filter((t) => !denied.has(t.name));
  }

  // Always deny subagent tools inside subagents to prevent recursion.
  tools = tools.filter((t) => !t.name.startsWith("subagent_"));

  return tools;
}

