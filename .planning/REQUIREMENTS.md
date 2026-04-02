# Requirements: Nessus MCP Server

**Defined:** 2026-04-02
**Core Value:** AI assistants can trigger, monitor, and retrieve results from real Tenable.io vulnerability scans through a reliable, secure MCP interface.

## v1 Requirements

Requirements for production-ready Tenable.io integration. Each maps to roadmap phases.

### Safety & Correctness

- [x] **SAFE-01**: Server uses `console.error` exclusively for logging (no stdout contamination of MCP stdio transport)
- [x] **SAFE-02**: Dead zod schemas removed from `scans.ts` (no duplicate validation paths)
- [x] **SAFE-03**: tsconfig updated for Node 22 LTS (`lib: ["ES2022", "DOM"]`, `module`/`moduleResolution`: `NodeNext`)
- [x] **SAFE-04**: `node-fetch` dependency removed; all HTTP calls use Node 22 native `fetch`
- [x] **SAFE-05**: Server validates API credentials at startup and fails fast with clear error if missing (no silent mock fallback)

### Tenable.io HTTP Client

- [x] **HTTP-01**: Dedicated HTTP client module (`tenable-client.ts`) handles all Tenable.io API calls
- [x] **HTTP-02**: Every request includes `X-ApiKeys: accessKey=<key>;secretKey=<key>` authentication header
- [x] **HTTP-03**: Request timeout (30s default) using `AbortController` prevents hanging requests
- [x] **HTTP-04**: HTTP status codes (401, 403, 404, 429, 500) map to structured MCP error types
- [x] **HTTP-05**: Rate-limit handling detects 429 responses and applies exponential backoff with `p-retry`
- [x] **HTTP-06**: Client-side rate throttling via `p-throttle` prevents proactive rate-limit exhaustion

### Type Safety

- [x] **TYPE-01**: Typed interfaces for all Tenable.io API responses in `src/types/tenable.ts` (no `any` types)
- [x] **TYPE-02**: Scan ID typed as number, scan UUID typed as string, enforced at abstraction boundary

### Tool: list_scan_templates

- [ ] **TMPL-01**: Tool calls `GET /editor/scan/templates` on real Tenable.io API
- [ ] **TMPL-02**: Response includes template `uuid` field (required by `start_scan`)

### Tool: start_scan

- [ ] **SCAN-01**: Tool creates scan via `POST /scans` with template UUID and target settings
- [ ] **SCAN-02**: Tool launches scan via `POST /scans/{id}/launch` after creation (two-step flow)
- [ ] **SCAN-03**: Tool returns immediately with integer scan ID (does not block on scan completion)
- [ ] **SCAN-04**: `scan_type` parameter maps to template UUID via lookup
- [ ] **SCAN-05**: Target validation accepts CIDR notation and IP ranges alongside single IPs/hostnames

### Tool: get_scan_status

- [ ] **STAT-01**: Tool calls `GET /scans/{id}` and extracts `info.status` (no `/status` sub-resource)
- [ ] **STAT-02**: Integer scan ID parameter correctly handled

### Tool: get_scan_results

- [ ] **RSLT-01**: Tool calls `GET /scans/{id}` for scan metadata, hosts, and vulnerability summary
- [ ] **RSLT-02**: Handles "scan not completed" gracefully with actionable error message
- [ ] **RSLT-03**: Integer severity (0-4) correctly mapped to severity labels (info/low/medium/high/critical)
- [ ] **RSLT-04**: Tenable.io response schema (plugin_id, plugin_name, severity int, count) correctly parsed

### Tool: list_scans

- [ ] **LIST-01**: Tool calls `GET /scans` on real Tenable.io API
- [ ] **LIST-02**: Handles `null` scans list (empty account) without crashing
- [ ] **LIST-03**: Epoch timestamps converted to readable format

### Tool: get_vulnerability_details

- [ ] **VULN-01**: Tool routes to Workbenches API (`GET /workbenches/vulnerabilities`) with appropriate filters
- [ ] **VULN-02**: Accepts both CVE ID and plugin ID as input
- [ ] **VULN-03**: Handles multi-result responses (CVE may map to multiple plugins)

### Tool: search_vulnerabilities

- [ ] **SRCH-01**: Tool routed through `nessus-api.ts` (not direct `mock-data.ts` import)
- [ ] **SRCH-02**: Uses Workbenches API `text_filter` parameter for keyword search
- [ ] **SRCH-03**: Response schema normalized from Tenable.io format (plugin_id, plugin_name, severity int)

### Error Handling

- [x] **ERR-01**: `NessusErrorType` extended with `RATE_LIMITED`, `AUTH_FAILED`, `TIMEOUT` types
- [x] **ERR-02**: HTTP 409 mapped to `SCAN_IN_PROGRESS` error type
- [x] **ERR-03**: All error paths return structured MCP error responses (no raw exceptions)

### Testing

- [ ] **TEST-01**: Vitest test framework configured and working with ESM/TypeScript
- [ ] **TEST-02**: Unit tests for `tenable-client.ts` HTTP functions (mocked fetch)
- [ ] **TEST-03**: Unit tests for input validation functions in `error-handling.ts`
- [ ] **TEST-04**: Tool handler tests for all 7 tools in mock mode
- [ ] **TEST-05**: Startup credential validation tested (fail-fast path)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Additional Tools

- **TOOL-01**: `export_scan` tool to export scan results in various formats
- **TOOL-02**: `pause_scan` / `resume_scan` tools for scan lifecycle management
- **TOOL-03**: `delete_scan` tool for cleanup

### Extended Features

- **EXT-01**: Scan result caching layer for repeated queries
- **EXT-02**: On-prem Nessus Professional support (different API/auth)
- **EXT-03**: Mock schema parity update (align mock data to real API field names)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Nessus Professional (on-prem) support | Different API, different auth — Tenable.io cloud only |
| New MCP tools beyond current 7 | Scope control — make existing tools production-ready first |
| Scan result caching | Adds statefulness to stateless server |
| Webhook/polling for scan completion | MCP stdio doesn't support push; caller polls via `get_scan_status` |
| Full asset/network/tag model | Not needed for scan + vulnerability workflow |
| OAuth/SSO authentication | Service-to-service; API keys are correct auth model |
| Response streaming | Not supported by MCP stdio transport |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SAFE-01 | Phase 1 | Complete |
| SAFE-02 | Phase 1 | Complete |
| SAFE-03 | Phase 1 | Complete |
| SAFE-04 | Phase 1 | Complete |
| SAFE-05 | Phase 1 | Complete |
| HTTP-01 | Phase 2 | Complete |
| HTTP-02 | Phase 2 | Complete |
| HTTP-03 | Phase 2 | Complete |
| HTTP-04 | Phase 2 | Complete |
| HTTP-05 | Phase 2 | Complete |
| HTTP-06 | Phase 2 | Complete |
| TYPE-01 | Phase 2 | Complete |
| TYPE-02 | Phase 2 | Complete |
| TMPL-01 | Phase 3 | Pending |
| TMPL-02 | Phase 3 | Pending |
| SCAN-01 | Phase 3 | Pending |
| SCAN-02 | Phase 3 | Pending |
| SCAN-03 | Phase 3 | Pending |
| SCAN-04 | Phase 3 | Pending |
| SCAN-05 | Phase 3 | Pending |
| STAT-01 | Phase 3 | Pending |
| STAT-02 | Phase 3 | Pending |
| RSLT-01 | Phase 3 | Pending |
| RSLT-02 | Phase 3 | Pending |
| RSLT-03 | Phase 3 | Pending |
| RSLT-04 | Phase 3 | Pending |
| LIST-01 | Phase 3 | Pending |
| LIST-02 | Phase 3 | Pending |
| LIST-03 | Phase 3 | Pending |
| VULN-01 | Phase 3 | Pending |
| VULN-02 | Phase 3 | Pending |
| VULN-03 | Phase 3 | Pending |
| SRCH-01 | Phase 3 | Pending |
| SRCH-02 | Phase 3 | Pending |
| SRCH-03 | Phase 3 | Pending |
| ERR-01 | Phase 2 | Complete |
| ERR-02 | Phase 2 | Complete |
| ERR-03 | Phase 2 | Complete |
| TEST-01 | Phase 4 | Pending |
| TEST-02 | Phase 4 | Pending |
| TEST-03 | Phase 4 | Pending |
| TEST-04 | Phase 4 | Pending |
| TEST-05 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 43 total
- Mapped to phases: 43
- Unmapped: 0

---
*Requirements defined: 2026-04-02*
*Last updated: 2026-04-02 after roadmap creation*
