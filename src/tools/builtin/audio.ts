import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { Type } from "@sinclair/typebox";
import type { Tool } from "@mariozechner/pi-ai";

import type { ToolExecutionContext } from "../types.js";
import { normalizeFileAccessMode, resolveFileToolPath, type FileScope } from "../path-access.js";
import { getActiveLlmProfile } from "../../llm/pi-ai-adapter.js";

function normalizeScope(v: unknown): FileScope {
  const s = String(v ?? "").trim();
  if (s === "project") return "project";
  if (s === "tmp") return "tmp";
  return "workspace";
}

function guessAudioMimeTypeFromExt(p: string): string | undefined {
  const ext = path.extname(p).toLowerCase();
  const map: Record<string, string> = {
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".oga": "audio/ogg",
    ".wav": "audio/wav",
    ".webm": "audio/webm",
    ".mp4": "audio/mp4",
    ".mov": "video/quicktime",
  };
  return map[ext];
}

function joinUrl(base: string, p: string): string {
  return base.replace(/\/+$/g, "") + "/" + p.replace(/^\/+/g, "");
}

export function registerAudioTools(
  registry: { register: (tool: Tool, handler: (args: any) => Promise<string>) => void },
  ctx: ToolExecutionContext,
) {
  const fileAccessMode = normalizeFileAccessMode((ctx.config as any)?.execution?.fileAccessMode);

  registry.register(
    {
      name: "audio_transcribe",
      description:
        "Transcribe an audio file into text using OpenAI's transcription API. Requires an OpenAI LLM profile with apiKey in ~/.genieceo/config.json.",
      parameters: Type.Object({
        path: Type.String({ minLength: 1, description: "Audio file path (relative or absolute; resolved by scope)." }),
        scope: Type.Optional(
          Type.Union([Type.Literal("workspace"), Type.Literal("project"), Type.Literal("tmp")], {
            description:
              "Where to resolve relative paths: 'workspace' (~/.genieceo), 'project' (invocation directory), or 'tmp' (~/.genieceo/tmp). Default: 'workspace'.",
          }),
        ),
        profile: Type.Optional(
          Type.String({
            minLength: 1,
            description:
              "LLM profile name to use for the OpenAI API key (config.llm.profiles.<name>). If omitted, uses the active profile.",
          }),
        ),
        transcriptionModel: Type.Optional(
          Type.String({
            minLength: 1,
            description: "OpenAI transcription model name. Default: gpt-4o-transcribe.",
          }),
        ),
        language: Type.Optional(
          Type.String({
            minLength: 1,
            description: "Optional ISO language hint (e.g. 'en', 'zh').",
          }),
        ),
      }),
    },
    async (args) => {
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

      const profileName = typeof args.profile === "string" && args.profile.trim() ? String(args.profile).trim() : undefined;
      const llm = (ctx.config as any)?.llm;
      const profiles = (llm as any)?.profiles ?? {};
      let profile: any;
      if (profileName) {
        profile = profiles?.[profileName];
        if (!profile) return `Error: unknown LLM profile '${profileName}'. Add it under llm.profiles in ~/.genieceo/config.json.`;
      } else {
        try {
          profile = getActiveLlmProfile(ctx.config as any).profile;
        } catch (e: any) {
          const msg = e?.message ? String(e.message) : String(e);
          return `Error: ${msg}`;
        }
      }
      const provider = String(profile?.provider ?? "");
      if (provider !== "openai") {
        return `Error: audio_transcribe currently requires an OpenAI profile (provider='openai'). Got provider='${provider}'.`;
      }

      const apiKey = profile?.apiKey ? String(profile.apiKey) : "";
      if (!apiKey) return "Error: missing apiKey for the selected OpenAI profile.";

      const apiBase = profile?.apiBase ? String(profile.apiBase) : "https://api.openai.com/v1";
      const url = joinUrl(apiBase, "/audio/transcriptions");

      const transcriptionModelRaw =
        typeof args.transcriptionModel === "string" && args.transcriptionModel.trim()
          ? String(args.transcriptionModel).trim()
          : "gpt-4o-transcribe";
      const language = typeof args.language === "string" && args.language.trim() ? String(args.language).trim() : undefined;

      // NOTE: OpenAI's GPT-4o transcription model snapshots don't currently accept OGG/OGA
      // (common for Telegram voice notes). For those containers, fall back to whisper-1 so
      // voice messages work out of the box.
      const ext = path.extname(absPath).toLowerCase();
      const isOggContainer = ext === ".ogg" || ext === ".oga";
      const isGpt4oTranscribeModel =
        transcriptionModelRaw === "gpt-4o-transcribe" ||
        transcriptionModelRaw === "gpt-4o-mini-transcribe" ||
        transcriptionModelRaw === "gpt-4o-transcribe-diarize";
      const transcriptionModel =
        isOggContainer && isGpt4oTranscribeModel ? "whisper-1" : transcriptionModelRaw;

      const buf = await readFile(absPath);
      const filename = path.basename(absPath);
      const mimeType = guessAudioMimeTypeFromExt(absPath) ?? "application/octet-stream";

      const form = new FormData();
      // Node 22 supports File/Blob + FormData.
      if (typeof (globalThis as any).File !== "undefined") {
        const file = new (globalThis as any).File([buf], filename, { type: mimeType });
        form.append("file", file);
      } else {
        const blob = new Blob([buf], { type: mimeType });
        (form as any).append("file", blob, filename);
      }
      form.append("model", transcriptionModel);
      if (language) form.append("language", language);

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: form as any,
      });

      const text = await res.text().catch(() => "");
      if (!res.ok) {
        return `Error: transcription request failed: ${res.status} ${res.statusText}\n${text}`;
      }

      // Expected: { text: string, ... }
      try {
        const json = JSON.parse(text);
        const out = typeof json?.text === "string" ? json.text : "";
        if (!out.trim()) return `Error: transcription response missing 'text' field.\n${text}`;
        return out.trim();
      } catch {
        return `Error: failed to parse transcription response as JSON.\n${text}`;
      }
    },
  );
}

