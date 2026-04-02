# Conventions

## Naming

### Files
- **kebab-case** for all source files: `error-handling.ts`, `nessus-api.ts`, `mock-data.ts`
- Tool modules named by domain: `scans.ts`, `vulnerabilities.ts`

### Functions & Variables
- **camelCase** for functions and variables: `initializeNessusApi`, `getScanTemplates`, `handleNessusApiError`
- Handler functions follow pattern: `{toolName}ToolHandler`
- Schema objects follow pattern: `{toolName}ToolSchema`

### Types & Enums
- **PascalCase** for interfaces and enums: `NessusConfig`, `NessusErrorType`
- Enum members use **UPPER_SNAKE_CASE**: `SCAN_NOT_FOUND`, `API_ERROR`

### MCP Tool Names
- **snake_case** for tool names exposed via MCP: `list_scan_templates`, `get_scan_status`

## Code Style

- **TypeScript strict mode** enabled (`strict: true` in tsconfig.json)
- **ES2022** target with **Node16** module resolution
- **ESM modules** (`"type": "module"` in package.json)
- **2-space indentation** (implicit, consistent across files)
- `.js` extensions on all relative imports: `'./nessus-api.js'`, `'../utils/error-handling.js'`

## Import Organization

1. External packages (`@modelcontextprotocol/sdk`, `zod`)
2. Local modules with relative paths

## Patterns

### Tool Definition
Each MCP tool follows a consistent two-export pattern in `src/tools/`:
```typescript
// Schema object (plain object, not zod)
export const myToolSchema = {
  name: 'my_tool',
  description: 'Tool description',
  inputSchema: { type: 'object', properties: {...}, required: [...] }
};

// Handler function
export const myToolHandler = async (args: Record<string, unknown>) => {
  try {
    // Validate args using error-handling utilities
    // Call nessus-api function
    // Return { content: [{ type: 'text', text: ... }] }
  } catch (error) {
    const mcpError = handleNessusApiError(error);
    return { content: [{ type: 'text', text: `Error: ${mcpError.message}` }], isError: true };
  }
};
```

### Mock/Real API Branching
All API functions in `src/nessus-api.ts` use the same pattern:
```typescript
export const apiFunction = async (...) => {
  if (config.useMock) {
    return mockImplementation(...);
  }
  throw new Error("Real API not implemented");
};
```

### Error Handling
- Centralized in `src/utils/error-handling.ts`
- Custom `NessusErrorType` enum maps to MCP `ErrorCode` values
- `handleNessusApiError()` converts any error to `McpError`
- Validation functions (`validateScanId`, `validateTarget`, etc.) throw typed errors
- Tool handlers catch all errors and return `{ isError: true }` MCP responses

### Logging
- `console.error()` for all server logging (keeps stdout clean for MCP stdio transport)
- No structured logging framework in use

## JSDoc
- All exported functions have JSDoc comments with `@param` tags
- Internal/private functions also documented
