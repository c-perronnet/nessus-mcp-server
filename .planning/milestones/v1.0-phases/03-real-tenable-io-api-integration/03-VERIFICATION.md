---
phase: 03-real-tenable-io-api-integration
verified: 2026-04-02T21:41:40Z
status: human_needed
score: 13/13 must-haves verified
human_verification:
  - test: "start_scan with a real Tenable.io template UUID"
    expected: "Returns integer scan_id and scan_uuid; scan appears in list_scans"
    why_human: "Two-step create+launch flow requires live credentials to verify both POST calls succeed end-to-end"
  - test: "list_scans on an account with no scans"
    expected: "Returns empty scans list without crash (null guard confirmed in code, but live verification needed)"
    why_human: "Null scans array only occurs in a real account with zero scans"
  - test: "get_scan_results on a currently-running scan"
    expected: "Returns informative non-error message: 'Scan X is currently running. Use get_scan_status...'"
    why_human: "Status check path requires a real in-progress scan"
  - test: "list_scan_templates with an API key that lacks the Standard role"
    expected: "Returns actionable 403 message with guidance to pass UUID directly"
    why_human: "Requires an API key with restricted permissions to trigger the 403 path"
  - test: "search_vulnerabilities with keyword 'log4j'"
    expected: "Returns list of plugin results from Workbenches API, including truncation warning if >5000 results"
    why_human: "Workbenches API filter syntax must be validated against live response schema"
  - test: "get_vulnerability_details with 'CVE-2021-44228'"
    expected: "Routes to cve filter, returns matching plugins with severity labels"
    why_human: "CVE routing path requires live Workbenches API to confirm response shape"
  - test: "get_vulnerability_details with numeric plugin ID (e.g., '93561')"
    expected: "Routes to /workbenches/vulnerabilities/{id}/info endpoint and formats result"
    why_human: "Plugin info endpoint response schema is marked 'unknown' in code — requires live confirmation"
---

# Phase 03: Real Tenable.io API Integration — Verification Report

**Phase Goal:** Wire all 7 MCP tools to real Tenable.io API endpoints, replacing mock-data usage with proper HTTP calls through nessus-api.ts
**Verified:** 2026-04-02T21:41:40Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | start_scan creates a scan via POST /scans then launches it via POST /scans/{id}/launch and returns the integer scan ID immediately | VERIFIED | `nessus-api.ts` lines 106-120: two-step flow, `scan_id: createResult.scan.id` (integer from typed response) |
| 2 | start_scan accepts both template UUIDs and friendly scan type names | VERIFIED | `validateScanType` in `error-handling.ts` line 235: accepts any non-empty string, no whitelist |
| 3 | start_scan accepts CIDR notation, IP ranges, and comma-separated target lists | VERIFIED | `validateTarget` regex `/^[\d.\-\/,\s:a-zA-Z]+$/` at line 218 — explicitly permissive |
| 4 | list_scans returns readable ISO timestamps instead of raw epoch integers | VERIFIED | `scans.ts` lines 269-272: `new Date(scan.creation_date * 1000).toISOString()` applied to both date fields |
| 5 | list_scans handles a null scans array from the API without crashing | VERIFIED | `scans.ts` line 266: `(scans as any).scans ?? []` null-guard before `.map()` |
| 6 | get_scan_results returns an actionable informational message when the scan has not completed yet | VERIFIED | `scans.ts` lines 209-221: checks `running/pending/initializing/paused`, returns non-error message with no `isError: true` |
| 7 | list_scan_templates returns a clear permission error instead of a generic 403 when the API key lacks the Standard role | VERIFIED | `scans.ts` lines 45-55: catches error, checks `message.includes('403')`, returns actionable text |
| 8 | search_vulnerabilities routes through nessus-api.ts to the Workbenches API, not through a direct mock-data import | VERIFIED | `vulnerabilities.ts` line 5: `import { getVulnerabilityDetails, searchVulnerabilities } from '../nessus-api.js'` — no direct mock-data import anywhere in file |
| 9 | search_vulnerabilities uses filter.0.filter=plugin_name with quality=match for keyword search | VERIFIED | `nessus-api.ts` line 224: `/workbenches/vulnerabilities?filter.0.filter=plugin_name&filter.0.quality=match&filter.0.value=${encodedKeyword}` |
| 10 | get_vulnerability_details accepts both CVE IDs (CVE-2021-44228) and numeric plugin IDs (12345) | VERIFIED | `nessus-api.ts` lines 187-198: CVE regex `/^CVE-\d{4}-\d{4,}$/i` and numeric regex `/^\d+$/` with separate routing |
| 11 | get_vulnerability_details routes CVE lookups to workbenches filter and plugin ID lookups to /workbenches/vulnerabilities/{id}/info | VERIFIED | `nessus-api.ts` lines 189, 196: separate endpoint calls confirmed |
| 12 | Vulnerability formatters handle Tenable.io response shapes without crashing | VERIFIED | `vulnerabilities.ts` lines 94-203: 3-shape detection logic (workbenches array, plugin_name, legacy name) with numeric severity via `severityLabel()` — no `.toUpperCase()` on numbers |
| 13 | search_vulnerabilities includes total_vulnerability_count in output when results are truncated | VERIFIED | `vulnerabilities.ts` lines 283-284: truncation warning when `result.total_vulnerability_count > vulns.length` |

**Score:** 13/13 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/utils/error-handling.ts` | CIDR-aware validateTarget, UUID-aware validateScanType | VERIFIED | CIDR regex at line 218; `validateScanType` whitelist-free at line 235 |
| `src/nessus-api.ts` | Two-step startScan, searchVulnerabilities, CVE/plugin routing in getVulnerabilityDetails | VERIFIED | `/launch` at line 112; `searchVulnerabilities` export at line 210; CVE regex at line 187 |
| `src/tools/scans.ts` | Epoch-to-ISO formatting, incomplete scan handling, templates 403 message | VERIFIED | `toISOString` at lines 269/272; incomplete check lines 209-221; 403 message lines 45-55 |
| `src/tools/vulnerabilities.ts` | Rewired handlers using nessus-api imports, real-API-aware formatters | VERIFIED | Import from nessus-api.js at line 5; multi-shape formatter lines 94-203 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/tools/scans.ts` | `src/nessus-api.ts` | `import { startScan, listScans, getScanResults, getScanStatus, getScanTemplates }` | WIRED | Line 5-11: all 5 scan functions imported and called in handlers |
| `src/nessus-api.ts` | `src/tenable-client.ts` | `getClient().post('/scans/{id}/launch')` | WIRED | Line 111-113: `getClient().post` with `/launch` path confirmed in source and built JS |
| `src/tools/vulnerabilities.ts` | `src/nessus-api.ts` | `import { searchVulnerabilities, getVulnerabilityDetails }` | WIRED | Line 5: both functions imported, called at lines 56 and 245 |
| `src/nessus-api.ts` | `src/tenable-client.ts` | `getClient().get` for workbenches API calls | WIRED | Lines 189, 196, 202, 224: four distinct workbenches endpoint calls |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| TMPL-01 | 03-01 | Tool calls `GET /editor/scan/templates` | SATISFIED | `nessus-api.ts` line 87: `getClient().get<TenableTemplateListResponse>('/editor/scan/templates')` |
| TMPL-02 | 03-01 | Response includes template `uuid` field | SATISFIED | Response passed directly from Tenable API; `TenableTemplateListResponse` type includes uuid |
| SCAN-01 | 03-01 | Tool creates scan via `POST /scans` with UUID and settings | SATISFIED | `nessus-api.ts` line 106-109: `getClient().post('/scans', { uuid: scanType, settings: ... })` |
| SCAN-02 | 03-01 | Tool launches via `POST /scans/{id}/launch` (two-step) | SATISFIED | `nessus-api.ts` lines 111-113 |
| SCAN-03 | 03-01 | Tool returns immediately with integer scan ID | SATISFIED | Returns `scan_id: createResult.scan.id` — typed as number via `TenableCreateScanResponse` |
| SCAN-04 | 03-01 | scan_type maps to template UUID | SATISFIED | `validateScanType` accepts any string (UUID or name); UUID passed directly as `uuid` in POST body |
| SCAN-05 | 03-01 | Target validation accepts CIDR, IP ranges | SATISFIED | Permissive regex at `error-handling.ts` line 218 |
| STAT-01 | 03-01 | Tool calls `GET /scans/{id}` and extracts `info.status` | SATISFIED | `nessus-api.ts` lines 132-142: calls `/scans/${scanId}`, extracts `result.info.status` |
| STAT-02 | 03-01 | Integer scan ID parameter correctly handled | SATISFIED | Scan ID passed as string in URL template; Tenable.io accepts both |
| RSLT-01 | 03-01 | Tool calls `GET /scans/{id}` for metadata, hosts, vulnerabilities | SATISFIED | `nessus-api.ts` line 153: `getClient().get<TenableScanDetailsResponse>('/scans/${scanId}')` |
| RSLT-02 | 03-01 | Handles "scan not completed" gracefully | SATISFIED | `scans.ts` lines 209-221: informative non-error message for running/pending/initializing/paused |
| RSLT-03 | 03-01 | Integer severity (0-4) mapped to severity labels | SATISFIED | `SEVERITY_LABELS` map and `severityLabel()` at `scans.ts` lines 298-309 |
| RSLT-04 | 03-01 | Tenable.io response schema (plugin_id, plugin_name, severity int, count) correctly parsed | SATISFIED | `formatScanResults` real-API branch at `scans.ts` lines 359-364 uses `vuln.plugin_name`, `vuln.plugin_id`, `severityLabel(vuln.severity)`, `vuln.count` |
| LIST-01 | 03-01 | Tool calls `GET /scans` | SATISFIED | `nessus-api.ts` line 172: `getClient().get<TenableScanListResponse>('/scans')` |
| LIST-02 | 03-01 | Handles `null` scans list without crashing | SATISFIED | `scans.ts` line 266: `.scans ?? []` null guard |
| LIST-03 | 03-01 | Epoch timestamps converted to readable format | SATISFIED | `scans.ts` lines 268-273: `new Date(epoch * 1000).toISOString()` with conditional (preserves undefined) |
| VULN-01 | 03-02 | Tool routes to Workbenches API with appropriate filters | SATISFIED | `nessus-api.ts` lines 188-203: three routing cases, all targeting `/workbenches/vulnerabilities` |
| VULN-02 | 03-02 | Accepts both CVE ID and plugin ID | SATISFIED | CVE regex line 187, numeric regex line 194 |
| VULN-03 | 03-02 | Handles multi-result responses | SATISFIED | `formatVulnerabilityDetails` shape-1 branch iterates over all entries in `d.vulnerabilities` array |
| SRCH-01 | 03-02 | Tool routed through `nessus-api.ts` (not direct mock-data import) | SATISFIED | `vulnerabilities.ts` imports from `nessus-api.js` only; no `mock-data` import present |
| SRCH-02 | 03-02 | Uses Workbenches API `text_filter` parameter | SATISFIED (with note) | REQUIREMENTS.md wording says `text_filter` but research confirmed this parameter does not exist. Implementation correctly uses `filter.0.filter=plugin_name&filter.0.quality=match` per RESEARCH.md line 343. Behavior intent is satisfied. |
| SRCH-03 | 03-02 | Response schema normalized from Tenable.io format | SATISFIED | `searchVulnerabilitiesToolHandler` formats `plugin_id`, `plugin_name`, numeric `severity` via `severityLabel()` |

**All 22 phase requirements satisfied.**

No orphaned requirements detected: all IDs in PLAN frontmatter appear in REQUIREMENTS.md and are covered by implementation evidence.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/nessus-api.ts` | multiple | `as any` / `as unknown` return type on plugin info endpoint | Info | `getVulnerabilityDetails` returns `unknown` for plugin ID path — schema not yet confirmed. Not a blocker since formatter has JSON fallback. |

No TODO/FIXME/HACK/PLACEHOLDER comments found. No empty implementations. No stubs detected.

---

### Human Verification Required

#### 1. Two-Step Scan Create+Launch (Live API)

**Test:** Call `start_scan` with a valid Tenable.io template UUID and a test target IP.
**Expected:** Both POST calls succeed; response contains integer `scan_id` and `scan_uuid`; scan appears in `list_scans` output.
**Why human:** Live credentials required; the two API calls cannot be verified without a Tenable.io account with scan permissions.

#### 2. Null Scans Array (Empty Account)

**Test:** Call `list_scans` on a Tenable.io account that has never had a scan.
**Expected:** Returns `{ scans: [], folders: [...] }` without crashing.
**Why human:** The null guard is present in code but can only be triggered by an account with zero scans, which requires live access to a specific account state.

#### 3. Incomplete Scan Informational Message

**Test:** Call `get_scan_results` with the ID of a scan that is currently running.
**Expected:** Returns `"Scan 'X' is currently running. Use get_scan_status..."` without `isError: true`.
**Why human:** Requires a live running scan to trigger the `running` status branch.

#### 4. Permission-Denied 403 on Templates (Restricted API Key)

**Test:** Call `list_scan_templates` using an API key with only "Basic" access (no Standard role).
**Expected:** Returns actionable message: `"Permission denied: The API key does not have the Standard [32] role..."`.
**Why human:** Requires an API key with intentionally restricted permissions.

#### 5. search_vulnerabilities Workbenches API Filter (Live)

**Test:** Call `search_vulnerabilities` with keyword `"log4j"`.
**Expected:** Returns plugin results from Workbenches API including plugin_name, plugin_id, numeric severity correctly rendered as label. If >5000 results, truncation warning appears.
**Why human:** Requires live Workbenches API access to confirm the `filter.0.filter=plugin_name&filter.0.quality=match` syntax is accepted and response shape matches formatter expectations.

#### 6. CVE Lookup End-to-End

**Test:** Call `get_vulnerability_details` with `"CVE-2021-44228"`.
**Expected:** Routes to CVE filter endpoint, returns matching plugins with formatted severity labels.
**Why human:** Live Workbenches API required; also validates the CVE regex routing works against actual API response.

#### 7. Plugin ID Info Endpoint (Unknown Schema)

**Test:** Call `get_vulnerability_details` with a numeric plugin ID (e.g., `"93561"`).
**Expected:** Routes to `/workbenches/vulnerabilities/{id}/info`, formatter detects response shape via `plugin_name` field presence and renders correctly.
**Why human:** Return type is `unknown` in code — schema not confirmed until live test. Formatter has JSON fallback but correct rendering requires live validation.

---

### Summary

All 13 observable truths are verified in the codebase. All 4 required artifacts exist, are substantive, and are wired into the tool call paths. All 4 key links are confirmed. All 22 phase requirements have implementation evidence.

No blocker anti-patterns were found. The build passes cleanly (`npm run build` and `npx tsc --noEmit` both succeed with no errors). The old scan type whitelist is fully removed. Direct `mock-data` import in the vulnerability handler is fully removed.

The only open items are 7 human verification tests that require live Tenable.io API access — these cannot be validated programmatically from source inspection alone. Notably, the `getVulnerabilityDetails` plugin ID path returns `unknown` type, meaning the formatter's handling of that response shape is based on the plan's assumed field names (`plugin_name`, `severity`, `description`, etc.) and has a JSON fallback if the actual shape differs.

**REQUIREMENTS.md traceability table:** VULN-01 through VULN-03 and SRCH-01 through SRCH-03 are marked `[x]` (Complete) in REQUIREMENTS.md already. TMPL-01 through LIST-03 are still marked `[ ]` (Pending) in REQUIREMENTS.md — these should be updated to Complete now that the implementation is verified. This is a documentation gap only, not a code gap.

---

_Verified: 2026-04-02T21:41:40Z_
_Verifier: Claude (gsd-verifier)_
