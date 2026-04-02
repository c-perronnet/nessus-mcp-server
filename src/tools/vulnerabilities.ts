/**
 * Vulnerability-related tools for the Nessus MCP server
 */

import { getVulnerabilityDetails, searchVulnerabilities } from '../nessus-api.js';
import {
  validateVulnerabilityId,
  handleNessusApiError
} from '../utils/error-handling.js';

// ---------------------------------------------------------------------------
// Severity helpers (same map used by scans.ts)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// get_vulnerability_details
// ---------------------------------------------------------------------------

/**
 * Tool to get vulnerability details
 */
export const getVulnerabilityDetailsToolSchema = {
  name: 'get_vulnerability_details',
  description: 'Get detailed information about a specific vulnerability',
  inputSchema: {
    type: 'object',
    properties: {
      vulnerability_id: {
        type: 'string',
        description: 'ID of the vulnerability (CVE ID like CVE-2021-44228, numeric plugin ID, or plugin name keyword)'
      }
    },
    required: ['vulnerability_id']
  }
};

export const getVulnerabilityDetailsToolHandler = async (args: Record<string, unknown>) => {
  try {
    // Validate arguments
    const vulnId = validateVulnerabilityId(args.vulnerability_id);

    // Get vulnerability details
    const details = await getVulnerabilityDetails(vulnId);

    // Format the vulnerability details
    const formattedDetails = formatVulnerabilityDetails(details);

    return {
      content: [
        {
          type: 'text',
          text: formattedDetails
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

// ---------------------------------------------------------------------------
// Vulnerability details formatter
// ---------------------------------------------------------------------------

/**
 * Format vulnerability details for better readability.
 * Handles three response shapes:
 * 1. Workbenches list response (from CVE or filter lookup) — has .vulnerabilities array
 * 2. Real plugin info response — has .plugin_name
 * 3. Legacy mock response — has .name, .id, .severity as string
 */
const formatVulnerabilityDetails = (details: unknown): string => {
  if (!details) {
    return 'No vulnerability details available';
  }

  const d = details as Record<string, unknown>;

  // Shape 1: Workbenches list response (CVE or filter lookup)
  if (Array.isArray(d.vulnerabilities)) {
    const vulns = d.vulnerabilities as Array<Record<string, unknown>>;
    const total = (d.total_vulnerability_count as number) ?? vulns.length;

    if (vulns.length === 0) {
      return 'No vulnerability details found for the given identifier.';
    }

    let formatted = `# Vulnerability Details\n\n`;
    formatted += `Found ${vulns.length} matching plugin(s):\n\n`;

    for (const vuln of vulns) {
      formatted += `## ${vuln.plugin_name} (Plugin ID: ${vuln.plugin_id})\n\n`;
      formatted += `**Severity:** ${severityLabel(vuln.severity as number)}\n`;
      formatted += `**Plugin Family:** ${vuln.plugin_family ?? 'N/A'}\n`;
      if (vuln.vpr_score != null) {
        formatted += `**VPR Score:** ${vuln.vpr_score}\n`;
      }
      formatted += `**Affected Hosts:** ${vuln.count ?? 'N/A'}\n\n`;
    }

    if (total > vulns.length) {
      formatted += `\n> Note: Results truncated. Showing ${vulns.length} of ${total} total vulnerabilities.\n`;
    }

    return formatted;
  }

  // Shape 2: Real plugin info response (has plugin_name)
  if (d.plugin_name !== undefined) {
    let formatted = `# ${d.plugin_name} (Plugin ID: ${d.plugin_id ?? 'N/A'})\n\n`;
    formatted += `**Severity:** ${severityLabel((d.severity ?? d.risk_factor ?? 'Unknown') as number | string)}\n`;
    if (d.vpr_score != null) {
      formatted += `**VPR Score:** ${d.vpr_score}\n`;
    }
    if (d.plugin_family) {
      formatted += `**Plugin Family:** ${d.plugin_family}\n`;
    }
    formatted += '\n';

    if (d.description) {
      formatted += `## Description\n\n${d.description}\n\n`;
    }

    if (d.synopsis) {
      formatted += `## Synopsis\n\n${d.synopsis}\n\n`;
    }

    if (d.solution) {
      formatted += `## Solution\n\n${d.solution}\n\n`;
    }

    if (d.see_also) {
      formatted += `## References\n\n`;
      const refs = typeof d.see_also === 'string' ? (d.see_also as string).split('\n') : d.see_also;
      if (Array.isArray(refs)) {
        for (const ref of refs) {
          formatted += `- ${ref}\n`;
        }
      }
      formatted += '\n';
    }

    return formatted;
  }

  // Shape 3: Legacy mock response (has .name, .id, .severity as string)
  if (d.name !== undefined) {
    let formatted = `# ${d.name} (${d.id})\n\n`;
    formatted += `**Severity:** ${severityLabel((d.severity ?? 'Unknown') as string)}\n`;
    formatted += `**CVSS Score:** ${d.cvss_score ?? 'N/A'}\n\n`;

    if (d.description) {
      formatted += `## Description\n\n${d.description}\n\n`;
    }

    if (Array.isArray(d.affected_systems) && d.affected_systems.length > 0) {
      formatted += `## Affected Systems\n\n`;
      for (const system of d.affected_systems as string[]) {
        formatted += `- ${system}\n`;
      }
      formatted += '\n';
    }

    if (d.remediation) {
      formatted += `## Remediation\n\n${d.remediation}\n\n`;
    }

    if (Array.isArray(d.references) && d.references.length > 0) {
      formatted += `## References\n\n`;
      for (const ref of d.references as string[]) {
        formatted += `- ${ref}\n`;
      }
      formatted += '\n';
    }

    return formatted;
  }

  // Unknown shape — dump as JSON for debugging
  return `# Vulnerability Details\n\n\`\`\`json\n${JSON.stringify(details, null, 2)}\n\`\`\`\n`;
};

// ---------------------------------------------------------------------------
// search_vulnerabilities
// ---------------------------------------------------------------------------

/**
 * Tool to search for vulnerabilities by keyword
 */
export const searchVulnerabilitiesToolSchema = {
  name: 'search_vulnerabilities',
  description: 'Search for vulnerabilities by keyword',
  inputSchema: {
    type: 'object',
    properties: {
      keyword: {
        type: 'string',
        description: 'Keyword to search for in vulnerability/plugin names (searches via Tenable.io Workbenches API)'
      }
    },
    required: ['keyword']
  }
};

export const searchVulnerabilitiesToolHandler = async (args: Record<string, unknown>) => {
  try {
    // Validate arguments
    if (!args.keyword || typeof args.keyword !== 'string') {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: Keyword is required and must be a string'
          }
        ],
        isError: true
      };
    }

    const keyword = args.keyword as string;

    // Route through nessus-api.ts to Workbenches API
    const result = await searchVulnerabilities(keyword);

    const vulns = result.vulnerabilities;
    if (!vulns || vulns.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No vulnerabilities found matching "${keyword}"`
          }
        ]
      };
    }

    // Format the search results
    let results = `# Vulnerability Search Results for "${keyword}"\n\n`;
    results += `Found ${vulns.length} matching vulnerabilities:\n\n`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vulns.forEach((vuln: any, index: number) => {
      const name = (vuln.plugin_name ?? vuln.name ?? 'Unknown') as string;
      const id = (vuln.plugin_id ?? vuln.id ?? 'N/A') as string | number;
      const sev = vuln.severity;
      const family = vuln.plugin_family as string | undefined;
      const count = vuln.count as number | undefined;

      results += `## ${index + 1}. ${name} (${id})\n\n`;
      results += `**Severity:** ${severityLabel(sev as number | string)}\n`;
      if (family) {
        results += `**Plugin Family:** ${family}\n`;
      }
      if (count != null) {
        results += `**Affected Hosts:** ${count}\n`;
      }
      results += '\n';
    });

    // Truncation warning
    if (result.total_vulnerability_count > vulns.length) {
      results += `> Note: Results truncated. Showing ${vulns.length} of ${result.total_vulnerability_count} total vulnerabilities.\n`;
    }

    return {
      content: [
        {
          type: 'text',
          text: results
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
