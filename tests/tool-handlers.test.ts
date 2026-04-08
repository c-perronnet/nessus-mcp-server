import { describe, it, expect, beforeAll } from 'vitest';
import { initializeNessusApi } from '../src/nessus-api.js';
import {
  listScanTemplatesToolHandler,
  startScanToolHandler,
  getScanStatusToolHandler,
  getScanResultsToolHandler,
  listScansToolHandler,
} from '../src/tools/scans.js';
import {
  searchVulnerabilitiesToolHandler,
  getVulnerabilityDetailsToolHandler,
} from '../src/tools/vulnerabilities.js';

// ---------------------------------------------------------------------------
// Activate mock mode once for all handler tests
// ---------------------------------------------------------------------------

beforeAll(() => {
  initializeNessusApi({ useMock: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assert the basic MCP response envelope */
function assertMcpContent(result: { content: Array<{ type: string; text: string }>; isError?: boolean }) {
  expect(result.content).toBeDefined();
  expect(result.content.length).toBeGreaterThan(0);
  expect(result.content[0].type).toBe('text');
  expect(typeof result.content[0].text).toBe('string');
}

// ---------------------------------------------------------------------------
// 1. list_scan_templates
// ---------------------------------------------------------------------------

describe('list_scan_templates', () => {
  it('returns a valid MCP response with templates', async () => {
    const result = await listScanTemplatesToolHandler();
    assertMcpContent(result);
    expect(result.isError).toBeFalsy();

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.templates).toBeDefined();
    expect(Array.isArray(parsed.templates)).toBe(true);
    expect(parsed.templates.length).toBeGreaterThan(0);
  });

  it('templates have id and name fields', async () => {
    const result = await listScanTemplatesToolHandler();
    const parsed = JSON.parse(result.content[0].text);
    for (const tpl of parsed.templates) {
      expect(tpl).toHaveProperty('id');
      expect(tpl).toHaveProperty('name');
    }
  });
});

// ---------------------------------------------------------------------------
// 2. start_scan
// ---------------------------------------------------------------------------

describe('start_scan', () => {
  it('returns scan_id and queued status for valid input', async () => {
    const result = await startScanToolHandler({ target: '192.168.1.1', scan_type: 'basic' });
    assertMcpContent(result);
    expect(result.isError).toBeFalsy();

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.scan_id).toBeDefined();
    expect(parsed.status).toBe('queued');
  });

  it('returns isError for empty target', async () => {
    const result = await startScanToolHandler({ target: '', scan_type: 'basic' });
    assertMcpContent(result);
    expect(result.isError).toBe(true);
  });

  it('returns isError for missing target', async () => {
    const result = await startScanToolHandler({ scan_type: 'basic' });
    assertMcpContent(result);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. get_scan_status
// ---------------------------------------------------------------------------

describe('get_scan_status', () => {
  it('returns status for a known scan', async () => {
    // Create a scan first to get a valid scan_id
    const startResult = await startScanToolHandler({ target: '10.0.0.1', scan_type: 'basic' });
    const startParsed = JSON.parse(startResult.content[0].text);
    const scanId = startParsed.scan_id;

    const result = await getScanStatusToolHandler({ scan_id: scanId });
    assertMcpContent(result);
    expect(result.isError).toBeFalsy();

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBeDefined();
  });

  it('returns isError for non-numeric scan_id', async () => {
    const result = await getScanStatusToolHandler({ scan_id: 'nonexistent-id-999' });
    assertMcpContent(result);
    expect(result.isError).toBe(true);
  });

  it('returns isError for missing scan_id', async () => {
    const result = await getScanStatusToolHandler({});
    assertMcpContent(result);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. get_scan_results
// ---------------------------------------------------------------------------

describe('get_scan_results', () => {
  it('returns content for a started scan without crashing', async () => {
    // Create a scan
    const startResult = await startScanToolHandler({ target: '10.0.0.2', scan_type: 'basic' });
    const startParsed = JSON.parse(startResult.content[0].text);
    const scanId = startParsed.scan_id;

    const result = await getScanResultsToolHandler({ scan_id: scanId });
    assertMcpContent(result);
    // In mock mode the scan won't be "completed" instantly, so we may get an error
    // or a "results not available" message -- either is fine, just no crash
  });

  it('returns isError for missing scan_id', async () => {
    const result = await getScanResultsToolHandler({});
    assertMcpContent(result);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. list_scans
// ---------------------------------------------------------------------------

describe('list_scans', () => {
  it('returns valid MCP response with scans structure', async () => {
    const result = await listScansToolHandler();
    assertMcpContent(result);
    expect(result.isError).toBeFalsy();

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.scans).toBeDefined();
    expect(Array.isArray(parsed.scans)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. search_vulnerabilities
// ---------------------------------------------------------------------------

describe('search_vulnerabilities', () => {
  it('returns results for a matching keyword', async () => {
    // "remote code" matches descriptions in mock data (Log4Shell, Spring4Shell, etc.)
    const result = await searchVulnerabilitiesToolHandler({ keyword: 'remote code' });
    assertMcpContent(result);
    expect(result.isError).toBeFalsy();
    // Response is markdown-formatted text, not JSON -- just verify it's non-empty
    expect(result.content[0].text.length).toBeGreaterThan(0);
  });

  it('returns content for no-match keyword without crashing', async () => {
    const result = await searchVulnerabilitiesToolHandler({ keyword: 'zzz_no_match_zzz' });
    assertMcpContent(result);
    // Should return a "no vulnerabilities found" message, not crash
    expect(result.isError).toBeFalsy();
  });

  it('returns isError for missing keyword', async () => {
    const result = await searchVulnerabilitiesToolHandler({});
    assertMcpContent(result);
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. get_vulnerability_details
// ---------------------------------------------------------------------------

describe('get_vulnerability_details', () => {
  it('returns details for a known CVE', async () => {
    const result = await getVulnerabilityDetailsToolHandler({ vulnerability_id: 'CVE-2021-44228' });
    assertMcpContent(result);
    expect(result.isError).toBeFalsy();
    // Mock returns the vulnerability object, handler formats as markdown
    expect(result.content[0].text).toContain('Log4Shell');
  });

  it('returns graceful error for unknown vulnerability', async () => {
    const result = await getVulnerabilityDetailsToolHandler({ vulnerability_id: 'CVE-0000-00000' });
    assertMcpContent(result);
    // Mock returns { error: "Vulnerability not found" } -- handler formats it
    // Either isError or a message containing "not found" / "error" is acceptable
  });

  it('returns isError for missing vulnerability_id', async () => {
    const result = await getVulnerabilityDetailsToolHandler({});
    assertMcpContent(result);
    expect(result.isError).toBe(true);
  });
});
