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
  const streamEnabledEnv = String(process.env.GENIECEO_STREAM ?? "").trim().toLowerCase();
  const streamEnabled =
    streamEnabledEnv === ""
      ? true
      : streamEnabledEnv === "1" || streamEnabledEnv === "true" || streamEnabledEnv === "yes" || streamEnabledEnv === "on";

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
      let sawTextDelta = false;
      let startedOutput = false;
      const { assistantText } = await runAgentTurn({
        runtime,
        messages: context.messages,
        userText: line,
        conversation: { channel: "cli" },
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
            console.log(
              `[tool] ${ev.toolName} done (${ev.durationMs}ms)${ev.isError ? " [error]" : ""}`,
            );
          } else if (ev.type === "error") {
            if (!startedOutput) {
              startedOutput = true;
              process.stdout.write("\n");
            }
            console.error(`[error] ${ev.message}`);
          }
        },
      });
      // If streaming showed text deltas, avoid duplicating output.
      if (!sawTextDelta) {
        if (assistantText) console.log(`\n${assistantText}\n`);
        else console.log("\n[No text output]\n");
      }

      // Persist all newly appended messages this turn (user, assistant, tool results).
      const newMessages = context.messages.slice(startLen);
      for (const m of newMessages) await appendJsonl(sessionPath, m);
    }
  } finally {
    rl.close();
  }
}

