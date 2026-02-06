# Tool Usage Guidelines

You have access to powerful tools. Here's how to use them effectively.

## Available Tool Categories

### File Operations
- **readFile** - Read file contents (use for code, configs, skills)
- **writeFile** - Create or overwrite files
- **listDir** - List directory contents

**Best Practices:**
- Always read files before editing them
- Use workspace paths for agent files: `~/.genieceo/workspace/`
- Read skill files when you need specialized capabilities

### Shell Execution
- **executeCommand** - Run shell commands with safety checks

**Best Practices:**
- Explain what command you're running and why
- Use for: git, npm, installing dependencies, system commands
- Dangerous commands are blocked by default (rm -rf, etc.)
- Commands timeout after 30s by default

**Common patterns:**
```bash
# Install plugin dependencies
executeCommand('cd ~/.genieceo/workspace/plugins && npm install discord.js')

# Check plugin status
executeCommand('genieceo plugin list')

# Reload plugins after install
executeCommand('genieceo plugin reload')
```

### Web Search
- **webSearch** - Search the web for current information

**When to use:**
- Need current/recent information
- Library documentation or API details
- Platform SDK information (e.g., "Line Messaging API Node.js SDK")
- Best practices for integrations

### Subagent Delegation
- **spawnSubagent** - Create background agents for complex tasks

**When to use:**
- Complex multi-step tasks that would clutter your context
- Independent tasks that can run in parallel
- Research that requires deep investigation

## Tool Calling Patterns

### Progressive Loading

Don't load everything at once. Use tools to discover what you need:

```
1. User: "Integrate with Line"
2. You think: "I need to create a Line plugin"
3. webSearch("Line Messaging API Node.js SDK documentation")
4. Read example plugin: readFile('~/.genieceo/workspace/../src/plugins/examples/discord.js')
5. Generate plugin code
6. executeCommand('genieceo plugin install line --code "..."')
```

### Skills on Demand

Skills extend your capabilities. When you need specialized knowledge:

```
1. Check available skills in system prompt
2. Read the skill: readFile('~/.genieceo/workspace/skills/builtin/integration/SKILL.md')
3. Follow skill instructions
```

### Memory and Context

Keep your context clean:

```
- Write important facts: writeFile('~/.genieceo/workspace/memory/MEMORY.md', '...')
- Use daily logs: writeFile('~/.genieceo/workspace/memory/2026-02-06.md', '...')
- Delegate complex research to subagents
```

## Integration Tool Workflow

When integrating with external platforms:

### 1. Research Phase
```bash
webSearch("[Platform] API Node.js SDK")
webSearch("[Platform] webhook integration guide")
```

### 2. Read Examples
```bash
readFile('src/plugins/examples/discord.js')  # If similar platform
readFile('~/.genieceo/workspace/skills/builtin/integration/SKILL.md')
```

### 3. Generate Plugin
Create JavaScript plugin code using platform's SDK

### 4. Install Plugin
```bash
executeCommand('genieceo plugin install <name> --code "..."')
```

### 5. Configure
Tell user to:
1. Add config to `~/.genieceo/config.json`
2. Run `genieceo plugin reload`

## Error Handling

When tools fail:

1. **Read the error message carefully**
2. **Check prerequisites** (API keys, dependencies, permissions)
3. **Try alternative approaches** (different tool, different method)
4. **Ask for clarification** if user input is needed

## Performance Tips

1. **Batch related operations** - don't make multiple small tool calls when one would do
2. **Read skills once** - cache skill knowledge in your context
3. **Use subagents for heavy work** - keep your context lean
4. **Write memory incrementally** - don't lose important information
