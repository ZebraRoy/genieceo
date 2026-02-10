export type SubagentFrontmatter = {
  name: string;
  description: string;
  /**
   * Default LLM profile name from config.llm.profiles (e.g. "openai:gpt-5-mini").
   * If omitted, subagent runs with the caller's active profile.
   */
  profile?: string;
  /**
   * Optional allowlist of tool names for this subagent.
   * If present, only these tools are exposed to the subagent (minus disallowedTools).
   */
  tools?: string[];
  /**
   * Optional denylist of tool names.
   */
  disallowedTools?: string[];
  [k: string]: unknown;
};

export type SubagentIndexEntry = {
  name: string;
  description: string;
  profile?: string;
  /**
   * Absolute path to the subagent directory in the GenieCEO workspace.
   * Example: /Users/you/.genieceo/subagents/my-agent
   */
  dir: string;
  /**
   * Absolute path to AGENT.md
   */
  agentMdPath: string;
  updatedAtMs?: number;
};

export type SubagentParseResult =
  | {
      ok: true;
      frontmatter: SubagentFrontmatter;
      bodyMarkdown: string;
    }
  | {
      ok: false;
      error: string;
    };

