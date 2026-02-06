# Tool Calling Guide (TOOLS)

The runtime provides tools via API tool-calling. This file is **guidance** to help you decide when and how to call them.

## When to use tools
- Use tools when you need to read or modify files.
- Use web search tools when you need up-to-date information.
- If the answer is purely conversational, reply directly without tools.

## Output discipline
- Keep tool arguments minimal and valid.
- After a tool result, continue the task using the new information.

