import { checkbox, confirm, input, password, select } from "@inquirer/prompts";
import { complete, getModel, getModels, getProviders } from "@mariozechner/pi-ai";
import { stat } from "node:fs/promises";

import { loadConfig, saveConfig } from "../config/store.js";
import type { GenieCeoConfig, LlmProfile } from "../config/schema.js";
import { ensureWorkspace, installBuiltinSkills } from "../workspace/bootstrap.js";
import { getConfigPath, getWorkspaceRoot } from "../workspace/paths.js";

type WebSearchProvider = "brave" | "tavily" | "duckduckgo";

function providerLabel(p: WebSearchProvider): string {
  switch (p) {
    case "brave":
      return "Brave Search API";
    case "tavily":
      return "Tavily";
    case "duckduckgo":
      return "DuckDuckGo (Instant Answer API fallback)";
  }
}

async function pickWebSearchOrder(existing: GenieCeoConfig["webSearch"]): Promise<{
  order: WebSearchProvider[];
  braveApiKey?: string;
  tavilyApiKey?: string;
}> {
  const enabled = (await checkbox<WebSearchProvider>({
    message: "Select enabled web search providers (space to toggle, enter to confirm).",
    choices: [
      { name: providerLabel("brave"), value: "brave", checked: existing.order.includes("brave") },
      { name: providerLabel("tavily"), value: "tavily", checked: existing.order.includes("tavily") },
      { name: providerLabel("duckduckgo"), value: "duckduckgo", checked: existing.order.includes("duckduckgo") },
    ],
    validate: (vals) => (vals.length === 0 ? "Select at least one provider." : true),
  })) as WebSearchProvider[];

  // Now choose priority order explicitly (checkbox doesn't express ordering).
  const order: WebSearchProvider[] = [];
  const remaining = new Set(enabled);
  while (remaining.size > 0) {
    const choice = await select<WebSearchProvider>({
      message:
        order.length === 0
          ? "Pick the FIRST web search provider to try."
          : "Pick the NEXT web search provider to try.",
      choices: Array.from(remaining).map((p) => ({ name: providerLabel(p), value: p })),
    });
    order.push(choice);
    remaining.delete(choice);
  }

  let braveApiKey: string | undefined;
  let tavilyApiKey: string | undefined;

  if (order.includes("brave")) {
    const key = await password({
      message: "Brave API key (leave empty to configure later).",
      mask: "*",
    });
    if (key.trim()) braveApiKey = key.trim();
  }

  if (order.includes("tavily")) {
    const key = await password({
      message: "Tavily API key (leave empty to configure later).",
      mask: "*",
    });
    if (key.trim()) tavilyApiKey = key.trim();
  }

  return { order, braveApiKey, tavilyApiKey };
}

async function healthCheckProfile(profile: LlmProfile): Promise<{ ok: boolean; error?: string }> {
  try {
    const baseModel = getModel(profile.provider as any, profile.model as any) as any;
    const model = profile.apiBase ? { ...baseModel, baseUrl: profile.apiBase } : baseModel;

    const msg = await complete(
      model,
      {
        systemPrompt: "You are a health check. Reply with exactly: OK",
        messages: [{ role: "user", content: "OK", timestamp: Date.now() }] as any,
      },
      {
        apiKey: profile.apiKey,
        temperature: 0,
        maxTokens: 16,
      }
    );

    if (msg.stopReason === "error") return { ok: false, error: msg.errorMessage ?? "unknown error" };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ? String(e.message) : String(e) };
  }
}

async function pickModelForProvider(provider: string, defaultModel?: string): Promise<string> {
  const models = getModels(provider as any);
  const maxChoices = 40;
  const modelChoice = await select<string>({
    message: `Select a model for ${provider} (or choose custom).`,
    choices: [
      ...models.slice(0, maxChoices).map((m: any) => ({
        name: `${m.id}${m.name ? ` — ${m.name}` : ""}`,
        value: m.id,
      })),
      { name: "Custom model id...", value: "__custom__" },
    ],
    default: defaultModel,
  });
  return modelChoice === "__custom__"
    ? (await input({ message: "Enter model id (exact).", validate: (v) => (v.trim() ? true : "Required") })).trim()
    : modelChoice;
}

async function configureProfile(initial: Partial<LlmProfile> = {}): Promise<LlmProfile | null> {
  const providers = getProviders();
  const provider = await select<string>({
    message: "Select an LLM provider to configure.",
    choices: providers.map((p) => ({ name: p, value: p })),
    default: initial.provider,
  });

  let model = await pickModelForProvider(provider, initial.model);
  let apiKey = (await password({
    message: `API key for ${provider} (leave empty to use env vars).`,
    mask: "*",
  })).trim();
  if (!apiKey && initial.apiKey) apiKey = initial.apiKey;

  let apiBase = (await input({
    message: "Custom API base URL (optional, for OpenAI-compatible endpoints).",
    default: initial.apiBase ?? "",
  })).trim();

  const profile: LlmProfile = {
    provider,
    model,
    apiKey: apiKey || undefined,
    apiBase: apiBase || undefined,
  };

  // Health check loop
  while (true) {
    process.stdout.write(`Health check: ${provider}/${model}... `);
    const hc = await healthCheckProfile(profile);
    if (hc.ok) {
      console.log("OK");
      return profile;
    }
    console.log("FAILED");
    console.log(`  ${hc.error ?? "Unknown error"}`);

    const action = await select<"retry_key" | "retry_model" | "keep" | "skip">({
      message: "Health check failed. What do you want to do?",
      choices: [
        { name: "Retry API key", value: "retry_key" },
        { name: "Retry model selection", value: "retry_model" },
        { name: "Keep this provider anyway", value: "keep" },
        { name: "Skip this provider", value: "skip" },
      ],
    });

    if (action === "skip") return null;
    if (action === "keep") return profile;
    if (action === "retry_key") {
      apiKey = (await password({ message: `API key for ${provider} (leave empty for env vars).`, mask: "*" })).trim();
      profile.apiKey = apiKey || undefined;
      continue;
    }
    if (action === "retry_model") {
      model = await pickModelForProvider(provider, model);
      profile.model = model;
      continue;
    }
  }
}

function defaultProfileName(profiles: Record<string, LlmProfile>, profile: LlmProfile): string {
  const base = `${profile.provider}:${profile.model}`.replace(/\s+/g, "-");
  if (!profiles[base]) return base;
  let i = 2;
  while (profiles[`${base}#${i}`]) i++;
  return `${base}#${i}`;
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function runOnboard(): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  await ensureWorkspace(workspaceRoot);

  const config = await loadConfig(workspaceRoot);

  type SetupStep = "skills" | "access" | "websearch" | "llm" | "gateway" | "channels";

  const existingProfiles = Object.keys(config.llm?.profiles ?? {}).length;
  const configPath = getConfigPath(workspaceRoot);
  const hasConfigFile = await exists(configPath);

  const selectedSteps = (await checkbox<SetupStep>({
    message:
      "Select setup steps to run (space to toggle, enter to confirm). Skipped steps keep existing configuration.",
    choices: [
      { name: "Built-in skills (install/overwrite)", value: "skills", checked: false },
      { name: "Filesystem access mode (protected vs free)", value: "access", checked: false },
      { name: "Web search providers + API keys", value: "websearch", checked: false },
      {
        name: "LLM profiles (providers/models/keys) + active profile",
        value: "llm",
        checked: existingProfiles === 0, // required on first setup
      },
      { name: "Gateway (daemon) settings (host/port/plugins dir)", value: "gateway", checked: false },
      { name: "Channels (Telegram/webhooks/etc.)", value: "channels", checked: false },
    ],
  })) as SetupStep[];

  if (hasConfigFile && selectedSteps.length === 0) {
    console.log("No steps selected. Will save config as-is (normalized) for migration/upgrade.");
  }

  if (selectedSteps.includes("skills")) {
    const builtinSkills = (await checkbox<string>({
      message: "Select built-in skills to install (space to toggle, enter to confirm).",
      choices: [
        {
          name: "author-skills — guidance for writing great SKILL.md files",
          value: "author-skills",
          checked: true,
        },
        {
          name: "install-from-github — install skills by copying from GitHub into ~/.genieceo/skills",
          value: "install-from-github",
          checked: true,
        },
        {
          name: "discover-skills — discover community skills (no npx skills add)",
          value: "discover-skills",
          checked: true,
        },
      ],
    })) as string[];

    const overwriteSkills = await confirm({
      message: "Overwrite existing built-in skills if they already exist?",
      default: false,
    });

    const installRes = await installBuiltinSkills(workspaceRoot, builtinSkills, { overwrite: overwriteSkills });
    if (installRes.installed.length > 0) {
      console.log(`Installed skills into ~/.genieceo/skills/: ${installRes.installed.join(", ")}`);
    }
    if (installRes.skipped.length > 0) {
      console.log(
        `Skipped ${installRes.skipped.length} skill(s):\n` +
          installRes.skipped.map((s) => `- ${s.name}: ${s.reason}`).join("\n")
      );
    }
  }

  const accessMode =
    selectedSteps.includes("access")
      ? await select<"protected" | "free">({
          message: "Filesystem access mode for tools (file tools + run_command).",
          choices: [
            { name: "Completely free (default) — allow access to any path", value: "free" },
            { name: "Protected — only allow ~/.genieceo and the current folder", value: "protected" },
          ],
          default: (config.execution?.fileAccessMode as any) === "protected" ? "protected" : "free",
        })
      : ((config.execution?.fileAccessMode as any) === "protected" ? "protected" : "free");

  const webSearch = selectedSteps.includes("websearch") ? await pickWebSearchOrder(config.webSearch) : config.webSearch;

  const gateway = selectedSteps.includes("gateway")
    ? {
        host: (await input({
          message: "Gateway bind host (default: 127.0.0.1).",
          default: config.gateway?.host ?? "127.0.0.1",
        })).trim() || "127.0.0.1",
        port: Number(
          (await input({
            message: "Gateway port (default: 18790).",
            default: String(config.gateway?.port ?? 18790),
            validate: (v) => {
              const n = Number(v);
              if (!Number.isFinite(n) || !Number.isInteger(n)) return "Must be an integer";
              if (n < 1 || n > 65535) return "Must be between 1 and 65535";
              return true;
            },
          })).trim()
        ),
        pluginsDir: (await input({
          message: "Plugins directory override (optional). Leave empty for ~/.genieceo/plugins.",
          default: config.gateway?.pluginsDir ?? "",
        })).trim() || undefined,
      }
    : config.gateway;

  const channels = { ...(config.channels ?? {}) } as any;
  if (selectedSteps.includes("channels")) {
    const enabled = (await checkbox<"telegram">({
      message: "Select channels to enable/configure.",
      choices: [{ name: "Telegram webhook (Bot API)", value: "telegram", checked: Boolean(channels.telegram?.enabled) }],
    })) as ("telegram")[];

    if (enabled.includes("telegram")) {
      const botToken = (await password({ message: "Telegram bot token (required).", mask: "*" })).trim();
      const webhookSecretToken = (await password({
        message: "Telegram webhook secret token (optional but recommended).",
        mask: "*",
      })).trim();

      channels.telegram = {
        ...(channels.telegram ?? {}),
        enabled: true,
        botToken: botToken || channels.telegram?.botToken,
        webhookSecretToken: webhookSecretToken || channels.telegram?.webhookSecretToken,
      };
    } else if (channels.telegram?.enabled) {
      // If user didn't select it, disable it.
      channels.telegram = { ...(channels.telegram ?? {}), enabled: false };
    }
  }

  const profiles: Record<string, LlmProfile> = { ...(config.llm?.profiles ?? {}) };

  let activeProfile: string | undefined = config.llm?.activeProfile;
  if (selectedSteps.includes("llm")) {
    const alreadyHasProfiles = Object.keys(profiles).length > 0;
    let addFirst = true;
    if (alreadyHasProfiles) {
      addFirst = await confirm({ message: "Add a new LLM profile?", default: false });
    }

    // Configure 0+ profiles (but require at least 1 overall).
    if (addFirst || !alreadyHasProfiles) {
      while (true) {
        const profile = await configureProfile();
        if (!profile) {
          if (Object.keys(profiles).length > 0) {
            const done = await confirm({ message: "No profile added. Finish LLM setup?", default: true });
            if (done) break;
            continue;
          }
          const again = await confirm({ message: "No profile added yet. Try again?", default: true });
          if (!again) throw new Error("At least one LLM profile is required to use `genieceo chat`.");
          continue;
        }

        const suggested = defaultProfileName(profiles, profile);
        const name = (await input({
          message: "Profile name (used to select active profile).",
          default: suggested,
          validate: (v) => {
            const s = v.trim();
            if (!s) return "Required";
            if (profiles[s]) return "Name already exists";
            return true;
          },
        })).trim();

        profiles[name] = profile;

        const addMore = await confirm({ message: "Add another LLM profile?", default: false });
        if (!addMore) break;
      }
    }

    const profileNames = Object.keys(profiles);
    if (profileNames.length === 0) {
      throw new Error("No LLM profiles configured. Please run onboard again and add at least one profile.");
    }

    activeProfile = await select<string>({
      message: "Select the active LLM profile to use for `genieceo chat`.",
      choices: profileNames.map((n) => ({ name: n, value: n })),
      default: activeProfile && profileNames.includes(activeProfile) ? activeProfile : profileNames[0],
    });
  }

  if (Object.keys(profiles).length === 0) {
    throw new Error(
      "No LLM profiles configured. Please run `genieceo onboard` and select the 'LLM profiles' step to add at least one profile."
    );
  }

  if (!activeProfile || !Object.prototype.hasOwnProperty.call(profiles, activeProfile)) {
    // Safety fallback: keep config valid even if activeProfile was removed/invalid.
    activeProfile = Object.keys(profiles)[0];
  }

  const updated: GenieCeoConfig = {
    ...config,
    version: 2,
    webSearch,
    llm: {
      activeProfile,
      profiles,
    },
    execution: {
      ...config.execution,
      fileAccessMode: accessMode,
      shellAccessMode: accessMode,
    },
    gateway,
    channels,
  };

  await saveConfig(updated, workspaceRoot);
  console.log("Saved configuration to ~/.genieceo/config.json");
}

