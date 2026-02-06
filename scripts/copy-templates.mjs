import { mkdir, readdir, copyFile, cp, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "..");
const srcDir = path.join(repoRoot, "src", "workspace", "templates");
const outDir = path.join(repoRoot, "dist", "templates");

await mkdir(outDir, { recursive: true });

const entries = await readdir(srcDir, { withFileTypes: true });
for (const ent of entries) {
  if (!ent.isFile()) continue;
  if (!ent.name.endsWith(".md")) continue;
  await copyFile(path.join(srcDir, ent.name), path.join(outDir, ent.name));
}

// Copy built-in skills for seeding the workspace at runtime.
const srcSkillsDir = path.join(repoRoot, "src", "workspace", "skills");
const outSkillsDir = path.join(repoRoot, "dist", "skills");

const hasSkills = await stat(srcSkillsDir).then(() => true).catch(() => false);
if (hasSkills) {
  await rm(outSkillsDir, { recursive: true, force: true });
  await mkdir(outSkillsDir, { recursive: true });
  await cp(srcSkillsDir, outSkillsDir, { recursive: true });
}

