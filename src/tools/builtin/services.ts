import { Type } from "@sinclair/typebox";
import type { Tool } from "@mariozechner/pi-ai";

import type { ToolExecutionContext } from "../types.js";
import { getServiceStatus, listServices, safeServiceName, startService, stopService, tailServiceLogs } from "../../services/manager.js";

export function registerServiceTools(
  registry: { register: (tool: Tool, handler: (args: any) => Promise<string>) => void },
  ctx: ToolExecutionContext
) {
  const nameSchema = Type.String({
    minLength: 1,
    description: "Service name (letters/numbers/._- only). Used to persist PID and logs under ~/.genieceo/.",
  });

  registry.register(
    {
      name: "service_start",
      description:
        "Start a long-running service in the background (detached). Persists PID + metadata under ~/.genieceo/services and appends logs under ~/.genieceo/logs/services/.",
      parameters: Type.Object({
        name: nameSchema,
        command: Type.String({ minLength: 1, description: "Shell command to run (e.g. 'genieceo gateway')." }),
        cwd: Type.Optional(
          Type.String({
            description:
              "Working directory. If relative, resolved relative to where `genieceo chat` was launched. Must be within allowed roots.",
          })
        ),
        overwriteIfStopped: Type.Optional(
          Type.Boolean({
            description: "If a stale record exists for a stopped service, overwrite it. Default true.",
          })
        ),
      }),
    },
    async (args) => {
      const name = safeServiceName(args.name);
      const command = String(args.command ?? "").trim();
      if (!command) return "Error: command is required";

      const overwriteIfStopped = args.overwriteIfStopped == null ? true : Boolean(args.overwriteIfStopped);
      const rec = await startService(ctx, { name, command, cwd: args.cwd, overwriteIfStopped });

      return JSON.stringify(
        {
          ok: true,
          name: rec.name,
          pid: rec.pid,
          cwd: rec.cwd,
          logPath: rec.logPath,
          note: "Service started detached. Use service_status / service_tail_logs to inspect.",
        },
        null,
        2
      );
    }
  );

  registry.register(
    {
      name: "service_status",
      description: "Get status for a managed service (running/stopped) and its persisted metadata.",
      parameters: Type.Object({
        name: nameSchema,
      }),
    },
    async (args) => {
      const name = safeServiceName(args.name);
      const { record, running, uptimeSec } = await getServiceStatus(ctx, name);

      return JSON.stringify(
        {
          ok: true,
          name: record.name,
          running,
          pid: record.pid,
          startedAtMs: record.startedAtMs,
          uptimeSec,
          command: record.command,
          cwd: record.cwd,
          logPath: record.logPath,
        },
        null,
        2
      );
    }
  );

  registry.register(
    {
      name: "service_list",
      description: "List managed services recorded under ~/.genieceo/services (and whether their PID is currently running).",
      parameters: Type.Object({}),
    },
    async () => {
      const services = await listServices(ctx);
      return JSON.stringify({ ok: true, services }, null, 2);
    }
  );

  registry.register(
    {
      name: "service_stop",
      description: "Stop a managed service by PID (SIGTERM then SIGKILL if needed) and keep its record.",
      parameters: Type.Object({
        name: nameSchema,
        timeoutMs: Type.Optional(
          Type.Number({ minimum: 100, maximum: 60_000, description: "Grace period before SIGKILL (100..60000). Default 5000." })
        ),
      }),
    },
    async (args) => {
      const name = safeServiceName(args.name);
      const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : 5000;
      const res = await stopService(ctx, name, { timeoutMs });
      return JSON.stringify(
        {
          ok: true,
          name,
          running: res.running,
          pid: res.pid,
          note: res.running ? "Tried to stop but PID still appears running." : "Stopped.",
        },
        null,
        2
      );
    }
  );

  registry.register(
    {
      name: "service_tail_logs",
      description: "Show the last N lines of a managed service's log file.",
      parameters: Type.Object({
        name: nameSchema,
        lines: Type.Optional(Type.Number({ minimum: 1, maximum: 500, description: "Number of lines to show (1..500). Default 80." })),
        maxBytes: Type.Optional(Type.Number({ minimum: 1000, maximum: 200000, description: "Max bytes to read from end of file. Default 50000." })),
      }),
    },
    async (args) => {
      const name = safeServiceName(args.name);
      const lines = typeof args.lines === "number" ? Math.floor(args.lines) : 80;
      const maxBytes = typeof args.maxBytes === "number" ? Math.floor(args.maxBytes) : 50_000;
      return await tailServiceLogs(ctx, name, { lines, maxBytes });
    }
  );
}

