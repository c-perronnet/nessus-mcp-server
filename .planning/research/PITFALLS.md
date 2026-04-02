# Domain Pitfalls

**Domain:** Tenable.io MCP server — security scanning API integration
**Researched:** 2026-04-02
**Confidence:** MEDIUM — Tenable.io-specific details from training knowledge (API docs inaccessible during research); MCP/Node.js findings from direct codebase inspection

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or security incidents.

---

### Pitfall 1: stdout Contamination Breaks MCP stdio Transport

**What goes wrong:** Any `console.log()` or `process.stdout.write()` call emits bytes on stdout. The MCP stdio transport uses stdout as its exclusive channel for JSON-RPC messages. A single stray log line corrupts the framing and the client sees parse errors or hangs.

**Why it happens:** The codebase already has this bug. `nessus-api.ts` lines 42 and 45 call `console.log()` during `initializeNessusApi()`. When real API mode is activated, these lines fire at startup and prepend plain text to the first JSON-RPC frame.

**Consequences:** The MCP client (Claude Desktop, any host) immediately fails to connect. Silent from the server's perspective — the process is running, but the client gets garbage. Extremely hard to diagnose because the symptom looks like a transport or SDK bug.

**Prevention:**
- Replace every `console.log` in `nessus-api.ts` with `console.error`.
- Establish a lint rule or grep CI check: `console\.log` must not exist anywhere in `src/`.
- `console.error` goes to stderr, which is ignored by the stdio transport.

**Detection:** The existing `index.ts` already uses `console.error` correctly — compare that pattern and audit all other files.

**Phase:** Address in Phase 1 (security / correctness fixes), before any real API work.

---

### Pitfall 2: Tenable.io Rate Limiting — 429 Without Retry-After Causes Cascading Failures

**What goes wrong:** Tenable.io enforces aggressive rate limits on its REST API (documented as approximately 200 requests/minute per API key, with stricter limits on some endpoints such as scan launch). The current codebase has no rate-limit handling. When a 429 is received, the error propagates as a generic API error and the MCP tool returns failure to the AI. The AI, trying to be helpful, immediately retries — issuing another 429, entering a tight loop that consumes the entire rate window.

**Why it happens:** No retry logic, no backoff, no 429-specific handling. The fetch call (once implemented) will throw or return a non-OK response, which the generic error handler wraps as `NessusErrorType.API_ERROR`.

**Consequences:**
- AI-driven workflows can exhaust the rate window in seconds.
- Every subsequent scan or status poll fails for the remainder of the window (typically 60 seconds).
- Scan launches are idempotent from the API's perspective — double-retrying `POST /scans/{id}/launch` can trigger duplicate scans.

**Prevention:**
- Implement exponential backoff with jitter specifically for HTTP 429 responses.
- Respect `Retry-After` header when present (Tenable.io includes it).
- Implement a token bucket or request queue at the API client layer, not inside individual tool handlers.
- Return a structured "rate limited, retry after N seconds" message to the MCP tool so the AI can surface it cleanly rather than looping.

**Detection:** 429 response status code from `https://cloud.tenable.com`. HTTP response body typically contains `{"statusCode": 429, "error": "Too Many Requests"}`.

**Phase:** Address in Phase 2 (real API integration). The rate limit client wrapper must be built before any tool handler can be considered production-ready.

---

### Pitfall 3: Treating Scan Launch as Synchronous — Polling Scans That Never Finish

**What goes wrong:** Tenable.io scans are async workflows. `POST /scans/{id}/launch` returns immediately with a scan UUID. The scan then runs for minutes to hours depending on target count and scan policy. An MCP tool that waits inline for scan completion will either time out (MCP requests have a default timeout) or hold a connection open indefinitely.

**Why it happens:** The mock implementation simulates this correctly (setTimeout at 2s and 10s), but that pattern trains developers to think of scans as "fast". Real scans against a single host in basic-network-scan mode take 2–10 minutes; compliance scans can run for hours.

**Consequences:**
- `start_scan` MCP tool call hangs until the MCP client times out.
- The scan may have launched successfully on Tenable.io but the client receives an error response — leaving a scan running that nobody is tracking.
- If the MCP host retries (as AI assistants often do), duplicate scans accumulate on the Tenable.io account.

**Prevention:**
- `start_scan` must return immediately with the scan ID and status `queued` — never poll inline.
- `get_scan_status` is the correct polling primitive — let the AI call it repeatedly.
- Document the expected workflow in tool descriptions: "Call `get_scan_status` to check progress; call `get_scan_results` only when status is `completed`."
- Add `status` guard in `getScanResultsToolHandler`: if the real API returns results for a non-completed scan, surface a clear "scan still running" message rather than empty data.

**Detection:** `start_scan` tool call takes more than 5 seconds to return — something is blocking inline.

**Phase:** Design constraint for Phase 2. The API client must never block on scan completion.

---

### Pitfall 4: Tenable.io Scan ID vs. Scan UUID — Two Different ID Spaces

**What goes wrong:** Tenable.io uses two scan identifier types:
- **Scan ID** (integer): sequential ID returned by `GET /scans` list, used in URL paths like `/scans/{id}`.
- **Scan UUID** (string, UUIDv4): returned on scan launch and in scan history. Required for export and history operations.

Code that stores a scan UUID from `POST /scans/{id}/launch` and then tries to use it as the integer scan ID in `GET /scans/{scan_id}` will get 404s or wrong data.

**Why it happens:** The current mock implementation uses a single string ID (`scan-{timestamp}-{random}`). When implementing the real API, developers may conflate the two because both are called "scan ID" in different parts of the docs.

**Consequences:** `get_scan_status` and `get_scan_results` silently fail or return data for the wrong scan. Extremely hard to debug because the error response from Tenable.io for a wrong ID is often a generic 404.

**Prevention:**
- Store both `scan_id` (integer) and `scan_uuid` (string) when creating a scan.
- Use `scan_id` for status and results polling (`GET /scans/{scan_id}`).
- Use `scan_uuid` for scan history lookups if needed.
- Add TypeScript types that distinguish the two: `type ScanId = number` and `type ScanUuid = string`.

**Detection:** `GET /scans/{id}` returning 404 when a scan was just launched; check whether integer vs UUID is being used.

**Phase:** Architecture decision for Phase 2. The `startScan()` return type must be defined before implementation.

---

## Moderate Pitfalls

### Pitfall 5: `searchVulnerabilities` Is Hardwired to Mock Data in Production Mode

**What goes wrong:** `searchVulnerabilitiesToolHandler` always imports from `../mock-data.js` regardless of whether mock mode is enabled. In production (real API mode), this tool will search the hardcoded 10-vulnerability mock dataset instead of real Tenable.io data.

**Why it happens:** The handler has no API client call — it was implemented as a pure mock from the start and never wired to a dual-mode pattern like the other tools.

**Consequences:** An AI querying for vulnerabilities in real mode gets stale mock results (Log4Shell, PrintNightmare, etc.) while the real Tenable.io instance has live scan findings. No error is surfaced — the wrong data is returned silently.

**Prevention:** Implement `searchVulnerabilities()` in `nessus-api.ts` following the same `if (config.useMock) { ... } else { ... }` pattern. The real implementation maps to `GET /workbenches/vulnerabilities` with a filter parameter.

**Detection:** Real mode is active but `search_vulnerabilities` returns results from 2021-era CVEs regardless of actual scan history.

**Phase:** Phase 2, alongside the other real API implementations — do not skip this tool.

---

### Pitfall 6: Authentication Header Format — `X-ApiKeys` Not `Authorization: Bearer`

**What goes wrong:** Tenable.io uses a custom authentication header format: `X-ApiKeys: accessKey={key};secretKey={key}`. It does not use `Authorization: Bearer` or any standard auth header scheme. Code that uses a standard `Authorization` header receives a 401.

**Why it happens:** Most REST APIs use `Authorization: Bearer`. Developers migrating from other API integrations apply the familiar pattern. The Tenable.io docs are clear on this but the header name is easy to misremember.

**Consequences:** Every API call returns 401. If error handling maps 401 to a generic API error without logging the response body, the developer sees "Authentication failed" with no indication of why.

**Prevention:**
- Set the header explicitly: `'X-ApiKeys': \`accessKey=${accessKey};secretKey=${secretKey}\``
- Add an integration test or manual test of `checkApiStatus()` against the real endpoint as the very first real API call.
- Log the full response body (to stderr) when receiving 4xx in development mode.

**Detection:** HTTP 401 from `https://cloud.tenable.com` on any endpoint.

**Phase:** Phase 2, API client setup. Must be verified before any other endpoint work.

---

### Pitfall 7: Node 22 Native Fetch — Different Error Semantics from node-fetch

**What goes wrong:** Node 22's built-in `fetch` (based on the WHATWG Fetch standard) has different error-throwing behavior from `node-fetch` v3:
- Network errors throw `TypeError` (not `FetchError`)
- DNS resolution failures throw `TypeError: fetch failed` with a `cause` property containing the system error
- HTTPS certificate errors throw `TypeError` with a `cause` of type `Error` (not the openssl error string directly)
- Timeouts require an `AbortController` — there is no built-in `timeout` option

The existing error handler in `error-handling.ts` does `error instanceof Error` checks on string message content. These string patterns will not match native fetch errors.

**Why it happens:** `node-fetch` was a Node.js polyfill that exposed its own error classes. Native fetch standardized on the browser Fetch API, which uses `TypeError` for network errors. Migrating from one to the other without updating error detection breaks silent failure paths.

**Consequences:**
- Network errors (DNS failure, connection refused) fall through to "Unknown Nessus API error" instead of a meaningful message.
- Certificate errors are swallowed without any indication that TLS is the problem.
- Requests that should time out hang indefinitely because no `AbortController` is set.

**Prevention:**
- Remove `node-fetch` from `package.json` and all imports.
- Implement a `tenableFetch()` wrapper around native `fetch` that:
  - Attaches an `AbortController` with a configurable timeout (default: 30 seconds).
  - Unwraps `TypeError` + `cause` for network-level errors.
  - Maps HTTP 4xx/5xx to typed errors before they reach tool handlers.
- Test the error paths explicitly: wrong URL (DNS fail), expired cert, timeout.

**Detection:** Network failures return "Unknown Nessus API error" with no cause; requests hang on network issues.

**Phase:** Phase 1 (Node 22 migration). Must be done before real API implementation or errors will be invisible.

---

### Pitfall 8: TLS Certificate Validation — Never Disable in Production, Configure for Dev

**What goes wrong:** The PROJECT.md notes "Nessus/Tenable.io often has self-signed certs in dev." Developers who hit TLS errors during development commonly add `NODE_TLS_REJECT_UNAUTHORIZED=0` to their environment or pass `rejectUnauthorized: false` to the fetch agent — and then forget to remove it before shipping.

Tenable.io cloud (`https://cloud.tenable.com`) uses a valid, CA-signed TLS certificate. Disabling TLS verification for the cloud endpoint is unnecessary and creates an active security vulnerability (the MCP server would transmit API keys to any host, including a MITM).

**Why it happens:** `cloud.tenable.com` itself does not need TLS workarounds, but developers may test against a local Nessus Professional instance or a staging proxy that uses a self-signed cert, apply the fix globally, and ship it.

**Consequences:** API keys (`NESSUS_ACCESS_KEY`, `NESSUS_SECRET_KEY`) could be exfiltrated via man-in-the-middle on any network if TLS verification is off.

**Prevention:**
- Never set `NODE_TLS_REJECT_UNAUTHORIZED=0` in any script or configuration file committed to the repo.
- If custom CA support is needed (e.g., corporate proxy), use `NODE_EXTRA_CA_CERTS` environment variable pointing to a trusted CA bundle — this adds trust, it does not remove it.
- The `NESSUS_URL` is hardcoded to `https://cloud.tenable.com` in practice — document that custom URLs must use valid certs.

**Detection:** `NODE_TLS_REJECT_UNAUTHORIZED` set to `0` anywhere in env, scripts, or `.env` files; `rejectUnauthorized: false` in any fetch agent configuration.

**Phase:** Phase 1 (security fixes). Pre-deployment checklist item.

---

### Pitfall 9: Scan Results Pagination — Large Scans Return Truncated Data Silently

**What goes wrong:** `GET /scans/{scan_id}` returns paginated vulnerability findings. For scans against large networks (many hosts, many plugins), the default response contains only the first page. The current `getScanResults()` design returns the raw API response without handling `pagination` metadata or making additional requests.

**Why it happens:** Single-host demo scans return complete data. Developers test against a single IP, see a complete list, assume the endpoint returns all results. In production, a scan against a /24 network can have thousands of findings — only the first ~100 are returned without pagination.

**Consequences:** The AI receives incomplete vulnerability data and may incorrectly conclude a target has fewer vulnerabilities than it does. Missing critical findings is a security analysis error.

**Prevention:**
- Always check the response for `pagination.total` vs the length of the returned items array.
- Implement a `fetchAllPages()` helper that follows `page` and `size` parameters.
- Surface pagination metadata in `get_scan_results` tool output: "Showing X of Y vulnerabilities."
- For the initial MVP, return the first page and explicitly state the count in the result text.

**Detection:** `pagination.total` in API response is greater than `vulnerabilities` array length.

**Phase:** Phase 2 (real API implementation). Design the result formatter to include pagination awareness from the start rather than retrofitting.

---

## Minor Pitfalls

### Pitfall 10: Dead Zod Schemas Indicate Validation Gap

**What goes wrong:** In `scans.ts`, `targetSchema` and `scanTypeSchema` are defined but never used — the code calls `validateTarget()` and `validateScanType()` instead. This is not just dead code; it indicates two validation paths exist that can diverge. If `validateTarget()` is updated but `targetSchema` is not (or vice versa), reviews may pass incorrect assumptions about what is validated.

**Prevention:** Remove `targetSchema` and `scanTypeSchema` from `scans.ts`. Use zod as the single validation layer or the custom validators, not both. The milestone codebase concern already flags this — resolve it in Phase 1.

**Phase:** Phase 1 (bug fixes).

---

### Pitfall 11: Module-Level Mutable Config — Test Isolation Failures

**What goes wrong:** `nessus-api.ts` exports a module-level `config` variable mutated by `initializeNessusApi()`. When tests import multiple modules that call `initializeNessusApi()` with different configs, the final call wins and all tests share that config. This causes test ordering dependencies — a test that sets real API mode can break a subsequent test that expects mock mode.

**Prevention:** Refactor the API client to a class or factory that accepts config at construction time. Each test instantiates its own client. The module-level singleton is appropriate for the running server process, but not for test isolation.

**Phase:** Phase 3 (test suite). Do not rely on module-level state in test setup.

---

### Pitfall 12: `SCAN_IN_PROGRESS` Error Type Is Defined But Never Thrown

**What goes wrong:** `NessusErrorType.SCAN_IN_PROGRESS` exists in the enum but is not used anywhere. When `getScanResults()` is called on a running scan, the mock returns `{ error: "Scan results not available", status: "running" }` and the handler checks `'error' in results` — this surfaces as a text error, not an MCP error code. The real API will return HTTP 409 or a similar status code for this case.

**Prevention:** Map HTTP 409 (Conflict) from the real API to `NessusErrorType.SCAN_IN_PROGRESS`. The tool handler should return a structured "scan is still running" response that the AI can parse and act on (e.g., "Scan is still running. Call `get_scan_status` to monitor progress.").

**Phase:** Phase 2.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Phase 1: Node 22 migration | Native fetch error semantics break existing error detection | Write `tenableFetch()` wrapper with typed error mapping before removing `node-fetch` |
| Phase 1: Security fixes | `console.log` in `nessus-api.ts` corrupts MCP stdio | Audit all files for stdout writes; enforce `console.error` only policy |
| Phase 1: Security fixes | TLS disable flags leaked into config | Grep for `rejectUnauthorized` and `NODE_TLS_REJECT_UNAUTHORIZED` as a pre-commit check |
| Phase 2: Real API integration | 401 due to wrong auth header format | Verify `X-ApiKeys` header format against Tenable.io docs before implementing any other endpoint |
| Phase 2: Real API integration | Scan ID vs UUID confusion causes 404s | Define distinct TypeScript types for integer scan IDs and UUID strings at the start |
| Phase 2: Real API integration | Rate limiting causes AI retry loops | Implement 429 + backoff handling in `tenableFetch()` wrapper, not per-tool |
| Phase 2: Real API integration | `searchVulnerabilities` silently uses mock data in real mode | Wire to real API endpoint; add a mode assertion test |
| Phase 2: Real API integration | `start_scan` blocks waiting for completion | Make `startScan()` return immediately; never poll inline |
| Phase 2: Real API integration | Large scan results silently truncated | Include pagination metadata in formatted output from day one |
| Phase 3: Test suite | Module-level config breaks test isolation | Refactor to instance-based API client before writing tests |

---

## Sources

- Direct codebase inspection: `src/nessus-api.ts`, `src/tools/scans.ts`, `src/tools/vulnerabilities.ts`, `src/utils/error-handling.ts`, `src/mock-data.ts`, `src/index.ts` — HIGH confidence (first-hand)
- `.planning/codebase/CONCERNS.md` — HIGH confidence (documented findings)
- `.planning/PROJECT.md` — HIGH confidence (project context)
- Tenable.io API authentication header format (`X-ApiKeys`) — MEDIUM confidence (training knowledge, verified against developer.tenable.com pattern; WebFetch unavailable during research session)
- Tenable.io rate limiting behavior — MEDIUM confidence (training knowledge; approximately 200 req/min per key is widely documented in integrations; verify against https://developer.tenable.com/docs/rate-limiting before implementation)
- Tenable.io scan ID vs UUID distinction — MEDIUM confidence (training knowledge from Tenable API docs pattern; verify scan launch response schema before implementation)
- Node 22 native fetch vs node-fetch error semantics — HIGH confidence (Node.js official documentation, standard WHATWG Fetch spec behavior)
- MCP stdio transport stdout contamination — HIGH confidence (MCP SDK documentation, stdio protocol design)
