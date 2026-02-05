# Development Guide

## Project Structure

```
genieceo/
├── src/
│   ├── agent/              # Agent core logic
│   │   ├── context.ts      # System prompt builder
│   │   ├── index.ts        # Agent initialization
│   │   ├── loop.ts         # Main agent loop (Vercel AI SDK)
│   │   └── subagent.ts     # Background task delegation
│   ├── cli/                # CLI interface
│   │   ├── commands/       # Command implementations
│   │   │   ├── chat.ts     # Chat command (interactive/single)
│   │   │   ├── init.ts     # Initialize command
│   │   │   └── status.ts   # Status command
│   │   └── index.ts        # CLI entry point (Commander)
│   ├── config/             # Configuration system
│   │   ├── manager.ts      # Config loading/saving
│   │   └── schema.ts       # Zod schemas
│   ├── providers/          # LLM providers
│   │   └── llm.ts          # Vercel AI SDK wrapper
│   ├── skills/             # Skill system
│   │   ├── builtin/        # Built-in skills (markdown)
│   │   │   ├── coding/
│   │   │   ├── debugging/
│   │   │   └── planning/
│   │   └── loader.ts       # Skill loading & management
│   ├── tools/              # Tool implementations
│   │   ├── base.ts         # Tool registry & interface
│   │   ├── filesystem.ts   # readFile, writeFile, listDir
│   │   ├── shell.ts        # executeCommand (with safety)
│   │   ├── spawn.ts        # spawnSubagent
│   │   └── web.ts          # webSearch (Brave)
│   ├── types/              # TypeScript types
│   │   └── index.ts        # Shared types
│   └── workspace/          # Workspace management
│       └── manager.ts      # Workspace initialization
├── package.json
├── tsconfig.json
├── README.md
└── LICENSE
```

## Code Statistics

- **Total Lines**: ~1,941 lines of TypeScript
- **Files**: 19 TypeScript files + 3 skill markdown files
- **Architecture**: Clean, modular, easy to extend

## Building

```bash
npm run build     # Compile TypeScript to dist/
npm run dev       # Watch mode for development
```

## Testing Locally

```bash
# Build
npm run build

# Link for global use
npm link

# Test commands
genieceo init
genieceo status
genieceo chat -m "Hello!"
```

## Key Design Patterns

### 1. Tool Registry Pattern
All tools are registered in a central registry and converted to Vercel AI SDK format:

```typescript
const registry = new ToolRegistry();
registry.register(readFileTool);
const vercelTools = registry.toVercelTools();
```

### 2. Vercel AI SDK Integration
Using `generateText()` with automatic tool calling loop:

```typescript
const result = await generateText({
  model: getModel(),
  messages,
  tools,
  maxSteps: 15  // Automatic iteration
});
```

### 3. Configuration with Zod
Type-safe configuration with runtime validation:

```typescript
const ConfigSchema = z.object({
  workspace: z.string(),
  model: z.string(),
  // ...
});
```

### 4. Skill System
Markdown files with YAML frontmatter:

```markdown
---
name: skill-name
description: What it does
---
# Skill content
```

## Adding a New Tool

1. Create tool file in `src/tools/`:

```typescript
import { z } from 'zod';
import type { Tool } from '../types';

export const myTool: Tool = {
  name: 'myTool',
  description: 'What the tool does',
  parameters: z.object({
    param: z.string(),
  }),
  execute: async (params) => {
    // Implementation
    return { success: true };
  },
};
```

2. Register in `src/agent/index.ts`:

```typescript
import { myTool } from '../tools/mytool';
toolRegistry.register(myTool);
```

## Adding a New LLM Provider

1. Install SDK:
```bash
npm install @ai-sdk/anthropic
```

2. Update `src/providers/llm.ts`:

```typescript
import { createAnthropic } from '@ai-sdk/anthropic';

case 'anthropic':
  const anthropicProvider = createAnthropic({
    apiKey: this.config.llm.anthropic.apiKey,
  });
  return anthropicProvider(model);
```

3. Update config schema in `src/config/schema.ts`

## Adding a New Skill

Create directory in `src/skills/builtin/`:

```
src/skills/builtin/myskill/
└── SKILL.md
```

The skill will be automatically loaded on startup.

## Architecture Benefits

1. **Vercel AI SDK**: Automatic tool calling, provider-agnostic
2. **Modular**: Each component is independent and testable
3. **Type-safe**: TypeScript + Zod for runtime validation
4. **Extensible**: Easy to add tools, skills, providers
5. **Clean**: ~2000 lines vs nanobot's ~4000 lines (50% smaller!)

## Publishing to npm

1. Update version in `package.json`
2. Build: `npm run build`
3. Test: `npm link` and verify
4. Publish: `npm publish`

## Environment Variables

```bash
GENIECEO_LLM_OPENAI_API_KEY       # OpenAI API key
GENIECEO_MODEL                     # Model (e.g., "openai:gpt-4o")
GENIECEO_WORKSPACE                 # Workspace path
GENIECEO_TOOLS_WEBSEARCH_API_KEY  # Brave Search API key
```

## Troubleshooting

### Build Errors
- Run `npm install` to ensure dependencies are installed
- Check TypeScript version: `npm list typescript`

### Runtime Errors
- Verify config: `genieceo status`
- Check API keys are set
- Ensure workspace is initialized: `genieceo init`

### Tool Errors
- Check tool parameters match Zod schema
- Verify workspace path exists
- Check shell command safety patterns

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Build and test: `npm run build && genieceo status`
5. Commit: `git commit -m "Description"`
6. Push: `git push origin feature-name`
7. Create pull request

## Philosophy

- **Simplicity over complexity**
- **Readability over cleverness**
- **Modularity over monoliths**
- **Type safety over duck typing**
- **Convention over configuration**

Keep the codebase small, clean, and understandable!
