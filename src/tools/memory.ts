/**
 * Memory Tools
 * Tools for working memory and long-term memory management
 */

import { z } from 'zod';
import { ToolRegistry } from './base';
import { GenieCEOMemoryStore } from '../memory/ceo';
import { LongTermMemory } from '../memory/long-term';

export function registerMemoryTools(
  registry: ToolRegistry,
  ceoMemory: GenieCEOMemoryStore,
  longTermMemory: LongTermMemory
) {
  // Remember (working memory)
  registry.register({
    name: 'remember',
    description: 'Store a value in working memory for quick access. Use sparingly - prefer files for important data.',
    parameters: z.object({
      key: z.string().describe('Memory key'),
      value: z.any().describe('Value to store'),
    }),
    async execute(params) {
      await ceoMemory.remember(params.key, params.value);
      return `✓ Remembered: ${params.key}`;
    },
  });

  // Recall (working memory)
  registry.register({
    name: 'recall',
    description: 'Recall a value from working memory',
    parameters: z.object({
      key: z.string().describe('Memory key'),
    }),
    async execute(params) {
      const value = await ceoMemory.recall(params.key);
      
      if (value === undefined) {
        return `No memory found for key: ${params.key}`;
      }
      
      return typeof value === 'object' 
        ? JSON.stringify(value, null, 2)
        : String(value);
    },
  });

  // Forget (working memory)
  registry.register({
    name: 'forget',
    description: 'Remove a value from working memory',
    parameters: z.object({
      key: z.string().describe('Memory key'),
    }),
    async execute(params) {
      await ceoMemory.forget(params.key);
      return `✓ Forgot: ${params.key}`;
    },
  });

  // List memory keys
  registry.register({
    name: 'listMemoryKeys',
    description: 'List all working memory keys',
    parameters: z.object({}),
    async execute() {
      const keys = ceoMemory.getMemoryKeys();
      
      if (keys.length === 0) {
        return 'No items in working memory';
      }
      
      return `# Working Memory Keys (${keys.length})\n\n${keys.map(k => `- ${k}`).join('\n')}`;
    },
  });

  // Curate to long-term memory
  registry.register({
    name: 'curateMemory',
    description: 'Save important learnings, patterns, or knowledge to long-term memory. Organized by sections.',
    parameters: z.object({
      section: z.string().describe('Section name (e.g., "User Preferences", "Staff Patterns", "Best Practices")'),
      content: z.string().describe('Content to save'),
      mode: z.enum(['append', 'replace']).optional().describe('append = add to section, replace = overwrite section (default: append)'),
    }),
    async execute(params) {
      const mode = params.mode || 'append';
      
      if (mode === 'append') {
        await longTermMemory.append(params.section, params.content);
        return `✓ Added to long-term memory: ${params.section}`;
      } else {
        await longTermMemory.updateSection(params.section, params.content);
        return `✓ Updated long-term memory: ${params.section}`;
      }
    },
  });

  // Read long-term memory
  registry.register({
    name: 'readLongTermMemory',
    description: 'Read long-term memory (entire file or specific section)',
    parameters: z.object({
      section: z.string().optional().describe('Specific section to read (optional)'),
    }),
    async execute(params) {
      if (params.section) {
        return await longTermMemory.getSection(params.section);
      }
      
      return await longTermMemory.read();
    },
  });

  // Search long-term memory
  registry.register({
    name: 'searchMemory',
    description: 'Search long-term memory for content matching a query',
    parameters: z.object({
      query: z.string().describe('Search query'),
    }),
    async execute(params) {
      return await longTermMemory.search(params.query);
    },
  });

  // List memory sections
  registry.register({
    name: 'listMemorySections',
    description: 'List all sections in long-term memory',
    parameters: z.object({}),
    async execute() {
      const sections = await longTermMemory.listSections();
      
      if (sections.length === 0) {
        return 'No sections in long-term memory yet';
      }
      
      return `# Long-term Memory Sections (${sections.length})\n\n${sections.map(s => `- ${s}`).join('\n')}`;
    },
  });
}
