# Tool Calling Guide (TOOLS)

The runtime provides tools via API tool-calling. This file is **guidance** to help you decide when and how to call them.

## When to use tools
- Use tools when you need to read or modify files.
- Use the `run_command` tool when you need to execute a local command (install deps, run tests, start dev servers, inspect system state). Prefer using it instead of guessing.
- Use web search tools when you need up-to-date information.
- If the answer is purely conversational, reply directly without tools.
- For file tools, prefer **relative paths** (e.g. `prompts/TOOLS.md`) over `~/.genieceo/...` to avoid path-resolution surprises.

## File tools: path scopes (important)
The file tools (`read_file`, `write_file`, `edit_file`, `list_dir`) accept:
- `path`: file/dir path (relative or absolute)
- `scope` (optional): where to resolve **relative** paths:
  - `workspace` (default): `~/.genieceo/`
  - `project`: the directory where the user launched `genieceo chat` (`process.cwd()`)
  - `tmp`: `~/.genieceo/tmp/`

Use-case mapping (default behavior):
- Internal/self-improvement scripts or artifacts: **`scope="workspace"`**
- Deliverables the user should pick up in their current folder: **`scope="project"`**
- Temporary scratch outputs you don’t want to keep: **`scope="tmp"`**

## Access modes: what is actually enforced
The runtime can restrict filesystem/shell access via `~/.genieceo/config.json`:
- `execution.fileAccessMode`:
  - `free` (default): file tools may access any path (including absolute paths outside `~/.genieceo/`)
  - `protected`: file tools only allow paths within `~/.genieceo/` or the invocation directory; relative paths must stay within the chosen `scope`
- `execution.shellAccessMode` affects `run_command` allowed roots unless `execution.shell.allowedRoots` is set.

## Shell tool constraints (run_command)
- Can be disabled via `execution.shell.enabled=false`
- Working directory must be within allowed roots (derived from access mode unless overridden by `execution.shell.allowedRoots`)
- Default timeout: 60s (max 600s)
- Default output limit: 50k chars combined stdout+stderr (max 200k); output is truncated to keep the most recent content

## Long-running services (recommended for “run forever” tasks)
If you need to start a command that should keep running beyond the current turn (servers, daemons, watchers), prefer the service tools:
- `service_start`: start a background/detached process and persist its PID + metadata
- `service_status`: check if it is still running
- `service_list`: list managed services
- `service_tail_logs`: inspect recent logs
- `service_stop`: stop a managed service

## Subagents (delegation)
Use subagents when the user’s request needs a **specialized prompt**, **different default model/profile**, or a **restricted toolset**.

Tools:
- `subagent_list`: discover what subagents exist
- `subagent_create`: create/update a subagent under `~/.genieceo/subagents/<name>/AGENT.md`
- `subagent_run`: run a subagent and get its final text output back

Recommended pattern:
- If you (the main agent) are not well-suited for a job, create or reuse a subagent and run it.
- Pass file paths (e.g. `~/.genieceo/media/...`) in the `input`/attachments for the subagent.

## Audio transcription
If a task requires understanding audio, use `audio_transcribe` to convert audio → text, then analyze the transcript (possibly via a subagent like `audio-analyst`).

## Tool-loop limits
- There is **no fixed hard cap** on tool-call iterations per turn; token/context limits are the practical bound. Avoid infinite loops.

## Output discipline
- Keep tool arguments minimal and valid.
- After a tool result, continue the task using the new information.

