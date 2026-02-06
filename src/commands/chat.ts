import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";

import type { Context, Message, Tool } from "@mariozechner/pi-ai";

import { loadConfig } from "../config/store.js";
import { ensureWorkspace, loadSystemPrompt } from "../workspace/bootstrap.js";
import { getSessionsDir, getWorkspaceRoot } from "../workspace/paths.js";
import { createToolRegistry } from "../tools/index.js";
import { completeWithToolLoop, getActiveLlmProfile, getModelForProfile } from "../llm/pi-ai-adapter.js";

function isoCompact(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function appendJsonl(sessionPath: string, obj: unknown): Promise<void> {
  await appendFile(sessionPath, JSON.stringify(obj) + "\n", "utf8");
}

function renderAssistantText(msg: any): string {
  const parts = (msg?.content ?? []).filter((b: any) => b?.type === "text").map((b: any) => String(b.text ?? ""));
  return parts.join("").trim();
}

export async function runChat(): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  await ensureWorkspace(workspaceRoot);

  const config = await loadConfig(workspaceRoot);
  const { name: profileName, profile } = getActiveLlmProfile(config);
  const model = getModelForProfile(profile);

  const toolRegistry = createToolRegistry({ workspaceRoot, invocationCwd: process.cwd(), config });
  const tools = toolRegistry.list() as Tool[];

  const context: Context = {
    // Note: refresh this before each model call so SKILLS_INDEX can change between turns.
    systemPrompt: await loadSystemPrompt(workspaceRoot),
    messages: [],
    tools,
  };

  const sessionDir = getSessionsDir(workspaceRoot);
  await mkdir(sessionDir, { recursive: true });
  const sessionPath = path.join(sessionDir, `session-${isoCompact()}.jsonl`);

  console.log(`Session: ${sessionPath}`);
  console.log(`LLM profile: ${profileName} (${profile.provider}/${profile.model})`);
  console.log('Type your message. Type "/exit" to quit.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const line = (await rl.question("> ")).trim();
      if (!line) continue;
      if (line === "/exit" || line === "/quit") break;

      const userMsg: Message = {
        role: "user",
        content: line,
        timestamp: Date.now(),
      } as any;

      const startLen = context.messages.length;
      context.messages.push(userMsg);

      // Refresh system prompt each turn (skills/templates may have changed on disk).
      context.systemPrompt = await loadSystemPrompt(workspaceRoot);

      const assistant = await completeWithToolLoop({
        apiKey: profile.apiKey,
        model,
        context,
        tools,
        registry: toolRegistry,
      });

      const assistantText = renderAssistantText(assistant);
      if (assistantText) console.log(`\n${assistantText}\n`);
      else console.log("\n[No text output]\n");

      // Persist all newly appended messages this turn (user, assistant, tool results).
      const newMessages = context.messages.slice(startLen);
      for (const m of newMessages) await appendJsonl(sessionPath, m);
    }
  } finally {
    rl.close();
  }
}

