import { describe, expect, it } from "vitest";
import path from "node:path";

import { defaultShellAllowedRoots, resolveFileToolPath } from "../src/tools/path-access.js";

describe("path-access", () => {
  describe("resolveFileToolPath (protected)", () => {
    const workspaceRoot = "/tmp/genieceo-workspace";
    const invocationCwd = "/tmp/genieceo-project";

    it("resolves workspace scope relative paths within workspace", () => {
      expect(
        resolveFileToolPath({
          workspaceRoot,
          invocationCwd,
          mode: "protected",
          scope: "workspace",
          userPath: "prompts/TOOLS.md",
        })
      ).toBe(path.join(workspaceRoot, "prompts/TOOLS.md"));
    });

    it("rejects escaping workspace scope", () => {
      expect(() =>
        resolveFileToolPath({
          workspaceRoot,
          invocationCwd,
          mode: "protected",
          scope: "workspace",
          userPath: "../escape.txt",
        })
      ).toThrow(/escapes/i);
    });

    it("resolves project scope relative paths within invocation cwd", () => {
      expect(
        resolveFileToolPath({
          workspaceRoot,
          invocationCwd,
          mode: "protected",
          scope: "project",
          userPath: "out/result.txt",
        })
      ).toBe(path.join(invocationCwd, "out/result.txt"));
    });

    it("resolves tmp scope under workspace/tmp", () => {
      expect(
        resolveFileToolPath({
          workspaceRoot,
          invocationCwd,
          mode: "protected",
          scope: "tmp",
          userPath: "calc.json",
        })
      ).toBe(path.join(workspaceRoot, "tmp/calc.json"));
    });

    it("allows absolute paths only within workspace or invocation cwd", () => {
      expect(
        resolveFileToolPath({
          workspaceRoot,
          invocationCwd,
          mode: "protected",
          scope: "workspace",
          userPath: "/tmp/genieceo-workspace/ok.txt",
        })
      ).toBe("/tmp/genieceo-workspace/ok.txt");

      expect(() =>
        resolveFileToolPath({
          workspaceRoot,
          invocationCwd,
          mode: "protected",
          scope: "workspace",
          userPath: "/etc/passwd",
        })
      ).toThrow(/not allowed/i);
    });
  });

  describe("resolveFileToolPath (free)", () => {
    const workspaceRoot = "/tmp/genieceo-workspace";
    const invocationCwd = "/tmp/genieceo-project";

    it("allows absolute paths anywhere", () => {
      expect(
        resolveFileToolPath({
          workspaceRoot,
          invocationCwd,
          mode: "free",
          scope: "workspace",
          userPath: "/etc/passwd",
        })
      ).toBe("/etc/passwd");
    });

    it("allows relative traversal (scope is just the base)", () => {
      expect(
        resolveFileToolPath({
          workspaceRoot,
          invocationCwd,
          mode: "free",
          scope: "tmp",
          userPath: "../escape.txt",
        })
      ).toBe(path.join(workspaceRoot, "escape.txt"));
    });
  });

  describe("defaultShellAllowedRoots", () => {
    const workspaceRoot = "/tmp/genieceo-workspace";
    const invocationCwd = "/tmp/genieceo-project/subdir";

    it("uses configuredRoots when provided (mode-independent)", () => {
      const roots = defaultShellAllowedRoots({
        workspaceRoot,
        invocationCwd,
        mode: "free",
        configuredRoots: ["/tmp/only"],
      });
      expect(roots).toEqual(["/tmp/only"]);
    });

    it("protected mode defaults to workspace + invocation cwd", () => {
      const roots = defaultShellAllowedRoots({
        workspaceRoot,
        invocationCwd,
        mode: "protected",
        configuredRoots: [],
      });
      expect(roots).toEqual([workspaceRoot, invocationCwd]);
    });

    it("free mode defaults to filesystem root", () => {
      const roots = defaultShellAllowedRoots({
        workspaceRoot,
        invocationCwd,
        mode: "free",
        configuredRoots: [],
      });
      expect(roots.length).toBe(1);
      expect(roots[0]).toBe(path.parse(path.resolve(invocationCwd)).root);
    });
  });
});

