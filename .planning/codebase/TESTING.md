# Testing

## Current State

**No testing infrastructure exists.** There are no test files, test frameworks, or test scripts configured.

### What's Missing
- No test framework (jest, vitest, mocha, etc.)
- No test files or `__tests__/` directories
- No `test` script in `package.json`
- No coverage tooling
- No CI/CD test pipeline

## Mock Data as Implicit Testing

The codebase uses `src/mock-data.ts` as a built-in mock layer for manual testing:
- Mock scan templates, scans, and vulnerability data
- Controlled by `NESSUS_URL`, `NESSUS_ACCESS_KEY`, `NESSUS_SECRET_KEY` env vars
- When env vars are absent, the server runs in mock mode automatically

This enables manual functional testing via MCP clients without a real Nessus instance, but provides no automated verification.

## Validation Functions

`src/utils/error-handling.ts` contains input validation functions that could serve as a foundation for unit tests:
- `validateScanId()` - string presence and type check
- `validateVulnerabilityId()` - string presence and type check
- `validateTarget()` - IP/hostname regex validation
- `validateScanType()` - enum membership check

## Recommendations

### Priority Test Targets
1. **Validation functions** in `src/utils/error-handling.ts` - pure functions, easy to test
2. **Tool handlers** in `src/tools/scans.ts` and `src/tools/vulnerabilities.ts` - mock mode makes these testable without external deps
3. **Error mapping** in `handleNessusApiError()` - ensure all error types map correctly to MCP error codes
