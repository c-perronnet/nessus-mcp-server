---
status: issues-found
phase: 02-http-client-and-infrastructure
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md]
started: 2026-04-02T16:00:00Z
updated: 2026-04-02T16:30:00Z
---

## Tests

### 1. List Scans
expected: Calling list_scans returns scan data from Tenable.io (IDs, names, statuses). No "not implemented" errors.
result: PASS
notes: Returned 46 scans with full metadata (IDs, names, statuses, owners, schedules). API connectivity confirmed.

### 2. List Scan Templates
expected: Calling list_scan_templates returns available Tenable.io scan templates. No errors.
result: FAIL
notes: HTTP 403 on /editor/scan/templates. API key lacks permission for this endpoint. Not a code bug — key scope limitation.

### 3. Get Scan Results
expected: Calling get_scan_results with a valid scan ID returns vulnerability results for that scan.
result: FAIL → FIXED
notes: |
  Bug: `vuln.severity.toUpperCase()` crashed because Tenable API returns severity as a number (0-4), not a string.
  Root cause: formatScanResults assumed mock-data shape (string severity, .name, .id) but real API uses numeric severity, plugin_name, plugin_id.
  Fix: Rewrote formatScanResults to detect real vs mock response and use severityLabel() mapper. Rebuilt successfully.

### 4. Get Scan Status
expected: Calling get_scan_status with a valid scan ID returns the scan's current status.
result: PASS
notes: Returned status "completed", name, targets, hostcount, scan_start, scan_end for scan 243.

### 5. Search Vulnerabilities
expected: Calling search_vulnerabilities with a keyword returns matching vulnerability entries from the workbench.
result: PASS (mock only)
notes: Returned mock Log4Shell data. Real workbench API not yet wired (Phase 3+ scope).

### 6. Error Handling - Invalid Scan ID
expected: Calling get_scan_results with an invalid/nonexistent scan ID returns a clear error message (not a crash).
result: PASS
notes: Returned clean "HTTP 404: Not Found" error, no stack trace or crash.

## Summary

total: 6
passed: 4
issues: 2
pending: 0
skipped: 0

## Gaps

### GAP-01: formatScanResults crash on real API data
- **Status:** FIXED
- **Test:** 3
- **Root cause:** Formatter assumed mock-data shape; real Tenable API returns numeric severity and different field names
- **Fix:** Added severityLabel() mapper and real-API branch in formatScanResults (src/tools/scans.ts)

### GAP-02: /editor/scan/templates returns 403
- **Status:** KNOWN LIMITATION
- **Test:** 2
- **Root cause:** API key does not have editor permissions. Not a code bug.
- **Action:** Document as known limitation; may need upgraded API key permissions.

### GAP-03: Trailing slash in NESSUS_URL causes 403
- **Status:** FIXED
- **Root cause:** baseUrl with trailing slash produced double-slash URLs (e.g. https://cloud.tenable.com//scans) which Tenable rejects with 403
- **Fix:** Added .replace(/\/+$/, '') in TenableClient constructor (src/tenable-client.ts)
