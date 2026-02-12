import { ensureWorkspace, syncInstalledBuiltinSkills, syncInstalledPromptTemplates } from "../workspace/bootstrap.js";
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
          name: "agentic (diff + ask on conflicts)",
          value: "agentic",
          description: "Compares shipped templates vs your prompts and asks what to keep",
        },
      ],
    });
  };

  const mode: "existing" | "agentic" =
    opts.mode ?? (opts.agentic ? "agentic" : isTty ? await selectMode() : "existing");

  const promptsRes = await syncInstalledPromptTemplates(workspaceRoot, {
    overwrite: overwritePrompts,
    mode,
    interactive: true,
  });
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

