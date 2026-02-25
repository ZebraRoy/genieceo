import readline from "node:readline/promises";

import type { Context } from "@mariozechner/pi-ai";

import { createAgentRuntime } from "../agent/runner.js";
import { renderAssistantText } from "../agent/render.js";
import { completeWithToolLoop } from "../llm/pi-ai-adapter.js";
import {
  ensureWorkspace,
  loadSystemPrompt,
  syncInstalledBuiltinSkills,
  syncInstalledPromptTemplates,
  type PromptTemplateConflict,
} from "../workspace/bootstrap.js";
import { getWorkspaceRoot } from "../workspace/paths.js";

export async function runMigrate(opts: {
  overwrite?: boolean;
  overwritePrompts?: boolean;
  overwriteSkills?: boolean;
  mode?: "existing" | "agentic";
  agentic?: boolean;
}): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  await ensureWorkspace(workspaceRoot);

  const overwritePrompts = Boolean(opts.overwrite || opts.overwritePrompts);
  const overwriteSkills = Boolean(opts.overwrite || opts.overwriteSkills);

  const isTty = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const selectMode = async (): Promise<"existing" | "agentic"> => {
    const { select } = await import("@inquirer/prompts");
    return await select({
      message: "Select prompt migration mode",
      choices: [
        {
          name: "existing (current behavior)",
          value: "existing",
          description: "Non-destructive unless --overwrite; may skip updated templates if you edited them",
        },
        {
          name: "agentic (chat-assisted conflicts)",
          value: "agentic",
          description: "Chat with GenieCEO per conflicting file, then decide keep vs template",
        },
      ],
    });
  };

  const mode: "existing" | "agentic" =
    opts.mode ?? (opts.agentic ? "agentic" : isTty ? await selectMode() : "existing");

  const streamEnabledEnv = String(process.env.GENIECEO_STREAM ?? "").trim().toLowerCase();
  const streamEnabled =
    streamEnabledEnv === ""
      ? true
      : streamEnabledEnv === "1" || streamEnabledEnv === "true" || streamEnabledEnv === "yes" || streamEnabledEnv === "on";

  const shouldChat = mode === "agentic" && isTty && !overwritePrompts;

  const runtime = shouldChat
    ? await (async () => {
        try {
          return await createAgentRuntime({ workspaceRoot, invocationCwd: process.cwd() });
        } catch (e: any) {
          const msg = e?.message ? String(e.message) : String(e);
          console.warn(`[warn] Agentic migrate chat unavailable (${msg}). Falling back to non-chat agentic mode.`);
          return null;
        }
      })()
    : null;

  const rl = shouldChat ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;

  const onConflict = runtime && rl
    ? async (conflict: PromptTemplateConflict): Promise<"keep" | "template"> => {
        const allowedToolNames = new Set(["read_file", "write_file", "edit_file", "list_dir", "run_command"]);
        const allowedTools = runtime.tools.filter((t) => allowedToolNames.has(t.name));
        runtime.toolRegistry.setHooks(runtime.hooks);

        const basePrompt = await loadSystemPrompt(workspaceRoot);
        const systemPrompt = `${basePrompt}\n\n---\n\n## MIGRATE_ASSISTANT\n\nYou are GenieCEO, helping the user migrate prompt templates.\n\nYou are resolving a single markdown file conflict.\n\n- File: ${conflict.filename}\n\nYou have:\n- EXISTING (what the user currently has)\n- TEMPLATE (what this GenieCEO version ships)\n- DIFF (a compact line diff; may be truncated)\n\nTools you MAY use:\n- read_file, write_file, edit_file, list_dir (prefer scope='workspace' and paths like prompts/${conflict.filename})\n- run_command (only if necessary; keep it safe and non-destructive)\n\nMigration guidance:\n- Prefer preserving the user's edits.\n- If you make edits to the existing file, instruct the user to type 'keep' to proceed (so we don't overwrite afterward).\n\nHard rules:\n- Do not delete files.\n- Do not modify anything outside ~/.genieceo/prompts unless the user explicitly asks.\n\nIf asked to recommend, explain briefly and end with: RECOMMENDATION: keep|template.\n\n### EXISTING\n${conflict.existingContent}\n\n### TEMPLATE\n${conflict.templateContent}\n\n### DIFF\n${conflict.diffText}\n`;

        const ctx: Context = { systemPrompt, messages: [], tools: allowedTools as any };

        console.log(`\n[conflict] ${conflict.filename}`);
        console.log(`Chat with GenieCEO about this change (it can use file/shell tools).`);
        console.log(`When ready, type: keep | template`);
        console.log(`Other commands: diff | show existing | show template | recommend | help\n`);

        while (true) {
          const line = (await rl.question("migrate> ")).trim();
          if (!line) continue;

          const lower = line.toLowerCase();
          if (lower === "help" || lower === "?") {
            console.log("\nCommands: keep | template | diff | show existing | show template | recommend | help\n");
            continue;
          }
          if (lower === "diff") {
            console.log("");
            console.log(`--- existing: ${conflict.dstPath}`);
            console.log(`+++ template: ${conflict.srcPath}`);
            console.log(conflict.diffText.trimEnd());
            if (conflict.diffTruncated) console.log("\n[diff truncated]");
            console.log("");
            continue;
          }
          if (lower === "show existing") {
            console.log("");
            console.log(conflict.existingContent.trimEnd());
            console.log("");
            continue;
          }
          if (lower === "show template") {
            console.log("");
            console.log(conflict.templateContent.trimEnd());
            console.log("");
            continue;
          }
          if (lower === "keep") return "keep";
          if (lower === "template") return "template";
          if (lower === "recommend") {
            ctx.messages.push({ role: "user", content: "Please recommend keep vs template. End with RECOMMENDATION: keep|template.", timestamp: Date.now() } as any);
          } else {
            ctx.messages.push({ role: "user", content: line, timestamp: Date.now() } as any);
          }

          let sawTextDelta = false;
          let startedOutput = false;
          const assistant = await completeWithToolLoop({
            apiKey: runtime.apiKey,
            model: runtime.model,
            context: ctx,
            tools: allowedTools as any,
            registry: runtime.toolRegistry,
            maxIterations: 10,
            stream: streamEnabled,
            onEvent: (ev) => {
              if (ev.type === "model_text_delta") {
                if (!startedOutput) {
                  startedOutput = true;
                  process.stdout.write("\n");
                }
                sawTextDelta = true;
                process.stdout.write(ev.delta);
              } else if (ev.type === "model_text_end") {
                if (sawTextDelta) process.stdout.write("\n\n");
              } else if (ev.type === "tool_execute_start") {
                if (!startedOutput) {
                  startedOutput = true;
                  process.stdout.write("\n");
                }
                console.log(`[tool] ${ev.toolName} ...`);
              } else if (ev.type === "tool_execute_end") {
                console.log(`[tool] ${ev.toolName} done (${ev.durationMs}ms)${ev.isError ? " [error]" : ""}`);
              }
            },
          });

          if (!sawTextDelta) {
            const t = renderAssistantText(assistant);
            if (t) console.log(`\n${t}\n`);
            else console.log("\n[No text output]\n");
          }
        }
      }
    : undefined;

  const promptsRes = await (async () => {
    try {
      return await syncInstalledPromptTemplates(workspaceRoot, {
        overwrite: overwritePrompts,
        mode,
        onConflict,
      });
    } finally {
      rl?.close();
    }
  })();
  const skillsRes = await syncInstalledBuiltinSkills(workspaceRoot, { overwrite: overwriteSkills });

  // Prompts
  const overwriteNote = mode === "existing" && overwritePrompts ? " (overwrite enabled)" : "";
  if (promptsRes.copied.length > 0) {
    console.log(
      `Prompt templates: copied ${promptsRes.copied.length}${overwriteNote}: ${promptsRes.copied.join(
        ", "
      )}`
    );
  } else {
    console.log(`Prompt templates: no changes${overwriteNote}.`);
  }
  if (mode === "agentic") {
    const kept = promptsRes.keptExisting ?? [];
    const same = promptsRes.identical ?? [];
    const conflicts = promptsRes.conflicts ?? [];
    if (conflicts.length > 0) console.log(`Prompt templates: ${conflicts.length} conflict(s) detected (agentic mode).`);
    if (kept.length > 0) console.log(`Prompt templates: kept existing ${kept.length}: ${kept.join(", ")}`);
    if (same.length > 0) console.log(`Prompt templates: identical ${same.length}: ${same.join(", ")}`);
  } else if (promptsRes.skipped.length > 0 && !overwritePrompts) {
    console.log(`Prompt templates: kept existing ${promptsRes.skipped.length}: ${promptsRes.skipped.join(", ")}`);
  }

  // Skills
  if (skillsRes.installed.length > 0) {
    console.log(`Built-in skills: installed ${skillsRes.installed.length}: ${skillsRes.installed.join(", ")}`);
  }
  if (skillsRes.overwritten.length > 0) {
    console.log(`Built-in skills: overwritten ${skillsRes.overwritten.length}: ${skillsRes.overwritten.join(", ")}`);
  }
  if (skillsRes.existing.length > 0 && !overwriteSkills) {
    console.log(`Built-in skills: already present ${skillsRes.existing.length}: ${skillsRes.existing.join(", ")}`);
  }
  if (skillsRes.installed.length === 0 && skillsRes.overwritten.length === 0 && skillsRes.existing.length === 0) {
    console.log("Built-in skills: none found in this installation.");
  }
}

