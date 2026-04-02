# Nessus MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server for interacting with the [Tenable.io](https://cloud.tenable.com) vulnerability scanner. This server allows AI assistants (Claude, etc.) to perform vulnerability scanning and analysis through the MCP protocol.

## Features

- **Scan Management** -- List, start, and monitor vulnerability scans on Tenable.io
- **Scan Results** -- Retrieve and format vulnerability findings from completed scans
- **Vulnerability Search** -- Search and inspect known vulnerabilities
- **Resilient HTTP Client** -- Centralized `TenableClient` with automatic retries, rate limiting, and request timeouts
- **Structured Error Handling** -- Typed error codes (`RATE_LIMITED`, `AUTH_FAILED`, `TIMEOUT`, etc.) with HTTP-status-to-error mapping

## Tools

| Tool | Description |
| --- | --- |
| `list_scans` | List all scans and their current status |
| `list_scan_templates` | List available scan templates |
| `start_scan` | Start a new vulnerability scan against a target |
| `get_scan_status` | Check the status of a running or completed scan |
| `get_scan_results` | Get formatted vulnerability results from a completed scan |
| `get_vulnerability_details` | Get detailed information about a specific vulnerability (e.g. CVE-2021-44228) |
| `search_vulnerabilities` | Search for vulnerabilities by keyword |

## Prerequisites

- **Node.js** 18+ (uses native `fetch` and `AbortSignal.timeout`)
- **Tenable.io account** with API keys ([generate here](https://cloud.tenable.com/settings/my-account/api-keys))

## Installation

```bash
git clone <repo-url>
cd nessus-mcp-server
npm install
npm run build
```

## Configuration

The server requires three environment variables:

| Variable | Description | Example |
| --- | --- | --- |
| `NESSUS_URL` | Tenable.io base URL (no trailing slash) | `https://cloud.tenable.com` |
| `NESSUS_ACCESS_KEY` | Tenable.io API access key | `5ccf...dc05` |
| `NESSUS_SECRET_KEY` | Tenable.io API secret key | `8cc7...63fc` |

The server exits with an error if any of these are missing.

> **Note:** A trailing slash in `NESSUS_URL` is automatically stripped by the client.

## Usage

### With Claude Code

Add to your `.mcp.json` (project root or `~/.claude/.mcp.json`):

```json
{
  "mcpServers": {
    "nessus": {
      "command": "node",
      "args": ["/path/to/nessus-mcp-server/build/index.js"],
      "env": {
        "NESSUS_URL": "https://cloud.tenable.com",
        "NESSUS_ACCESS_KEY": "your-access-key",
        "NESSUS_SECRET_KEY": "your-secret-key"
      }
    }
  }
}
```

Then use `/mcp` in Claude Code to connect.

### With Claude Desktop

Edit your Claude Desktop config:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "nessus": {
      "command": "node",
      "args": ["/path/to/nessus-mcp-server/build/index.js"],
      "env": {
        "NESSUS_URL": "https://cloud.tenable.com",
        "NESSUS_ACCESS_KEY": "your-access-key",
        "NESSUS_SECRET_KEY": "your-secret-key"
      }
    }
  }
}
```

### Standalone

```bash
NESSUS_URL=https://cloud.tenable.com \
NESSUS_ACCESS_KEY=your-key \
NESSUS_SECRET_KEY=your-secret \
node build/index.js
```

The server communicates over stdio using the MCP protocol.

## Architecture

```
src/
  index.ts                  MCP server setup, tool registration, stdio transport
  nessus-api.ts             API layer -- routes calls to TenableClient or mock data
  tenable-client.ts         HTTP client with auth, retry, throttle, timeout
  mock-data.ts              Mock vulnerability/scan data for testing
  tools/
    scans.ts                Scan tool schemas and handlers (list, start, status, results)
    vulnerabilities.ts      Vulnerability tool schemas and handlers (details, search)
  types/
    tenable.ts              TypeScript interfaces for Tenable.io API responses
  utils/
    error-handling.ts       Error types, HTTP-to-error mapping, MCP error creation
```

### HTTP Client (`TenableClient`)

All Tenable.io API calls go through `TenableClient`, which provides:

- **Authentication** -- `X-ApiKeys` header on every request
- **Timeout** -- Per-attempt `AbortSignal.timeout` (default 30s), fresh signal per retry
- **Retries** -- Exponential backoff via `p-retry` (default 3 attempts). Retries on 429 and 5xx; does not retry 400/401/403/404/409
- **Rate limiting** -- Client-side throttle via `p-throttle` (default 100 req/min in 10s sliding windows)

### Error Handling

Errors are mapped to typed `NessusErrorType` values:

| HTTP Status | Error Type |
| --- | --- |
| 401 | `AUTH_FAILED` |
| 403 | `AUTH_FAILED` |
| 404 | `NOT_FOUND` |
| 429 | `RATE_LIMITED` |
| 5xx | `API_ERROR` |
| Timeout | `TIMEOUT` |

All errors surface as structured MCP error responses, never raw stack traces.

## Example Interactions

### List all scans

```
> list_scans
```

Returns scan names, IDs, statuses, owners, and schedules from your Tenable.io account.

### Get scan results

```
> get_scan_results
  scan_id: "243"
```

Returns a formatted report with vulnerability summary (critical/high/medium/low/info counts) and per-vulnerability details (plugin name, severity, family, count).

### Check scan status

```
> get_scan_status
  scan_id: "243"
```

Returns the scan's current status, name, targets, host count, and start/end times.

### Start a scan

```
> start_scan
  target: "192.168.1.0/24"
  scan_type: "basic-network-scan"
```

### Search vulnerabilities

```
> search_vulnerabilities
  keyword: "log4j"
```

### Get vulnerability details

```
> get_vulnerability_details
  vulnerability_id: "CVE-2021-44228"
```

## Development

```bash
npm run build    # Compile TypeScript and set executable permission
npm run dev      # Build and run
npm start        # Run the compiled server
```

### Adding a new tool

1. Define `toolSchema` (name, description, inputSchema) and `toolHandler` in `src/tools/`
2. Import and register both in `src/index.ts` (add to `ListToolsRequestSchema` response and `CallToolRequestSchema` switch)

## Known Limitations

- **`list_scan_templates`** requires editor-level API permissions. Keys with read-only access will get a 403.
- **`search_vulnerabilities`** and **`get_vulnerability_details`** currently return mock data. Real workbench API integration is planned for a future phase.
- **`start_scan`** uses a single `POST /scans` call. Full two-step create+launch flow is planned for a future phase.

## License

ISC

## Disclaimer

This server is not affiliated with or endorsed by Tenable, Inc. Nessus is a registered trademark of Tenable, Inc.
