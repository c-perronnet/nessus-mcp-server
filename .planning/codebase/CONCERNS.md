# Concerns

## Real API Not Implemented

**Severity: High** | Affects: `src/nessus-api.ts`

Every API function throws `"Real API not implemented"` when mock mode is disabled. The server only works with mock data. This is the primary gap — the core purpose of an MCP server for Nessus is to interface with a real Nessus instance.

Functions affected:
- `getScanTemplates()`
- `startScan()`
- `getScanStatus()`
- `getScanResults()`
- `listScans()`
- `getVulnerabilityDetails()`
- `checkApiStatus()`

## No Automated Tests

**Severity: Medium** | Affects: entire codebase

No test framework, test files, or test scripts. Changes have no automated safety net. See `TESTING.md` for details.

## Input Validation Gaps

**Severity: Medium** | Affects: `src/tools/scans.ts`

- `startScanToolHandler` creates `zod` schemas (`targetSchema`, `scanTypeSchema`) but never uses them for validation — instead calls `validateTarget()` and `validateScanType()` from error-handling utilities. The zod imports/schemas are dead code.
- `searchVulnerabilitiesToolHandler` does inline validation instead of using shared validation utilities, inconsistent with other handlers.

## Type Safety

**Severity: Low** | Affects: `src/tools/scans.ts`, `src/tools/vulnerabilities.ts`

- `formatScanResults()` and `formatVulnerabilityDetails()` accept `any` typed parameters, bypassing TypeScript's strict mode benefits.
- Tool handler args are typed as `Record<string, unknown>` — functional but requires runtime validation for every field.

## Module-Level Mutable State

**Severity: Low** | Affects: `src/nessus-api.ts`

- `config` is a module-level mutable variable reassigned by `initializeNessusApi()`. This works for a single-instance server but could cause issues if the module were imported in tests or multiple contexts.
- `mockScans` in `src/mock-data.ts` uses a mutable `Map` at module scope for scan state.

## Security Considerations

**Severity: Low** | Current state

- API keys (`NESSUS_ACCESS_KEY`, `NESSUS_SECRET_KEY`) are read from environment variables — good practice.
- No TLS certificate validation configuration for when real Nessus API is implemented (Nessus often uses self-signed certs).
- `console.log` used in `nessus-api.ts` for initialization messages (could leak to stdout alongside MCP transport) vs `console.error` used correctly in `index.ts`.

## Missing Features for Production Use

**Severity: Info** | Affects: overall

- No rate limiting or request throttling for Nessus API calls
- No retry logic for transient API failures
- No connection pooling or keep-alive management
- No scan result caching
- No pagination support for large scan lists
- `node-fetch` dependency may be unnecessary (Node 18+ has built-in `fetch`)
