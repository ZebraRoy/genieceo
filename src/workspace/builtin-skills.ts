import path from "node:path";
import { fileURLToPath } from "node:url";

export const BUILTIN_SKILLS = ["manage-skills", "author-skills", "install-from-github", "discover-skills", "runtime-hooks"] as const;
export type BuiltinSkillName = (typeof BUILTIN_SKILLS)[number];

export function getInstalledBuiltinSkillsDir(): string {
  // When running from source, this resolves to src/workspace/skills/.
  // When bundled, this resolves relative to dist/cli.js, and `scripts/copy-templates.mjs`
  // copies builtin skills to dist/skills/.
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "skills");
}

