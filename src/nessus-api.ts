/**
 * Nessus API client
 * This file provides an interface to the Nessus API with fallback to mock data
 */

import {
  scanTemplates,
  createMockScan,
  getMockScanStatus,
  getMockScanResults,
  getMockVulnerabilityDetails,
  mockScans
} from './mock-data.js';
import { TenableClient } from './tenable-client.js';
import { NessusErrorType, createNessusError } from './utils/error-handling.js';
import type {
  TenableScanListResponse,
  TenableTemplateListResponse,
  TenableScanDetailsResponse,
  TenableCreateScanResponse,
  TenableWorkbenchVulnsResponse,
} from './types/tenable.js';

// Configuration for Nessus API
interface NessusConfig {
  url?: string;
  accessKey?: string;
  secretKey?: string;
  useMock: boolean;
}

// Default configuration — useMock must be explicitly set by caller
const defaultConfig: NessusConfig = {
  useMock: false
};

// Current configuration
let config: NessusConfig = { ...defaultConfig };

// TenableClient instance for real-API mode
let client: TenableClient | null = null;

/**
 * Return the active TenableClient or throw a configuration error.
 */
function getClient(): TenableClient {
  if (!client) {
    throw createNessusError(
      NessusErrorType.CONFIGURATION_ERROR,
      'TenableClient not initialized — call initializeNessusApi with valid credentials first',
    );
  }
  return client;
}

/**
 * Initialize the Nessus API client
 * @param newConfig Configuration options
 */
export const initializeNessusApi = (newConfig: Partial<NessusConfig> = {}) => {
  config = { ...defaultConfig, ...newConfig };

  if (config.useMock) {
    client = null;
  } else {
    client = new TenableClient({
      baseUrl: config.url!,
      accessKey: config.accessKey!,
      secretKey: config.secretKey!,
    });
  }

  console.error(`Nessus API client initialized in ${config.useMock ? 'mock' : 'real API'} mode`);

  return config;
};

/**
 * Get available scan templates
 */
export const getScanTemplates = async () => {
  if (config.useMock) {
    return { templates: scanTemplates };
  }

  return getClient().get<TenableTemplateListResponse>('/editor/scan/templates');
};

/**
 * Start a new scan
 * @param target Target IP or hostname
 * @param scanType Type of scan to run (template UUID)
 */
export const startScan = async (target: string, scanType: string) => {
  if (config.useMock) {
    const scanId = createMockScan(target, scanType);
    return {
      scan_id: scanId,
      status: "queued",
      message: "Scan queued successfully"
    };
  }

  // Basic create-scan call. Full two-step create+launch flow is Phase 3 (SCAN-01/02).
  const result = await getClient().post<TenableCreateScanResponse>('/scans', {
    uuid: scanType,
    settings: { name: 'MCP Scan', text_targets: target },
  });

  return {
    scan_id: String(result.scan.id),
    status: 'created',
    message: 'Scan created',
  };
};

/**
 * Get scan status
 * @param scanId ID of the scan
 */
export const getScanStatus = async (scanId: string) => {
  if (config.useMock) {
    return getMockScanStatus(scanId);
  }

  const result = await getClient().get<TenableScanDetailsResponse>(`/scans/${scanId}`);

  return {
    status: result.info.status,
    name: result.info.name,
    targets: result.info.targets,
    hostcount: result.info.hostcount,
    scan_start: result.info.scan_start,
    scan_end: result.info.scan_end,
  };
};

/**
 * Get scan results
 * @param scanId ID of the scan
 */
export const getScanResults = async (scanId: string) => {
  if (config.useMock) {
    return getMockScanResults(scanId);
  }

  return getClient().get<TenableScanDetailsResponse>(`/scans/${scanId}`);
};

/**
 * List all scans
 */
export const listScans = async () => {
  if (config.useMock) {
    const scans = Array.from(mockScans.values()).map(scan => ({
      id: scan.id,
      target: scan.target,
      type: scan.type,
      status: scan.status,
      created: scan.created
    }));

    return { scans };
  }

  return getClient().get<TenableScanListResponse>('/scans');
};

/**
 * Get vulnerability details
 * @param vulnId Vulnerability ID (e.g., plugin ID)
 */
export const getVulnerabilityDetails = async (vulnId: string) => {
  if (config.useMock) {
    return getMockVulnerabilityDetails(vulnId);
  }

  // Basic filter implementation. Phase 3 will refine filter logic.
  return getClient().get<TenableWorkbenchVulnsResponse>(
    `/workbenches/vulnerabilities?filter.0.filter=plugin_id&filter.0.quality=eq&filter.0.value=${vulnId}`,
  );
};

/**
 * Check if the Nessus API is available
 */
export const checkApiStatus = async () => {
  if (config.useMock) {
    return {
      status: "ok",
      mode: "mock",
      message: "Using mock Nessus API"
    };
  }

  try {
    await getClient().get<{ status: string }>('/server/status');
    return {
      status: "ok",
      mode: "real",
      message: "Connected to Tenable.io API"
    };
  } catch (error) {
    return {
      status: "error",
      mode: "real",
      message: `Failed to connect to Tenable.io API: ${error}`
    };
  }
};
