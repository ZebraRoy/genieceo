import { stat } from "node:fs/promises";
import path from "node:path";

import type { Tool } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";

import type { ToolExecutionContext } from "../types.js";
import { normalizeFileAccessMode, resolveFileToolPath } from "../path-access.js";
import { getToolTurnContext } from "../turn-context.js";

function normalizeScope(v: unknown): "workspace" | "project" | "tmp" {
  const s = String(v ?? "").trim();
  if (s === "project") return "project";
  if (s === "tmp") return "tmp";
  return "workspace";
}

function guessMimeTypeFromExt(p: string): string | undefined {
  const ext = path.extname(p).toLowerCase();
  const map: Record<string, string> = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".json": "application/json",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".zip": "application/zip",
  };
  return map[ext];
}

export function registerChannelTools(
  registry: { register: (tool: Tool, handler: (args: any) => Promise<string>) => void },
  ctx: ToolExecutionContext,
) {
  const fileAccessMode = normalizeFileAccessMode(
    (ctx.config as any)?.execution?.fileAccessMode,
  );

  registry.register(
    {
      name: "channel_send_file",
      description:
        "Send a local file to the user via the current message channel (gateway). Only works in Telegram/Discord channels; not available in CLI chat.",
      parameters: Type.Object({
        path: Type.String({
          minLength: 1,
          description:
            "Local file path. Relative paths are resolved based on 'scope' (default: workspace).",
        }),
        scope: Type.Optional(
          Type.Union([Type.Literal("workspace"), Type.Literal("project"), Type.Literal("tmp")], {
            description:
              "Where to resolve relative paths: 'workspace' (~/.genieceo), 'project' (invocation directory), or 'tmp' (~/.genieceo/tmp). Default: 'workspace'.",
          }),
        ),
        filename: Type.Optional(
          Type.String({
            description:
              "Optional filename to present to the user (if the channel supports it). Defaults to the local basename.",
          }),
        ),
        mimeType: Type.Optional(
          Type.String({
            description:
              "Optional MIME type hint (e.g. 'application/pdf', 'image/png'). If omitted, GenieCEO will guess from the file extension when possible.",
          }),
        ),
        caption: Type.Optional(
          Type.String({
            description:
              "Optional caption/text to include with the uploaded file (channel-specific; may be truncated).",
          }),
        ),
      }),
    },
    async (args) => {
      const turn = getToolTurnContext();
      const channel = String(turn?.channel ?? "");
      const conversationKey = String(turn?.conversationKey ?? "");
      if (!turn?.queueOutbound || !conversationKey) {
        return "Error: channel_send_file is only available when running via message channels (gateway).";
      }
      if (channel === "cli") {
        return "Error: channel_send_file is not available in CLI chat.";
      }

      const scope = normalizeScope(args.scope);
      const rawPath = String(args.path ?? "").trim();
      if (!rawPath) return "Error: path is required";

      const absPath = resolveFileToolPath({
        workspaceRoot: ctx.workspaceRoot,
        invocationCwd: ctx.invocationCwd,
        mode: fileAccessMode,
        scope,
        userPath: rawPath,
      });

      const st = await stat(absPath).catch(() => null);
      if (!st) return `Error: file not found: ${absPath}`;
      if (!st.isFile()) return `Error: not a file: ${absPath}`;

      const filename =
        typeof args.filename === "string" && args.filename.trim()
          ? String(args.filename).trim()
          : path.basename(absPath);
      const mimeType =
        typeof args.mimeType === "string" && args.mimeType.trim()
          ? String(args.mimeType).trim()
          : guessMimeTypeFromExt(filename) ?? guessMimeTypeFromExt(absPath);
      const caption =
        typeof args.caption === "string" && args.caption.trim()
          ? String(args.caption)
          : "";

      turn.queueOutbound({
        conversationKey,
        text: caption,
        attachments: [{ path: absPath, filename, mimeType }],
      });

      return JSON.stringify(
        {
          ok: true,
          queued: true,
          conversationKey,
          channel,
          file: {
            path: absPath,
            filename,
            mimeType: mimeType ?? null,
            sizeBytes: st.size,
          },
          note: "Queued for upload by the channel adapter.",
        },
        null,
        2,
      );
    },
  );
}

