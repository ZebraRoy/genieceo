import YAML from "yaml";

import type { SkillFrontmatter, SkillParseResult } from "./types.js";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/**
 * Extracts YAML frontmatter from a markdown file.
 * We follow the common convention: a leading '---' line, then YAML, then a closing '---' line.
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

export function validateSkillName(name: string): string | null {
  // Per agentskills.io/specification constraints.
  if (!name || name.length > 64) return "name must be 1-64 characters";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    return "name must contain only lowercase letters, numbers, and single hyphens (no leading/trailing/consecutive hyphens)";
  }
  return null;
}

export function validateSkillDescription(description: string): string | null {
  const d = description.trim();
  if (!d) return "description must be non-empty";
  if (d.length > 1024) return "description must be at most 1024 characters";
  return null;
}

function coerceFrontmatter(val: unknown): { ok: true; data: SkillFrontmatter } | { ok: false; error: string } {
  if (!isPlainObject(val)) return { ok: false, error: "frontmatter must be a YAML mapping/object" };

  const name = typeof val.name === "string" ? val.name.trim() : "";
  const description = typeof val.description === "string" ? val.description.trim() : "";

  const nameErr = validateSkillName(name);
  if (nameErr) return { ok: false, error: `invalid name: ${nameErr}` };

  const descErr = validateSkillDescription(description);
  if (descErr) return { ok: false, error: `invalid description: ${descErr}` };

  // metadata: string->string if present
  let metadata: Record<string, string> | undefined;
  if (val.metadata != null) {
    if (!isPlainObject(val.metadata)) return { ok: false, error: "metadata must be a mapping of string->string" };
    metadata = {};
    for (const [k, v] of Object.entries(val.metadata)) {
      if (typeof k !== "string" || !k) return { ok: false, error: "metadata keys must be non-empty strings" };
      if (typeof v !== "string") return { ok: false, error: `metadata.${k} must be a string` };
      metadata[k] = v;
    }
  }

  const fm: SkillFrontmatter = {
    ...(val as any),
    name,
    description,
    metadata,
  };

  return { ok: true, data: fm };
}

export function parseSkillMarkdown(markdown: string, opts?: { expectedName?: string }): SkillParseResult {
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

