import { describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";

import { parseSubagentMarkdown } from "../src/subagents/frontmatter.js";
import { buildSubagentsIndex } from "../src/subagents/index.js";
import { filterToolsForSubagent } from "../src/subagents/tool-filter.js";

describe("subagents", () => {
  it("parses subagent frontmatter", () => {
    const md = `---
name: audio-analyst
description: Transcribe and analyze audio files.
profile: openai:gpt-5-mini
tools:
  - audio_transcribe
  - web_search
disallowedTools:
  - run_command
---

Hello`;

    const parsed = parseSubagentMarkdown(md, { expectedName: "audio-analyst" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.frontmatter.name).toBe("audio-analyst");
    expect(parsed.frontmatter.profile).toBe("openai:gpt-5-mini");
    expect(parsed.frontmatter.tools).toEqual(["audio_transcribe", "web_search"]);
    expect(parsed.frontmatter.disallowedTools).toEqual(["run_command"]);
  });

  it("rejects invalid names", () => {
    const md = `---
name: Bad Name
description: x
---

Body`;
    const parsed = parseSubagentMarkdown(md);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toMatch(/invalid name/i);
  });

  it("builds subagents index and skips missing AGENT.md", async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), "genieceo-subagents-"));

    await mkdir(path.join(base, "good-agent"), { recursive: true });
    await writeFile(
      path.join(base, "good-agent", "AGENT.md"),
      `---\nname: good-agent\ndescription: ok\n---\n\nBody\n`,
      "utf8",
    );
    await mkdir(path.join(base, "missing-agent"), { recursive: true });

    const { subagents, skipped } = await buildSubagentsIndex(base, { limit: 50 });
    expect(subagents.map((s) => s.name)).toEqual(["good-agent"]);
    expect(skipped.some((s) => s.dir.endsWith(path.join("missing-agent")))).toBe(true);
  });

  it("filters tools with allow/deny and blocks subagent_*", () => {
    const all = [
      { name: "read_file", description: "", parameters: {} as any },
      { name: "run_command", description: "", parameters: {} as any },
      { name: "subagent_run", description: "", parameters: {} as any },
      { name: "web_search", description: "", parameters: {} as any },
    ];

    const filtered = filterToolsForSubagent(all as any, { tools: ["read_file", "subagent_run", "web_search"], disallowedTools: ["run_command"] });
    expect(filtered.map((t) => t.name).sort()).toEqual(["read_file", "web_search"]);
  });
});

