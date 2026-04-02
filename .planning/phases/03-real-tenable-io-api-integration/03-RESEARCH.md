# Phase 3: Real Tenable.io API Integration - Research

**Researched:** 2026-04-02
**Domain:** Tenable.io REST API integration (scans, workbenches, templates)
**Confidence:** MEDIUM-HIGH

## Summary

Phase 3 wires all 7 MCP tools to real Tenable.io API endpoints. Critically, several tools already work from Phase 2 UAT: `list_scans`, `get_scan_status`, and `get_scan_results` (after the severity-mapping fix). The remaining work falls into three categories: (1) fixing the `start_scan` two-step create+launch flow, (2) wiring `search_vulnerabilities` and `get_vulnerability_details` to the Workbenches API, and (3) handling the `list_scan_templates` 403 permission issue.

The Tenable.io API uses a consistent pattern: GET endpoints for reads, POST for mutations, filter-indexed query parameters for workbench queries (`filter.0.filter=X&filter.0.quality=eq&filter.0.value=Y`). The Workbenches API has a 5,000 result limit and 450-day data window. The scan creation flow is explicitly two-step: `POST /scans` to create, then `POST /scans/{id}/launch` to start execution.

**Primary recommendation:** Focus implementation effort on the workbenches integration (search + vulnerability details) and the start_scan create+launch split. The scan read tools are already working. Handle the templates 403 as a graceful degradation with clear error messaging.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TMPL-01 | Tool calls `GET /editor/scan/templates` on real Tenable.io API | Endpoint requires Standard [32] role. Current API key has insufficient permissions (403). Need graceful handling or permission upgrade. |
| TMPL-02 | Response includes template `uuid` field (required by `start_scan`) | TenableTemplate type already defines `uuid: string`. Response shape is correct if endpoint is accessible. |
| SCAN-01 | Tool creates scan via `POST /scans` with template UUID and target settings | POST /scans body requires `uuid`, `settings.name`, `settings.text_targets`. Current code already does this. |
| SCAN-02 | Tool launches scan via `POST /scans/{id}/launch` after creation (two-step flow) | POST /scans/{id}/launch returns `{ scan_uuid: string }`. Must be added after create step. |
| SCAN-03 | Tool returns immediately with integer scan ID (does not block on completion) | Already implemented -- `startScan` returns scan_id from create response. |
| SCAN-04 | `scan_type` parameter maps to template UUID via lookup | Current `validateScanType` hardcodes mock template names. Needs refactoring to accept UUID directly or do lookup. |
| SCAN-05 | Target validation accepts CIDR notation and IP ranges | Current `validateTarget` regex only accepts single IPs and hostnames. Needs CIDR/range support. |
| STAT-01 | Tool calls `GET /scans/{id}` and extracts `info.status` | Already working per UAT. No changes needed. |
| STAT-02 | Integer scan ID parameter correctly handled | Already working per UAT. Scan IDs passed as strings in URL path. |
| RSLT-01 | Tool calls `GET /scans/{id}` for scan metadata, hosts, and vulnerability summary | Already working per UAT after severity fix. |
| RSLT-02 | Handles "scan not completed" gracefully with actionable error message | Needs implementation -- check `info.status` before formatting results. |
| RSLT-03 | Integer severity (0-4) correctly mapped to severity labels | Already fixed in Phase 2 UAT -- `severityLabel()` mapper exists. |
| RSLT-04 | Tenable.io response schema correctly parsed | Already working per UAT -- `plugin_id`, `plugin_name`, `severity` int, `count`. |
| LIST-01 | Tool calls `GET /scans` on real Tenable.io API | Already working per UAT (returned 46 scans). |
| LIST-02 | Handles `null` scans list without crashing | Needs null guard in `listScansToolHandler` or `listScans`. |
| LIST-03 | Epoch timestamps converted to readable format | `creation_date` and `last_modification_date` are epoch ints. Need conversion in formatter. |
| VULN-01 | Tool routes to Workbenches API with appropriate filters | Current code calls `/workbenches/vulnerabilities` with `filter.0.filter=plugin_id`. Needs CVE routing too. |
| VULN-02 | Accepts both CVE ID and plugin ID as input | Must detect input format (CVE-XXXX-XXXXX vs numeric) and route to appropriate filter. |
| VULN-03 | Handles multi-result responses (CVE may map to multiple plugins) | Workbenches response is `{ vulnerabilities: [...], total_vulnerability_count: N }`. Already structured for multi-result. |
| SRCH-01 | Tool routed through `nessus-api.ts` (not direct `mock-data.ts` import) | Current `searchVulnerabilitiesToolHandler` imports directly from `mock-data.js`. Must be rewired through `nessus-api.ts`. |
| SRCH-02 | Uses Workbenches API `text_filter` parameter for keyword search | Workbenches API does not have a `text_filter` param. Use `filter.0.filter=plugin_name&filter.0.quality=match&filter.0.value=keyword`. |
| SRCH-03 | Response schema normalized from Tenable.io format | Workbenches returns `{ vulnerabilities: [{ plugin_id, plugin_name, plugin_family, severity (int), count }] }`. Must normalize to display format. |
</phase_requirements>

## Current State Assessment

### Already Working (from Phase 2 UAT)

| Tool | Status | Evidence |
|------|--------|----------|
| `list_scans` | WORKING | Returned 46 scans with full metadata |
| `get_scan_status` | WORKING | Returns status, name, targets, hostcount |
| `get_scan_results` | WORKING (fixed) | `severityLabel()` mapper handles numeric severity |

### Needs Implementation

| Tool | What's Missing | Effort |
|------|---------------|--------|
| `start_scan` | Add `POST /scans/{id}/launch` step; refactor scan_type validation; add CIDR target validation | Medium |
| `list_scan_templates` | 403 on `/editor/scan/templates` due to API key permissions | Low (graceful error) or External (permission change) |
| `search_vulnerabilities` | Hardcoded to mock-data.js import; needs Workbenches API wiring | Medium |
| `get_vulnerability_details` | Basic filter exists; needs CVE detection and proper formatting | Medium |

### Needs Enhancement (already working but incomplete)

| Tool | Enhancement | Effort |
|------|-------------|--------|
| `list_scans` | Null guard for empty account; epoch timestamp conversion | Low |
| `get_scan_results` | "Scan not completed" graceful handling | Low |

## Architecture Patterns

### Tenable.io API Endpoint Map

```
Scans:
  GET  /scans                              → list all scans
  POST /scans                              → create scan configuration
  POST /scans/{scan_id}/launch             → launch existing scan
  GET  /scans/{scan_id}                    → scan details (status + results + hosts + vulns)
  GET  /scans/{scan_id}/latest-status      → lightweight status check (recommended for polling)

Templates:
  GET  /editor/scan/templates              → list Tenable-provided scan templates (requires Standard [32] role)

Workbenches:
  GET  /workbenches/vulnerabilities        → list vulnerabilities with filters (max 5000 results, 450-day window)
  GET  /workbenches/vulnerabilities/{plugin_id}/info → plugin detail information
```

### Workbenches Filter Syntax

The Workbenches API uses indexed filter parameters:

```
filter.0.filter=plugin_id&filter.0.quality=eq&filter.0.value=12345
filter.0.filter=plugin_name&filter.0.quality=match&filter.0.value=log4j
filter.search_type=and   (default, can be "or")
```

**Constraints:**
- Maximum 10 filters per request
- Maximum 50 values per filter
- Results capped at 5,000 vulnerabilities
- Only returns data less than 450 days old

### Filter Quality Operators

| Operator | Meaning |
|----------|---------|
| `eq` | equals |
| `neq` | not equals |
| `match` | contains/matches |
| `nmatch` | does not match |

### CVE vs Plugin ID Detection Pattern

```typescript
function isCveId(input: string): boolean {
  return /^CVE-\d{4}-\d{4,}$/i.test(input);
}

// CVE lookup: filter.0.filter=cve&filter.0.quality=eq&filter.0.value=CVE-2021-44228
// Plugin ID lookup: GET /workbenches/vulnerabilities/{plugin_id}/info
```

### Two-Step Scan Creation Pattern

```typescript
// Step 1: Create scan configuration
const createResult = await client.post<TenableCreateScanResponse>('/scans', {
  uuid: templateUuid,
  settings: {
    name: `MCP Scan - ${target}`,
    text_targets: target,
  },
});

// Step 2: Launch the scan
const launchResult = await client.post<TenableLaunchScanResponse>(
  `/scans/${createResult.scan.id}/launch`,
);

return {
  scan_id: createResult.scan.id,  // integer
  scan_uuid: launchResult.scan_uuid,
  status: 'launched',
};
```

### Recommended nessus-api.ts Changes

```typescript
// Add searchVulnerabilities function (currently missing from nessus-api.ts)
export const searchVulnerabilities = async (keyword: string) => {
  if (config.useMock) {
    // existing mock search logic
  }
  return getClient().get<TenableWorkbenchVulnsResponse>(
    `/workbenches/vulnerabilities?filter.0.filter=plugin_name&filter.0.quality=match&filter.0.value=${encodeURIComponent(keyword)}`
  );
};
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL query parameter encoding | Manual string concatenation | `URLSearchParams` or template literal with `encodeURIComponent` | Special characters in search terms will break queries |
| CVE-to-plugin mapping | Local CVE database | Workbenches filter API with `filter.0.filter=cve` | Tenable already maintains this mapping |
| Template UUID hardcoding | Static UUID map | Runtime lookup via `/editor/scan/templates` (or pass UUID directly) | Templates change between Tenable.io accounts |
| Scan completion polling | Built-in polling loop | Return scan ID immediately, let MCP caller poll `get_scan_status` | MCP stdio doesn't support push; caller controls polling |

## Common Pitfalls

### Pitfall 1: Workbenches 5,000 Result Cap
**What goes wrong:** Search queries with broad keywords may silently truncate results at 5,000.
**Why it happens:** Tenable.io enforces a hard limit on the workbenches endpoint.
**How to avoid:** Include `total_vulnerability_count` in the response so the caller knows if results were truncated.
**Warning signs:** `total_vulnerability_count` exceeds `vulnerabilities.length`.

### Pitfall 2: Null Scans List
**What goes wrong:** `listScans` crashes when the API returns `{ scans: null }` for accounts with no scans.
**Why it happens:** Tenable.io returns `null` instead of `[]` for the scans array when no scans exist.
**How to avoid:** Guard with `response.scans ?? []` before any array operations.
**Warning signs:** TypeError on `.map()` or `.forEach()` of null.

### Pitfall 3: Templates Endpoint Permission
**What goes wrong:** `GET /editor/scan/templates` returns 403 with the current API key.
**Why it happens:** The endpoint requires Standard [32] user role. The API key may only have Basic [16] or Scan Operator [24] permissions.
**How to avoid:** Either upgrade API key permissions, or handle 403 gracefully with a clear error message explaining what permission is needed.
**Warning signs:** HTTP 403 on the templates endpoint specifically.

### Pitfall 4: Scan Type Validation Blocks Real UUIDs
**What goes wrong:** `validateScanType` only allows `['basic-network-scan', 'web-app-scan', 'compliance-scan']` -- real template UUIDs will be rejected.
**Why it happens:** Validation was written for mock mode with hardcoded template names.
**How to avoid:** Accept any non-empty string as scan_type in real mode (UUIDs are validated by the API), or accept both friendly names and UUIDs.
**Warning signs:** "Scan type must be one of..." error when passing a real UUID.

### Pitfall 5: Target Validation Rejects CIDR/Ranges
**What goes wrong:** `validateTarget` regex rejects CIDR notation (192.168.1.0/24) and ranges (192.168.1.1-192.168.1.50).
**Why it happens:** Regex was written for single IPs and hostnames only.
**How to avoid:** Extend regex to accept CIDR notation, IP ranges, and comma-separated lists. Tenable's `text_targets` field handles all these formats natively.
**Warning signs:** "Target must be a valid IP address or hostname" error for valid CIDR inputs.

### Pitfall 6: Epoch Timestamps Not Human-Readable
**What goes wrong:** `list_scans` returns raw epoch integers (e.g., 1711234567) instead of readable dates.
**Why it happens:** Tenable API returns `creation_date` and `last_modification_date` as Unix epoch seconds.
**How to avoid:** Convert with `new Date(epoch * 1000).toISOString()` in the formatter.
**Warning signs:** Large integers where dates are expected.

### Pitfall 7: formatVulnerabilityDetails Assumes Mock Shape
**What goes wrong:** `formatVulnerabilityDetails` in `vulnerabilities.ts` expects `details.name`, `details.id`, `details.severity.toUpperCase()` -- real API returns different fields.
**Why it happens:** Same pattern as the `formatScanResults` crash fixed in Phase 2 UAT. The formatter was written for mock data shape.
**How to avoid:** Write formatters that handle the Tenable.io workbenches response schema (`plugin_id`, `plugin_name`, `severity` as int, etc.).
**Warning signs:** `.toUpperCase()` on a number, undefined field references.

## Code Examples

### searchVulnerabilities via Workbenches API

```typescript
// In nessus-api.ts
export const searchVulnerabilities = async (keyword: string) => {
  if (config.useMock) {
    const { vulnerabilities } = await import('./mock-data.js');
    return vulnerabilities.filter(v =>
      v.name.toLowerCase().includes(keyword.toLowerCase()) ||
      v.description.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  const encodedKeyword = encodeURIComponent(keyword);
  return getClient().get<TenableWorkbenchVulnsResponse>(
    `/workbenches/vulnerabilities?filter.0.filter=plugin_name&filter.0.quality=match&filter.0.value=${encodedKeyword}`
  );
};
```

### getVulnerabilityDetails with CVE Detection

```typescript
// In nessus-api.ts
export const getVulnerabilityDetails = async (vulnId: string) => {
  if (config.useMock) {
    return getMockVulnerabilityDetails(vulnId);
  }

  const isCve = /^CVE-\d{4}-\d{4,}$/i.test(vulnId);

  if (isCve) {
    // CVE lookup via workbenches filter
    return getClient().get<TenableWorkbenchVulnsResponse>(
      `/workbenches/vulnerabilities?filter.0.filter=cve&filter.0.quality=eq&filter.0.value=${vulnId}`
    );
  }

  // Plugin ID lookup via dedicated endpoint
  return getClient().get<unknown>(
    `/workbenches/vulnerabilities/${vulnId}/info`
  );
};
```

### Null-Safe listScans Formatting

```typescript
// In the formatter or listScansToolHandler
const response = await listScans();
const scans = response.scans ?? [];
const formatted = scans.map(scan => ({
  ...scan,
  creation_date: new Date(scan.creation_date * 1000).toISOString(),
  last_modification_date: new Date(scan.last_modification_date * 1000).toISOString(),
}));
```

### CIDR-Aware Target Validation

```typescript
export const validateTarget = (target: unknown): string => {
  if (!target || typeof target !== 'string') {
    throw createNessusError(NessusErrorType.INVALID_TARGET, 'Target is required and must be a string');
  }

  // Accept: single IP, hostname, CIDR, IP range, comma-separated list
  // Tenable's text_targets handles validation server-side
  const targetPattern = /^[\d\.\-\/,\s:a-zA-Z]+$/;
  if (!targetPattern.test(target)) {
    throw createNessusError(NessusErrorType.INVALID_TARGET,
      'Target must be a valid IP address, hostname, CIDR range, or comma-separated list');
  }

  return target;
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single POST /scans creates AND launches | Two-step: POST /scans + POST /scans/{id}/launch | Tenable.io v2 API | Must explicitly launch after creation |
| GET /scans/{id} for status polling | GET /scans/{id}/latest-status (lightweight) | Recent API addition | Reduces load when polling many scans |
| Unlimited workbench results | 5,000 cap + 450-day window | API policy change | Must use /vulns/export for bulk data |

## Open Questions

1. **Templates 403 Resolution**
   - What we know: `/editor/scan/templates` requires Standard [32] role. Current API key gets 403.
   - What's unclear: Whether upgrading the API key permission is possible/desirable for the user.
   - Recommendation: Implement graceful error handling now. Document that permission upgrade resolves it. Optionally accept template UUID directly in `start_scan` to bypass template listing entirely.

2. **Workbenches CVE Filter Name**
   - What we know: pyTenable uses `cve` as a filter name. Official docs don't explicitly list all filter names.
   - What's unclear: Exact filter name for CVE -- could be `cve`, `cve.raw`, or `plugin.attributes.cve`.
   - Recommendation: Try `cve` first (HIGH confidence from pyTenable source). Fall back to listing available filters via `GET /filters/workbenches/vulnerabilities` if it fails.

3. **Scan Type UUIDs**
   - What we know: Real Tenable templates use UUIDs like `731a8e52-3ea6-a291-ec0a-d2ff0619c19d7bd788d6be818b65`. Mock uses friendly names like `basic-network-scan`.
   - What's unclear: Whether to maintain friendly-name-to-UUID mapping or just pass UUIDs through.
   - Recommendation: Accept both formats. If input matches a UUID pattern, pass directly. If it's a friendly name, attempt template lookup (if templates endpoint is accessible).

4. **Vulnerability Info Response Type**
   - What we know: `GET /workbenches/vulnerabilities/{plugin_id}/info` exists and returns plugin details.
   - What's unclear: Exact response schema -- likely includes `plugin_description`, `plugin_name`, `severity`, `vpr_score`, `see_also`, etc.
   - Recommendation: Type as `unknown` initially, then refine based on actual API response during implementation/testing. Add a dedicated type interface once shape is confirmed.

## Sources

### Primary (HIGH confidence)
- [Tenable Developer Portal - Create a Scan](https://developer.tenable.com/docs/create-scan-tio) - Two-step create+launch flow, POST /scans body format
- [Tenable Developer Portal - Workbench Filters](https://developer.tenable.com/docs/workbench-filters) - Filter parameter syntax, constraints (10 filter max, 50 values max)
- [Tenable Developer Portal - List Vulnerabilities](https://developer.tenable.com/reference/workbenches-vulnerabilities) - 5,000 result cap, 450-day window, Basic [16] role required
- [Tenable Developer Portal - Get Plugin Details](https://developer.tenable.com/reference/workbenches-vulnerability-info) - GET /workbenches/vulnerabilities/{plugin_id}/info
- [Tenable Developer Portal - List Templates](https://developer.tenable.com/reference/editor-list-templates) - Standard [32] role requirement
- [Tenable Developer Portal - Get Scan Details](https://developer.tenable.com/reference/scans-details) - GET /scans/{scan_id}, Scan Operator [24] role
- Phase 2 UAT results (02-UAT.md) - Confirmed working/broken tools with real API

### Secondary (MEDIUM confidence)
- [pyTenable workbenches.py source](https://github.com/tenable/pyTenable/blob/main/tenable/io/workbenches.py) - Filter usage patterns, CVE filter name, vulnerability_info method path
- [Tenable Developer Portal - Workbench Filter Limitation](https://developer.tenable.com/changelog/io-vm-vulnerabilities-workbench-filter-limitation) - Filter count limits

### Tertiary (LOW confidence)
- Workbenches `text_filter` parameter existence -- requirements mention it but no official docs confirm a `text_filter` parameter. Use filter.0.filter=plugin_name with quality=match instead.
- Exact CVE filter name (`cve` vs other variations) -- inferred from pyTenable, not confirmed in official REST docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries needed, using existing TenableClient infrastructure
- Architecture: HIGH - Tenable.io API endpoints well-documented, filter syntax confirmed
- Pitfalls: HIGH - Multiple confirmed from Phase 2 UAT real-world testing
- Workbenches filter details: MEDIUM - Filter syntax confirmed, but exact filter names for CVE search need validation
- Templates permissions: HIGH - 403 confirmed in UAT, permission level documented

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable API, unlikely to change)
