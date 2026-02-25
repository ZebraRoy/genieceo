import path from "node:path";
import { spawn } from "node:child_process";
import { Type } from "@sinclair/typebox";
import type { Tool } from "@mariozechner/pi-ai";

import type { ToolExecutionContext } from "../types.js";
import { defaultShellAllowedRoots, expandHome, isWithinRoot, normalizeFileAccessMode } from "../path-access.js";
import { getToolTurnContext } from "../turn-context.js";

function resolveCwd(ctx: ToolExecutionContext, cwdInput: string | undefined): { cwd: string; allowedRoots: string[] } {
  const enabled = Boolean((ctx.config as any)?.execution?.shell?.enabled);
  if (!enabled) {
    throw new Error(
      "Shell execution is disabled. Set config.execution.shell.enabled=true in ~/.genieceo/config.json to enable."
    );
  }

  const configuredRoots = Array.isArray((ctx.config as any)?.execution?.shell?.allowedRoots)
    ? ((ctx.config as any).execution.shell.allowedRoots as string[])
    : [];

  const shellAccessMode = normalizeFileAccessMode((ctx.config as any)?.execution?.shellAccessMode);

  const allowedRoots = defaultShellAllowedRoots({
    workspaceRoot: ctx.workspaceRoot,
    invocationCwd: ctx.invocationCwd,
    mode: shellAccessMode,
    configuredRoots,
  });

  // If no cwd is specified, default to the directory where `genieceo chat` was launched.
  if (!cwdInput || !String(cwdInput).trim()) {
    const cwd = path.resolve(ctx.invocationCwd);
    if (!allowedRoots.some((r) => isWithinRoot(r, cwd))) {
      throw new Error(`Default cwd '${cwd}' is not within allowedRoots.`);
    }
    return { cwd, allowedRoots };
  }

  const raw = expandHome(String(cwdInput));
  const resolved = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(ctx.invocationCwd, raw);
  if (!allowedRoots.some((r) => isWithinRoot(r, resolved))) {
    throw new Error(
      `cwd '${resolved}' is not allowed. Allowed roots:\n` + allowedRoots.map((r) => `- ${r}`).join("\n")
    );
  }
  return { cwd: resolved, allowedRoots };
}

export function registerShellTools(
  registry: { register: (tool: Tool, handler: (args: any) => Promise<string>) => void },
  ctx: ToolExecutionContext
) {
  registry.register(
    {
      name: "run_command",
      description:
        "Run a shell command locally (restricted to allowed roots; can be disabled via config). Returns stdout/stderr and exit code.",
      parameters: Type.Object({
        command: Type.String({ minLength: 1, description: "Shell command to execute." }),
        cwd: Type.Optional(
          Type.String({
            description:
              "Working directory. If relative, it is resolved relative to where `genieceo chat` was launched. Must be within an allowed root.",
          })
        ),
        timeoutMs: Type.Optional(
          Type.Number({
            minimum: 100,
            maximum: 10 * 60 * 1000,
            description: "Timeout in milliseconds (100..600000). Default 60000.",
          })
        ),
        stdin: Type.Optional(Type.String({ description: "Optional stdin to pass to the process." })),
        maxOutputChars: Type.Optional(
          Type.Number({
            minimum: 1000,
            maximum: 200000,
            description: "Maximum combined stdout+stderr characters to return (1000..200000). Default 50000.",
          })
        ),
      }),
    },
    async (args) => {
      const command = String(args.command ?? "").trim();
      if (!command) return "Error: command is required";

      const { cwd } = resolveCwd(ctx, args.cwd);
      const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : 60_000;
      const maxOutputChars = typeof args.maxOutputChars === "number" ? args.maxOutputChars : 50_000;
      const stdin = args.stdin == null ? null : String(args.stdin);

      const startedAt = Date.now();
      const turn = getToolTurnContext();
      if (turn?.hooks?.enabled) {
        await turn.hooks.emit({
          name: "shell.command.start",
          timestampMs: startedAt,
          workspaceRoot: ctx.workspaceRoot,
          scope: "system",
          runId: turn.runId,
          channel: turn.channel,
          conversationKey: turn.conversationKey,
          data: {
            command,
            cwd,
            timeoutMs,
          },
        });
      }

      return await new Promise<string>((resolve) => {
        const child = spawn(command, {
          cwd,
          shell: true,
          env: process.env,
          stdio: "pipe",
        });

        let stdout = "";
        let stderr = "";
        let killedByTimeout = false;

        const append = (which: "stdout" | "stderr", chunk: Buffer | string) => {
          const s = typeof chunk === "string" ? chunk : chunk.toString("utf8");
          if (which === "stdout") stdout += s;
          else stderr += s;

          const total = stdout.length + stderr.length;
          if (total > maxOutputChars) {
            // Trim from the end to keep the most recent output.
            const over = total - maxOutputChars;
            // Prefer trimming stdout first to preserve error output.
            if (stdout.length >= over) stdout = stdout.slice(over);
            else {
              const remain = over - stdout.length;
              stdout = "";
              stderr = stderr.slice(Math.min(remain, stderr.length));
            }
          }
        };

        child.stdout?.on("data", (c) => append("stdout", c));
        child.stderr?.on("data", (c) => append("stderr", c));

        child.on("error", (err) => {
          const msg = err?.message ? String(err.message) : String(err);
          if (turn?.hooks?.enabled) {
            void turn.hooks.emit({
              name: "shell.command.error",
              timestampMs: Date.now(),
              workspaceRoot: ctx.workspaceRoot,
              scope: "system",
              runId: turn.runId,
              channel: turn.channel,
              conversationKey: turn.conversationKey,
              data: {
                command,
                cwd,
                message: msg,
              },
            });
          }
          resolve(`Error: spawn failed: ${msg}`);
        });

        const timer = setTimeout(() => {
          killedByTimeout = true;
          try {
            child.kill("SIGTERM");
          } catch {
            // ignore
          }
          // escalate shortly after
          setTimeout(() => {
            try {
              child.kill("SIGKILL");
            } catch {
              // ignore
            }
          }, 500);
        }, timeoutMs);

        if (stdin != null) {
          try {
            child.stdin?.write(stdin);
            child.stdin?.end();
          } catch {
            // ignore
          }
        } else {
          try {
            child.stdin?.end();
          } catch {
            // ignore
          }
        }

        child.on("close", (code, signal) => {
          clearTimeout(timer);
          const elapsedMs = Date.now() - startedAt;

          const header = [
            `cwd: ${cwd}`,
            `command: ${command}`,
            `exitCode: ${code ?? "null"}`,
            `signal: ${signal ?? "null"}`,
            `timedOut: ${killedByTimeout ? "true" : "false"}`,
            `elapsedMs: ${elapsedMs}`,
          ].join("\n");

          const out =
            header +
            "\n\n--- stdout ---\n" +
            (stdout.trimEnd() || "[empty]") +
            "\n\n--- stderr ---\n" +
            (stderr.trimEnd() || "[empty]");

          if (turn?.hooks?.enabled) {
            void turn.hooks.emit({
              name: "shell.command.end",
              timestampMs: Date.now(),
              workspaceRoot: ctx.workspaceRoot,
              scope: "system",
              runId: turn.runId,
              channel: turn.channel,
              conversationKey: turn.conversationKey,
              data: {
                command,
                cwd,
                exitCode: code ?? null,
                signal: signal ?? null,
                timedOut: killedByTimeout,
                elapsedMs,
              },
            });
          }

          resolve(out);
        });
      });
    }
  );
}

