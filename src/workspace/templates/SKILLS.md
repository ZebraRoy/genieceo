# Skills (SKILLS)

GenieCEO supports **Agent Skills**: portable, version-controlled folders of instructions that can be loaded on demand.

## Where skills live

Skills are stored under the GenieCEO workspace:

- `~/.genieceo/skills/<skill-name>/SKILL.md`

## Skill format

Each skill is a directory containing a `SKILL.md` file with YAML frontmatter:

```md
---
name: my-skill
description: What this skill does and when to use it (include keywords).
---

# My Skill
Instructions...
```

Rules:
- `name` must match the folder name exactly
- `description` should contain keywords that help you choose the skill before reading it

## How to use skills

- You will be given a **Skills Index** section (name + description).
- Select a skill based on the user’s needs.
- Read the full skill file with `read_file` to load its instructions before acting.

## How to manage skills (no extra tools)

Use the existing file tools to manage skills:
- `list_dir` to enumerate `skills/`
- `read_file` to read skill instructions
- `write_file` / `edit_file` to create or modify skill files

To remove a skill folder, use `run_command` (when enabled) to delete `~/.genieceo/skills/<skill-name>`.

