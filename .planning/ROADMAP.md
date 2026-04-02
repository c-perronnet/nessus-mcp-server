# Roadmap: Nessus MCP Server

## Overview

This roadmap takes an existing mock-only MCP server and delivers a production-grade Tenable.io integration in four phases. Phase 1 eliminates production blockers in the existing codebase before any real API work begins. Phase 2 builds the HTTP client and type infrastructure everything else depends on. Phase 3 wires all 7 tools to real Tenable.io endpoints. Phase 4 adds the test suite that validates the complete integration.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Safety and Correctness** - Fix production blockers in the existing codebase before touching the real API (completed 2026-04-02)
- [x] **Phase 2: HTTP Client and Infrastructure** - Build the HTTP client, type definitions, and error handling that all tools depend on (completed 2026-04-02)
- [ ] **Phase 3: Real Tenable.io API Integration** - Wire all 7 tools to real Tenable.io endpoints
- [ ] **Phase 4: Test Suite** - Add Vitest test suite covering all tools, HTTP client, and error paths

## Phase Details

### Phase 1: Safety and Correctness
**Goal**: The codebase is safe to run against a real Tenable.io account — no stdout corruption, no dead validation code, and the Node.js 22 environment is correctly configured
**Depends on**: Nothing (first phase)
**Requirements**: SAFE-01, SAFE-02, SAFE-03, SAFE-04, SAFE-05
**Success Criteria** (what must be TRUE):
  1. Running the server produces no output on stdout except valid MCP JSON-RPC messages (all logging goes to stderr)
  2. `package.json` has no `node-fetch` dependency and all HTTP calls reference native `fetch`
  3. `tsconfig.json` targets Node 22 with `lib: ["ES2022", "DOM"]` and `moduleResolution: NodeNext`
  4. Starting the server without API credentials in environment produces an explicit error and exits — it does not silently enter mock mode
  5. `src/tools/scans.ts` contains no dead Zod schemas that duplicate validation already performed elsewhere
**Plans**: 2 (01-PLAN.md: tsconfig + node-fetch; 02-PLAN.md: stdout fix + dead code + fail-fast)

### Phase 2: HTTP Client and Infrastructure
**Goal**: A dedicated Tenable.io HTTP client exists with auth, timeouts, retry, and rate limiting; all API response shapes are typed; error types cover all failure modes
**Depends on**: Phase 1
**Requirements**: HTTP-01, HTTP-02, HTTP-03, HTTP-04, HTTP-05, HTTP-06, TYPE-01, TYPE-02, ERR-01, ERR-02, ERR-03
**Success Criteria** (what must be TRUE):
  1. `src/tenable-client.ts` exists and all Tenable.io HTTP calls pass through it (no direct `fetch` calls in tool handlers)
  2. Every outbound HTTP request includes the `X-ApiKeys: accessKey=<key>;secretKey=<key>` header in the exact Tenable.io format
  3. A request that takes longer than 30 seconds is cancelled and returns a `TIMEOUT` error to the caller
  4. A 429 response triggers exponential backoff retries rather than immediately returning an error to the MCP client
  5. `src/types/tenable.ts` exists with typed interfaces for all Tenable.io API responses — no `any` types remain in API call paths
**Plans**: 2 plans

Plans:
- [ ] 02-01-PLAN.md — Type definitions (tenable.ts) and error type extensions (ERR + TYPE requirements)
- [ ] 02-02-PLAN.md — TenableClient HTTP client with auth, retry, throttle, and nessus-api.ts wiring (HTTP requirements)

### Phase 3: Real Tenable.io API Integration
**Goal**: All 7 MCP tools call real Tenable.io endpoints, return correctly shaped responses, and handle edge cases documented in the API
**Depends on**: Phase 2
**Requirements**: TMPL-01, TMPL-02, SCAN-01, SCAN-02, SCAN-03, SCAN-04, SCAN-05, STAT-01, STAT-02, RSLT-01, RSLT-02, RSLT-03, RSLT-04, LIST-01, LIST-02, LIST-03, VULN-01, VULN-02, VULN-03, SRCH-01, SRCH-02, SRCH-03
**Success Criteria** (what must be TRUE):
  1. `list_scan_templates` returns real templates from `GET /editor/scan/templates` including their `uuid` fields, which `start_scan` can consume directly
  2. `start_scan` creates and launches a scan via the two-step `POST /scans` + `POST /scans/{id}/launch` flow and returns the integer scan ID immediately without waiting for scan completion
  3. `get_scan_status` and `get_scan_results` accept integer scan IDs and call `GET /scans/{id}`, with severity values correctly mapped from integers (0–4) to labels (info/low/medium/high/critical)
  4. `list_scans` handles a `null` scans list from the API (empty account) without crashing and converts epoch timestamps to readable format
  5. `search_vulnerabilities` routes through `nessus-api.ts` (not direct mock data import) and `get_vulnerability_details` accepts both CVE ID and plugin ID as input
**Plans**: 2 plans

Plans:
- [ ] 03-01-PLAN.md — Scan tools: validators, two-step startScan, listScans enhancements, scan results incomplete handling, templates graceful 403
- [ ] 03-02-PLAN.md — Vulnerability tools: searchVulnerabilities + getVulnerabilityDetails via Workbenches API, rewired handlers, real-API formatters

### Phase 4: Test Suite
**Goal**: Automated tests validate all 7 tool handlers, the HTTP client in isolation, error paths, and the startup credential check — with no real Tenable.io API calls required
**Depends on**: Phase 3
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05
**Success Criteria** (what must be TRUE):
  1. `vitest` runs successfully in the project with `npm test` and all tests pass in ESM/TypeScript mode
  2. `tenable-client.ts` HTTP functions are covered by unit tests that mock `fetch` — no real network calls
  3. All 7 tool handlers have tests that exercise them in mock mode (activated by omitting API credentials)
  4. Starting the server without credentials fails the startup test with the expected error message
**Plans**: 2 plans

Plans:
- [ ] 04-01-PLAN.md — Vitest setup + error-handling validation tests + TenableClient HTTP tests (TEST-01, TEST-02, TEST-03)
- [ ] 04-02-PLAN.md — Tool handler tests for all 7 tools in mock mode + startup credential test (TEST-04, TEST-05)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Safety and Correctness | 2/2 | Complete    | 2026-04-02 |
| 2. HTTP Client and Infrastructure | 2/2 | Complete    | 2026-04-02 |
| 3. Real Tenable.io API Integration | 0/2 | Not started | - |
| 4. Test Suite | 0/2 | Not started | - |
