---
phase: 03-real-tenable-io-api-integration
plan: 02
subsystem: api
tags: [tenable, workbenches, vulnerabilities, mcp]

# Dependency graph
requires:
  - phase: 03-01
    provides: "TenableClient integration, scan tools wired to real API"
provides:
  - "searchVulnerabilities function in nessus-api.ts using Workbenches API"
  - "CVE/plugin-ID/keyword routing in getVulnerabilityDetails"
  - "Multi-shape vulnerability formatters (workbenches list, plugin info, mock)"
affects: [phase-04, testing]

# Tech tracking
tech-stack:
  added: []
  patterns: ["multi-shape response formatting with detection logic", "CVE regex routing for vulnerability lookups"]

key-files:
  created: []
  modified:
    - src/nessus-api.ts
    - src/tools/vulnerabilities.ts

key-decisions:
  - "Used unknown return type for plugin info endpoint since schema is unconfirmed until live testing"
  - "Copied SEVERITY_LABELS into vulnerabilities.ts rather than extracting shared module (same pattern as scans.ts)"
  - "Formatter detects response shape via field presence (vulnerabilities array, plugin_name, name) rather than explicit type tags"

patterns-established:
  - "Multi-shape formatter: detect response type by field presence, format accordingly, fallback to JSON dump"
  - "CVE regex routing: /^CVE-\\d{4}-\\d{4,}$/i for CVE detection, /^\\d+$/ for plugin ID"

requirements-completed: [VULN-01, VULN-02, VULN-03, SRCH-01, SRCH-02, SRCH-03]

# Metrics
duration: 6min
completed: 2026-04-02
---

# Phase 3 Plan 2: Vulnerability Tools Wired to Real Tenable.io Workbenches API

**search_vulnerabilities and get_vulnerability_details routed through nessus-api.ts to Workbenches API with CVE/plugin-ID detection and multi-shape formatters**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-02T21:31:46Z
- **Completed:** 2026-04-02T21:37:22Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added searchVulnerabilities function in nessus-api.ts using Workbenches filter.0.filter=plugin_name API
- Updated getVulnerabilityDetails to detect CVE IDs (routes to cve filter), numeric plugin IDs (routes to /info endpoint), and keyword fallback
- Rewired searchVulnerabilitiesToolHandler to import from nessus-api.ts instead of direct mock-data.js import
- Rewrote formatVulnerabilityDetails to handle 3 response shapes without crashing on numeric severity
- Added truncation warning when total_vulnerability_count exceeds displayed results

## Task Commits

Each task was committed atomically:

1. **Task 1: Add searchVulnerabilities and update getVulnerabilityDetails in nessus-api.ts** - `7a0c885` (feat)
2. **Task 2: Rewire vulnerability handlers and rewrite formatters for real API shapes** - `cb26dd1` (feat)

## Files Created/Modified
- `src/nessus-api.ts` - Added searchVulnerabilities export, updated getVulnerabilityDetails with CVE/plugin-ID/keyword routing
- `src/tools/vulnerabilities.ts` - Rewired handlers through nessus-api, multi-shape formatter, severity helpers, truncation warning

## Decisions Made
- Used `unknown` return type for the plugin info endpoint (`/workbenches/vulnerabilities/{id}/info`) since the exact schema is unconfirmed until live testing
- Copied SEVERITY_LABELS map into vulnerabilities.ts rather than extracting to shared module -- keeps change minimal and matches existing scans.ts pattern
- Formatter detects response shape via field presence (`vulnerabilities` array vs `plugin_name` vs `name`) rather than requiring explicit type discriminators

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- TypeScript error on `forEach` callback: the union return type from `searchVulnerabilities` (mock shape | Tenable shape) caused type incompatibility with `Record<string, unknown>`. Fixed by using `any` type annotation on the forEach callback parameter.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 7 MCP tools now route through nessus-api.ts to the real Tenable.io API
- Mock mode preserved for all tools via useMock config flag
- Ready for end-to-end testing with real Tenable.io credentials
- Workbenches API filter syntax should be verified against live responses

---
*Phase: 03-real-tenable-io-api-integration*
*Completed: 2026-04-02*
