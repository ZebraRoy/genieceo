# Bootstrap File System

## Problem

Previously, genieceo had architecture knowledge and guidelines **hardcoded** in `src/agent/index.ts`. This created tight coupling:

- User asks about LINE integration
- Agent gives wrong answer (suggesting OpenAI Assistants API)
- We fix it by hardcoding LINE-specific knowledge
- Next time: different problem, need different hardcoded fix

**This doesn't scale!**

## Solution: nanobot's Bootstrap Pattern

Inspired by [nanobot](https://github.com/HKUDS/nanobot), genieceo now uses a **modular prompt system** with bootstrap files.

### Architecture

```
System Prompt = Core Identity + Bootstrap Files + Skills + Tools

Core Identity (code):
  - Minimal, essential only
  - Current time, workspace path
  - Basic capability list

Bootstrap Files (workspace):
  - AGENTS.md     → Behavior guidelines, patterns
  - TOOLS.md      → Complete tool documentation
  - IDENTITY.md   → Personality, communication style

Skills (workspace):
  - Custom skills in skills/ directory

Tools (code):
  - Tool definitions from registry
```

### Key Principles

1. **Separation of Concerns**
   - Code = minimal identity + infrastructure
   - Files = behavior, knowledge, customization

2. **User Customization**
   - Users can edit bootstrap files
   - Changes take effect immediately
   - No code changes needed

3. **No Hardcoding**
   - Architecture knowledge → AGENTS.md
   - Integration patterns → AGENTS.md
   - Tool usage → TOOLS.md
   - Personality → IDENTITY.md

4. **Progressive Enhancement**
   - Start with defaults
   - Users add what they need
   - Files grow with experience

## Bootstrap Files

### AGENTS.md

**Purpose**: Agent behavior guidelines and architectural knowledge

**Contains**:
- Core principles (be concise, ask for clarification)
- Architecture explanation (how the agent works)
- Integration patterns (webhooks, messaging platforms)
- Working patterns (when to delegate, when to handle directly)
- Memory management guidelines

**User customization**:
- Add project-specific guidelines
- Document team conventions
- Add domain-specific patterns

### TOOLS.md

**Purpose**: Complete tool documentation and usage patterns

**Contains**:
- Tool signatures and parameters
- Safety features and limitations
- Usage examples
- Best practices

**User customization**:
- Add custom tool documentation
- Document tool combinations
- Add project-specific tool patterns

### IDENTITY.md

**Purpose**: Personality and communication style

**Contains**:
- Core identity definition
- Communication style preferences
- Delegation guidelines
- Learning and adaptation patterns

**User customization**:
- Adjust communication style
- Set personality traits
- Define interaction preferences

## Benefits

### 1. Decoupling
- Code doesn't know about specific problems (LINE, Telegram, etc.)
- Bootstrap files contain domain knowledge
- Easy to update without code changes

### 2. Flexibility
- Users customize agent behavior per workspace
- Different projects can have different guidelines
- Team-specific conventions documented

### 3. Maintainability
- Guidelines in markdown, not code
- Easy to review and update
- Version controlled with project

### 4. Scalability
- Add new patterns to AGENTS.md as needed
- No code changes for new use cases
- Knowledge accumulates over time

## Example: LINE Integration

**Before** (hardcoded):
```typescript
// In src/agent/index.ts
const systemPrompt = `
**For messaging platform integrations** (LINE, Telegram):
- Build webhook service
- Call agent.run(messageText)
...
`;
```

**After** (bootstrap file):
```markdown
<!-- In workspace/AGENTS.md -->
## Integration Patterns

For messaging platforms (LINE, Telegram, Discord):
- Build webhook services that receive platform events
- Extract message content from webhook payloads
- Process messages through your agent loop
- Return responses via platform APIs
```

**Result**:
- No LINE-specific code
- Works for any messaging platform
- Users can add their own patterns
- Scales to all integration types

## Migration Path

### For Existing Users

Your existing workspace will be updated when you:
1. Run `genieceo init` (creates missing bootstrap files)
2. Existing files preserved (your customizations safe)
3. New files created from templates

### For New Users

Bootstrap files created automatically:
1. `genieceo init` → creates workspace + bootstrap files
2. Edit AGENTS.md, TOOLS.md, IDENTITY.md as needed
3. Changes take effect immediately

## Best Practices

### 1. Keep Core Identity Minimal
- Only essential info in code
- Everything else in bootstrap files

### 2. Document Patterns
- Add successful patterns to AGENTS.md
- Document team conventions
- Share knowledge across projects

### 3. Customize per Project
- Each workspace can have unique guidelines
- Project-specific patterns in AGENTS.md
- Tool configurations in TOOLS.md

### 4. Version Control
- Commit bootstrap files with project
- Team shares knowledge
- Guidelines evolve with project

## Implementation Details

### Template Location
```
src/templates/
  ├── AGENTS.md      # Default agent guidelines
  ├── TOOLS.md       # Default tool documentation
  └── IDENTITY.md    # Default personality
```

### Workspace Location
```
~/.genieceo/workspace/
  ├── AGENTS.md      # User-customized guidelines
  ├── TOOLS.md       # User-customized docs
  ├── IDENTITY.md    # User-customized personality
  ├── skills/        # Custom skills
  └── ...
```

### Loading Order
1. Core identity (code) - minimal, essential
2. Bootstrap files (workspace) - behavior, knowledge
3. Skills (workspace) - specialized capabilities
4. Tools (code) - tool definitions

## Future Extensions

### Possible Additions
- USER.md - User preferences and history
- SOUL.md - Deeper personality traits
- PROJECT.md - Project-specific context
- TEAM.md - Team conventions

### Per-Directory Overrides
- Project-specific AGENTS.md
- Override workspace defaults
- Inherit and extend patterns

## Conclusion

The bootstrap file system provides:
- **Decoupling**: No hardcoded domain knowledge
- **Flexibility**: Users customize behavior
- **Scalability**: Patterns accumulate over time
- **Maintainability**: Guidelines in markdown

This is the **general principle** that prevents the LINE integration problem and all similar issues.
