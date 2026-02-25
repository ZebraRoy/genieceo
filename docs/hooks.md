# Runtime Hooks

GenieCEO supports an external runtime hook module so you can observe lifecycle events without modifying core source code.

## Quickstart (3 minutes)

1. Create a hook module at `~/.genieceo/hooks/event-log.mjs`:

```js
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

const outPath = path.join(process.env.HOME, ".genieceo", "logs", "hook-events.jsonl");

export default async function onEvent(event) {
  await mkdir(path.dirname(outPath), { recursive: true });
  await appendFile(outPath, JSON.stringify(event) + "\n", "utf8");
}
```

2. Update `~/.genieceo/config.json`:

```json
{
  "version": 2,
  "hooks": {
    "enabled": true,
    "handlerModule": "hooks/event-log.mjs",
    "timeoutMs": 2000,
    "failOpen": true
  }
}
```

3. Restart GenieCEO (`genieceo chat` or `genieceo gateway`) and run a request.
4. Check `~/.genieceo/logs/hook-events.jsonl`.

If the file is growing, hooks are working.

## Config Reference

- `hooks.enabled`: enables/disables runtime hooks.
- `hooks.handlerModule`: module path.
  - Absolute path: used directly.
  - Relative path: resolved from `~/.genieceo`.
- `hooks.timeoutMs`: max time per hook call in milliseconds.
- `hooks.failOpen`:
  - `true` (recommended): hook failures are logged, runtime continues.
  - `false`: hook failures can bubble up (advanced use only).

## Supported Module Exports

Use one of these patterns:

### 1) default export function

```js
export default async function onEvent(event, context) {
  // context.workspaceRoot
}
```

### 2) named `onEvent` export

```js
export async function onEvent(event, context) {
  // ...
}
```

### 3) `createHookHandler` factory

```js
export function createHookHandler(context) {
  return async function onEvent(event) {
    // build state once, reuse per event
  };
}
```

## Event Families

- `agent.loop.*`: top-level agent turn loop events.
- `subagent.loop.*`: subagent turn loop events.
- `tool.execute.before|after|error`: centralized tool lifecycle.
- `gateway.inbound.*`: inbound message lifecycle.
- `gateway.outbound.*`: outbound message lifecycle.
- `session.load|append|append_many|clear`: gateway session persistence lifecycle.
- `memory.flush.*`: internal memory flush lifecycle.
- `memory.store.read|write`: memory file operations.
- `shell.command.*`: shell command lifecycle.
- `service.lifecycle.*`: managed service lifecycle.

## Event Payload Shape

All events share a common envelope:

```json
{
  "name": "tool.execute.before",
  "timestampMs": 1730000000000,
  "workspaceRoot": "/Users/you/.genieceo",
  "scope": "agent",
  "runId": "uuid-optional",
  "channel": "cli",
  "conversationKey": "optional-channel-key",
  "data": {}
}
```

The `data` field changes by event family. Example tool event:

```json
{
  "name": "tool.execute.after",
  "scope": "agent",
  "data": {
    "toolName": "read_file",
    "args": { "path": "prompts/USER.md" },
    "result": "...",
    "metadata": {
      "iteration": 0,
      "toolCallId": "call_123"
    }
  }
}
```

## Practical Recipes

### Only log subagent progress

```js
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

const outPath = path.join(process.env.HOME, ".genieceo", "logs", "subagent-progress.jsonl");

export default async function onEvent(event) {
  if (!String(event?.name ?? "").startsWith("subagent.loop.")) return;
  await mkdir(path.dirname(outPath), { recursive: true });
  await appendFile(outPath, JSON.stringify(event) + "\n", "utf8");
}
```

### Log only tool failures

```js
export default async function onEvent(event) {
  if (event?.name !== "tool.execute.error") return;
  console.error("Tool error:", event.data?.toolName, event.data?.errorMessage);
}
```

## Troubleshooting

- No events written:
  - Confirm `hooks.enabled` is `true`.
  - Confirm `hooks.handlerModule` path is correct.
  - Restart GenieCEO after config/module changes.
- Hook module loads but nothing happens:
  - Remove filtering in your handler and log every event first.
- Timeout warnings:
  - Increase `hooks.timeoutMs` or make handler non-blocking/lightweight.
- Runtime should not fail due to hooks:
  - Keep `hooks.failOpen: true`.

## Performance Guidance

- Prefer append-only writes (JSONL) over expensive transforms.
- Avoid network calls inside hook handlers unless required.
- If needed, queue writes in memory and flush in batches.
