---
phase: 01-safety-and-correctness
plan: 02
subsystem: api
tags: [mcp, stdio, zod, environment-variables]

# Dependency graph
requires:
  - phase: 01-safety-and-correctness/01
    provides: "tsconfig with Node 22 + native fetch"
provides:
  - "Stdout-clean MCP server (no console.log in src/)"
  - "Fail-fast credential guard (exits 1 on missing env vars)"
  - "Clean scans.ts without dead Zod schemas"
affects: [02-real-api-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: ["stderr-only logging for MCP stdio servers", "fail-fast env var validation at startup"]

key-files:
  created: []
  modified: [src/nessus-api.ts, src/tools/scans.ts, src/index.ts]

key-decisions:
  - "Mock mode kept callable in nessus-api.ts for test isolation but no longer auto-activated"
  - "Credential guard placed inside initializeApi() which runs before createServer()"

patterns-established:
  - "All logging via console.error (never console.log) to preserve MCP stdio framing"
  - "Startup validation: exit(1) with actionable error listing missing env vars"

requirements-completed: [SAFE-01, SAFE-02, SAFE-05]

# Metrics
duration: 1min
completed: 2026-04-02
---

# Phase 1 Plan 2: Production Blockers Summary

**Eliminated stdout contamination, dead code, and silent mock fallback -- server now fails fast with actionable errors on missing credentials**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-02T14:44:48Z
- **Completed:** 2026-04-02T14:45:51Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Replaced all console.log with console.error in src/ to prevent MCP JSON-RPC framing corruption
- Removed dead Zod schema declarations and unused zod import from scans.ts
- Added fail-fast credential guard that exits with code 1 and lists missing env vars

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix stdout contamination in nessus-api.ts** - `00c38b8` (fix)
2. **Task 2: Remove dead Zod schemas from scans.ts** - `6ba427d` (fix)
3. **Task 3: Add fail-fast credential guard to index.ts** - `6f96961` (feat)

## Files Created/Modified
- `src/nessus-api.ts` - console.log replaced with console.error
- `src/tools/scans.ts` - Dead Zod schemas and unused import removed
- `src/index.ts` - Fail-fast credential guard with process.exit(1)

## Decisions Made
- Mock mode branch kept in nessus-api.ts (callable for tests) but no longer auto-activated from index.ts
- Credential guard placed inside initializeApi() before createServer() per existing code structure

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All src/ files now use stderr-only logging, safe for MCP stdio transport
- Server requires NESSUS_URL, NESSUS_ACCESS_KEY, NESSUS_SECRET_KEY to start
- Phase 1 complete; ready for Phase 2 real API integration

---
*Phase: 01-safety-and-correctness*
*Completed: 2026-04-02*
