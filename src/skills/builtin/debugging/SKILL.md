---
name: debugging
description: Systematic approach to identifying and fixing issues in code and systems
metadata:
  always: false
---

# Debugging Skill

Follow this systematic debugging process to identify and fix issues efficiently.

## 1. Reproduce the Problem

- Understand what the expected behavior is
- Identify what's actually happening
- Try to reproduce the issue consistently
- Note any error messages or unexpected output

## 2. Gather Information

Use the available tools:
- `readFile` to examine relevant code files
- `executeCommand` to run diagnostics or tests
- `listDir` to check file structure
- `webSearch` to look up error messages or similar issues

## 3. Form Hypotheses

Based on the information:
- What could be causing this behavior?
- What are the most likely culprits?
- What assumptions might be wrong?

## 4. Test Hypotheses

- Start with the most likely cause
- Make one change at a time
- Test after each change
- Document what you tried

## 5. Fix and Verify

Once you find the issue:
- Implement the fix
- Test thoroughly
- Check for side effects
- Verify the original problem is solved

## Common Debugging Scenarios

### Syntax Errors
- Read the error message carefully
- Check the line number mentioned
- Look for typos, missing brackets, or semicolons

### Runtime Errors
- Check variable initialization
- Verify function arguments
- Look for null/undefined references
- Check array bounds

### Logic Errors
- Add logging/print statements
- Verify assumptions about data
- Test edge cases
- Check conditions in if/while statements

### Performance Issues
- Profile the code
- Look for nested loops
- Check for unnecessary computations
- Examine database queries

## Best Practices

1. **Isolate the problem**: Narrow down where the issue occurs
2. **Use version control**: Check when the bug was introduced
3. **Read documentation**: Verify you're using APIs correctly
4. **Take breaks**: Fresh perspective helps
5. **Ask for help**: Use webSearch or consult documentation
