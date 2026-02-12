import { mkdir, readFile, writeFile, copyFile, stat, readdir } from "node:fs/promises";
import path from "node:path";

import {
  getConfigPath,
  getLogsDir,
  getLongTermMemoryPath,
  getMemoryDir,
  getPluginsDir,
  getPromptsDir,
  getServicesDir,
  getSessionsDir,
  getSkillsDir,
  getSubagentsDir,
  getWorkspaceRoot,
} from "./paths.js";
import { getInstalledTemplatesDir, PROMPT_TEMPLATE_FILES } from "./templates.js";
import { getDefaultConfig } from "../config/schema.js";
import { getInstalledBuiltinSkillsDir } from "./builtin-skills.js";
import { buildSkillsIndex } from "../skills/index.js";
import { buildSubagentsIndex } from "../subagents/index.js";
import { buildMemoryPromptBlock } from "./memory.js";

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export type PromptTemplateSyncMode = "existing" | "agentic";

function normalizeEol(s: string): string {
  return s.replace(/\r\n/g, "\n");
}

function normalizeForCompare(s: string): string {
  // Ignore only a single trailing newline difference. (Templates tend to end with \n.)
  const n = normalizeEol(s);
  return n.endsWith("\n") ? n.slice(0, -1) : n;
}

type LineOp = { type: " " | "-" | "+"; line: string };

function buildLineDiffOps(aLines: string[], bLines: string[]): LineOp[] {
  const n = aLines.length;
  const m = bLines.length;

  // Guardrail: avoid O(n*m) memory for huge files.
  if (n * m > 400_000) {
    return [
      { type: " ", line: "[diff skipped: file too large to compute line diff safely]" },
      { type: "-", line: `existing: ${n} lines` },
      { type: "+", line: `template: ${m} lines` },
    ];
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = aLines[i] === bLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: LineOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (aLines[i] === bLines[j]) {
      ops.push({ type: " ", line: aLines[i] });
      i++;
      j++;
      continue;
    }
    if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "-", line: aLines[i] });
      i++;
    } else {
      ops.push({ type: "+", line: bLines[j] });
      j++;
    }
  }
  while (i < n) {
    ops.push({ type: "-", line: aLines[i] });
    i++;
  }
  while (j < m) {
    ops.push({ type: "+", line: bLines[j] });
    j++;
  }
  return ops;
}

function renderDiffHunks(
  ops: LineOp[],
  opts: { context: number; maxHunks: number; maxLines: number }
): { text: string; truncated: boolean } {
  const changeIdx: number[] = [];
  for (let k = 0; k < ops.length; k++) {
    if (ops[k].type !== " ") changeIdx.push(k);
  }

  if (changeIdx.length === 0) return { text: "[no differences]\n", truncated: false };

  const ranges: Array<{ start: number; end: number }> = [];
  const ctx = opts.context;

  let curStart = Math.max(0, changeIdx[0] - ctx);
  let curEnd = Math.min(ops.length, changeIdx[0] + ctx + 1);
  for (let idx = 1; idx < changeIdx.length; idx++) {
    const k = changeIdx[idx];
    const s = Math.max(0, k - ctx);
    const e = Math.min(ops.length, k + ctx + 1);
    if (s <= curEnd + ctx) {
      curEnd = Math.max(curEnd, e);
    } else {
      ranges.push({ start: curStart, end: curEnd });
      curStart = s;
      curEnd = e;
    }
  }
  ranges.push({ start: curStart, end: curEnd });

  const out: string[] = [];
  let lines = 0;
  let hunks = 0;
  let truncated = false;

  for (const r of ranges) {
    hunks++;
    if (hunks > opts.maxHunks) {
      truncated = true;
      break;
    }
    out.push(`@@ lines ${r.start + 1}-${r.end} @@`);
    for (let k = r.start; k < r.end; k++) {
      out.push(`${ops[k].type}${ops[k].type === " " ? " " : ""}${ops[k].line}`);
      lines++;
      if (lines >= opts.maxLines) {
        truncated = true;
        break;
      }
    }
    if (truncated) break;
    out.push("");
  }

  if (truncated) out.push("[diff truncated]");
  return { text: out.join("\n") + "\n", truncated };
}

export async function ensureWorkspace(workspaceRoot: string = getWorkspaceRoot()): Promise<void> {
  await mkdir(workspaceRoot, { recursive: true });
  await mkdir(getPromptsDir(workspaceRoot), { recursive: true });
  await mkdir(getSessionsDir(workspaceRoot), { recursive: true });
  await mkdir(getMemoryDir(workspaceRoot), { recursive: true });
  await mkdir(getLogsDir(workspaceRoot), { recursive: true });
  await mkdir(getServicesDir(workspaceRoot), { recursive: true });
  await mkdir(getPluginsDir(workspaceRoot), { recursive: true });
  await mkdir(getSkillsDir(workspaceRoot), { recursive: true });
  await mkdir(getSubagentsDir(workspaceRoot), { recursive: true });

  await ensurePromptTemplates(workspaceRoot, { overwrite: false });
  await ensureBaselineSkills(workspaceRoot, { overwrite: false });
  await ensureBaselineSubagents(workspaceRoot, { overwrite: false });

  // Create empty config.json placeholder (onboard will populate).
  const configPath = getConfigPath(workspaceRoot);
  if (!(await exists(configPath))) {
    await writeFile(configPath, JSON.stringify(getDefaultConfig(), null, 2) + "\n", "utf8");
  }

  // Create long-term memory placeholder.
  const memPath = getLongTermMemoryPath(workspaceRoot);
  if (!(await exists(memPath))) {
    await writeFile(memPath, "", "utf8");
  }
}

async function copyDirRecursive(srcDir: string, dstDir: string, opts: { overwrite: boolean }): Promise<void> {
  await mkdir(dstDir, { recursive: true });
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const ent of entries) {
    const src = path.join(srcDir, ent.name);
    const dst = path.join(dstDir, ent.name);
    if (ent.isDirectory()) {
      await copyDirRecursive(src, dst, opts);
      continue;
    }
    if (!opts.overwrite && (await exists(dst))) continue;
    await copyFile(src, dst);
  }
}

/**
 * Seeds a minimal set of built-in skills so GenieCEO always knows how to manage skills.
 * Additional skills are installed via the onboard wizard.
 */
export async function ensureBaselineSkills(workspaceRoot: string, opts: { overwrite: boolean }): Promise<void> {
  const installed = getInstalledBuiltinSkillsDir();
  const skillsDir = getSkillsDir(workspaceRoot);

  // Minimal baseline: manage-skills.
  const src = path.join(installed, "manage-skills");
  const dst = path.join(skillsDir, "manage-skills");
  if (!(await exists(src))) return;
  await copyDirRecursive(src, dst, opts);
}

/**
 * Seeds a minimal set of built-in subagents so delegation works out of the box.
 * Subagents live under ~/.genieceo/subagents/<name>/AGENT.md.
 */
export async function ensureBaselineSubagents(workspaceRoot: string, opts: { overwrite: boolean }): Promise<void> {
  const subagentsDir = getSubagentsDir(workspaceRoot);

  // Baseline: audio-analyst (uses audio_transcribe tool).
  const name = "audio-analyst";
  const dir = path.join(subagentsDir, name);
  const agentMdPath = path.join(dir, "AGENT.md");
  if (!opts.overwrite && (await exists(agentMdPath))) return;

  await mkdir(dir, { recursive: true });

  const content = [
    "---",
    "name: audio-analyst",
    "description: Transcribe and analyze audio files.",
    "profile: openai:gpt-5-mini",
    "tools:",
    "  - audio_transcribe",
    "  - read_file",
    "  - web_search",
    "  - web_fetch",
    "disallowedTools:",
    "  - run_command",
    "---",
    "",
    "You are the **audio-analyst** subagent.",
    "",
    "## What you do",
    "- When the user provides an audio file path (or you see an audio attachment path), call `audio_transcribe` on it.",
    "- Then analyze the transcript and return: a short summary, key points, and any action items.",
    "",
    "## Output format",
    "- Summary (2-4 sentences)",
    "- Key points (bullets)",
    "- Action items (bullets, if any)",
    "",
  ].join("\n");

  await writeFile(agentMdPath, content, "utf8");
}

export async function installBuiltinSkills(
  workspaceRoot: string,
  skillNames: string[],
  opts: { overwrite: boolean }
): Promise<{ installed: string[]; skipped: { name: string; reason: string }[] }> {
  const installedDir = getInstalledBuiltinSkillsDir();
  const skillsDir = getSkillsDir(workspaceRoot);

  const installed: string[] = [];
  const skipped: { name: string; reason: string }[] = [];

  for (const name of skillNames) {
    const src = path.join(installedDir, name);
    const dst = path.join(skillsDir, name);
    if (!(await exists(src))) {
      skipped.push({ name, reason: "builtin skill not found in installation" });
      continue;
    }
    await copyDirRecursive(src, dst, opts);
    installed.push(name);
  }

  return { installed, skipped };
}

export async function ensurePromptTemplates(
  workspaceRoot: string,
  opts: { overwrite: boolean }
): Promise<void> {
  const templatesDir = getInstalledTemplatesDir();
  const promptsDir = getPromptsDir(workspaceRoot);

  for (const filename of PROMPT_TEMPLATE_FILES) {
    const src = path.join(templatesDir, filename);
    const dst = path.join(promptsDir, filename);

    if (!opts.overwrite && (await exists(dst))) continue;
    await copyFile(src, dst);
  }
}

/**
 * Copies ALL installed prompt templates (.md files) into the workspace prompts folder.
 * This is used by `genieceo migrate` so older workspaces can pick up newly shipped templates.
 *
 * By default it is non-destructive: existing files are left untouched unless overwrite=true.
 */
export async function syncInstalledPromptTemplates(
  workspaceRoot: string,
  opts: { overwrite: boolean; mode?: PromptTemplateSyncMode; interactive?: boolean }
): Promise<{ copied: string[]; skipped: string[]; keptExisting?: string[]; identical?: string[]; conflicts?: string[] }> {
  const templatesDir = getInstalledTemplatesDir();
  const promptsDir = getPromptsDir(workspaceRoot);
  await mkdir(promptsDir, { recursive: true });

  const copied: string[] = [];
  const skipped: string[] = [];
  const keptExisting: string[] = [];
  const identical: string[] = [];
  const conflicts: string[] = [];

  if (!(await exists(templatesDir))) return { copied, skipped };

  const entries = await readdir(templatesDir, { withFileTypes: true });
  const mode: PromptTemplateSyncMode = opts.mode ?? "existing";

  if (mode === "existing") {
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      if (!ent.name.endsWith(".md")) continue;
      const src = path.join(templatesDir, ent.name);
      const dst = path.join(promptsDir, ent.name);
      if (!opts.overwrite && (await exists(dst))) {
        skipped.push(ent.name);
        continue;
      }
      await copyFile(src, dst);
      copied.push(ent.name);
    }

    copied.sort();
    skipped.sort();
    return { copied, skipped };
  }

  // Agentic mode: compare template vs existing and ask what to do on conflicts.
  const interactive = opts.interactive ?? true;
  const isTty = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const canPrompt = interactive && isTty;

  let globalPolicy: "keep" | "template" | null = null;

  // Import prompts lazily to avoid pulling them into non-interactive flows.
  const selectPrompt = async (params: {
    message: string;
    choices: Array<{ name: string; value: string; description?: string }>;
  }): Promise<string> => {
    const { select } = await import("@inquirer/prompts");
    return await select(params);
  };

  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (!ent.name.endsWith(".md")) continue;

    const src = path.join(templatesDir, ent.name);
    const dst = path.join(promptsDir, ent.name);
    const hasDst = await exists(dst);

    if (!hasDst) {
      await copyFile(src, dst);
      copied.push(ent.name);
      continue;
    }

    const [templateRaw, existingRaw] = await Promise.all([readFile(src, "utf8"), readFile(dst, "utf8")]);
    const templateCmp = normalizeForCompare(templateRaw);
    const existingCmp = normalizeForCompare(existingRaw);
    if (templateCmp === existingCmp) {
      identical.push(ent.name);
      skipped.push(ent.name);
      continue;
    }

    conflicts.push(ent.name);

    // Non-interactive agentic mode: be conservative (do not overwrite).
    if (!canPrompt) {
      keptExisting.push(ent.name);
      skipped.push(ent.name);
      continue;
    }

    if (globalPolicy === "keep") {
      keptExisting.push(ent.name);
      skipped.push(ent.name);
      continue;
    }
    if (globalPolicy === "template") {
      await copyFile(src, dst);
      copied.push(ent.name);
      continue;
    }

    const existingLines = normalizeEol(existingRaw).split("\n");
    const templateLines = normalizeEol(templateRaw).split("\n");
    const ops = buildLineDiffOps(existingLines, templateLines);
    const diff = renderDiffHunks(ops, { context: 3, maxHunks: 8, maxLines: 220 });

    // Prompt loop: allow showing diff then re-asking.
    while (true) {
      const action = await selectPrompt({
        message: `Prompt template conflict: ${ent.name} (existing differs from shipped template)`,
        choices: [
          { name: "Keep existing (do not change)", value: "keep" },
          { name: "Use shipped template (overwrite)", value: "template" },
          { name: "Show diff", value: "diff", description: diff.truncated ? "Diff is truncated; still useful" : undefined },
          { name: "Keep existing for ALL remaining conflicts", value: "keepAll" },
          { name: "Use template for ALL remaining conflicts", value: "templateAll" },
        ],
      });

      if (action === "diff") {
        console.log("");
        console.log(`--- existing: ${dst}`);
        console.log(`+++ template: ${src}`);
        console.log(diff.text.trimEnd());
        console.log("");
        continue;
      }

      if (action === "keep" || action === "keepAll") {
        if (action === "keepAll") globalPolicy = "keep";
        keptExisting.push(ent.name);
        skipped.push(ent.name);
        break;
      }
      if (action === "template" || action === "templateAll") {
        if (action === "templateAll") globalPolicy = "template";
        await copyFile(src, dst);
        copied.push(ent.name);
        break;
      }
    }
  }

  copied.sort();
  skipped.sort();
  keptExisting.sort();
  identical.sort();
  conflicts.sort();
  return { copied, skipped, keptExisting, identical, conflicts };
}

/**
 * Copies ALL installed built-in skills into the workspace skills folder.
 *
 * By default it is non-destructive: existing files are left untouched unless overwrite=true.
 * Even when overwrite=false, missing files inside an existing skill folder will be added.
 */
export async function syncInstalledBuiltinSkills(
  workspaceRoot: string,
  opts: { overwrite: boolean }
): Promise<{ installed: string[]; overwritten: string[]; existing: string[] }> {
  const installedDir = getInstalledBuiltinSkillsDir();
  const skillsDir = getSkillsDir(workspaceRoot);
  await mkdir(skillsDir, { recursive: true });

  const installed: string[] = [];
  const overwritten: string[] = [];
  const existing: string[] = [];

  if (!(await exists(installedDir))) return { installed, overwritten, existing };

  const entries = await readdir(installedDir, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const src = path.join(installedDir, ent.name);
    const dst = path.join(skillsDir, ent.name);
    const hadDst = await exists(dst);

    // copyDirRecursive is intentionally "merge-like" when overwrite=false.
    await copyDirRecursive(src, dst, opts);

    if (!hadDst) installed.push(ent.name);
    else if (opts.overwrite) overwritten.push(ent.name);
    else existing.push(ent.name);
  }

  installed.sort();
  overwritten.sort();
  existing.sort();
  return { installed, overwritten, existing };
}

export async function loadSystemPrompt(workspaceRoot: string): Promise<string> {
  const promptsDir = getPromptsDir(workspaceRoot);
  const parts: string[] = [];

  for (const filename of PROMPT_TEMPLATE_FILES) {
    const p = path.join(promptsDir, filename);
    const content = await readFile(p, "utf8");
    parts.push(`## ${filename}\n\n${content.trim()}`);
  }

  const memoryBlock = await buildMemoryPromptBlock({ workspaceRoot });
  if (memoryBlock) parts.push(memoryBlock);

  // Append a compact, metadata-only index of skills (progressive disclosure).
  const skillsDir = getSkillsDir(workspaceRoot);
  const { skills, skipped, truncated } = await buildSkillsIndex(skillsDir, { limit: 200 });

  const skillsLines: string[] = [];
  for (const s of skills) {
    skillsLines.push(`- ${s.name}: ${s.description}`);
  }
  if (truncated) skillsLines.push(`- [truncated]`);
  if (skillsLines.length === 0) skillsLines.push("- [none installed]");

  parts.push(`## SKILLS_INDEX\n\n${skillsLines.join("\n")}`);

  // Append a compact, metadata-only index of subagents (progressive disclosure).
  const subagentsDir = getSubagentsDir(workspaceRoot);
  const { subagents, skipped: subSkipped, truncated: subTruncated } = await buildSubagentsIndex(subagentsDir, { limit: 200 });

  const subLines: string[] = [];
  for (const s of subagents) {
    const profile = s.profile ? ` (profile: ${s.profile})` : "";
    subLines.push(`- ${s.name}: ${s.description}${profile}`);
  }
  if (subTruncated) subLines.push(`- [truncated]`);
  if (subLines.length === 0) subLines.push("- [none installed]");

  parts.push(`## SUBAGENTS_INDEX\n\n${subLines.join("\n")}`);

  // Don't spam: only include a small diagnostic if something is wrong.
  if (subSkipped.length > 0) {
    const sample = subSkipped.slice(0, 5).map((x) => `- ${path.basename(x.dir)}: ${x.reason}`);
    parts.push(
      `## SUBAGENTS_INDEX_NOTES\n\nSkipped ${subSkipped.length} invalid subagent folder(s). Fix or remove them.\n\n${sample.join("\n")}${
        subSkipped.length > sample.length ? "\n- [more omitted]" : ""
      }`
    );
  }

  // Don't spam: only include a small diagnostic if something is wrong.
  if (skipped.length > 0) {
    const sample = skipped.slice(0, 5).map((x) => `- ${path.basename(x.dir)}: ${x.reason}`);
    parts.push(
      `## SKILLS_INDEX_NOTES\n\nSkipped ${skipped.length} invalid skill folder(s). Fix or remove them.\n\n${sample.join("\n")}${
        skipped.length > sample.length ? "\n- [more omitted]" : ""
      }`
    );
  }

  return parts.join("\n\n---\n\n");
}

