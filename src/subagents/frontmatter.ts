import YAML from "yaml";

import type { SubagentFrontmatter, SubagentParseResult } from "./types.js";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/**
 * Extracts YAML frontmatter from a markdown file.
 * Convention: leading '---' line, then YAML, then closing '---' line.
 */
export function splitFrontmatter(markdown: string): { yaml: string; body: string } | null {
  const src = markdown.replace(/\r\n/g, "\n");
  if (!src.startsWith("---\n")) return null;

  const end = src.indexOf("\n---\n", 4);
  if (end === -1) return null;

  const yaml = src.slice(4, end);
  const body = src.slice(end + "\n---\n".length);
  return { yaml, body };
}

export function validateSubagentName(name: string): string | null {
  if (!name || name.length > 64) return "name must be 1-64 characters";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    return "name must contain only lowercase letters, numbers, and single hyphens (no leading/trailing/consecutive hyphens)";
  }
  return null;
}

export function validateSubagentDescription(description: string): string | null {
  const d = description.trim();
  if (!d) return "description must be non-empty";
  if (d.length > 1024) return "description must be at most 1024 characters";
  return null;
}

function coerceFrontmatter(val: unknown): { ok: true; data: SubagentFrontmatter } | { ok: false; error: string } {
  if (!isPlainObject(val)) return { ok: false, error: "frontmatter must be a YAML mapping/object" };

  const name = typeof val.name === "string" ? val.name.trim() : "";
  const description = typeof val.description === "string" ? val.description.trim() : "";

  const nameErr = validateSubagentName(name);
  if (nameErr) return { ok: false, error: `invalid name: ${nameErr}` };

  const descErr = validateSubagentDescription(description);
  if (descErr) return { ok: false, error: `invalid description: ${descErr}` };

  const profile = typeof val.profile === "string" && val.profile.trim() ? val.profile.trim() : undefined;

  const coerceStringArray = (field: "tools" | "disallowedTools"): string[] | undefined | { error: string } => {
    const v = (val as any)[field];
    if (v == null) return undefined;
    if (!Array.isArray(v)) return { error: `${field} must be an array of strings` };
    const out: string[] = [];
    for (const x of v) {
      if (typeof x !== "string" || !x.trim()) return { error: `${field} must contain only non-empty strings` };
      out.push(x.trim());
    }
    return out;
  };

  const tools = coerceStringArray("tools");
  if ((tools as any)?.error) return { ok: false, error: (tools as any).error };
  const disallowedTools = coerceStringArray("disallowedTools");
  if ((disallowedTools as any)?.error) return { ok: false, error: (disallowedTools as any).error };

  const fm: SubagentFrontmatter = {
    ...(val as any),
    name,
    description,
    profile,
    tools: Array.isArray(tools) ? tools : undefined,
    disallowedTools: Array.isArray(disallowedTools) ? disallowedTools : undefined,
  };

  return { ok: true, data: fm };
}

export function parseSubagentMarkdown(markdown: string, opts?: { expectedName?: string }): SubagentParseResult {
  const split = splitFrontmatter(markdown);
  if (!split) {
    return { ok: false, error: "missing YAML frontmatter (expected leading --- ... ---)" };
  }

  let parsed: unknown;
  try {
    parsed = YAML.parse(split.yaml);
  } catch (e: any) {
    const msg = e?.message ? String(e.message) : String(e);
    return { ok: false, error: `failed to parse YAML frontmatter: ${msg}` };
  }

  const coerced = coerceFrontmatter(parsed);
  if (!coerced.ok) return { ok: false, error: coerced.error };

  if (opts?.expectedName && coerced.data.name !== opts.expectedName) {
    return { ok: false, error: `frontmatter name '${coerced.data.name}' does not match directory name '${opts.expectedName}'` };
  }

  return {
    ok: true,
    frontmatter: coerced.data,
    bodyMarkdown: split.body.replace(/^\n+/, ""),
  };
}

