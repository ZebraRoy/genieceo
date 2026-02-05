---
name: planning
description: Break down complex tasks into manageable steps and coordinate subagents
metadata:
  always: false
---

# Planning Skill

When faced with a complex task, follow this systematic approach:

## 1. Understand the Task

- Read the user's request carefully
- Ask clarifying questions if anything is ambiguous
- Identify the end goal and success criteria

## 2. Break Down into Subtasks

- Divide the work into logical, independent steps
- Order steps by dependencies (what must happen first)
- Identify steps that can be parallelized

## 3. Use Subagents for Independent Work

When you have subtasks that are:
- Independent (don't depend on each other)
- Time-consuming (would benefit from parallel execution)
- Well-defined (clear scope and deliverables)

Use `spawnSubagent` to delegate:

```
spawnSubagent({
  task: "Clear, specific description of what needs to be done",
  context: "Any additional information the subagent needs"
})
```

## 4. Execute the Plan

- Complete each step systematically
- Verify results before moving to next step
- Adapt the plan if issues arise

## 5. Review and Deliver

- Verify all requirements are met
- Test the final result
- Summarize what was accomplished

## Example: Building a Web App

Instead of doing everything sequentially:

**Bad Approach:**
1. Set up project structure
2. Write backend API
3. Write frontend
4. Write tests
5. Write documentation

**Good Approach with Subagents:**
1. Set up project structure (main agent)
2. Spawn 3 subagents in parallel:
   - Subagent A: Implement backend API
   - Subagent B: Implement frontend UI
   - Subagent C: Write tests and documentation
3. Main agent integrates and verifies

This parallelizes independent work and completes faster.
