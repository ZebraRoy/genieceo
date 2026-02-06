import { describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { resolveWithinWorkspace } from "../src/tools/path-safety.js";
import { getDefaultConfig } from "../src/config/schema.js";

describe("smoke", () => {
  it("runs", () => {
    expect(true).toBe(true);
  });

  it("prevents workspace escape", () => {
    const root = "/tmp/workspace";
    expect(() => resolveWithinWorkspace(root, "../etc/passwd")).toThrow();
    expect(resolveWithinWorkspace(root, "prompts/AGENTS.md")).toBe("/tmp/workspace/prompts/AGENTS.md");
  });

  it("expands ~ but still enforces workspace boundaries", () => {
    const root = path.join(os.homedir(), ".genieceo");
    expect(resolveWithinWorkspace(root, "~/.genieceo/prompts/AGENTS.md")).toBe(path.join(root, "prompts/AGENTS.md"));
    expect(() => resolveWithinWorkspace(root, "~/outside-workspace.txt")).toThrow();
  });

  it("default config validates", () => {
    const cfg = getDefaultConfig();
    expect(cfg.version).toBe(2);
    expect(cfg.webSearch.order.length).toBeGreaterThan(0);
    expect(cfg.llm.profiles).toBeTruthy();
  });
});

