import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { createHookRuntime } from "../src/hooks/runtime.js";
import { ToolRegistry } from "../src/tools/registry.js";
import { ConfigSchema } from "../src/config/schema.js";

async function makeWorkspace(): Promise<string> {
  return await mkdtemp(path.join(os.tmpdir(), "genieceo-hooks-"));
}

async function readJsonl(p: string): Promise<any[]> {
  const raw = await readFile(p, "utf8").catch(() => "");
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe("hook runtime", () => {
  it("loads custom module and emits events", async () => {
    const workspaceRoot = await makeWorkspace();
    const outPath = path.join(workspaceRoot, "hooks-events.jsonl");
    const modPath = path.join(workspaceRoot, "hooks-handler.mjs");

    await writeFile(
      modPath,
      [
        'import { appendFile } from "node:fs/promises";',
        "export default async function(event) {",
        `  await appendFile(${JSON.stringify(outPath)}, JSON.stringify(event) + "\\n", "utf8");`,
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    const config = ConfigSchema.parse({
      version: 2,
      hooks: {
        enabled: true,
        handlerModule: modPath,
      },
    });

    const runtime = await createHookRuntime({ workspaceRoot, config });
    await runtime.emit({
      name: "shell.command.start",
      timestampMs: Date.now(),
      workspaceRoot,
      scope: "system",
      data: { command: "echo hi" },
    });

    const lines = await readJsonl(outPath);
    expect(lines.length).toBe(1);
    expect(lines[0].name).toBe("shell.command.start");
  });

  it("keeps fail-open behavior for throwing handlers", async () => {
    const workspaceRoot = await makeWorkspace();
    const modPath = path.join(workspaceRoot, "hooks-throw.mjs");
    await writeFile(modPath, "export default async function(){ throw new Error('boom'); }\n", "utf8");

    const config = ConfigSchema.parse({
      version: 2,
      hooks: {
        enabled: true,
        handlerModule: modPath,
        failOpen: true,
      },
    });

    const runtime = await createHookRuntime({ workspaceRoot, config });
    await expect(
      runtime.emit({
        name: "memory.flush.start",
        timestampMs: Date.now(),
        workspaceRoot,
        scope: "memory_flush",
        data: {},
      }),
    ).resolves.toBeUndefined();
  });
});

describe("tool registry hooks", () => {
  it("emits before/after lifecycle around tool execution", async () => {
    const workspaceRoot = await makeWorkspace();
    const outPath = path.join(workspaceRoot, "tool-events.jsonl");
    const modPath = path.join(workspaceRoot, "tool-hooks.mjs");
    await writeFile(
      modPath,
      [
        'import { appendFile } from "node:fs/promises";',
        "export const onEvent = async (event) => {",
        '  if (!String(event?.name ?? "").startsWith("tool.execute.")) return;',
        `  await appendFile(${JSON.stringify(outPath)}, JSON.stringify(event) + "\\n", "utf8");`,
        "};",
        "",
      ].join("\n"),
      "utf8",
    );

    const config = ConfigSchema.parse({
      version: 2,
      hooks: {
        enabled: true,
        handlerModule: modPath,
      },
    });
    const hooks = await createHookRuntime({ workspaceRoot, config });

    const reg = new ToolRegistry({ workspaceRoot });
    reg.setHooks(hooks);
    reg.register({ name: "echo_tool", description: "", parameters: {} as any }, async (args) => `ok:${String(args?.v ?? "")}`);

    const out = await reg.execute("echo_tool", { v: "x" }, { scope: "system", workspaceRoot });
    expect(out).toBe("ok:x");

    const events = await readJsonl(outPath);
    expect(events.map((e) => e.name)).toEqual(["tool.execute.before", "tool.execute.after"]);
  });
});
