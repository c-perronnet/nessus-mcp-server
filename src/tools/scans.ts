/**
 * Scan-related tools for the Nessus MCP server
 */

import {
  getScanTemplates,
  startScan,
  getScanStatus,
  getScanResults,
  listScans,
  listScanHosts,
  getHostVulnerabilities
} from '../nessus-api.js';
import {
  validateScanId,
  validateTarget,
  validateScanType,
  handleNessusApiError
} from '../utils/error-handling.js';

/**
 * Tool to list available scan templates
 */
export const listScanTemplatesToolSchema = {
  name: 'list_scan_templates',
  description: 'List available Nessus scan templates',
  inputSchema: {
    type: 'object',
    properties: {}
  }
};

export const listScanTemplatesToolHandler = async () => {
  try {
    const templates = await getScanTemplates();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(templates, null, 2)
        }
      ]
    };
  } catch (error) {
    const mcpError = handleNessusApiError(error);
    const message = mcpError.message || '';
    if (message.includes('403')) {
      return {
        content: [
          {
            type: 'text',
            text: 'Permission denied: The API key does not have the Standard [32] role required to list scan templates. You can either upgrade the API key permissions in the Tenable.io console, or pass a template UUID directly to start_scan.'
          }
        ],
        isError: true
      };
    }
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${mcpError.message}`
        }
      ],
      isError: true
    };
  }
};

/**
 * Tool to start a new scan
 */
export const startScanToolSchema = {
  name: 'start_scan',
  description: 'Start a new vulnerability scan against a target',
  inputSchema: {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        description: 'Target IP, hostname, CIDR range (e.g., 192.168.1.0/24), or comma-separated list'
      },
      scan_type: {
        type: 'string',
        description: 'Template UUID (e.g., 731a8e52-...) or scan template name'
      }
    },
    required: ['target', 'scan_type']
  }
};

export const startScanToolHandler = async (args: Record<string, unknown>) => {
  try {
    // Validate arguments
    const target = validateTarget(args.target);
    const scanType = validateScanType(args.scan_type);

    // Start the scan
    const result = await startScan(target, scanType);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  } catch (error) {
    const mcpError = handleNessusApiError(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${mcpError.message}`
        }
      ],
      isError: true
    };
  }
};

/**
 * Tool to get scan status
 */
export const getScanStatusToolSchema = {
  name: 'get_scan_status',
  description: 'Check the status of a running scan',
  inputSchema: {
    type: 'object',
    properties: {
      scan_id: {
        type: 'string',
        description: 'ID of the scan to check'
      }
    },
    required: ['scan_id']
  }
};

export const getScanStatusToolHandler = async (args: Record<string, unknown>) => {
  try {
    // Validate arguments
    const scanId = validateScanId(args.scan_id);

    // Get scan status
    const status = await getScanStatus(scanId);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(status, null, 2)
        }
      ]
    };
  } catch (error) {
    const mcpError = handleNessusApiError(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${mcpError.message}`
        }
      ],
      isError: true
    };
  }
};

/**
 * Tool to get scan results
 */
export const getScanResultsToolSchema = {
  name: 'get_scan_results',
  description: 'Get the results of a completed scan',
  inputSchema: {
    type: 'object',
    properties: {
      scan_id: {
        type: 'string',
        description: 'ID of the scan to get results for'
      }
    },
    required: ['scan_id']
  }
};

export const getScanResultsToolHandler = async (args: Record<string, unknown>) => {
  try {
    // Validate arguments
    const scanId = validateScanId(args.scan_id);

    // Get scan results
    const results = await getScanResults(scanId);

    // Check if there was an error
    if ('error' in results) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${results.error}`
          }
        ],
        isError: true
      };
    }

    // Check if scan is still in progress — return informative (non-error) message
    const scanStatus = (results as any).info?.status;
    const incompleteStatuses = ['running', 'pending', 'initializing', 'paused'];
    if (scanStatus && incompleteStatuses.includes(scanStatus)) {
      const scanName = (results as any).info?.name || 'Unknown';
      return {
        content: [
          {
            type: 'text',
            text: `Scan '${scanName}' is currently ${scanStatus}. Use get_scan_status to monitor progress and try again when the scan is completed.`
          }
        ]
      };
    }

    // Format the results
    const formattedResults = formatScanResults(results);

    return {
      content: [
        {
          type: 'text',
          text: formattedResults
        }
      ]
    };
  } catch (error) {
    const mcpError = handleNessusApiError(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${mcpError.message}`
        }
      ],
      isError: true
    };
  }
};

/**
 * Tool to list all scans
 */
export const listScansToolSchema = {
  name: 'list_scans',
  description: 'List all scans and their status',
  inputSchema: {
    type: 'object',
    properties: {}
  }
};

export const listScansToolHandler = async () => {
  try {
    // Get all scans
    const scans = await listScans();

    // Null guard and epoch-to-ISO timestamp conversion
    const scanList = ((scans as any).scans ?? []).map((scan: any) => ({
      ...scan,
      creation_date: scan.creation_date
        ? new Date(scan.creation_date * 1000).toISOString()
        : scan.creation_date,
      last_modification_date: scan.last_modification_date
        ? new Date(scan.last_modification_date * 1000).toISOString()
        : scan.last_modification_date,
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ ...scans, scans: scanList }, null, 2)
        }
      ]
    };
  } catch (error) {
    const mcpError = handleNessusApiError(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${mcpError.message}`
        }
      ],
      isError: true
    };
  }
};

const SEVERITY_LABELS: Record<number, string> = {
  0: 'INFO',
  1: 'LOW',
  2: 'MEDIUM',
  3: 'HIGH',
  4: 'CRITICAL',
};

function severityLabel(severity: number | string): string {
  if (typeof severity === 'number') return SEVERITY_LABELS[severity] ?? 'UNKNOWN';
  return String(severity).toUpperCase();
}

/**
 * Format scan results for better readability.
 * Handles both the real Tenable API response (TenableScanDetailsResponse)
 * and the legacy mock-data shape.
 */
const formatScanResults = (results: any): string => {
  if (!results || !results.vulnerabilities) {
    return JSON.stringify(results, null, 2);
  }

  // Detect real API response (has .info object) vs mock shape
  const isRealApi = results.info !== undefined;

  let formattedResults: string;

  if (isRealApi) {
    const info = results.info;
    formattedResults = `# Scan Results: ${info.name || 'Unknown'}\n\n`;
    formattedResults += `Targets: ${info.targets || 'Unknown'}\n`;
    formattedResults += `Status: ${info.status || 'Unknown'}\n`;
    formattedResults += `Hosts: ${info.hostcount ?? 'Unknown'}\n\n`;

    // Build summary from hosts array
    const hosts: any[] = results.hosts || [];
    const summary = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    hosts.forEach((h: any) => {
      summary.critical += h.critical || 0;
      summary.high += h.high || 0;
      summary.medium += h.medium || 0;
      summary.low += h.low || 0;
      summary.info += h.info || 0;
    });

    formattedResults += `## Vulnerability Summary\n\n`;
    formattedResults += `Total Vulnerabilities: ${results.vulnerabilities.length}\n`;
    formattedResults += `Critical: ${summary.critical}\n`;
    formattedResults += `High: ${summary.high}\n`;
    formattedResults += `Medium: ${summary.medium}\n`;
    formattedResults += `Low: ${summary.low}\n`;
    formattedResults += `Info: ${summary.info}\n\n`;

    formattedResults += `## Vulnerabilities\n\n`;

    // Sort by severity descending (4=critical first)
    const sortedVulns = [...results.vulnerabilities].sort(
      (a: any, b: any) => (b.severity ?? 0) - (a.severity ?? 0),
    );

    sortedVulns.forEach((vuln: any, index: number) => {
      formattedResults += `### ${index + 1}. ${vuln.plugin_name} (Plugin ${vuln.plugin_id})\n\n`;
      formattedResults += `Severity: ${severityLabel(vuln.severity)}\n`;
      formattedResults += `Family: ${vuln.plugin_family}\n`;
      formattedResults += `Count: ${vuln.count}\n\n`;
    });
  } else {
    // Legacy mock-data shape
    const summary = results.summary || {};
    formattedResults = `# Scan Results for ${results.target || 'Unknown Target'}\n\n`;
    formattedResults += `Scan ID: ${results.scan_id || 'Unknown'}\n`;
    formattedResults += `Scan Type: ${results.scan_type || 'Unknown'}\n`;
    formattedResults += `Start Time: ${results.start_time || 'Unknown'}\n`;
    formattedResults += `End Time: ${results.end_time || 'Unknown'}\n`;
    formattedResults += `Status: ${results.status || 'Unknown'}\n\n`;

    formattedResults += `## Vulnerability Summary\n\n`;
    formattedResults += `Total Vulnerabilities: ${summary.total_vulnerabilities || 0}\n`;
    formattedResults += `Critical: ${summary.critical || 0}\n`;
    formattedResults += `High: ${summary.high || 0}\n`;
    formattedResults += `Medium: ${summary.medium || 0}\n`;
    formattedResults += `Low: ${summary.low || 0}\n`;
    formattedResults += `Info: ${summary.info || 0}\n\n`;

    formattedResults += `## Vulnerabilities\n\n`;

    const sortOrder = { 'critical': 0, 'high': 1, 'medium': 2, 'low': 3, 'info': 4 };
    const sortedVulns = [...results.vulnerabilities].sort((a: any, b: any) => {
      return (sortOrder[a.severity as keyof typeof sortOrder] || 999) -
             (sortOrder[b.severity as keyof typeof sortOrder] || 999);
    });

    sortedVulns.forEach((vuln: any, index: number) => {
      formattedResults += `### ${index + 1}. ${vuln.name} (${vuln.id})\n\n`;
      formattedResults += `Severity: ${severityLabel(vuln.severity)}\n`;
      formattedResults += `CVSS Score: ${vuln.cvss_score}\n\n`;
      formattedResults += `${vuln.description}\n\n`;

      if (vuln.affected_systems && vuln.affected_systems.length > 0) {
        formattedResults += `Affected Systems:\n`;
        vuln.affected_systems.forEach((system: string) => {
          formattedResults += `- ${system}\n`;
        });
        formattedResults += '\n';
      }

      if (vuln.remediation) {
        formattedResults += `Remediation: ${vuln.remediation}\n\n`;
      }

      if (vuln.references && vuln.references.length > 0) {
        formattedResults += `References:\n`;
        vuln.references.forEach((ref: string) => {
          formattedResults += `- ${ref}\n`;
        });
        formattedResults += '\n';
      }
    });
  }

  return formattedResults;
};

/**
 * Tool to list hosts in a scan with per-host severity counts
 */
export const listScanHostsToolSchema = {
  name: 'list_scan_hosts',
  description: 'List all hosts in a completed scan with per-host vulnerability severity counts (critical, high, medium, low, info)',
  inputSchema: {
    type: 'object',
    properties: {
      scan_id: {
        type: 'string',
        description: 'The ID of the scan to list hosts for'
      }
    },
    required: ['scan_id']
  }
};

export const listScanHostsToolHandler = async (args: Record<string, unknown>) => {
  try {
    const scanId = validateScanId(args.scan_id);
    const result = await listScanHosts(scanId);
    const hosts = result.hosts || [];

    let text = `# Scan Hosts (${hosts.length} hosts)\n\n`;
    text += `| Host | Critical | High | Medium | Low | Info | Score |\n`;
    text += `|------|----------|------|--------|-----|------|-------|\n`;

    for (const host of hosts) {
      text += `| ${host.hostname} (ID: ${host.host_id}) | ${host.critical} | ${host.high} | ${host.medium} | ${host.low} | ${host.info} | ${host.score} |\n`;
    }

    return {
      content: [{ type: 'text', text }]
    };
  } catch (error) {
    const mcpError = handleNessusApiError(error);
    return {
      content: [{ type: 'text', text: `Error: ${mcpError.message}` }],
      isError: true
    };
  }
};

/**
 * Tool to get vulnerabilities for a specific host in a scan
 */
export const getHostVulnerabilitiesToolSchema = {
  name: 'get_host_vulnerabilities',
  description: 'Get detailed vulnerabilities for a specific host in a scan, including plugin names, severity, and counts',
  inputSchema: {
    type: 'object',
    properties: {
      scan_id: {
        type: 'string',
        description: 'The ID of the scan'
      },
      host_id: {
        type: 'string',
        description: 'The host ID within the scan (from list_scan_hosts)'
      }
    },
    required: ['scan_id', 'host_id']
  }
};

export const getHostVulnerabilitiesToolHandler = async (args: Record<string, unknown>) => {
  try {
    const scanId = validateScanId(args.scan_id);
    const hostId = String(args.host_id || '');
    if (!hostId || !/^\d+$/.test(hostId)) {
      return {
        content: [{ type: 'text', text: 'Error: host_id must be a numeric ID (use list_scan_hosts to find host IDs)' }],
        isError: true
      };
    }

    const result = await getHostVulnerabilities(scanId, hostId);
    const info = result.info || {};
    const vulns = result.vulnerabilities || [];

    let text = `# Host Vulnerabilities: ${(info as any).host_ip || 'Unknown'}\n\n`;
    text += `FQDN: ${(info as any).host_fqdn || 'N/A'}\n`;
    text += `OS: ${Array.isArray((info as any).operating_system) ? (info as any).operating_system.join(', ') : 'N/A'}\n`;
    text += `Scan period: ${(info as any).host_start || '?'} → ${(info as any).host_end || '?'}\n\n`;

    text += `## Vulnerabilities (${vulns.length})\n\n`;

    const sorted = [...vulns].sort((a: any, b: any) => (b.severity ?? 0) - (a.severity ?? 0));
    for (const vuln of sorted) {
      text += `- **${severityLabel((vuln as any).severity)}** ${(vuln as any).plugin_name} (Plugin ${(vuln as any).plugin_id}, count: ${(vuln as any).count})\n`;
    }

    return {
      content: [{ type: 'text', text }]
    };
  } catch (error) {
    const mcpError = handleNessusApiError(error);
    return {
      content: [{ type: 'text', text: `Error: ${mcpError.message}` }],
      isError: true
    };
  }
};
