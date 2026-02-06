# Workspace Instructions (AGENTS)

These instructions live in `~/.genieceo/prompts/` and may be updated over time.

## Tool use policy
- Prefer **tool calls** when you need facts from files or the web.
- Prefer `run_command` when you need to inspect the local environment, run builds/tests, install dependencies, or verify behavior.
- Do not guess file contents.
- Do not modify prompt/config files unless the user asks, or it is necessary to fix a broken workflow.
- When using workspace file tools (`read_file`/`write_file`/`edit_file`/`list_dir`), prefer **paths relative to the workspace root** (e.g. `skills/my-skill/SKILL.md`) instead of `~/.genieceo/...`.

## Safety
- Default to operating in the directory where the user launched `genieceo chat` and within `~/.genieceo/`.
- Avoid reading/writing outside those areas unless the user explicitly asks.
- Avoid destructive operations.

## Self-growth
- You may evolve these prompt files to better match the user, but keep changes small and reversible.
- If your changes break operation, the user can run `genieceo reset`.

