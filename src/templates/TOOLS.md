# Available Tools

Complete reference for all tools available to genieceo.

## File Operations

### readFile
Read contents of a file.
```
readFile(path: string) -> string
```

### writeFile
Create or overwrite a file.
```
writeFile(path: string, content: string) -> void
```

### listDir
List directory contents.
```
listDir(path: string) -> string[]
```

## Shell Commands

### executeCommand
Run shell commands safely.
```
executeCommand(command: string, workingDir?: string) -> { stdout, stderr, exitCode }
```

**Safety features**:
- Configurable timeout (default 30s)
- Dangerous commands blocked by default
- Workspace restrictions available

## Web Access

### webSearch
Search the web using configured providers (Tavily, Brave, or browser fallback).
```
webSearch(query: string, maxResults?: number) -> SearchResult[]
```

Returns search results with titles, URLs, and content snippets.

## Subagents

### spawnSubagent
Delegate complex tasks to background agents.
```
spawnSubagent(task: string, context?: string) -> SubagentResult
```

Use for time-consuming or complex tasks that can run independently.

## GenieCEO Tools (Multi-Agent Mode)

### Staff Management
- **defineStaff**: Create new staff types (api-builder, debugger, etc.)
- **spawnStaff**: Start staff on a task
- **waitForStaff**: Get completion summary
- **checkStaffStatus**: Check staff progress
- **listStaffTypes**: Show available staff
- **readStaffPlan**: Read detailed findings

### Service Management
- **startService**: Launch web servers, APIs, webhooks, daemons
- **stopService**: Stop running services
- **restartService**: Restart services
- **listServices**: Show all services
- **checkServiceHealth**: Check service status
- **viewServiceLogs**: Debug services

### Memory Tools
- **remember**: Store information in working memory
- **recall**: Retrieve stored information
- **curateMemory**: Save to long-term memory
- **readLongTermMemory**: Access historical knowledge
- **searchMemory**: Search across memories
- **viewContextBudget**: Check token usage

## Customizing Tools

Users can edit this file to document custom tools or change behavior guidelines.
