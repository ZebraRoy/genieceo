import type { GenieCeoConfig } from "../config/schema.js";

export type ToolExecutionContext = {
  workspaceRoot: string;
  /**
   * The directory where `genieceo chat` was launched from.
   * Used as the default working directory for shell execution.
   */
  invocationCwd: string;
  config: GenieCeoConfig;
};

