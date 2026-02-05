---
name: coding
description: Best practices for writing clean, maintainable, and efficient code
metadata:
  always: false
---

# Coding Skill

Guidelines for writing high-quality code across all languages.

## General Principles

### 1. Write Clear, Readable Code
- Use descriptive variable and function names
- Keep functions small and focused (one responsibility)
- Add comments for complex logic, not obvious code
- Follow consistent formatting and style

### 2. Handle Errors Properly
- Check for error conditions
- Provide meaningful error messages
- Use try-catch blocks where appropriate
- Don't silently fail

### 3. Test Your Code
- Write tests for critical functionality
- Test edge cases and error conditions
- Verify inputs and outputs
- Use the `executeCommand` tool to run tests

### 4. Keep It Simple
- Don't over-engineer solutions
- Avoid premature optimization
- Use standard libraries when possible
- Follow language idioms

## Code Organization

### File Structure
```
project/
├── src/           # Source code
├── tests/         # Test files
├── docs/          # Documentation
└── README.md      # Project overview
```

### Module Design
- Group related functionality
- Minimize dependencies between modules
- Use clear interfaces/APIs
- Document public functions

## Language-Specific Tips

### JavaScript/TypeScript
- Use `const` by default, `let` when needed
- Prefer arrow functions for callbacks
- Use async/await over promises chains
- Enable strict mode in TypeScript

### Python
- Follow PEP 8 style guide
- Use list comprehensions appropriately
- Handle exceptions with specific types
- Use type hints in Python 3.5+

### General Best Practices
- Validate inputs
- Use meaningful variable names
- Keep functions short (< 50 lines)
- Write self-documenting code
- Version control everything

## Code Review Checklist

Before finalizing code:
- [ ] Does it work correctly?
- [ ] Is it readable?
- [ ] Are there tests?
- [ ] Is error handling adequate?
- [ ] Are there security concerns?
- [ ] Is performance acceptable?
- [ ] Is documentation clear?

## Using Tools Effectively

### Reading Code
```javascript
readFile({ path: "src/module.ts" })
```

### Writing Code
```javascript
writeFile({
  path: "src/new-feature.ts",
  content: "// Your code here"
})
```

### Running Tests
```javascript
executeCommand({ command: "npm test" })
```

### Searching for Solutions
```javascript
webSearch({
  query: "how to implement feature X in language Y",
  count: 5
})
```

## Remember

- **Correctness** > Cleverness
- **Simplicity** > Complexity  
- **Maintainability** > Performance (usually)
- **Working code** > Perfect code

Ship code that works, then improve it.
