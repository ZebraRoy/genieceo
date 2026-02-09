import { ensureWorkspace, syncInstalledBuiltinSkills, syncInstalledPromptTemplates } from "../workspace/bootstrap.js";
import { getWorkspaceRoot } from "../workspace/paths.js";

export async function runMigrate(opts: {
  overwrite?: boolean;
  overwritePrompts?: boolean;
  overwriteSkills?: boolean;
}): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  await ensureWorkspace(workspaceRoot);

  const overwritePrompts = Boolean(opts.overwrite || opts.overwritePrompts);
  const overwriteSkills = Boolean(opts.overwrite || opts.overwriteSkills);

  const promptsRes = await syncInstalledPromptTemplates(workspaceRoot, { overwrite: overwritePrompts });
  const skillsRes = await syncInstalledBuiltinSkills(workspaceRoot, { overwrite: overwriteSkills });

  // Prompts
  if (promptsRes.copied.length > 0) {
    console.log(
      `Prompt templates: copied ${promptsRes.copied.length}${overwritePrompts ? " (overwrite enabled)" : ""}: ${promptsRes.copied.join(
        ", "
      )}`
    );
  } else {
    console.log(`Prompt templates: no changes${overwritePrompts ? " (overwrite enabled)" : ""}.`);
  }
  if (promptsRes.skipped.length > 0 && !overwritePrompts) {
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

