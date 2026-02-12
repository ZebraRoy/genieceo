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
import { runMigrate } from "./commands/migrate.js";
import { runGateway } from "./commands/gateway.js";
import { runStatus } from "./commands/status.js";

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

program
  .command("migrate")
  .description("Update an existing ~/.genieceo workspace with newly shipped templates and built-in skills")
  .option("--overwrite", "Overwrite existing prompt and skill files")
  .option("--overwrite-prompts", "Overwrite existing prompt files")
  .option("--overwrite-skills", "Overwrite existing built-in skill files")
  .option("--mode <mode>", "Prompt migration mode: existing|agentic (agentic prompts on conflicts)")
  .option("--agentic", "Alias for --mode agentic")
  .action(
    async (options: {
      overwrite?: boolean;
      overwritePrompts?: boolean;
      overwriteSkills?: boolean;
      mode?: string;
      agentic?: boolean;
    }) => {
    // runMigrate calls ensureWorkspace internally; still print location consistently.
    console.log(`Workspace: ${getWorkspaceRoot()}`);

    const mode =
      options.mode === undefined
        ? undefined
        : options.mode === "existing" || options.mode === "agentic"
          ? options.mode
          : (() => {
              throw new Error(`Invalid --mode "${options.mode}". Expected "existing" or "agentic".`);
            })();

    await runMigrate({
      overwrite: Boolean(options.overwrite),
      overwritePrompts: Boolean(options.overwritePrompts),
      overwriteSkills: Boolean(options.overwriteSkills),
      mode,
      agentic: Boolean(options.agentic),
    });
  }
  );

program
  .command("gateway")
  .description("Run the long-lived GenieCEO gateway (webhooks, channels)")
  .action(async () => {
    await ensureWorkspace();
    console.log(`Workspace: ${getWorkspaceRoot()}`);
    await runGateway();
  });

program
  .command("status")
  .description("Show gateway + managed service status")
  .option("--json", "Output JSON for programmatic use")
  .action(async (options: { json?: boolean }) => {
    await runStatus({ json: Boolean(options.json) });
  });

program.parseAsync(process.argv);

