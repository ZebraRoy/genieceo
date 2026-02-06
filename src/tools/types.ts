import type { GenieCeoConfig } from "../config/schema.js";

export type ToolExecutionContext = {
  workspaceRoot: string;
  config: GenieCeoConfig;
};

