# Codebase Structure

**Analysis Date:** 2026-04-02

## Directory Layout

```
nessus-mcp-server/
├── src/                    # TypeScript source code
│   ├── index.ts           # MCP server entry point and request routing
│   ├── nessus-api.ts      # API abstraction layer (mock/real Nessus)
│   ├── mock-data.ts       # Sample vulnerability and scan data
│   ├── tools/             # Tool schemas and handlers
│   │   ├── scans.ts       # Scan-related tools (list, start, status, results)
│   │   └── vulnerabilities.ts # Vulnerability-related tools (details, search)
│   └── utils/             # Shared utilities
│       └── error-handling.ts # Error types, validation, error mapping
├── build/                 # Compiled JavaScript (generated, not in git)
├── package.json          # Node.js project manifest
├── package-lock.json     # Dependency lock file
├── tsconfig.json         # TypeScript compiler configuration
├── LICENSE               # Project license
├── glama.json           # Project metadata (AI/LLM tools)
└── README.md            # Project documentation
```

## Directory Purposes

**src/**
- Purpose: All TypeScript source files for the Nessus MCP server
- Contains: Server initialization, tool definitions, API client, utilities
- Key files: `index.ts` (entry), `nessus-api.ts` (core), `mock-data.ts` (test data)

**src/tools/**
- Purpose: Tool implementations (schemas and handlers)
- Contains: Scan tools and vulnerability tools, each with schema and handler function
- Key files: `scans.ts` (7 tools), `vulnerabilities.ts` (2 tools)
- Pattern: One file per domain (scans vs vulnerabilities)

**src/utils/**
- Purpose: Reusable utilities and cross-cutting concerns
- Contains: Error handling, validation functions, type definitions
- Key files: `error-handling.ts` (error types, validators, error mapping)

**build/**
- Purpose: Compiled JavaScript output from TypeScript compiler
- Contains: .js files mirroring src/ structure
- Generated: Yes (by `npm run build`)
- Committed: No (in .gitignore)

## Key File Locations

**Entry Points:**
- `src/index.ts`: Main server executable (shebang line, CLI entry, async main function)
- `build/index.js`: Compiled entry point (referenced in package.json bin field)

**Configuration:**
- `tsconfig.json`: TypeScript compiler settings (ES2022 target, strict mode, Node16 module)
- `package.json`: Project metadata, scripts, dependencies

**Core Logic:**
- `src/nessus-api.ts`: API client abstraction, mock/real routing, configuration management
- `src/tools/scans.ts`: Scan-related tool schemas and handlers (list, start, status, results, list)
- `src/tools/vulnerabilities.ts`: Vulnerability tool schemas and handlers (details, search)

**Testing & Mock Data:**
- `src/mock-data.ts`: Mock scan templates, vulnerabilities, scan state simulation

**Utilities:**
- `src/utils/error-handling.ts`: Error type enum, error creation/mapping, input validators

## Naming Conventions

**Files:**
- Pattern: `kebab-case.ts` for regular modules, `PascalCase.ts` for classes/types (none currently)
- Examples: `error-handling.ts`, `mock-data.ts`, `nessus-api.ts`

**Directories:**
- Pattern: `kebab-case` or `lowercase` plural for grouping
- Examples: `src/tools/`, `src/utils/`

**Functions & Variables:**
- Pattern: `camelCase` for functions and variables
- Tool naming: `[operation][Domain]Tool[Schema|Handler]` in tools files
- Examples: `listScanTemplatesToolSchema`, `startScanToolHandler`
- Validator naming: `validate[Entity]` pattern
- Examples: `validateScanId()`, `validateTarget()`

**Types & Interfaces:**
- Pattern: `PascalCase` or `UPPER_SNAKE_CASE` for enums
- Examples: `NessusConfig` (interface), `NessusErrorType` (enum)

**Constants:**
- Pattern: `camelCase` for exported data objects, `UPPER_SNAKE_CASE` for true constants
- Examples: `scanTemplates`, `vulnerabilities`, `severityLevels` (all mock data exports)

## Where to Add New Code

**New Tool (Scan-related):**
- Primary implementation: `src/tools/scans.ts`
  - Add tool schema object: `export const [operation]ScanToolSchema = { name, description, inputSchema }`
  - Add handler function: `export const [operation]ScanToolHandler = async (args) => {}`
  - Both follow existing patterns (validation, try-catch, error handling)
- API layer: `src/nessus-api.ts`
  - Add function: `export const [operation]Scan = async (...) => {}`
  - Include mock/real branching on `config.useMock`
- Router: `src/index.ts`
  - Add case in `CallToolRequestSchema` handler switch statement
  - Add schema to tools array in `ListToolsRequestSchema` handler
- Tests: Create `src/tools/scans.test.ts` if/when test framework added

**New Tool (Vulnerability-related):**
- Primary implementation: `src/tools/vulnerabilities.ts`
- API layer: `src/nessus-api.ts`
- Router: `src/index.ts` (update switch and schema list)
- Follow same pattern as scan tools

**New Utility:**
- Create: `src/utils/[feature].ts`
- Export: All public functions/types
- Import: Where needed (lazily if possible to reduce coupling)

**Mock Data Enhancement:**
- Location: `src/mock-data.ts`
- Pattern: Export constant arrays/objects, update type annotations
- Use by: API layer when `config.useMock` is true

**Error Handling Enhancement:**
- Location: `src/utils/error-handling.ts`
- Add new error type: Update `NessusErrorType` enum
- Add validator: Follow existing `validate*` pattern
- Update mapping: Ensure new types handled in `createNessusError()` switch

## Special Directories

**build/**
- Purpose: TypeScript compilation output
- Generated: Yes (by tsc via npm run build)
- Committed: No (listed in .gitignore)
- Content: Mirrored directory structure with .js files

**node_modules/**
- Purpose: Installed dependencies
- Generated: Yes (by npm install)
- Committed: No (in .gitignore)
- Size: Standard Node packages, @modelcontextprotocol SDK, zod, TypeScript

**.git/**
- Purpose: Git repository metadata
- Generated: Yes (git init)
- Committed: No (repository tracking)

**.planning/**
- Purpose: GSD planning and codebase documentation
- Generated: Yes (by GSD tools)
- Committed: Typically yes (best practices documentation)
- Content: ARCHITECTURE.md, STRUCTURE.md, etc.

## Module Export Patterns

**Tools Module** (`src/tools/scans.ts`, `src/tools/vulnerabilities.ts`):
- Export: Schemas and handlers as named exports
- Pattern: `export const [toolName]ToolSchema = {...}`
- Pattern: `export const [toolName]ToolHandler = async (...) => {...}`
- Used by: `src/index.ts` imports all schemas and handlers

**API Module** (`src/nessus-api.ts`):
- Export: `initializeNessusApi()`, `getScanTemplates()`, `startScan()`, etc.
- Pattern: All async functions with standardized signatures
- Config: Stored in module-scoped variable, accessed via `config` object

**Utilities Module** (`src/utils/error-handling.ts`):
- Export: `NessusErrorType` enum, error functions, validator functions
- Used by: Tools and main server for error handling and validation

## Environment & Configuration

**Environment Variables** (checked in `src/index.ts`):
- `NESSUS_URL`: Base URL of real Nessus API (optional)
- `NESSUS_ACCESS_KEY`: API access key (optional)
- `NESSUS_SECRET_KEY`: API secret key (optional)
- If all three present: Uses real API mode
- If any missing: Falls back to mock mode

**Build Output:**
- Command: `npm run build` (runs `tsc && chmod 755 build/index.js`)
- Output: `build/` directory with compiled JavaScript
- Executable: `build/index.js` marked as executable via chmod

**CLI Execution:**
- Via npm: `npm start` or `npm run dev`
- Via node: `node build/index.js`
- Via bin: `nessus-server` (requires global npm install or npm link)

---

*Structure analysis: 2026-04-02*
