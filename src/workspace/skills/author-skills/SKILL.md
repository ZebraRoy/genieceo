---
name: author-skills
description: Write high-quality Agent Skills (SKILL.md) for GenieCEO. Use when creating or improving a skill’s structure, keywords, examples, and progressive disclosure.
---

# Author Skills (GenieCEO)

This skill teaches how to write a **good** `SKILL.md` so the agent can (1) select the right skill from the index and (2) execute the instructions reliably once loaded.

## Follow the spec

GenieCEO uses the Agent Skills format:
- One directory per skill
- Required file: `SKILL.md`
- Required YAML frontmatter keys: `name`, `description`

Reference: Agent Skills spec at `https://agentskills.io/specification`.

## Frontmatter best practices

### `name`
- Keep it stable (renaming breaks references).
- Must match the folder name exactly.

### `description`
Your `description` is what the agent sees **before** it reads the skill.

Write it like:
- What it does (concrete verbs)
- When to use it (triggers)
- Include keywords users will say

Good:
> Extract meeting notes, produce action items, and generate follow-up emails. Use when the user mentions meetings, minutes, action items, or follow-ups.

Weak:
> Helps with meetings.

## Body best practices (once loaded)

Recommended sections:
- **When to use**: bullets of triggers
- **Inputs required**: what the agent must ask the user for
- **Step-by-step procedure**: numbered, deterministic
- **Examples**: realistic examples of user prompts + expected outcomes
- **Edge cases / safety**: what not to do

## Progressive disclosure

Keep `SKILL.md` focused. If the skill grows large:
- Move detailed reference into `references/REFERENCE.md`
- Keep `SKILL.md` as the “operator manual”

## GenieCEO-specific guidance

GenieCEO can manage skills using existing tools:
- Use `list_dir` to enumerate `skills/`
- Use `read_file` / `write_file` / `edit_file` to manage `SKILL.md`
- Use `run_command` only when necessary and keep operations inside `~/.genieceo/`

