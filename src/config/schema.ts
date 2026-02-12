import { z } from "zod";

export const WebSearchProviderSchema = z.enum(["brave", "tavily", "duckduckgo"]);

const AccessModeSchema = z.enum(["protected", "free"]);

const ExecutionShellSchema = z
  .object({
    enabled: z.boolean().default(true),
    /**
     * Absolute paths that shell commands are allowed to run within.
     * If empty, the GenieCEO workspace root and the invocation working directory are allowed.
     */
    allowedRoots: z.array(z.string().min(1)).default([]),
  })
  .default({ enabled: true, allowedRoots: [] });

const ExecutionSchema = z
  .object({
    shell: ExecutionShellSchema,
    /**
     * Controls where the built-in file tools are allowed to read/write/edit/list.
     *
     * - free (default): allow any path (including absolute paths outside the workspace)
     * - protected: only allow paths within the workspace root and the invocation cwd
     */
    fileAccessMode: AccessModeSchema.default("free"),
    /**
     * Controls where `run_command` is allowed to execute.
     *
     * Note: If `execution.shell.allowedRoots` is non-empty, it always overrides this mode.
     */
    shellAccessMode: AccessModeSchema.default("free"),
  })
  .default({ shell: { enabled: true, allowedRoots: [] }, fileAccessMode: "free", shellAccessMode: "free" });

const LlmProfileSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  apiKey: z.string().min(1).optional(),
  apiBase: z.string().min(1).optional(),
});

const LlmConfigV2Schema = z
  .object({
    activeProfile: z.string().min(1).optional(),
    profiles: z.record(z.string().min(1), LlmProfileSchema).default({}),
    /**
     * Max bytes per inbound image to embed into the LLM prompt (base64).
     * If unset, GenieCEO uses a conservative default.
     */
    maxImageBytes: z.number().int().min(1).optional(),
  })
  .default({ profiles: {} });

const WebSearchSchema = z
  .object({
    order: z.array(WebSearchProviderSchema).default(["brave", "tavily", "duckduckgo"]),
    braveApiKey: z.string().min(1).optional(),
    tavilyApiKey: z.string().min(1).optional(),
  })
  .default({ order: ["brave", "tavily", "duckduckgo"] });

const MemoryFlushSchema = z
  .object({
    enabled: z.boolean().default(true),
    /**
     * Rough, character-based threshold to trigger a silent "memory flush" turn
     * (OpenClaw-style pre-compaction reminder).
     *
     * This is an approximation (not token-accurate) but works well enough to
     * prevent important facts from being lost in long sessions.
     */
    softThresholdChars: z.number().int().min(10_000).default(120_000),
    /**
     * Also trigger by message count (useful when messages are short but numerous).
     */
    softThresholdMessages: z.number().int().min(10).default(80),
    /**
     * After a flush, don't flush again until the history grows by at least this delta.
     */
    deltaChars: z.number().int().min(1_000).default(25_000),
    deltaMessages: z.number().int().min(1).default(20),
    /**
     * Minimum interval between flush attempts per conversation.
     */
    minIntervalMs: z.number().int().min(0).default(5 * 60 * 1000),
    /**
     * Bound tool-loop iterations for the flush turn to avoid infinite loops.
     */
    maxToolIterations: z.number().int().min(1).max(20).default(6),
  })
  .default({
    enabled: true,
    softThresholdChars: 120_000,
    softThresholdMessages: 80,
    deltaChars: 25_000,
    deltaMessages: 20,
    minIntervalMs: 5 * 60 * 1000,
    maxToolIterations: 6,
  });

const MemorySchema = z
  .object({
    flush: MemoryFlushSchema,
  })
  .default({ flush: MemoryFlushSchema.parse({}) });

const GatewaySchema = z
  .object({
    host: z.string().min(1).default("127.0.0.1"),
    port: z.number().int().min(1).max(65535).default(3000),
    /**
     * Optional shared token for non-channel endpoints (future use).
     */
    token: z.string().min(1).optional(),
    /**
     * Override where the gateway loads plugins from.
     * Default is ~/.genieceo/plugins.
     */
    pluginsDir: z.string().min(1).optional(),
    /**
     * Optional list of managed services (by name) to ensure are running when the gateway starts.
     * These correspond to records under ~/.genieceo/services/<name>.json created by the service tools.
     */
    autostartServices: z.array(z.string().min(1)).default([]),
  })
  .default({ host: "127.0.0.1", port: 3000, autostartServices: [] });

/**
 * Channel configs are intentionally open-ended so new channels/plugins can
 * extend config.json without requiring a GenieCEO core release.
 *
 * Convention: each channel config includes { enabled: boolean, ... }.
 */
const ChannelsSchema = z.record(z.string().min(1), z.any()).default({});

const ConfigV1Schema = z.object({
  version: z.literal(1).default(1),
  llm: z
    .object({
      provider: z.string().min(1).optional(),
      model: z.string().min(1).optional(),
      apiKey: z.string().min(1).optional(),
      apiBase: z.string().min(1).optional(),
    })
    .default({}),
  webSearch: WebSearchSchema,
  telemetry: z.boolean().optional(),
});

const ConfigV2Schema = z.object({
  version: z.literal(2).default(2),
  llm: LlmConfigV2Schema,
  webSearch: WebSearchSchema,
  memory: MemorySchema,
  execution: ExecutionSchema,
  gateway: GatewaySchema,
  channels: ChannelsSchema,
  telemetry: z.boolean().optional(),
});

export const ConfigSchema = z.preprocess((val) => {
  if (!val || typeof val !== "object") return val;
  const v: any = val as any;
  const version = v.version ?? 1;
  if (version === 2) return v;

  // Migrate v1 -> v2
  const parsedV1 = ConfigV1Schema.safeParse({ ...v, version: 1 });
  if (!parsedV1.success) return v;

  const provider = parsedV1.data.llm.provider;
  const model = parsedV1.data.llm.model;
  const apiKey = parsedV1.data.llm.apiKey;
  const apiBase = parsedV1.data.llm.apiBase;

  const profiles: Record<string, z.infer<typeof LlmProfileSchema>> = {};
  let activeProfile: string | undefined;

  if (provider && model) {
    profiles.default = { provider, model, apiKey, apiBase };
    activeProfile = "default";
  }

  return {
    ...parsedV1.data,
    version: 2,
    llm: {
      activeProfile,
      profiles,
    },
    gateway: GatewaySchema.parse({}),
    memory: MemorySchema.parse({}),
    channels: {},
  };
}, ConfigV2Schema);

export type GenieCeoConfig = z.infer<typeof ConfigSchema>;
export type LlmProfile = z.infer<typeof LlmProfileSchema>;

export function getDefaultConfig(): GenieCeoConfig {
  return ConfigSchema.parse({ version: 2 });
}

