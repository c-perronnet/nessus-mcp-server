# Project Research Summary

**Project:** Tenable.io MCP Server — Production Upgrade
**Domain:** Security scanning API integration (MCP server for Tenable.io cloud)
**Researched:** 2026-04-02
**Confidence:** MEDIUM-HIGH

## Executive Summary

This project upgrades an existing MCP server from a fully mock implementation to a production-grade integration with the Tenable.io cloud REST API. The server already has a working MCP protocol layer, 7 defined tools, and a mock data layer — the research confirms that the core architecture decision (keeping the tool and protocol layers unchanged and replacing only the stub API functions) is the correct approach. The primary work is building a new `tenable-client.ts` HTTP module, wiring it into the existing `nessus-api.ts` API abstraction layer, and fixing several pre-existing correctness bugs before any real API calls can succeed.

The recommended approach treats this as three distinct passes: a safety/correctness phase that fixes production blockers (stdout contamination, native fetch error semantics, dead validation code) before touching the Tenable.io API at all; a real API integration phase that implements all 7 tools in dependency order; and a hardening phase that adds retry logic, rate limiting, and a test suite with proper isolation. The Tenable.io API is well-documented and the endpoint mapping for 6 of 7 tools is HIGH confidence — the vulnerability workbenches API (used by `get_vulnerability_details` and `search_vulnerabilities`) requires verification of filter syntax before implementation.

The single most important risk is the combination of stdout contamination and no 429 rate-limit handling. The stdout bug is a production blocker that will prevent any MCP client from connecting at all; the missing rate-limit handling means AI-driven workflows will enter tight retry loops that exhaust the Tenable.io API window and trigger duplicate scan launches. Both must be fixed before the server is used against a real Tenable.io account.

---

## Key Findings

### Recommended Stack

The existing stack (Node.js 22 LTS, TypeScript 5.8, `@modelcontextprotocol/sdk`, Zod) is correct and requires no major changes. The principal stack action is removing `node-fetch` (it was a placeholder and is now fully superseded by Node 22's stable native `fetch`) and adding two lightweight resilience libraries: `p-retry` for exponential backoff on 429/5xx errors and `p-throttle` for client-side rate limiting. The testing gap is significant — there is no test runner — and `vitest` is the only viable option given the project's ESM-first `"type": "module"` configuration, which makes Jest painful to configure correctly. One non-obvious TypeScript configuration change is required: adding `"DOM"` to `tsconfig.json`'s `lib` array so that TypeScript recognizes the native `fetch`, `Request`, `Response`, and `Headers` globals.

**Core technologies:**
- **Node.js 22 LTS**: Runtime — Maintenance LTS, stable native fetch, `--env-file` flag eliminates `dotenv`
- **Native `fetch` (built-in)**: HTTP client — replaces `node-fetch`; identical API for this use case, zero dependency
- **`p-retry` ^6.2.0**: Retry logic — exponential backoff with jitter for 429 and 5xx; prevents thundering herd
- **`p-throttle` ^6.1.0**: Rate limiting — client-side token bucket to stay within Tenable.io's ~200 req/min limits
- **`vitest` ^3.x**: Test runner — ESM-native, transparent TypeScript support; Jest's ESM story is broken for `"type": "module"` projects
- **`@modelcontextprotocol/sdk` ^1.8.0**: MCP protocol — already installed and working; no change
- **Zod ^3.24.2**: Validation — already used; keep as-is

**What to remove:** `node-fetch`, `@types/node-fetch`, `dotenv` (if present).

### Expected Features

The 7 existing tools are the complete scope for this milestone. No new tools should be added. The research surfaced significant schema mismatches between mock assumptions and the real Tenable.io API — these are not "nice-to-haves" but correctness requirements.

**Must have (table stakes — tools break without these):**
- HTTP client with `X-ApiKeys` auth header injection — every API call requires this exact header format
- `console.log` → `console.error` fix — `console.log` in `nessus-api.ts` corrupts the MCP stdio stream and blocks all connections
- Credential validation at startup — fail fast if env vars are missing rather than silently entering mock mode
- Integer scan IDs throughout — Tenable.io uses integer IDs; all mock string IDs must be normalized at the abstraction boundary
- `GET /scans/{id}` for status (not a nonexistent `/status` sub-resource)
- `POST /scans` + `POST /scans/{id}/launch` two-step for scan creation — creating a scan does NOT auto-launch it
- Template UUID lookup for `start_scan` — the API needs a UUID, not a name slug
- Workbenches API routing for `search_vulnerabilities` and `get_vulnerability_details` — these tools currently bypass `nessus-api.ts` entirely or call nonexistent endpoints
- Pagination awareness in `get_scan_results` — `GET /scans` returns `null` (not `[]`) for empty lists; large scans return truncated data silently
- Integer severity mapping (0=info through 4=critical) replacing the string-based mock schema
- 429 rate-limit handling with backoff — no rate-limit handling means AI retry loops exhaust the API window

**Should have (correctness and reliability):**
- Request timeout with `AbortController` (default 30s) — hanging requests block the MCP process
- Type-safe Tenable.io response interfaces (`src/types/tenable.ts`) — eliminates `any` types, catches schema changes
- `p-retry` + `p-throttle` integration — prevents thundering herd and proactive rate exhaustion
- Scan ID vs UUID distinction enforced in TypeScript types — prevents silent 404s
- Mock schema parity update — align mock data to real API field names so mock↔real transitions are seamless
- CIDR and IP-range target support — `validateTarget()` regex currently rejects `192.168.1.0/24`

**Defer (v2+):**
- New MCP tools (`export_scan`, `pause_scan`, `delete_scan`) — scope creep for this milestone
- Scan result caching — adds statefulness to a stateless server
- Full Tenable.io asset/network/tag model — not needed for scan+vuln workflow
- Webhook or polling loop for scan completion — MCP stdio transport does not support push notifications
- On-prem Nessus Professional support — different API, different auth

### Architecture Approach

The target architecture adds a single new layer (`src/tenable-client.ts`) below the existing `src/nessus-api.ts` API abstraction without changing the tool or protocol layers. The `nessus-api.ts` module's `if (config.useMock) { ... } else { throw new Error("Real API not implemented") }` stubs are replaced with calls to the new HTTP client. A companion `src/types/tenable.ts` defines typed interfaces for all Tenable.io API response shapes. All mock/real branching stays exclusively in `nessus-api.ts` — this boundary must not be violated. One existing boundary violation (`vulnerabilities.ts` directly importing `mock-data.ts` for `search_vulnerabilities`) must be fixed as part of the integration.

**Major components:**
1. `src/types/tenable.ts` (NEW) — typed interfaces for all Tenable.io API response shapes; built first because everything else depends on it
2. `src/tenable-client.ts` (NEW) — all HTTP calls to Tenable.io, auth headers, timeout, response parsing, error normalization, retry/rate limiting; stateless functions (not a class), framework-agnostic
3. `src/nessus-api.ts` (MODIFY) — fills in 7 real API branches; maps Tenable.io shapes to the internal shapes tool handlers already expect; the only place `useMock` logic lives
4. `src/tools/vulnerabilities.ts` (FIX) — remove direct `mock-data.ts` import from `searchVulnerabilitiesToolHandler`; route through `nessus-api.ts`
5. `src/utils/error-handling.ts` (EXTEND) — add `RATE_LIMITED`, `AUTH_FAILED`, `TIMEOUT` error types; map HTTP 409 to `SCAN_IN_PROGRESS`

**Build order:** types → HTTP client → API abstraction → tool handler fix → error handling extension.

### Critical Pitfalls

1. **stdout contamination** — `console.log` in `nessus-api.ts` writes to stdout, corrupting the MCP JSON-RPC transport. Fix before any other work: replace with `console.error`; enforce via CI grep. This is a production blocker regardless of mock vs. real mode.

2. **429 without retry-after causes AI retry loops** — no rate-limit handling means the AI receives a failure, immediately retries, exhausts the rate window, and triggers duplicate scan launches on idempotent operations. Implement `p-retry` + 429-specific backoff in `tenable-client.ts`, not per-tool. Return a structured "rate limited, retry after N seconds" message to the caller.

3. **`start_scan` must not block inline on scan completion** — real scans take 2–10 minutes (hours for compliance). `start_scan` must return immediately with the scan ID; `get_scan_status` is the polling primitive. Blocking inline will cause MCP timeout + orphaned running scans on Tenable.io + AI-triggered duplicate launches on retry.

4. **Scan ID (integer) vs. Scan UUID (string) confusion** — Tenable.io uses integer IDs for status/results polling and UUIDs for history/export operations. Conflating them causes silent 404s. Define `type ScanId = number` and `type ScanUuid = string` in `tenable.ts` and enforce at the abstraction boundary.

5. **`searchVulnerabilities` silently uses mock data in real mode** — the tool handler bypasses `nessus-api.ts` entirely with a direct `mock-data.ts` import. In production mode, it returns 2021-era CVEs regardless of actual scan history. This is a silent correctness failure, not a crash.

---

## Implications for Roadmap

Based on research, 3 phases are recommended. The ordering follows hard dependencies: production blockers must be fixed before real API calls, the HTTP client must exist before the 7 tools can be wired, and tests cannot be isolated until the module-level singleton config is refactored.

### Phase 1: Safety and Correctness Fixes

**Rationale:** Three bugs in the current codebase are production blockers regardless of mock vs. real mode, and one is a security risk. These must be resolved before any real API work begins, or they will corrupt results and make debugging impossible. All fixes are contained to existing files with no new dependencies.

**Delivers:** A codebase that is safe to run against a real Tenable.io account; no stdout corruption; no TLS security holes; no dual validation paths.

**Addresses:**
- `console.log` → `console.error` throughout `nessus-api.ts` (Pitfall 1 — stdout contamination)
- Remove dead `targetSchema` / `scanTypeSchema` from `scans.ts` (Pitfall 10 — diverging validation paths)
- Confirm no `NODE_TLS_REJECT_UNAUTHORIZED=0` in any config or script (Pitfall 8 — credential exfiltration risk)
- Update `tsconfig.json`: add `lib: ["ES2022", "DOM"]`, change `module`/`moduleResolution` to `NodeNext`
- Remove `node-fetch` from `package.json`; confirm native fetch error semantics are handled (Pitfall 7)

**Avoids:** Corrupted MCP stdio stream at startup; TLS certificate bypass shipping to production.

**Research flag:** Standard patterns — no additional research needed. All changes are mechanical fixes to known issues documented in CONCERNS.md and confirmed by codebase inspection.

---

### Phase 2: Real Tenable.io API Integration

**Rationale:** This is the core milestone. The build order within this phase is dictated by dependency: types first (everything needs them), HTTP client second (the 7 tools depend on it), then API abstraction stubs replaced in priority order, then the `search_vulnerabilities` boundary violation fixed. Rate-limit and retry handling belongs in this phase, not a later one — the Tenable.io API will hit 429s during development and the handler must exist before the 7 tools can be considered tested.

**Delivers:** All 7 tools functional against a real Tenable.io cloud account; correct endpoint mapping; proper schema normalization; rate-limit and retry resilience; type-safe response parsing.

**Implementation order within phase:**
1. `src/types/tenable.ts` — all Tenable.io response interfaces (no dependencies)
2. `src/tenable-client.ts` — HTTP functions with auth, timeout, retry (`p-retry`), throttle (`p-throttle`)
3. `src/nessus-api.ts` — fill in real branches in this tool order:
   - `list_scans` + `get_scan_status` (simplest; validates auth and client end-to-end)
   - `list_scan_templates` (prerequisite for `start_scan` UUID mapping)
   - `start_scan` (create + launch two-step; CIDR target support; return immediately)
   - `get_scan_results` (most complex; real schema mapping; pagination awareness)
   - `search_vulnerabilities` (move out of `vulnerabilities.ts` mock bypass)
   - `get_vulnerability_details` (Workbenches API; CVE-to-plugin-ID translation strategy)
4. `src/tools/vulnerabilities.ts` — remove direct `mock-data.ts` import
5. `src/utils/error-handling.ts` — add `RATE_LIMITED`, `AUTH_FAILED`, `TIMEOUT`, map HTTP 409 to `SCAN_IN_PROGRESS`

**Uses:** Native fetch, `p-retry`, `p-throttle`, `src/types/tenable.ts`

**Avoids:** Pitfalls 2 (rate limit loops), 3 (inline scan polling), 4 (ID vs UUID), 5 (mock search in real mode), 6 (wrong auth header), 9 (silent pagination truncation), 12 (`SCAN_IN_PROGRESS` never thrown)

**Research flag:** The Workbenches API filter syntax for `search_vulnerabilities` and `get_vulnerability_details` should be verified against https://developer.tenable.com/reference before implementing those two tools. The filter query parameter structure (`filter.0.filter`, `filter.0.quality`, `filter.0.value`) was inferred from API structure at MEDIUM confidence and should be confirmed. All other endpoints are HIGH confidence.

---

### Phase 3: Test Suite and Hardening

**Rationale:** Tests cannot be added reliably until the module-level singleton config in `nessus-api.ts` is refactored to support per-test instantiation. This refactor is low risk but affects the module interface, so it should not be mixed with Phase 2's API integration work. A clean test suite written after Phase 2 validates the complete integration.

**Delivers:** Vitest test suite covering all 7 tool handlers (mock mode), the HTTP client layer in isolation, error paths, and startup credential validation; no real Tenable.io API calls in the test suite (per PROJECT.md scope).

**Addresses:**
- Refactor module-level `config` singleton to support per-test instances (Pitfall 11 — test isolation)
- Unit tests for `tenable-client.ts` with `vi.mock()` on native fetch
- Integration-style tests for all 7 tool handlers using mock mode (activated by not providing env vars)
- Test the `console.log`-free policy (guard against regression)
- Test startup credential validation (fail-fast path)

**Research flag:** Standard patterns — vitest with `vi.mock()` for ESM modules is well-documented. No additional research needed.

---

### Phase Ordering Rationale

- Phase 1 before Phase 2 because the stdout bug makes Phase 2 results undebuggable; native fetch error semantics must be understood before the HTTP client is written; TLS configuration must be confirmed clean before credentials are sent to `cloud.tenable.com`.
- The tool order within Phase 2 follows the feature dependency graph from FEATURES.md: `list_scan_templates` → `start_scan` → `get_scan_status`/`get_scan_results`. Starting with `list_scans` and `get_scan_status` validates auth end-to-end before tackling more complex endpoints.
- Phase 3 after Phase 2 because the module refactor needed for test isolation would destabilize Phase 2 if interleaved; writing tests after the real API is working means tests validate actual behavior rather than mocks of mocks.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Workbenches API):** The filter syntax for `GET /workbenches/vulnerabilities` is MEDIUM confidence. Before implementing `search_vulnerabilities` and `get_vulnerability_details`, verify the filter query parameter structure and the CVE-to-plugin-ID lookup approach against https://developer.tenable.com/reference.
- **Phase 2 (rate limit thresholds):** Tenable.io rate limits are LOW confidence on exact numbers (~200 req/min is widely cited but not in official docs). Confirm before tuning `p-throttle` settings.

Phases with standard patterns (skip research-phase):
- **Phase 1:** All changes are mechanical fixes to known bugs documented in CONCERNS.md. No new patterns.
- **Phase 3:** Vitest ESM mocking patterns are well-documented and directly applicable.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Node.js 22 release schedule confirmed; native fetch stable; vitest ESM advantage is well-established; p-retry/p-throttle versions from training data — verify before install |
| Features | HIGH | Core endpoints (`/scans`, `/editor/scan/templates`) are stable Tenable.io API; scan ID as integer is unambiguous; `console.log` bug confirmed by direct codebase inspection |
| Architecture | HIGH | Based on direct codebase analysis; Tenable.io endpoint mapping is MEDIUM for Workbenches API specifically |
| Pitfalls | MEDIUM-HIGH | stdout/MCP stdio corruption is HIGH (direct codebase + MCP SDK docs); Tenable.io rate limiting and scan ID/UUID distinction are MEDIUM (training data, not live doc verification) |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Workbenches API filter syntax:** `GET /workbenches/vulnerabilities` filter query parameter format is inferred, not verified. Verify the exact filter structure for keyword search and CVE-to-plugin-ID lookup before implementing `search_vulnerabilities` and `get_vulnerability_details`. Use https://developer.tenable.com/reference as the authoritative source.
- **Tenable.io rate limit exact thresholds:** "~200 req/min" is widely cited but not in official documentation. Check the Tenable.io developer docs rate limiting page before configuring `p-throttle`. The conservative approach is to implement throttling and tune it down if needed.
- **`GET /scans` returning `null` for empty list:** Reported in community integrations but not in official docs. Add a null guard (`scans ?? []`) in the implementation and verify by testing against an account with no scans.
- **Scan UUID return value from `POST /scans/{id}/launch`:** The exact response schema of the launch endpoint (particularly whether `scan_uuid` is directly in the response or must be read from `GET /scans/{id}`) should be confirmed before implementing the `start_scan` return type in Phase 2.

---

## Sources

### Primary (HIGH confidence)
- Project codebase (`src/nessus-api.ts`, `src/tools/scans.ts`, `src/tools/vulnerabilities.ts`, `src/mock-data.ts`, `src/utils/error-handling.ts`, `src/index.ts`) — direct inspection; all mock stubs, bugs, and boundary violations confirmed first-hand
- `.planning/codebase/CONCERNS.md` — documented pre-existing concerns; confirmed against code
- `.planning/PROJECT.md` — project constraints (Node 22, Tenable.io cloud target, real instance testing deferred)
- Node.js 22 release schedule (nodejs.org) — Maintenance LTS confirmed 2026-04-02
- TypeScript `lib: ["DOM"]` for native fetch types — documented TypeScript configuration requirement

### Secondary (MEDIUM confidence)
- Tenable.io REST API endpoint structure — training data knowledge of `POST /scans`, `GET /scans`, `GET /scans/{id}`, `GET /editor/scan/templates`; `X-ApiKeys` header format is extensively documented
- Tenable.io Workbenches API (`GET /workbenches/vulnerabilities`) — filter syntax inferred from API structure; verify at https://developer.tenable.com/reference
- p-retry ^6.2.0, p-throttle ^6.1.0 — ESM-first, zero-dep; version numbers from training data; confirm before install
- Tenable.io rate limiting (~200 req/min per key) — widely cited in community integrations; not in official docs

### Tertiary (LOW confidence)
- Tenable.io rate limit exact thresholds — needs validation against https://developer.tenable.com/docs/rate-limiting before `p-throttle` configuration
- `GET /scans` returning `null` for empty list — community-reported; not in official docs; add null guard and verify empirically

---

*Research completed: 2026-04-02*
*Ready for roadmap: yes*
