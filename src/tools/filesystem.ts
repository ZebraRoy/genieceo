import { readFile as fsReadFile, writeFile as fsWriteFile, readdir, mkdir } from 'fs/promises';
import { z } from 'zod';
import { join, dirname, resolve } from 'path';
import { existsSync } from 'fs';
import type { Tool } from '../types';

/**
 * Read File Tool
 * Reads content from a file
 */
export const readFileTool: Tool = {
  name: 'readFile',
  description: 'Read the contents of a file. Provide the file path relative to the workspace files directory or an absolute path.',
  parameters: z.object({
    path: z.string().describe('Path to the file to read'),
    encoding: z.enum(['utf-8', 'base64']).default('utf-8').optional().describe('File encoding (default: utf-8)'),
  }),
  execute: async (params: { path: string; encoding?: 'utf-8' | 'base64' }) => {
    try {
      const content = await fsReadFile(params.path, params.encoding || 'utf-8');
      return {
        success: true,
        content: content.toString(),
        path: params.path,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        path: params.path,
      };
    }
  },
};

/**
 * Write File Tool
 * Writes content to a file (creates directories if needed)
 */
export const writeFileTool: Tool = {
  name: 'writeFile',
  description: 'Write content to a file. Creates the file if it doesn\'t exist, overwrites if it does. Creates parent directories as needed.',
  parameters: z.object({
    path: z.string().describe('Path to the file to write'),
    content: z.string().describe('Content to write to the file'),
    encoding: z.enum(['utf-8', 'base64']).default('utf-8').optional().describe('File encoding (default: utf-8)'),
  }),
  execute: async (params: { path: string; content: string; encoding?: 'utf-8' | 'base64' }) => {
    try {
      // Ensure parent directory exists
      const dir = dirname(params.path);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }

      await fsWriteFile(params.path, params.content, params.encoding || 'utf-8');
      
      return {
        success: true,
        path: params.path,
        bytes: Buffer.byteLength(params.content, params.encoding || 'utf-8'),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        path: params.path,
      };
    }
  },
};

/**
 * List Directory Tool
 * Lists contents of a directory
 */
export const listDirTool: Tool = {
  name: 'listDir',
  description: 'List the contents of a directory. Returns files and subdirectories.',
  parameters: z.object({
    path: z.string().describe('Path to the directory to list'),
    includeHidden: z.boolean().default(false).optional().describe('Include hidden files (starting with .) (default: false)'),
  }),
  execute: async (params: { path: string; includeHidden?: boolean }) => {
    try {
      const entries = await readdir(params.path, { withFileTypes: true });
      
      const files: string[] = [];
      const directories: string[] = [];
      
      for (const entry of entries) {
        // Skip hidden files if not requested
        if (!params.includeHidden && entry.name.startsWith('.')) {
          continue;
        }
        
        if (entry.isDirectory()) {
          directories.push(entry.name);
        } else {
          files.push(entry.name);
        }
      }
      
      return {
        success: true,
        path: params.path,
        files: files.sort(),
        directories: directories.sort(),
        total: files.length + directories.length,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        path: params.path,
      };
    }
  },
};
