import { describe, it, expect } from 'vitest';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import {
  validateScanId,
  validateVulnerabilityId,
  validateTarget,
  validateScanType,
  httpStatusToErrorType,
  NessusErrorType,
} from '../src/utils/error-handling.js';

// ---------------------------------------------------------------------------
// validateScanId
// ---------------------------------------------------------------------------

describe('validateScanId', () => {
  it('returns the string for a valid scan ID', () => {
    expect(validateScanId('123')).toBe('123');
  });

  it('throws for empty string', () => {
    expect(() => validateScanId('')).toThrow(McpError);
  });

  it('throws for null', () => {
    expect(() => validateScanId(null)).toThrow(McpError);
  });

  it('throws for undefined', () => {
    expect(() => validateScanId(undefined)).toThrow(McpError);
  });

  it('coerces numeric input to string', () => {
    expect(validateScanId(123)).toBe('123');
  });

  it('throws with InvalidParams code', () => {
    try {
      validateScanId(null);
    } catch (e) {
      expect(e).toBeInstanceOf(McpError);
      expect((e as McpError).code).toBe(ErrorCode.InvalidParams);
    }
  });
});

// ---------------------------------------------------------------------------
// validateVulnerabilityId
// ---------------------------------------------------------------------------

describe('validateVulnerabilityId', () => {
  it('returns the string for a valid vuln ID', () => {
    expect(validateVulnerabilityId('CVE-2024-1234')).toBe('CVE-2024-1234');
  });

  it('throws for empty string', () => {
    expect(() => validateVulnerabilityId('')).toThrow(McpError);
  });

  it('throws for null', () => {
    expect(() => validateVulnerabilityId(null)).toThrow(McpError);
  });

  it('throws for undefined', () => {
    expect(() => validateVulnerabilityId(undefined)).toThrow(McpError);
  });

  it('throws for non-string (number)', () => {
    expect(() => validateVulnerabilityId(42)).toThrow(McpError);
  });

  it('throws with InvalidParams code', () => {
    try {
      validateVulnerabilityId(null);
    } catch (e) {
      expect(e).toBeInstanceOf(McpError);
      expect((e as McpError).code).toBe(ErrorCode.InvalidParams);
    }
  });
});

// ---------------------------------------------------------------------------
// validateTarget
// ---------------------------------------------------------------------------

describe('validateTarget', () => {
  it('returns the string for a valid IP', () => {
    expect(validateTarget('192.168.1.1')).toBe('192.168.1.1');
  });

  it('returns the string for a CIDR range', () => {
    expect(validateTarget('10.0.0.0/24')).toBe('10.0.0.0/24');
  });

  it('returns the string for a hostname', () => {
    expect(validateTarget('server.example.com')).toBe('server.example.com');
  });

  it('returns the string for a comma-separated list', () => {
    expect(validateTarget('192.168.1.1,192.168.1.2')).toBe(
      '192.168.1.1,192.168.1.2',
    );
  });

  it('throws for empty string', () => {
    expect(() => validateTarget('')).toThrow(McpError);
  });

  it('throws for null', () => {
    expect(() => validateTarget(null)).toThrow(McpError);
  });

  it('throws for undefined', () => {
    expect(() => validateTarget(undefined)).toThrow(McpError);
  });

  it('throws for non-string (number)', () => {
    expect(() => validateTarget(123)).toThrow(McpError);
  });

  it('throws for invalid characters (<script>)', () => {
    expect(() => validateTarget('<script>')).toThrow(McpError);
  });

  it('throws with InvalidParams code', () => {
    try {
      validateTarget(null);
    } catch (e) {
      expect(e).toBeInstanceOf(McpError);
      expect((e as McpError).code).toBe(ErrorCode.InvalidParams);
    }
  });
});

// ---------------------------------------------------------------------------
// validateScanType
// ---------------------------------------------------------------------------

describe('validateScanType', () => {
  it('returns the string for a valid scan type', () => {
    expect(validateScanType('basic-network-scan')).toBe('basic-network-scan');
  });

  it('returns the string for a UUID-style type', () => {
    const uuid = '731a8e52-3ea6-a291-ec0a-d2ff0619c19d';
    expect(validateScanType(uuid)).toBe(uuid);
  });

  it('throws for empty string', () => {
    expect(() => validateScanType('')).toThrow(McpError);
  });

  it('throws for null', () => {
    expect(() => validateScanType(null)).toThrow(McpError);
  });

  it('throws for undefined', () => {
    expect(() => validateScanType(undefined)).toThrow(McpError);
  });

  it('throws for non-string (number)', () => {
    expect(() => validateScanType(99)).toThrow(McpError);
  });

  it('throws with InvalidParams code', () => {
    try {
      validateScanType(null);
    } catch (e) {
      expect(e).toBeInstanceOf(McpError);
      expect((e as McpError).code).toBe(ErrorCode.InvalidParams);
    }
  });
});

// ---------------------------------------------------------------------------
// httpStatusToErrorType
// ---------------------------------------------------------------------------

describe('httpStatusToErrorType', () => {
  it('maps 401 to AUTH_FAILED', () => {
    expect(httpStatusToErrorType(401)).toBe(NessusErrorType.AUTH_FAILED);
  });

  it('maps 403 to AUTH_FAILED', () => {
    expect(httpStatusToErrorType(403)).toBe(NessusErrorType.AUTH_FAILED);
  });

  it('maps 404 to SCAN_NOT_FOUND', () => {
    expect(httpStatusToErrorType(404)).toBe(NessusErrorType.SCAN_NOT_FOUND);
  });

  it('maps 409 to SCAN_IN_PROGRESS', () => {
    expect(httpStatusToErrorType(409)).toBe(NessusErrorType.SCAN_IN_PROGRESS);
  });

  it('maps 429 to RATE_LIMITED', () => {
    expect(httpStatusToErrorType(429)).toBe(NessusErrorType.RATE_LIMITED);
  });

  it('maps 500 to API_ERROR', () => {
    expect(httpStatusToErrorType(500)).toBe(NessusErrorType.API_ERROR);
  });

  it('maps unknown status to API_ERROR', () => {
    expect(httpStatusToErrorType(418)).toBe(NessusErrorType.API_ERROR);
  });
});
