#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureWorkspace } from "./workspace/bootstrap.js";
import { getWorkspaceRoot } from "./workspace/paths.js";
import { runOnboard } from "./commands/onboard.js";
import { runChat } from "./commands/chat.js";
import { runReset } from "./commands/reset.js";

function getCliVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const pkgPath = path.resolve(__dirname, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    if (typeof pkg?.version === "string" && pkg.version.trim()) return pkg.version.trim();
  } catch {
    // ignore
  }
  return "0.0.0";
}

const program = new Command();

program.name("genieceo").description("GenieCEO agent CLI").version(getCliVersion());

program
  .command("chat")
  .description("Chat with GenieCEO")
  .action(async () => {
    await ensureWorkspace();
    console.log(`Workspace: ${getWorkspaceRoot()}`);
    await runChat();
  });

program
  .command("onboard")
  .description("Setup wizard for LLM and web search")
  .action(async () => {
    await ensureWorkspace();
    console.log(`Workspace: ${getWorkspaceRoot()}`);
    await runOnboard();
  });

program
  .command("reset")
  .description("Reset GenieCEO workspace prompt files")
  .option("--all", "Also reset config")
  .action(async (options: { all?: boolean }) => {
    await ensureWorkspace();
    console.log(`Workspace: ${getWorkspaceRoot()}`);
    await runReset({ all: Boolean(options.all) });
  });

program.parseAsync(process.argv);

