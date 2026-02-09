import { describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";

import { parseSkillMarkdown, validateSkillName } from "../src/skills/frontmatter.js";
import { buildSkillsIndex } from "../src/skills/index.js";

describe("skills", () => {
  it("validates skill names", () => {
    expect(validateSkillName("ok")).toBeNull();
    expect(validateSkillName("my-skill")).toBeNull();
    expect(validateSkillName("bad--skill")).toMatch(/consecutive/i);
    expect(validateSkillName("-bad")).toMatch(/only/i);
    expect(validateSkillName("Bad")).toMatch(/lowercase/i);
  });

  it("parses SKILL.md frontmatter and body", () => {
    const md = `---\nname: demo-skill\ndescription: Does demo things. Use when demo.\n---\n\n# Demo\n\nHello\n`;
    const res = parseSkillMarkdown(md, { expectedName: "demo-skill" });
    if (!res.ok) throw new Error(res.error);
    expect(res.frontmatter.name).toBe("demo-skill");
    expect(res.frontmatter.description).toContain("demo");
    expect(res.bodyMarkdown).toContain("# Demo");
  });

  it("builds a skills index and skips invalid folders", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "genieceo-skills-"));
    const skillsDir = path.join(root, "skills");
    await mkdir(skillsDir, { recursive: true });

    // valid
    await mkdir(path.join(skillsDir, "a-skill"), { recursive: true });
    await writeFile(
      path.join(skillsDir, "a-skill", "SKILL.md"),
      `---\nname: a-skill\ndescription: A.\n---\n\n# A\n`,
      "utf8"
    );

    // invalid (name mismatch)
    await mkdir(path.join(skillsDir, "b-skill"), { recursive: true });
    await writeFile(
      path.join(skillsDir, "b-skill", "SKILL.md"),
      `---\nname: not-b\ndescription: B.\n---\n\n# B\n`,
      "utf8"
    );

    const idx = await buildSkillsIndex(skillsDir, { limit: 200 });
    expect(idx.skills.map((s) => s.name)).toEqual(["a-skill"]);
    expect(idx.skipped.length).toBe(1);
  });
});

