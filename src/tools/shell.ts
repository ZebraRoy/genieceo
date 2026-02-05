import { exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import type { Tool } from '../types';
import type { Config } from '../types';

const execAsync = promisify(exec);

/**
 * Dangerous command patterns to block
 */
const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\/[^\/\s]*/,  // rm -rf /...
  /rm\s+-rf\s+~\/?$/,        // rm -rf ~
  /rm\s+-rf\s+\*$/,          // rm -rf *
  /:\(\)\{\s*:\|\:&\s*\};:/, // fork bomb
  /mkfs/,                     // format disk
  /dd\s+if=.*\s+of=\/dev/,   // overwrite disk
  />\s*\/dev\/sd[a-z]/,      // write to disk device
  /chmod\s+-R\s+777\s+\//,   // chmod 777 on root
  /sudo\s+rm/,                // sudo rm
  /curl.*\|\s*sh/,            // curl | sh
  /wget.*\|\s*sh/,            // wget | sh
];

/**
 * Check if a command is dangerous
 */
function isDangerous(command: string): boolean {
  return DANGEROUS_PATTERNS.some(pattern => pattern.test(command));
}

/**
 * Execute Command Tool
 * Executes shell commands with safety checks
 */
export function createExecuteCommandTool(config: Config): Tool {
  return {
    name: 'executeCommand',
    description: 'Execute a shell command. The command runs in the workspace files directory by default. Returns stdout, stderr, and exit code.',
    parameters: z.object({
      command: z.string().describe('The shell command to execute'),
      workingDir: z.string().optional().describe('Working directory (default: workspace files directory)'),
    }),
    execute: async (params: { command: string; workingDir?: string }) => {
      try {
        // Safety check: block dangerous commands
        if (!config.tools.shell.allowDangerous && isDangerous(params.command)) {
          return {
            success: false,
            error: 'Command blocked: potentially dangerous operation detected',
            command: params.command,
          };
        }

        // Execute command with timeout
        const { stdout, stderr } = await execAsync(params.command, {
          cwd: params.workingDir || config.workspace + '/files',
          timeout: config.tools.shell.timeout,
          maxBuffer: 1024 * 1024 * 10, // 10MB
        });

        return {
          success: true,
          command: params.command,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          workingDir: params.workingDir || config.workspace + '/files',
        };
      } catch (error: any) {
        return {
          success: false,
          command: params.command,
          error: error.message || String(error),
          stdout: error.stdout?.trim() || '',
          stderr: error.stderr?.trim() || '',
          exitCode: error.code,
        };
      }
    },
  };
}
