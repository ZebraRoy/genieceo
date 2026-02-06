import { checkbox, confirm, input, password, select } from "@inquirer/prompts";
import { complete, getModel, getModels, getProviders } from "@mariozechner/pi-ai";

import { loadConfig, saveConfig } from "../config/store.js";
import type { GenieCeoConfig, LlmProfile } from "../config/schema.js";
import { ensureWorkspace } from "../workspace/bootstrap.js";

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

export async function runOnboard(): Promise<void> {
  await ensureWorkspace();

  const config = await loadConfig();

  const webSearch = await pickWebSearchOrder(config.webSearch);

  const profiles: Record<string, LlmProfile> = { ...(config.llm?.profiles ?? {}) };

  // Configure 1+ profiles (supports multiple models per provider).
  while (true) {
    const profile = await configureProfile();
    if (!profile) {
      const again = await confirm({ message: "No profile added. Try configuring another profile?", default: true });
      if (!again && Object.keys(profiles).length > 0) break;
      if (!again) continue;
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

  const profileNames = Object.keys(profiles);
  if (profileNames.length === 0) {
    throw new Error("No LLM profiles configured. Please run onboard again and add at least one profile.");
  }
  const activeProfile = await select<string>({
    message: "Select the active LLM profile to use for `genieceo chat`.",
    choices: profileNames.map((n) => ({ name: n, value: n })),
    default: config.llm?.activeProfile && profileNames.includes(config.llm.activeProfile) ? config.llm.activeProfile : profileNames[0],
  });

  const updated: GenieCeoConfig = {
    ...config,
    version: 2,
    webSearch: {
      order: webSearch.order,
      braveApiKey: webSearch.braveApiKey,
      tavilyApiKey: webSearch.tavilyApiKey,
    },
    llm: {
      activeProfile,
      profiles,
    },
  };

  await saveConfig(updated);
  console.log("Saved configuration to ~/.genieceo/config.json");
}

