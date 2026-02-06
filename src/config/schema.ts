import { z } from "zod";

export const WebSearchProviderSchema = z.enum(["brave", "tavily", "duckduckgo"]);

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
  })
  .default({ shell: { enabled: true, allowedRoots: [] } });

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
  })
  .default({ profiles: {} });

const WebSearchSchema = z
  .object({
    order: z.array(WebSearchProviderSchema).default(["brave", "tavily", "duckduckgo"]),
    braveApiKey: z.string().min(1).optional(),
    tavilyApiKey: z.string().min(1).optional(),
  })
  .default({ order: ["brave", "tavily", "duckduckgo"] });

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
  execution: ExecutionSchema,
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
  };
}, ConfigV2Schema);

export type GenieCeoConfig = z.infer<typeof ConfigSchema>;
export type LlmProfile = z.infer<typeof LlmProfileSchema>;

export function getDefaultConfig(): GenieCeoConfig {
  return ConfigSchema.parse({ version: 2 });
}

