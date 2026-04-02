---
phase: 02-http-client-and-infrastructure
plan: 02
subsystem: api
tags: [http-client, p-retry, p-throttle, tenable-io, rate-limiting, retry]

# Dependency graph
requires:
  - phase: 02-01
    provides: Tenable.io response types and error handling utilities (httpStatusToErrorType, NessusErrorType)
provides:
  - TenableClient class with auth, timeout, retry, and rate-limiting
  - nessus-api.ts wired to TenableClient for all real-API paths
affects: [03-scan-lifecycle, 04-vulnerability-analysis]

# Tech tracking
tech-stack:
  added: [p-retry, p-throttle]
  patterns: [centralized-http-client, module-level-singleton, getClient-guard-pattern]

key-files:
  created: [src/tenable-client.ts]
  modified: [src/nessus-api.ts, src/index.ts, package.json]

key-decisions:
  - "TenableClient created inside initializeNessusApi rather than index.ts to keep wiring internal"
  - "getClient() guard function throws CONFIGURATION_ERROR instead of raw null assertion"
  - "startScan uses single POST /scans call; full create+launch flow deferred to Phase 3"

patterns-established:
  - "Centralized HTTP client: all Tenable.io calls flow through TenableClient.request()"
  - "getClient() guard: null-check with typed error before any API call"
  - "Per-attempt AbortSignal: fresh timeout signal per retry attempt, not shared"

requirements-completed: [HTTP-01, HTTP-02, HTTP-03, HTTP-04, HTTP-05, HTTP-06]

# Metrics
duration: 3min
completed: 2026-04-02
---

# Phase 2 Plan 2: HTTP Client and API Wiring Summary

**Centralized TenableClient with p-retry exponential backoff, p-throttle rate limiting, and full nessus-api.ts integration replacing all stub throws**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-02T15:06:00Z
- **Completed:** 2026-04-02T15:15:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- TenableClient class with X-ApiKeys auth, 30s per-attempt timeout, exponential backoff retries, and client-side rate throttling
- All 7 nessus-api.ts real-API paths wired to TenableClient -- zero "Real API not implemented" throws remain
- getClient() guard ensures typed CONFIGURATION_ERROR if client not initialized

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and create TenableClient** - `dc8c37f` (feat)
2. **Task 2: Wire TenableClient into nessus-api.ts and index.ts** - `b160a95` (feat)

## Files Created/Modified
- `src/tenable-client.ts` - Centralized HTTP client with auth, timeout, retry, rate limiting
- `src/nessus-api.ts` - All real-API paths now use TenableClient via getClient() guard
- `src/index.ts` - Added URL format comment; existing initializeNessusApi call unchanged
- `package.json` - Added p-retry and p-throttle dependencies

## Decisions Made
- TenableClient instantiation kept inside initializeNessusApi rather than exposing it in index.ts -- keeps HTTP client as internal detail of the API layer
- getClient() guard pattern used instead of non-null assertions (client!) for safer runtime error messages
- startScan uses single POST /scans; full two-step create+launch deferred to Phase 3 (SCAN-01/02)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- HTTP infrastructure complete: all tools can now make real Tenable.io API calls
- Phase 3 (scan lifecycle) can build on TenableClient for create+launch+poll flows
- Workbenches API filter syntax needs verification against Tenable docs (noted in STATE.md blockers)

---
*Phase: 02-http-client-and-infrastructure*
*Completed: 2026-04-02*
