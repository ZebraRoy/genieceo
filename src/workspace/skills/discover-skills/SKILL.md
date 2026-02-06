---
name: discover-skills
description: Discover relevant community skills and decide whether to install one. Use when the user asks for a specialized capability that might exist as an installable Agent Skill.
---

# Discover Skills (GenieCEO)

This skill is inspired by the open skills ecosystem (including skills.sh) but is tailored to GenieCEO:
- We **discover** skills via web search + reading sources
- We **install** by copying skill folders into `~/.genieceo/skills/` (not via `npx skills add`)

## When to use

Use when the user:
- asks for a specialized workflow or domain expertise
- says “is there a skill for …”
- repeatedly asks similar questions that would benefit from a reusable procedure

## How to discover a skill

1. Extract keywords from the user request (domain + task).\n   Example: “React app is slow” → `react performance profiling`.
2. Use `web_search` with those keywords plus “SKILL.md” or “skills.sh”.
3. Open promising results with `web_fetch`.
4. Prefer skills that:\n   - have clear triggers in the description\n   - are short and actionable\n   - include examples\n   - are hosted on reputable repos

## How to install (high-level)

Once you identify a specific skill and its GitHub source, follow the `install-from-github` skill to copy the skill directory into:

- `~/.genieceo/skills/<skill-name>/`

## If no good skill exists

- Tell the user no suitable skill was found.
- Offer to create a new skill (use `author-skills` + `manage-skills`).

