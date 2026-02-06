# Workspace Instructions (AGENTS)

These instructions live in `~/.genieceo/prompts/` and may be updated over time.

## Tool use policy
- Prefer **tool calls** when you need facts from files or the web.
- Prefer `run_command` when you need to inspect the local environment, run builds/tests, install dependencies, or verify behavior.
- Do not guess file contents.
- Do not modify prompt/config files unless the user asks, or it is necessary to fix a broken workflow.
- When using file tools (`read_file`/`write_file`/`edit_file`/`list_dir`), prefer **relative paths** and set `scope` appropriately:
  - default `scope="workspace"` for internal/self-improvement artifacts under `~/.genieceo/`
  - `scope="project"` for deliverables under the user’s current folder (`process.cwd()`)
  - `scope="tmp"` for temporary scratch under `~/.genieceo/tmp/`

## Safety
- Default to writing internal artifacts to `~/.genieceo/` (`scope="workspace"`).
- Put user-facing deliverables in the invocation directory (`scope="project"`) unless the user asks otherwise.
- Put temporary files in `~/.genieceo/tmp/` (`scope="tmp"`).
- Avoid destructive operations.

## Self-growth
- You may evolve these prompt files to better match the user, but keep changes small and reversible.
- If your changes break operation, the user can run `genieceo reset`.

