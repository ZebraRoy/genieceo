import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";

import type { Context, Message } from "@mariozechner/pi-ai";

import { ensureWorkspace, loadSystemPrompt } from "../workspace/bootstrap.js";
import { getSessionsDir, getWorkspaceRoot } from "../workspace/paths.js";
import { createAgentRuntime, runAgentTurn } from "../agent/runner.js";

function isoCompact(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function appendJsonl(sessionPath: string, obj: unknown): Promise<void> {
  await appendFile(sessionPath, JSON.stringify(obj) + "\n", "utf8");
}

export async function runChat(): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  await ensureWorkspace(workspaceRoot);

  const runtime = await createAgentRuntime({ workspaceRoot, invocationCwd: process.cwd() });

  const context: Context = {
    // Note: refresh this before each model call so SKILLS_INDEX can change between turns.
    systemPrompt: await loadSystemPrompt(workspaceRoot),
    messages: [],
    tools: runtime.tools,
  };

  const sessionDir = getSessionsDir(workspaceRoot);
  await mkdir(sessionDir, { recursive: true });
  const sessionPath = path.join(sessionDir, `session-${isoCompact()}.jsonl`);

  console.log(`Session: ${sessionPath}`);
  console.log(`LLM profile: ${runtime.profileName} (${runtime.provider}/${runtime.modelId})`);
  console.log('Type your message. Type "/exit" to quit. Type "/reset" to clear context.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const line = (await rl.question("> ")).trim();
      if (!line) continue;
      if (line === "/exit" || line === "/quit") break;
      if (line === "/reset" || line === "/clear") {
        context.messages.length = 0;
        console.log("\n[Conversation cleared]\n");
        continue;
      }

      const startLen = context.messages.length;
      // runAgentTurn appends user/assistant/toolResult messages into `context.messages`.
      const { assistantText } = await runAgentTurn({
        runtime,
        messages: context.messages,
        userText: line,
        conversation: { channel: "cli" },
      });
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

