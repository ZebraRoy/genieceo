---
name: install-from-github
description: Install a skill into ~/.genieceo/skills by fetching its SKILL.md (and any referenced files) from a public GitHub repository. Use when the user wants to add a new capability from the open skills ecosystem.
---

# Install Skills from GitHub (GenieCEO)

GenieCEO does **not** rely on `npx skills add` for installation. Instead, we install by copying a skill folder into:

- `~/.genieceo/skills/<skill-name>/`

## When to use

Use this when:
- The user wants a new capability and it likely exists as a community skill
- You found a skill on a website (e.g. skills.sh) that is hosted on GitHub

## Installation strategy

### Preferred: fetch raw files and write them into the workspace

1. Identify the GitHub repo and the skill directory path.\n   Common patterns:\n   - `skills/<skill-name>/SKILL.md`\n   - `<skill-name>/SKILL.md`
2. Fetch the raw `SKILL.md` with `web_fetch` (or `web_search` then `web_fetch`).
3. Create the target directory and write the file using `write_file`:\n   - `skills/<skill-name>/SKILL.md` relative to the workspace root (`~/.genieceo/`).
4. If `SKILL.md` references additional files (like `references/REFERENCE.md` or `scripts/*.sh`), fetch those raw URLs too and write them into the same folder structure.
5. Validate:\n   - frontmatter `name` matches folder name\n   - `description` exists

### Optional: git clone (only if shell is enabled)

If `run_command` is enabled and allowed, you can clone to a temp location inside `~/.genieceo/` and then copy the desired skill folder into `~/.genieceo/skills/`.

Safety rules:
- Only write under `~/.genieceo/`
- Prefer `cwd: ~/.genieceo`
- Never run untrusted scripts automatically

## Notes / limitations

- Some community skills may assume other agents’ tool names. Adjust the instructions to GenieCEO’s tool set if needed.
- If a skill is too large, only install the needed subset and note what was skipped.

