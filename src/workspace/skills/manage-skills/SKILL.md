---
name: manage-skills
description: Create, edit, install, and remove GenieCEO skills stored under ~/.genieceo/skills. Use when you need to teach or update the agent’s capabilities by changing skill files.
---

# Manage Skills (GenieCEO)

GenieCEO skills live in the GenieCEO workspace at:

- `~/.genieceo/skills/<skill-name>/SKILL.md`

Each skill is a **folder** and must contain a `SKILL.md` file that begins with YAML frontmatter:

```md
---
name: my-skill
description: What this skill does and when to use it (include keywords).
---

# My Skill
Instructions...
```

## How skills are used

- The agent always gets a **Skills Index** (name + description) for all installed skills.
- When it needs more detail, it **reads the full `SKILL.md`** for the chosen skill.

## Add a new skill

1. Pick a valid skill name (lowercase letters, numbers, hyphens; no leading/trailing hyphen; no `--`).
2. Create `~/.genieceo/skills/<name>/SKILL.md` using `write_file`.
3. Include good keywords in the `description` so the agent can match it later.

## Edit an existing skill

- Prefer small edits and keep the file under ~500 lines.
- Use `edit_file` (replace-first) or `write_file` (overwrite) to update `SKILL.md`.

## Remove a skill

Skills are folders. To remove a skill completely, delete its directory:

```bash
rm -rf ~/.genieceo/skills/<skill-name>
```

Guidelines:
- Only delete inside `~/.genieceo/skills/`.
- Prefer running shell commands with `cwd: ~/.genieceo` (workspace root) when possible.

## Validate a skill quickly

Before relying on a skill, sanity-check:
- `SKILL.md` exists
- YAML frontmatter has `name` and `description`
- `name` matches the folder name exactly

