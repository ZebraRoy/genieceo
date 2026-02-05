/**
 * Shared TypeScript types for genieceo
 */

export interface Config {
  workspace: string;
  model: string;
  maxIterations: number;
  llm: {
    openai: {
      apiKey: string;
    };
    anthropic?: {
      apiKey: string;
    };
  };
  tools: {
    webSearch: {
      provider?: 'auto' | 'brave' | 'tavily' | 'browser';
      brave?: {
        apiKey: string;
      };
      tavily?: {
        apiKey: string;
      };
      // Legacy support for old config format
      apiKey?: string;
    };
    shell: {
      timeout: number;
      allowDangerous: boolean;
    };
  };
}

export interface Skill {
  name: string;
  description: string;
  content: string;
  metadata?: {
    always?: boolean;
    requires?: {
      bins?: string[];
      config?: string[]; // Config paths like 'llm.openai.apiKey' or 'tools.webSearch.apiKey'
    };
  };
}

export interface Tool {
  name: string;
  description: string;
  parameters: any; // Zod schema
  execute(params: any): Promise<any>;
}

// ============================================================================
// GenieCEO Multi-Agent System Types
// ============================================================================

/**
 * Staff definition (completely flexible - no rigid roles)
 * Define staff based on actual needs: api-builder, debugger, security-auditor, etc.
 */
export interface StaffDefinition {
  name: string; // e.g., "api-builder", "debugger", "security-auditor"
  description: string; // < 200 tokens - GenieCEO reads when choosing
  prompt: string; // Full system prompt
  model?: string; // "fast" | "inherit" | specific model
  allowedTools?: string[]; // Tool restrictions
  readonly?: boolean; // Prevent writes

  // Context engineering
  maxSummaryTokens?: number; // Default: 2000
  savePlanFile?: boolean; // Save detailed findings? Default: true
}

/**
 * Staff process (ephemeral execution)
 * Represents a running staff instance working on a task
 */
export interface StaffProcess {
  id: string; // "api-builder-a3f2"
  staffName: string;
  status: 'spawning' | 'working' | 'completed' | 'failed';
  task: string;
  spawnedAt: Date;
  completedAt?: Date;

  // Context tracking
  summaryTokens?: number; // Actual tokens returned
  planFilePath?: string; // Where detailed work saved
  result?: string; // Condensed summary
  error?: string;
}

/**
 * Service process (long-running applications)
 * GenieCEO can build and run applications on the user's computer
 */
export interface ServiceProcess {
  id: string; // "webhook-server-3f2a"
  name: string; // Human-readable
  type: 'web-server' | 'api' | 'webhook' | 'daemon' | 'other';
  pid?: number; // System process ID
  port?: number;
  status: 'starting' | 'running' | 'stopped' | 'crashed' | 'restarting';
  startedAt: Date;
  stoppedAt?: Date;
  healthCheckUrl?: string; // For monitoring
  autoRestart?: boolean;
  restartCount?: number;
  logFile?: string; // Path to logs
  workingDir?: string;
  command?: string; // Start command
  env?: Record<string, string>; // Environment variables
}

/**
 * Context budget tracker
 * Keeps GenieCEO's context under 50K tokens via auto-compaction at 45K
 */
export interface ContextBudget {
  genieCEOCurrentTokens: number;
  genieCEOMaxTokens: number; // 50K limit
  lastCompactionAt?: Date;
  compactionCount: number;
}

/**
 * Daily log entry
 * Append-only log for tracking decisions, task results, learnings
 */
export interface DailyLogEntry {
  timestamp: Date;
  type: 'decision' | 'task_result' | 'learning' | 'conversation' | 'service_event';
  actor: 'genieceo' | 'user' | string; // Process ID for staff
  content: string;
  metadata?: Record<string, any>;
}

/**
 * Message interface for conversation history
 */
export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
  metadata?: Record<string, any>;
}
