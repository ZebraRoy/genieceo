# GenieCEO Staff Examples

This directory contains example staff definitions to help you get started with GenieCEO's multi-agent system.

## What are Staff?

Staff are flexible agents that handle specific types of work. They:
- Have their own 200K context window (isolated from GenieCEO)
- Return condensed summaries (~2K tokens) to GenieCEO
- Save detailed work to plan files
- Can be anything you need: api-builder, debugger, security-auditor, etc.

## Using Example Staff

To use these examples in your GenieCEO workspace:

1. Start GenieCEO in multi-agent mode:
   ```bash
   genieceo chat --mode genieceo
   ```

2. Define a staff member using the examples:
   ```
   Read the api-builder.md example and define it:
   defineStaff({
     name: "api-builder",
     description: "Builds Express.js/Fastify API servers...",
     prompt: "[copy from api-builder.md]"
   })
   ```

   Or simply tell GenieCEO:
   ```
   "Define an api-builder staff based on examples/staff/api-builder.md"
   ```

3. Spawn the staff to work on a task:
   ```
   spawnStaff({
     staffName: "api-builder",
     task: "Build a REST API for a blog with posts and comments"
   })
   ```

4. Wait for completion:
   ```
   waitForStaff({ processId: "[returned-id]" })
   ```

## Example Staff Included

### api-builder
Researches and builds production-ready REST APIs with:
- Express.js or Fastify
- Authentication and authorization
- Error handling
- Health checks
- CORS, logging, middleware

**Use when**: Creating APIs, webhooks, or HTTP servers

### debugger
Analyzes bugs and implements fixes:
- Traces execution flow
- Identifies root causes
- Applies fixes
- Tests solutions

**Use when**: Code is broken or behaving incorrectly

### codebase-scanner (readonly)
Maps codebase structure and patterns:
- Directory structure
- Key files and purposes
- Code patterns and conventions
- Dependencies
- Architecture overview

**Use when**: Need to understand a new project or codebase

## Creating Your Own Staff

Staff are completely flexible. Create whatever you need:

```markdown
---
name: security-auditor
description: Scans for vulnerabilities and applies security patches
model: inherit
allowedTools: [readFile, writeFile, webSearch]
maxSummaryTokens: 2000
savePlanFile: true
---

You are a Security Specialist...

[Your custom prompt here]
```

**Remember**: All staff must:
1. Read `docs/tasks/context.md` for current state
2. Do their deep work (200K context available)
3. Save detailed findings to plan files
4. Update context.md with 3-line summary
5. Return <= 2K token summary to GenieCEO

## Context Engineering Benefits

- **GenieCEO**: Stays under 50K tokens (clean context)
- **Staff**: Each gets full 200K context (deep work)
- **Savings**: 40x context reduction (staff reads 80K → returns 2K)
- **Scalability**: Spawn many staff without context pollution

## More Examples

Want more examples? Check the plan document or ask GenieCEO:
- deployment-specialist (prepares and deploys apps)
- documentation-writer (understands code, writes docs)
- test-engineer (writes comprehensive tests)
- refactoring-expert (improves code structure)
- performance-optimizer (finds bottlenecks, optimizes)

The possibilities are endless!
