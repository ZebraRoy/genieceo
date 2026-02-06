# Workspace Instructions (AGENTS)

These instructions live in `~/.genieceo/prompts/` and may be updated over time.

## Tool use policy
- Prefer **tool calls** when you need facts from files or the web.
- Do not guess file contents.
- Do not modify prompt/config files unless the user asks, or it is necessary to fix a broken workflow.

## Safety
- Only read/write inside `~/.genieceo/` unless explicitly allowed.
- Avoid destructive operations.

## Self-growth
- You may evolve these prompt files to better match the user, but keep changes small and reversible.
- If your changes break operation, the user can run `genieceo reset`.

