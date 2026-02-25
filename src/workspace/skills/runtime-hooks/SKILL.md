---
name: runtime-hooks
description: Configure and use GenieCEO runtime hooks for progress logging, observability, and automation. Use when the user asks for callbacks, hook points, subagent progress logs, tool lifecycle logs, or custom event handling.
---

# Runtime Hooks (GenieCEO)

Use this skill when users want extensibility without patching GenieCEO source, especially:
- "log each subagent step"
- "run custom code on tool execution"
- "capture gateway/session events"
- "observe shell/service lifecycle"

## What runtime hooks are

Runtime hooks are user-provided JS/ESM handlers loaded from `~/.genieceo/config.json`.

Configured keys:
- `hooks.enabled`
- `hooks.handlerModule`
- `hooks.timeoutMs`
- `hooks.failOpen`

## Quick setup steps

1. Create a hook module file under `~/.genieceo/hooks/`, for example `~/.genieceo/hooks/event-log.mjs`.
2. Add/update `hooks` in `~/.genieceo/config.json`:

```json
{
  "hooks": {
    "enabled": true,
    "handlerModule": "hooks/event-log.mjs",
    "timeoutMs": 2000,
    "failOpen": true
  }
}
```

3. Restart running GenieCEO processes (`genieceo chat` or `genieceo gateway`).
4. Verify output (for logging handlers) in `~/.genieceo/logs/*.jsonl`.

## Handler signatures

Accepted module exports:
- default function `export default async function onEvent(event, context) {}`
- named function `export async function onEvent(event, context) {}`
- factory `export function createHookHandler(context) { return async (event) => {} }`

## Useful event families

- `agent.loop.*`
- `subagent.loop.*`
- `tool.execute.before|after|error`
- `gateway.inbound.*`
- `gateway.outbound.*`
- `session.load|append|append_many|clear`
- `memory.flush.*`
- `memory.store.read|write`
- `shell.command.*`
- `service.lifecycle.*`

## Default implementation pattern (JSONL logger)

```js
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

const outPath = path.join(process.env.HOME, ".genieceo", "logs", "hook-events.jsonl");

export default async function onEvent(event) {
  await mkdir(path.dirname(outPath), { recursive: true });
  await appendFile(outPath, JSON.stringify(event) + "\n", "utf8");
}
```

## Subagent-only progress logger pattern

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

## Troubleshooting checklist

- No events:
  - ensure `hooks.enabled` is `true`
  - ensure `hooks.handlerModule` path is correct
  - restart running processes after config/module changes
- Hook errors:
  - keep `hooks.failOpen: true` for resilience
  - increase `hooks.timeoutMs` if handler is slow
- Still unclear:
  - inspect `~/.genieceo/logs/gateway.log` for hook load/handler warnings
