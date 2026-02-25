import { checkbox, confirm, input, password, select } from "@inquirer/prompts";
import {
  complete,
  getModel,
  getModels,
  getProviders,
} from "@mariozechner/pi-ai";
import { stat } from "node:fs/promises";

import { loadConfig, saveConfig } from "../config/store.js";
import type { GenieCeoConfig, LlmProfile } from "../config/schema.js";
import {
  ensureWorkspace,
  installBuiltinSkills,
} from "../workspace/bootstrap.js";
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

async function pickWebSearchOrder(
  existing: GenieCeoConfig["webSearch"],
): Promise<{
  order: WebSearchProvider[];
  braveApiKey?: string;
  tavilyApiKey?: string;
}> {
  const enabled = (await checkbox<WebSearchProvider>({
    message:
      "Select enabled web search providers (space to toggle, enter to confirm).",
    choices: [
      {
        name: providerLabel("brave"),
        value: "brave",
        checked: existing.order.includes("brave"),
      },
      {
        name: providerLabel("tavily"),
        value: "tavily",
        checked: existing.order.includes("tavily"),
      },
      {
        name: providerLabel("duckduckgo"),
        value: "duckduckgo",
        checked: existing.order.includes("duckduckgo"),
      },
    ],
    validate: (vals) =>
      vals.length === 0 ? "Select at least one provider." : true,
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
      choices: Array.from(remaining).map((p) => ({
        name: providerLabel(p),
        value: p,
      })),
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

async function healthCheckProfile(
  profile: LlmProfile,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const baseModel = getModel(
      profile.provider as any,
      profile.model as any,
    ) as any;
    const model = profile.apiBase
      ? { ...baseModel, baseUrl: profile.apiBase }
      : baseModel;

    const msg = await complete(
      model,
      {
        systemPrompt: "You are a health check. Reply with exactly: OK",
        messages: [
          { role: "user", content: "OK", timestamp: Date.now() },
        ] as any,
      },
      {
        apiKey: profile.apiKey,
        temperature: 0,
        maxTokens: 16,
      },
    );

    if (msg.stopReason === "error")
      return { ok: false, error: msg.errorMessage ?? "unknown error" };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ? String(e.message) : String(e) };
  }
}

async function pickModelForProvider(
  provider: string,
  defaultModel?: string,
): Promise<string> {
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
    ? (
        await input({
          message: "Enter model id (exact).",
          validate: (v) => (v.trim() ? true : "Required"),
        })
      ).trim()
    : modelChoice;
}

async function configureProfile(
  initial: Partial<LlmProfile> = {},
): Promise<LlmProfile | null> {
  const providers = getProviders();
  const provider = await select<string>({
    message: "Select an LLM provider to configure.",
    choices: providers.map((p) => ({ name: p, value: p })),
    default: initial.provider,
  });

  let model = await pickModelForProvider(provider, initial.model);
  let apiKey = (
    await password({
      message: `API key for ${provider} (leave empty to use env vars).`,
      mask: "*",
    })
  ).trim();
  if (!apiKey && initial.apiKey) apiKey = initial.apiKey;

  let apiBase = (
    await input({
      message:
        "Custom API base URL (optional, for OpenAI-compatible endpoints).",
      default: initial.apiBase ?? "",
    })
  ).trim();

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
      apiKey = (
        await password({
          message: `API key for ${provider} (leave empty for env vars).`,
          mask: "*",
        })
      ).trim();
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

function defaultProfileName(
  profiles: Record<string, LlmProfile>,
  profile: LlmProfile,
): string {
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

  type SetupStep =
    | "skills"
    | "access"
    | "websearch"
    | "llm"
    | "gateway"
    | "channels";

  const existingProfiles = Object.keys(config.llm?.profiles ?? {}).length;
  const configPath = getConfigPath(workspaceRoot);
  const hasConfigFile = await exists(configPath);

  const selectedSteps = (await checkbox<SetupStep>({
    message:
      "Select setup steps to run (space to toggle, enter to confirm). Skipped steps keep existing configuration.",
    choices: [
      {
        name: "Built-in skills (install/overwrite)",
        value: "skills",
        checked: false,
      },
      {
        name: "Filesystem access mode (protected vs free)",
        value: "access",
        checked: false,
      },
      {
        name: "Web search providers + API keys",
        value: "websearch",
        checked: false,
      },
      {
        name: "LLM profiles (providers/models/keys) + active profile",
        value: "llm",
        checked: existingProfiles === 0, // required on first setup
      },
      {
        name: "Gateway (daemon) settings (host/port/plugins dir)",
        value: "gateway",
        checked: false,
      },
      {
        name: "Channels (Telegram/webhooks/etc.)",
        value: "channels",
        checked: false,
      },
    ],
  })) as SetupStep[];

  if (hasConfigFile && selectedSteps.length === 0) {
    console.log(
      "No steps selected. Will save config as-is (normalized) for migration/upgrade.",
    );
  }

  if (selectedSteps.includes("skills")) {
    const builtinSkills = (await checkbox<string>({
      message:
        "Select built-in skills to install (space to toggle, enter to confirm).",
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

    const installRes = await installBuiltinSkills(
      workspaceRoot,
      builtinSkills,
      { overwrite: overwriteSkills },
    );
    if (installRes.installed.length > 0) {
      console.log(
        `Installed skills into ~/.genieceo/skills/: ${installRes.installed.join(", ")}`,
      );
    }
    if (installRes.skipped.length > 0) {
      console.log(
        `Skipped ${installRes.skipped.length} skill(s):\n` +
          installRes.skipped.map((s) => `- ${s.name}: ${s.reason}`).join("\n"),
      );
    }
  }

  const accessMode = selectedSteps.includes("access")
    ? await select<"protected" | "free">({
        message: "Filesystem access mode for tools (file tools + run_command).",
        choices: [
          {
            name: "Completely free (default) — allow access to any path",
            value: "free",
          },
          {
            name: "Protected — only allow ~/.genieceo and the current folder",
            value: "protected",
          },
        ],
        default:
          (config.execution?.fileAccessMode as any) === "protected"
            ? "protected"
            : "free",
      })
    : (config.execution?.fileAccessMode as any) === "protected"
      ? "protected"
      : "free";

  const webSearch = selectedSteps.includes("websearch")
    ? await pickWebSearchOrder(config.webSearch)
    : config.webSearch;

  const gateway = selectedSteps.includes("gateway")
    ? {
        host:
          (
            await input({
              message: "Gateway bind host (default: 127.0.0.1).",
              default: config.gateway?.host ?? "127.0.0.1",
            })
          ).trim() || "127.0.0.1",
        port: Number(
          (
            await input({
              message: "Gateway port (default: 3000).",
              default: String(config.gateway?.port ?? 3000),
              validate: (v) => {
                const n = Number(v);
                if (!Number.isFinite(n) || !Number.isInteger(n))
                  return "Must be an integer";
                if (n < 1 || n > 65535) return "Must be between 1 and 65535";
                return true;
              },
            })
          ).trim(),
        ),
        pluginsDir:
          (
            await input({
              message:
                "Plugins directory override (optional). Leave empty for ~/.genieceo/plugins.",
              default: config.gateway?.pluginsDir ?? "",
            })
          ).trim() || undefined,
        // Preserve fields not covered by the prompt.
        token: config.gateway?.token,
        autostartServices: Array.isArray(
          (config.gateway as any)?.autostartServices,
        )
          ? ((config.gateway as any).autostartServices as string[])
          : [],
        hotReload: (config.gateway as any)?.hotReload ?? {
          enabled: true,
          intervalMs: 2000,
        },
      }
    : config.gateway;

  const channels = { ...(config.channels ?? {}) } as any;
  if (selectedSteps.includes("channels")) {
    const enabled = (await checkbox<"telegram" | "discord" | "line">({
      message: "Select channels to enable/configure.",
      choices: [
        {
          name: "Telegram webhook (Bot API)",
          value: "telegram",
          checked: Boolean(channels.telegram?.enabled),
        },
        {
          name: "Discord webhook (Bot API)",
          value: "discord",
          checked: Boolean(channels.discord?.enabled),
        },
        {
          name: "Line Messaging API",
          value: "line",
          checked: Boolean(channels.line?.enabled),
        },
      ],
    })) as ("telegram" | "discord" | "line")[];

    if (enabled.includes("telegram")) {
      const botToken = (
        await password({ message: "Telegram bot token (required).", mask: "*" })
      ).trim();
      const webhookSecretToken = (
        await password({
          message: "Telegram webhook secret token (optional but recommended).",
          mask: "*",
        })
      ).trim();

      const publicDomain = (
        await input({
          message:
            "Public domain for webhook (e.g., https://yourdomain.com or https://xxx.trycloudflare.com).",
          default: (channels.telegram as any)?.publicDomain ?? "",
          validate: (v) => {
            const trimmed = v.trim();
            if (!trimmed)
              return "Required - Telegram needs a public URL to send webhooks";
            if (
              !trimmed.startsWith("http://") &&
              !trimmed.startsWith("https://")
            ) {
              return "Must start with http:// or https://";
            }
            return true;
          },
        })
      ).trim();

      const existingParseMode = String(
        (channels.telegram as any)?.parse_mode ??
          (channels.telegram as any)?.parseMode ??
          "",
      ).trim();
      const parseModeChoice = await select<
        "__none__" | "HTML" | "MarkdownV2" | "Markdown"
      >({
        message:
          "Telegram parse_mode for outgoing messages (optional; affects formatting).",
        choices: [
          { name: "None (plain text)", value: "__none__" },
          { name: "HTML", value: "HTML" },
          { name: "MarkdownV2", value: "MarkdownV2" },
          { name: "Markdown (legacy)", value: "Markdown" },
        ],
        default:
          existingParseMode === "HTML" ||
          existingParseMode === "MarkdownV2" ||
          existingParseMode === "Markdown"
            ? (existingParseMode as any)
            : "__none__",
      });
      const parseMode =
        parseModeChoice === "__none__" ? undefined : parseModeChoice;

      const downloadMedia = await confirm({
        message:
          "Download inbound Telegram attachments (images/voice/video/files) into ~/.genieceo/media/?",
        default: (channels.telegram as any)?.downloadMedia !== false,
      });
      const mediaDir = (
        await input({
          message:
            "Telegram media directory override (optional). Leave empty for ~/.genieceo/media.",
          default: String((channels.telegram as any)?.mediaDir ?? ""),
        })
      ).trim();
      const maxDownloadMb = downloadMedia
        ? (
            await input({
              message:
                "Telegram max attachment download size in MB (per file, default: 20).",
              default: String(
                Math.max(
                  1,
                  Math.round(
                    Number((channels.telegram as any)?.maxDownloadBytes ?? 20 * 1024 * 1024) /
                      (1024 * 1024),
                  ),
                ),
              ),
              validate: (v) => {
                const n = Number(v);
                if (!Number.isFinite(n) || n <= 0) return "Must be a positive number";
                return true;
              },
            })
          ).trim()
        : "";
      const maxDownloadBytes =
        downloadMedia && maxDownloadMb
          ? Math.floor(Number(maxDownloadMb) * 1024 * 1024)
          : undefined;

      const shouldRegisterWebhook = await confirm({
        message: "Automatically register webhook with Telegram now?",
        default: true,
      });

      channels.telegram = {
        ...(channels.telegram ?? {}),
        enabled: true,
        botToken: botToken || channels.telegram?.botToken,
        webhookSecretToken:
          webhookSecretToken || channels.telegram?.webhookSecretToken,
        publicDomain: publicDomain,
        downloadMedia,
        mediaDir: mediaDir || undefined,
        maxDownloadBytes,
        // Always overwrite so selecting "None" clears the config key.
        parse_mode: parseMode,
        // Prefer snake_case (matches Telegram API); clear any legacy key.
        parseMode: undefined,
      };

      if (shouldRegisterWebhook && botToken) {
        try {
          const webhookUrl = `${publicDomain}/webhooks/telegram`;
          const payload: any = { url: webhookUrl };
          if (webhookSecretToken) {
            payload.secret_token = webhookSecretToken;
          }

          const res = await fetch(
            `https://api.telegram.org/bot${botToken}/setWebhook`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
            },
          );

          const result = await res.json();
          if (result.ok) {
            console.log(`✓ Webhook registered: ${webhookUrl}`);
          } else {
            console.log(
              `✗ Webhook registration failed: ${result.description || "unknown error"}`,
            );
            console.log(
              "  You can manually register it later using the curl command in README.md",
            );
          }
        } catch (e: any) {
          console.log(`✗ Error registering webhook: ${e.message}`);
          console.log(
            "  You can manually register it later using the curl command in README.md",
          );
        }
      }
    } else if (channels.telegram?.enabled) {
      channels.telegram = { ...(channels.telegram ?? {}), enabled: false };
    }

    if (enabled.includes("discord")) {
      const botToken = (
        await password({ message: "Discord bot token (required).", mask: "*" })
      ).trim();
      const webhookSecret = (
        await password({
          message: "Discord webhook secret (optional but recommended).",
          mask: "*",
        })
      ).trim();

      const downloadMedia = await confirm({
        message:
          "Download inbound Discord attachments (images/voice/video/files) into ~/.genieceo/media/?",
        default: (channels.discord as any)?.downloadMedia !== false,
      });
      const mediaDir = (
        await input({
          message:
            "Discord media directory override (optional). Leave empty for ~/.genieceo/media.",
          default: String((channels.discord as any)?.mediaDir ?? ""),
        })
      ).trim();
      const maxDownloadMb = downloadMedia
        ? (
            await input({
              message:
                "Discord max attachment download size in MB (per file, default: 20).",
              default: String(
                Math.max(
                  1,
                  Math.round(
                    Number((channels.discord as any)?.maxDownloadBytes ?? 20 * 1024 * 1024) /
                      (1024 * 1024),
                  ),
                ),
              ),
              validate: (v) => {
                const n = Number(v);
                if (!Number.isFinite(n) || n <= 0) return "Must be a positive number";
                return true;
              },
            })
          ).trim()
        : "";
      const maxDownloadBytes =
        downloadMedia && maxDownloadMb
          ? Math.floor(Number(maxDownloadMb) * 1024 * 1024)
          : undefined;

      channels.discord = {
        ...(channels.discord ?? {}),
        enabled: true,
        botToken: botToken || channels.discord?.botToken,
        webhookSecret: webhookSecret || channels.discord?.webhookSecret,
        downloadMedia,
        mediaDir: mediaDir || undefined,
        maxDownloadBytes,
      };
    } else if (channels.discord?.enabled) {
      channels.discord = { ...(channels.discord ?? {}), enabled: false };
    }

    if (enabled.includes("line")) {
      const channelAccessToken = (
        await password({
          message: "Line channel access token (required).",
          mask: "*",
        })
      ).trim();
      const channelSecret = (
        await password({
          message: "Line channel secret (required).",
          mask: "*",
        })
      ).trim();

      channels.line = {
        ...(channels.line ?? {}),
        enabled: true,
        channelAccessToken:
          channelAccessToken || channels.line?.channelAccessToken,
        channelSecret: channelSecret || channels.line?.channelSecret,
      };
    } else if (channels.line?.enabled) {
      channels.line = { ...(channels.line ?? {}), enabled: false };
    }
  }

  const profiles: Record<string, LlmProfile> = {
    ...(config.llm?.profiles ?? {}),
  };

  let activeProfile: string | undefined = config.llm?.activeProfile;
  if (selectedSteps.includes("llm")) {
    const alreadyHasProfiles = Object.keys(profiles).length > 0;
    let addFirst = true;
    if (alreadyHasProfiles) {
      addFirst = await confirm({
        message: "Add a new LLM profile?",
        default: false,
      });
    }

    // Configure 0+ profiles (but require at least 1 overall).
    if (addFirst || !alreadyHasProfiles) {
      while (true) {
        const profile = await configureProfile();
        if (!profile) {
          if (Object.keys(profiles).length > 0) {
            const done = await confirm({
              message: "No profile added. Finish LLM setup?",
              default: true,
            });
            if (done) break;
            continue;
          }
          const again = await confirm({
            message: "No profile added yet. Try again?",
            default: true,
          });
          if (!again)
            throw new Error(
              "At least one LLM profile is required to use `genieceo chat`.",
            );
          continue;
        }

        const suggested = defaultProfileName(profiles, profile);
        const name = (
          await input({
            message: "Profile name (used to select active profile).",
            default: suggested,
            validate: (v) => {
              const s = v.trim();
              if (!s) return "Required";
              if (profiles[s]) return "Name already exists";
              return true;
            },
          })
        ).trim();

        profiles[name] = profile;

        const addMore = await confirm({
          message: "Add another LLM profile?",
          default: false,
        });
        if (!addMore) break;
      }
    }

    const profileNames = Object.keys(profiles);
    if (profileNames.length === 0) {
      throw new Error(
        "No LLM profiles configured. Please run onboard again and add at least one profile.",
      );
    }

    activeProfile = await select<string>({
      message: "Select the active LLM profile to use for `genieceo chat`.",
      choices: profileNames.map((n) => ({ name: n, value: n })),
      default:
        activeProfile && profileNames.includes(activeProfile)
          ? activeProfile
          : profileNames[0],
    });
  }

  if (Object.keys(profiles).length === 0) {
    throw new Error(
      "No LLM profiles configured. Please run `genieceo onboard` and select the 'LLM profiles' step to add at least one profile.",
    );
  }

  if (
    !activeProfile ||
    !Object.prototype.hasOwnProperty.call(profiles, activeProfile)
  ) {
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
