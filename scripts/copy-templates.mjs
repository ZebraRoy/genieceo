import { mkdir, readdir, copyFile } from "node:fs/promises";
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

