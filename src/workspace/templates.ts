import path from "node:path";
import { fileURLToPath } from "node:url";

export const PROMPT_TEMPLATE_FILES = [
  "IDENTITY.md",
  "AGENTS.md",
  "SOUL.md",
  "USER.md",
  "TOOLS.md",
] as const;

export type PromptTemplateFile = (typeof PROMPT_TEMPLATE_FILES)[number];

export function getInstalledTemplatesDir(): string {
  // When running from dist/cli.js, templates are copied to dist/workspace/templates.
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "templates");
}

