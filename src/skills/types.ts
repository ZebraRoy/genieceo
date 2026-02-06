export type SkillFrontmatter = {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  ["allowed-tools"]?: string;
  // Note: Cursor supports disable-model-invocation, but it's not in agentskills.io spec page.
  // We allow it to round-trip without validating semantics.
  ["disable-model-invocation"]?: boolean;
  [k: string]: unknown;
};

export type SkillIndexEntry = {
  name: string;
  description: string;
  /**
   * Absolute path to the skill directory in the GenieCEO workspace.
   * Example: /Users/you/.genieceo/skills/my-skill
   */
  dir: string;
  /**
   * Absolute path to SKILL.md
   */
  skillMdPath: string;
  updatedAtMs?: number;
};

export type SkillParseResult =
  | {
      ok: true;
      frontmatter: SkillFrontmatter;
      bodyMarkdown: string;
    }
  | {
      ok: false;
      error: string;
    };

