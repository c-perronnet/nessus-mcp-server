# Architecture

**Analysis Date:** 2026-04-02

## Pattern Overview

**Overall:** Model Context Protocol (MCP) Server with Adapter Pattern

**Key Characteristics:**
- MCP-compliant server exposing vulnerability scanning capabilities
- Fallback mechanism: Real Nessus API with mock data default
- Tool-based architecture: Each tool is a discrete, schema-validated operation
- Error handling layer abstracts API-specific errors to MCP error codes
- TypeScript strict mode ensures type safety throughout

## Layers

**Presentation/Protocol Layer:**
- Purpose: Handle MCP communication protocol via stdio
- Location: `src/index.ts` (main server setup, request routing)
- Contains: Server initialization, tool registration, request/response handling
- Depends on: MCP SDK, tool modules, error handling
- Used by: MCP clients (Claude, other MCP consumers)

**Tool Layer:**
- Purpose: Define tool schemas and implement request handlers
- Location: `src/tools/scans.ts`, `src/tools/vulnerabilities.ts`
- Contains: Tool schemas (input/output definitions), handler functions, output formatting
- Depends on: API client, error validation utilities
- Used by: Presentation layer (routing)

**API Abstraction Layer:**
- Purpose: Abstract Nessus API calls with fallback to mock data
- Location: `src/nessus-api.ts`
- Contains: Configuration management, API function implementations
- Depends on: Mock data module
- Used by: Tool handlers

**Data/Mock Layer:**
- Purpose: Provide default test data and scan state management
- Location: `src/mock-data.ts`
- Contains: Vulnerability definitions, scan templates, mock scan simulation
- Depends on: Nothing (leaf module)
- Used by: API abstraction layer

**Utility Layer:**
- Purpose: Cross-cutting concerns (error mapping, input validation)
- Location: `src/utils/error-handling.ts`
- Contains: Error type definitions, error creation/mapping, input validators
- Depends on: MCP SDK types
- Used by: Tool handlers, main server

## Data Flow

**Tool Invocation Flow:**

1. MCP client sends `CallToolRequest` with tool name and arguments
2. Server routes to appropriate handler in `src/index.ts` switch statement
3. Tool handler (e.g., `startScanToolHandler`) receives raw arguments
4. Handler validates inputs via utilities in `src/utils/error-handling.ts`
5. Handler calls API function in `src/nessus-api.ts`
6. API layer checks `config.useMock` flag
   - If mock: calls functions from `src/mock-data.ts`
   - If real: calls real Nessus API (not yet implemented)
7. API returns result data
8. Handler formats result (e.g., markdown output in `src/tools/scans.ts`)
9. Handler returns MCP-compliant response with `content[]` and optional `isError` flag
10. Server sends response back via stdio transport

**Configuration Flow:**

1. Server startup: `initializeApi()` checks environment variables
   - `NESSUS_URL`, `NESSUS_ACCESS_KEY`, `NESSUS_SECRET_KEY`
2. If all present: sets `useMock: false`, expects real API implementation
3. If any missing: sets `useMock: true`, activates mock mode
4. Config stored in module-scoped variable in `src/nessus-api.ts`

**State Management:**
- Mock state: Stored in memory using `Map` for scans in `src/mock-data.ts`
- Mock scan creation: Each `startScan` call generates new ID, stores scan object
- Mock scan status: Simulated progression through states (queued, running, completed)
- Real API: No state management (future concern)

## Key Abstractions

**Tool Schema:**
- Purpose: Define inputs and outputs for MCP tool protocol
- Examples: `listScanTemplatesToolSchema`, `startScanToolSchema` in `src/tools/scans.ts`
- Pattern: Objects with `name`, `description`, `inputSchema` properties

**Tool Handler:**
- Purpose: Execute tool logic and return MCP-compliant responses
- Examples: `listScanTemplatesToolHandler`, `startScanToolHandler` in `src/tools/scans.ts`
- Pattern: Async functions that validate args, call API, format output, catch errors

**API Function:**
- Purpose: Provide abstraction over mock/real Nessus API
- Examples: `getScanTemplates()`, `startScan()` in `src/nessus-api.ts`
- Pattern: Async functions that check `config.useMock` and route accordingly

**Validator:**
- Purpose: Ensure input safety and provide consistent error messages
- Examples: `validateScanId()`, `validateTarget()`, `validateScanType()` in `src/utils/error-handling.ts`
- Pattern: Functions that throw `NessusError` if validation fails

## Entry Points

**Node.js CLI Entry:**
- Location: `src/index.ts` (shebang: `#!/usr/bin/env node`)
- Triggers: `npm start` or direct execution `nessus-server` (via bin field in package.json)
- Responsibilities: Initialize API client, create MCP server, attach stdio transport, handle termination

**MCP Server Entry:**
- Location: Server initialization in `src/index.ts` function `createServer()`
- Triggers: When MCP transport connects
- Responsibilities: Register tools, set up request handlers, listen for tool invocation

## Error Handling

**Strategy:** Convert domain-specific errors to standardized MCP error codes

**Patterns:**

1. **Validation Errors** (`src/utils/error-handling.ts`):
   - Validators throw `NessusError` with specific error type
   - Caught in tool handlers, mapped to `ErrorCode.InvalidParams`
   - Example: missing required argument, invalid IP address format

2. **API Errors** (`src/utils/error-handling.ts`):
   - Nessus API errors (when implemented) caught as generic `Error`
   - Checked for specific error messages ("not found", "invalid scan type")
   - Mapped to appropriate `NessusErrorType` enum
   - Converted to `McpError` with `ErrorCode.InternalError` or `ErrorCode.InvalidParams`

3. **Tool Handler Try-Catch** (`src/tools/*.ts`):
   - All tool handlers wrapped in try-catch
   - Errors passed to `handleNessusApiError()` utility
   - Returned as MCP response with `isError: true`

4. **Server-Level Error Handling** (`src/index.ts`):
   - Main function catches fatal errors, logs, exits
   - Tool call handler catches errors from individual tools

## Cross-Cutting Concerns

**Logging:**
- Approach: Direct to `console.error` (visible in stderr)
- Used for: Startup mode indication ("mock" vs "real API"), server readiness, shutdown
- No structured logging framework

**Validation:**
- Approach: Input validators in `src/utils/error-handling.ts` called before API invocation
- Applied to: scan IDs, vulnerability IDs, targets, scan types
- Type safety: TypeScript enforces function signatures

**Authentication:**
- Approach: Configuration-driven; real API would use access/secret keys (environment variables)
- Current: Mock mode doesn't require auth
- Future: Real API implementation should pass credentials to Nessus endpoints

**Output Formatting:**
- Approach: Tool-specific formatters (markdown output for readability)
- Examples: `formatScanResults()` in `src/tools/scans.ts`, `formatVulnerabilityDetails()` in `src/tools/vulnerabilities.ts`
- Rationale: MCP requires text content; formatted markdown is more useful than raw JSON

---

*Architecture analysis: 2026-04-02*
