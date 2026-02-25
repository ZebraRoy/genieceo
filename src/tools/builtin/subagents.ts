import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { Type } from "@sinclair/typebox";
import type { Tool } from "@mariozechner/pi-ai";
import YAML from "yaml";

import type { ToolExecutionContext } from "../types.js";
import { getSubagentsDir } from "../../workspace/paths.js";
import { buildSubagentsIndex } from "../../subagents/index.js";
import { parseSubagentMarkdown, validateSubagentDescription, validateSubagentName } from "../../subagents/frontmatter.js";
import { loadSystemPrompt } from "../../workspace/bootstrap.js";
import { buildUserContent } from "../../agent/user-content.js";
import { renderAssistantText } from "../../agent/render.js";
import { completeWithToolLoop, getActiveLlmProfile, getModelForProfile } from "../../llm/pi-ai-adapter.js";
import { filterToolsForSubagent } from "../../subagents/tool-filter.js";
import { ToolRegistry } from "../registry.js";
import { registerFileTools } from "./files.js";
import { registerWebTools } from "./web.js";
import { registerShellTools } from "./shell.js";
import { registerServiceTools } from "./services.js";
import { registerChannelTools } from "./channel.js";
import { registerAudioTools } from "./audio.js";
import { getToolTurnContext } from "../turn-context.js";

function createDefaultRegistry(execCtx: ToolExecutionContext): ToolRegistry {
  const reg = new ToolRegistry({ workspaceRoot: execCtx.workspaceRoot });
  registerFileTools(reg, execCtx);
  registerWebTools(reg, execCtx);
  registerShellTools(reg, execCtx);
  registerServiceTools(reg, execCtx);
  registerChannelTools(reg, execCtx);
  registerAudioTools(reg, execCtx);
  const turn = getToolTurnContext();
  reg.setHooks(turn?.hooks);
  return reg;
}

function normalizeName(v: unknown): string {
  return String(v ?? "").trim();
}

function normalizeOptionalString(v: unknown): string | undefined {
  const s = String(v ?? "").trim();
  return s ? s : undefined;
}

function normalizeStringArray(v: unknown): string[] | undefined {
  if (v == null) return undefined;
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (!t) continue;
    out.push(t);
  }
  return out.length ? out : undefined;
}

function resolveProfileByName(ctx: ToolExecutionContext, profileName?: string): { name: string; profile: any } | { error: string } {
  const llm = (ctx.config as any)?.llm;
  const profiles = (llm as any)?.profiles ?? {};

  // Default: active profile (if set), else error.
  if (!profileName) {
    try {
      const { name, profile } = getActiveLlmProfile(ctx.config as any);
      return { name, profile };
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : String(e);
      return { error: msg };
    }
  }

  const p = profiles?.[profileName];
  if (!p) return { error: `Unknown LLM profile '${profileName}'. Add it under llm.profiles in ~/.genieceo/config.json.` };
  return { name: profileName, profile: p };
}

export function registerSubagentTools(
  registry: { register: (tool: Tool, handler: (args: any) => Promise<string>) => void },
  ctx: ToolExecutionContext,
) {
  registry.register(
    {
      name: "subagent_list",
      description: "List subagents installed under ~/.genieceo/subagents.",
      parameters: Type.Object({}),
    },
    async () => {
      const dir = getSubagentsDir(ctx.workspaceRoot);
      const { subagents, skipped, truncated } = await buildSubagentsIndex(dir, { limit: 500 });
      return JSON.stringify({ ok: true, subagents, skipped, truncated }, null, 2);
    },
  );

  registry.register(
    {
      name: "subagent_create",
      description:
        "Create or overwrite a subagent definition under ~/.genieceo/subagents/<name>/AGENT.md. The model is referenced by LLM profile name (config.llm.profiles).",
      parameters: Type.Object({
        name: Type.String({ minLength: 1, description: "Subagent name (lowercase letters/numbers + hyphens)." }),
        description: Type.String({ minLength: 1, description: "One-line description of what the subagent does." }),
        profile: Type.Optional(
          Type.String({ minLength: 1, description: "Default LLM profile name (e.g. 'openai:gpt-5-mini'). Optional." }),
        ),
        tools: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { description: "Optional allowlist of tool names." })),
        disallowedTools: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { description: "Optional denylist of tool names." })),
        prompt: Type.String({ minLength: 1, description: "Subagent system prompt/instructions (markdown allowed)." }),
      }),
    },
    async (args) => {
      const name = normalizeName(args.name);
      const description = String(args.description ?? "").trim();
      const profile = normalizeOptionalString(args.profile);
      const tools = normalizeStringArray(args.tools);
      const disallowedTools = normalizeStringArray(args.disallowedTools);
      const prompt = String(args.prompt ?? "").trim();

      const nameErr = validateSubagentName(name);
      if (nameErr) return `Error: invalid name: ${nameErr}`;
      const descErr = validateSubagentDescription(description);
      if (descErr) return `Error: invalid description: ${descErr}`;
      if (!prompt) return "Error: prompt is required";

      // Validate profile reference if provided.
      if (profile) {
        const resolved = resolveProfileByName(ctx, profile);
        if ("error" in resolved) return `Error: ${resolved.error}`;
      }

      const fm: any = { name, description };
      if (profile) fm.profile = profile;
      if (tools?.length) fm.tools = tools;
      if (disallowedTools?.length) fm.disallowedTools = disallowedTools;

      const yaml = YAML.stringify(fm); // includes trailing newline
      const content = `---\n${yaml}---\n\n${prompt.trim()}\n`;

      const root = getSubagentsDir(ctx.workspaceRoot);
      const dir = path.join(root, name);
      await mkdir(dir, { recursive: true });
      const agentPath = path.join(dir, "AGENT.md");
      await writeFile(agentPath, content, "utf8");

      return JSON.stringify({ ok: true, name, path: agentPath }, null, 2);
    },
  );

  registry.register(
    {
      name: "subagent_run",
      description:
        "Run a subagent in-process with its own default LLM profile and optional tool restrictions. Returns the subagent's final text output.",
      parameters: Type.Object({
        name: Type.String({ minLength: 1, description: "Subagent name to run." }),
        input: Type.String({ minLength: 1, description: "Input text for the subagent." }),
        attachments: Type.Optional(
          Type.Array(
            Type.Object({
              kind: Type.Union([Type.Literal("image"), Type.Literal("audio"), Type.Literal("video"), Type.Literal("file")]),
              path: Type.String({ minLength: 1 }),
              mimeType: Type.Optional(Type.String({ minLength: 1 })),
              originalName: Type.Optional(Type.String({ minLength: 1 })),
              sizeBytes: Type.Optional(Type.Number({ minimum: 0 })),
            }),
          ),
        ),
        profileOverride: Type.Optional(
          Type.String({
            minLength: 1,
            description:
              "Optional LLM profile name to override the subagent's default profile (from frontmatter).",
          }),
        ),
      }),
    },
    async (args) => {
      const name = normalizeName(args.name);
      const input = String(args.input ?? "").trim();
      const attachments = Array.isArray(args.attachments) ? (args.attachments as any[]) : [];
      const profileOverride = normalizeOptionalString(args.profileOverride);
      if (!name) return "Error: name is required";
      if (!input) return "Error: input is required";

      const root = getSubagentsDir(ctx.workspaceRoot);
      const agentPath = path.join(root, name, "AGENT.md");

      let agentMd: string;
      try {
        agentMd = await readFile(agentPath, "utf8");
      } catch {
        return `Error: subagent not found: ${name} (missing ${agentPath})`;
      }

      const parsed = parseSubagentMarkdown(agentMd, { expectedName: name });
      if (!parsed.ok) return `Error: invalid subagent '${name}': ${parsed.error}`;

      const profileToUse = profileOverride ?? parsed.frontmatter.profile;
      const resolved = resolveProfileByName(ctx, profileToUse);
      if ("error" in resolved) return `Error: ${resolved.error}`;

      const model = getModelForProfile(resolved.profile);
      const apiKey = resolved.profile?.apiKey;

      const toolRegistry = createDefaultRegistry(ctx);
      const allTools = toolRegistry.list() as Tool[];
      const filteredTools = filterToolsForSubagent(allTools, parsed.frontmatter);

      const baseSystemPrompt = await loadSystemPrompt(ctx.workspaceRoot);
      const systemPrompt = `${baseSystemPrompt}\n\n---\n\n## SUBAGENT\n\n- name: ${parsed.frontmatter.name}\n- description: ${parsed.frontmatter.description}\n- profile: ${resolved.name}\n\n---\n\n## SUBAGENT_PROMPT\n\n${parsed.bodyMarkdown.trim()}`;

      const { modelContent } = await buildUserContent({
        model,
        config: ctx.config,
        userText: input,
        attachments: attachments as any,
      });

      const context = {
        systemPrompt,
        messages: [{ role: "user", content: modelContent as any, timestamp: Date.now() } as any],
        tools: filteredTools,
      };
      const turn = getToolTurnContext();
      const runId = turn?.runId;
      const channel = turn?.channel;
      const conversationKey = turn?.conversationKey;
      const prevMeta = turn?.toolExecMeta;
      if (turn) {
        turn.toolExecMeta = {
          ...(prevMeta ?? {}),
          runId,
          scope: "subagent",
          channel,
          conversationKey,
          subagent: {
            name,
            profileUsed: resolved.name,
            parentToolCallId: prevMeta?.toolCallId,
          },
        };
      }

      const assistant = await (async () => {
        try {
          return await completeWithToolLoop({
            apiKey,
            model,
            context: context as any,
            tools: filteredTools,
            registry: toolRegistry as any,
            stream: false,
            onEvent: (event) => {
              if (!turn?.hooks?.enabled) return;
              void turn.hooks.emit({
                name: `subagent.loop.${event.type}`,
                timestampMs: Date.now(),
                workspaceRoot: ctx.workspaceRoot,
                scope: "subagent",
                runId,
                channel,
                conversationKey,
                data: {
                  event,
                  subagent: {
                    name,
                    profileUsed: resolved.name,
                    parentToolCallId: prevMeta?.toolCallId,
                  },
                },
              });
            },
          });
        } finally {
          if (turn) turn.toolExecMeta = prevMeta;
        }
      })();

      const assistantText = renderAssistantText(assistant);
      return JSON.stringify(
        {
          ok: true,
          name,
          profileUsed: resolved.name,
          outputText: assistantText,
        },
        null,
        2,
      );
    },
  );
}

