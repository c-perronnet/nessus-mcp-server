# Feature Landscape

**Domain:** Tenable.io MCP server — real API integration
**Researched:** 2026-04-02
**Scope:** Making 7 existing mock-only tools work against the real Tenable.io cloud API

---

## Context: What the Mock Assumed vs. What the Real API Requires

The mock implementation made simplifying assumptions that don't hold against the real Tenable.io API. These mismatches must be resolved for any tool to function in production.

| Mock Assumption | Real Tenable.io Reality | Impact |
|-----------------|------------------------|--------|
| Scan IDs are strings (`scan-1234-567`) | Scan IDs are integers | All tools using scan_id break |
| Template IDs are slugs (`basic-network-scan`) | Templates have UUIDs and uuid field | `start_scan` and `list_scan_templates` break |
| `GET /scans/{id}/results` endpoint | `GET /scans/{id}` returns scan info + host list; vulnerability data requires additional `GET /scans/{id}/hosts/{host_id}` calls | `get_scan_results` fails entirely |
| `GET /vulnerabilities/{id}` endpoint | No direct CVE lookup; use `GET /workbenches/vulnerabilities` with filters | `get_vulnerability_details` fails entirely |
| Scan status is a top-level field in a separate endpoint | Scan status is inside `GET /scans/{id}` response as `info.status` | `get_scan_status` returns wrong data |
| Authentication via config struct only | `X-ApiKeys: accessKey=<key>; secretKey=<key>` header on every request | All authenticated calls fail |
| `search_vulnerabilities` queries in-memory array | Tenable.io uses `GET /workbenches/vulnerabilities` with `?text_filter=` | `search_vulnerabilities` is fully mock-coupled |

---

## Table Stakes

Features that must exist for each tool to work in production. Missing any of these means the tool fails or returns wrong data.

### Cross-Cutting (All 7 Tools)

| Feature | Why Required | Complexity | Notes |
|---------|--------------|------------|-------|
| HTTP client with auth header injection | Every API call needs `X-ApiKeys: accessKey=<key>; secretKey=<key>` | Low | Replace stub with real fetch calls; header format is exact string — spacing matters |
| Request timeout (30s default) | Tenable.io scans can be slow; hanging requests block the MCP process | Low | Node 22 `fetch` supports `AbortController` + `signal` |
| Structured API error handling | HTTP 401 (bad keys), 403 (permissions), 404 (not found), 429 (rate limit), 500 need distinct MCP error codes | Medium | Currently `handleNessusApiError` only matches on Error message strings — needs HTTP status codes |
| `console.log` → `console.error` fix | `console.log` in `nessus-api.ts` writes to stdout, corrupting the MCP JSON-RPC transport stream | Low | One-line fix but a production blocker |
| Credential validation at startup | Fail fast with clear error if env vars missing/empty rather than silently entering mock mode | Low | Currently silently falls back to mock — operators won't know real API is not in use |

### `list_scan_templates`

| Feature | Why Required | Complexity | Notes |
|---------|--------------|------------|-------|
| `GET /editor/scan/templates` real call | Returns actual template list with uuid, title, desc, cloud_only fields | Low | Replace stub; response is `{ templates: [...] }` matching current return shape |
| Return `uuid` field alongside `id` | `start_scan` needs the template UUID to create a scan — callers must see it | Low | Mock returns only `id` (slug); real API has `uuid` as separate field |

### `start_scan`

| Feature | Why Required | Complexity | Notes |
|---------|--------------|------------|-------|
| `POST /scans` with proper request body | Tenable.io requires `{ uuid: <template_uuid>, settings: { name, text_targets } }` — not `{ target, scan_type }` | Medium | Current `startScan(target, scanType)` signature maps scanType slug to a UUID — needs template lookup or caller-supplied UUID |
| `scan_type` → template UUID mapping | The tool accepts `scan_type` string; API needs a UUID | Medium | Either: (a) look up UUID from `list_scan_templates` result, or (b) change input to accept UUID directly. Option (a) is better UX |
| Launch scan after creation | Creating a scan via `POST /scans` creates it in "stopped" state; `POST /scans/{id}/launch` is required to actually start it | Medium | Without this, the scan never runs — silent failure |
| Return integer scan ID | Tenable.io returns integer scan ID; downstream tools need it to call status/results | Low | Update return shape: `{ scan: { id: <int> } }` |
| Input: support CIDR ranges and IP lists | Current `validateTarget` regex rejects `192.168.1.0/24` and `10.0.0.1-10.0.0.5` — both are valid Tenable.io targets | Low | Widen the regex; CIDR and dash-range are standard |

### `get_scan_status`

| Feature | Why Required | Complexity | Notes |
|---------|--------------|------------|-------|
| `GET /scans/{id}` and extract `info.status` | No `/status` sub-endpoint exists; status is inside the full scan detail response | Low | Stub currently calls `GET /scans/{id}/status` which returns 404 |
| Integer scan ID parameter | Tenable.io scan IDs are integers; current validation only checks `typeof scanId !== 'string'` | Low | Cast/parse scan_id to number before constructing URL |
| Map Tenable status codes to consistent strings | Tenable statuses include: `running`, `completed`, `canceled`, `empty`, `imported`, `pending`, `processing`, `resuming`, `pausing`, `stopping` | Low | Return as-is or normalize — document which values callers can expect |

### `get_scan_results`

| Feature | Why Required | Complexity | Notes |
|---------|--------------|------------|-------|
| `GET /scans/{id}` for scan metadata and host list | Correct endpoint — returns `info`, `hosts`, `vulnerabilities` summary sections | Low | The current stub calls a nonexistent `/results` sub-path |
| Handle "scan not completed" gracefully | If `info.status != "completed"`, results are unavailable — must return actionable error, not raw API error | Low | Check status before attempting to parse vulnerability data |
| Parse Tenable.io response schema | Real response nests vulnerabilities under `vulnerabilities[]` with `plugin_id`, `plugin_name`, `severity` (0-4 integer), `count` fields — not CVE IDs or CVSS scores | High | Current `formatScanResults` expects mock schema; real schema differs substantially |
| Integer severity mapping | Tenable.io uses 0=info, 1=low, 2=medium, 3=high, 4=critical (integers, not strings) | Low | `formatScanResults` sorts by string severity — breaks with real data |

### `list_scans`

| Feature | Why Required | Complexity | Notes |
|---------|--------------|------------|-------|
| `GET /scans` real call | Returns `{ scans: [...] }` with `id` (int), `name`, `status`, `creation_date` (epoch), `last_modification_date` | Low | Response shape is close to mock but field names differ (`creation_date` not `created`) |
| Epoch timestamp conversion | Tenable.io dates are Unix epoch integers, not ISO strings | Low | Convert to ISO or document format — mixed formats between mock and real would confuse callers |
| Handle empty scans list | `GET /scans` returns `{ scans: null }` (not `[]`) when no scans exist | Low | `Array.from(mockScans.values())` pattern breaks; need null guard |

### `get_vulnerability_details`

| Feature | Why Required | Complexity | Notes |
|---------|--------------|------------|-------|
| Route to Workbenches API | No `/vulnerabilities/{id}` endpoint exists in Tenable.io; use `GET /workbenches/vulnerabilities?plugin.attributes.cve.value=<cve>` with filters | High | Requires understanding Tenable.io filter syntax; fundamentally different from mock approach |
| Accept plugin_id as alternative input | Tenable.io identifies vulnerabilities by plugin ID (integer), not CVE. Many vulns don't have CVEs | Medium | Tool currently only accepts CVE format strings; real users will have plugin IDs from scan results |
| Handle multi-result responses | Workbenches API returns lists — a CVE may map to multiple plugins | Medium | Return the first/most relevant, or return all with clear labeling |

### `search_vulnerabilities`

| Feature | Why Required | Complexity | Notes |
|---------|--------------|------------|-------|
| Route to `GET /workbenches/vulnerabilities` | Currently hard-imports mock-data module directly — not routed through `nessus-api.ts` at all | High | Must be moved into the API module and switch on mock/real mode like all other tools |
| `?text_filter` query parameter | Tenable.io Workbenches API supports `text_filter` for keyword search across plugin names/descriptions | Medium | `HIGH confidence` — this is documented API behavior |
| Pagination support (`limit` + `offset`) | Search results can return hundreds of entries; unbounded response would be too large for MCP context | Medium | Add `limit` parameter (default 20, max 100) to keep responses usable |
| Response schema normalization | Workbenches vulnerability response has `plugin_id`, `plugin_name`, `severity` (int), `plugin_family`, `counts.occurrences` — differs from mock | Medium | `formatVulnerabilityDetails` assumes mock schema; real schema needs its own formatter |

---

## Differentiators

Nice-to-have improvements that increase reliability or usability but are not blockers.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Retry logic with exponential backoff for 429 and 5xx | Tenable.io rate limits API calls; transient failures are common under load | Medium | 3 retries, backoff: 1s/2s/4s; only retry idempotent GET calls and scan launch |
| Request ID logging (stderr) | Makes debugging API failures traceable without exposing credentials | Low | Log `[request-id]`, HTTP status, endpoint path to stderr |
| `TENABLE_TIMEOUT_MS` env var | Allows operators to tune timeout for slow network paths | Low | Default 30000; read once at init |
| Scan name auto-generation | Tenable.io requires a `name` field when creating a scan; generate one from target + timestamp if not provided | Low | Prevents confusing "name required" API errors |
| Type-safe Tenable.io response interfaces | Eliminate all `any` types for API responses; catch schema changes at compile time | Medium | Define interfaces for `TenableScan`, `TenableVulnerability`, `TenableTemplate`, etc. |
| Mock mode parity with real API schemas | Update mock data to match real API field names (integer IDs, epoch timestamps, plugin_id-based vulns) | Medium | Prevents mock-to-real transition surprises; callers get consistent shapes |

---

## Anti-Features

Things to deliberately NOT build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| New MCP tools (e.g., `export_scan`, `pause_scan`, `delete_scan`) | Scope creep; this milestone is about making existing 7 tools real | Keep tool surface at exactly 7; log unsupported operations as future work |
| Scan result caching layer | Adds statefulness to a stateless server; complicates testing and debugging | Let the MCP client call `get_scan_results` repeatedly if needed — Tenable.io handles it |
| Webhook / polling loop for scan completion | Out of scope for stdio MCP server; transport doesn't support push notifications | AI assistant calls `get_scan_status` in a loop at its own cadence |
| Full Tenable.io asset/network model | Tenable.io has an Assets API, Tags, ACRs — none of this is needed for scan+vuln workflow | Ignore these APIs entirely |
| On-prem Nessus Professional support | Different API, different auth, different endpoints | Target only `https://cloud.tenable.com`; remove `NESSUS_URL` env var in favor of hardcoded base URL (or make it optional override) |
| Response streaming / chunked results | Not supported by MCP stdio transport in this pattern | Return complete results; if too large, apply truncation with a note |
| Database or file persistence for scan tracking | Stateless is simpler and sufficient; MCP server restart is acceptable | Use Tenable.io as the source of truth for all scan state |
| OAuth or SSO authentication | Tenable.io cloud MCP use case is service-to-service; API keys are the right auth model | Keep API key auth only |

---

## Feature Dependencies

```
HTTP client with auth headers
  └── (required by all 7 tools)

list_scan_templates (real API)
  └── start_scan (needs template UUID from templates list)

start_scan (create + launch)
  └── get_scan_status (needs integer scan ID)
  └── get_scan_results (needs integer scan ID)

get_scan_results
  └── integer severity mapping (to format results correctly)

search_vulnerabilities (moved to nessus-api.ts)
  └── HTTP client with auth headers
  └── pagination support

get_vulnerability_details
  └── Workbenches API routing (requires new endpoint understanding)
  └── accept plugin_id OR CVE as input
```

---

## MVP Recommendation

Prioritize in this order:

1. **HTTP client + auth headers + `console.log` fix** — unblocks all 7 tools
2. **`list_scans` and `get_scan_status`** — simplest endpoints, validates auth + client setup works end-to-end
3. **`list_scan_templates`** — prerequisite for `start_scan` template UUID mapping
4. **`start_scan`** — create + launch flow, CIDR target support
5. **`get_scan_results`** — most complex; requires real schema mapping
6. **`search_vulnerabilities`** — move out of mock module, route through API
7. **`get_vulnerability_details`** — Workbenches API routing; hardest endpoint to map to existing interface

Defer:
- Retry logic: implement after basic happy-path works; add in a hardening pass
- Type-safe interfaces: implement alongside real API calls (same pass)
- Mock parity update: defer until all 7 tools are working; then align mock schemas

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Tenable.io auth header format | HIGH | `X-ApiKeys: accessKey=<key>; secretKey=<key>` is extensively documented |
| Scan endpoint shapes | HIGH | `POST /scans`, `GET /scans`, `GET /scans/{id}` are stable, well-documented endpoints |
| Scan IDs are integers | HIGH | Standard Tenable.io API behavior; mock string IDs are clearly fabricated |
| `GET /scans/{id}/status` not existing | HIGH | The real endpoint is `GET /scans/{id}` — no status sub-resource |
| Workbenches API for vulnerability search | MEDIUM | `GET /workbenches/vulnerabilities` exists; `text_filter` parameter behavior inferred from API structure |
| Plugin ID vs CVE as primary identifier | HIGH | Tenable.io identifies findings by plugin ID; CVE is an attribute, not a primary key |
| `GET /scans/{id}/launch` for starting | HIGH | Scan creation via `POST /scans` does not auto-launch; `POST /scans/{id}/launch` is required |
| Rate limiting thresholds | LOW | Tenable.io does rate limit; exact thresholds not publicly documented |
| `GET /scans` returning `null` for empty | MEDIUM | Known behavior reported in community; not in official docs |

---

## Sources

- Tenable.io Developer Portal: https://developer.tenable.com/reference (training data knowledge, HIGH confidence for core endpoints)
- Codebase analysis: `src/nessus-api.ts`, `src/tools/scans.ts`, `src/tools/vulnerabilities.ts`, `src/mock-data.ts` (codebase, confirmed)
- Known gaps: `CONCERNS.md` (`src/nessus-api.ts` all stubs, pagination missing, no retry logic)
