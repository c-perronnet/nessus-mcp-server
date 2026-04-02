# External Integrations

**Analysis Date:** 2026-04-02

## APIs & External Services

**Nessus Vulnerability Scanner:**
- Service: Tenable Nessus (optional real API)
- What it's used for: Vulnerability scanning, threat detection, compliance assessment
  - SDK/Client: Custom implementation via node-fetch (not yet implemented)
  - Authentication: API key-based via headers
  - Env vars: `NESSUS_URL`, `NESSUS_ACCESS_KEY`, `NESSUS_SECRET_KEY`
  - Status: Mock mode functional; real API implementation planned

**Model Context Protocol (MCP):**
- Service: Anthropic MCP protocol
- What it's used for: Communication between AI assistants and tool server
  - SDK/Client: @modelcontextprotocol/sdk 1.8.0
  - Transport: Stdio-based communication
  - Entry point: `src/index.ts` via StdioServerTransport

## Data Storage

**Databases:**
- None - Stateless MCP server with in-memory mock data

**File Storage:**
- None - No persistent storage

**Caching:**
- In-memory mock data caching
  - Location: `src/mock-data.ts`
  - Purpose: Provides sample vulnerability and scan data for testing
  - Contains: Pre-defined vulnerabilities, scan templates, and mock scan results

## Authentication & Identity

**Auth Provider:**
- Custom - API key-based authentication (Nessus)
  - Implementation: Environment variables for credentials
  - Approach: Headers-based authentication for Nessus REST API (when real API is implemented)
  - Current status: Mock mode requires no credentials; real API requires three environment variables

## Monitoring & Observability

**Error Tracking:**
- None - No external error tracking service

**Logs:**
- Standard output via console.error()
  - Startup mode indication: `console.error('Nessus MCP Server starting in {mode} mode')`
  - Server status: `console.error('Nessus MCP Server running on stdio')`
  - Shutdown: `console.error('Shutting down Nessus MCP Server...')`
  - Error reporting: Via console.error and MCP error responses

## CI/CD & Deployment

**Hosting:**
- Claude for Desktop (supported)
  - Configuration file: `~/.config/Claude/claude_desktop_config.json` (macOS/Linux)
  - Configuration file: `%APPDATA%\Claude\claude_desktop_config.json` (Windows)
- Generic MCP-compatible environments

**CI Pipeline:**
- None detected - Manual build required

**Build Process:**
- Local TypeScript compilation: `npm run build`
- Creates executable in `build/index.js` with executable permissions

## Environment Configuration

**Required env vars (for real Nessus API):**
- `NESSUS_URL` - Base URL of Nessus instance (e.g., `https://nessus.example.com:8834`)
- `NESSUS_ACCESS_KEY` - API access key from Nessus
- `NESSUS_SECRET_KEY` - API secret key from Nessus

**Optional env vars:**
- None specified

**Secrets location:**
- Environment variables only (no .env file in repo)
- Must be set at runtime or in MCP server configuration

**When to use real API:**
- Provide all three environment variables
- Server automatically detects credentials and switches from mock mode

**When to use mock mode:**
- Default behavior when any credential is missing
- Suitable for development and testing

## Webhooks & Callbacks

**Incoming:**
- None - MCP server is request-response only

**Outgoing:**
- None - No webhook notifications implemented

## Tool Definitions

The server exposes 7 tools via MCP protocol:

**Scan Management:**
- `list_scan_templates` - List available scan templates (no parameters)
- `start_scan` - Begin vulnerability scan (target, scan_type)
- `get_scan_status` - Check scan progress (scan_id)
- `get_scan_results` - Retrieve completed scan results (scan_id)
- `list_scans` - List all scans and status (no parameters)

**Vulnerability Analysis:**
- `get_vulnerability_details` - Detailed info on specific vulnerability (vulnerability_id)
- `search_vulnerabilities` - Search vulnerabilities by keyword (keyword)

## Real API Implementation Notes

**Currently not implemented:**
- Location: `src/nessus-api.ts` contains stubs throwing "Real API not implemented"
- Functions requiring implementation:
  - `getScanTemplates()` - GET /templates
  - `startScan(target, scanType)` - POST /scans
  - `getScanStatus(scanId)` - GET /scans/{id}/status
  - `getScanResults(scanId)` - GET /scans/{id}/results
  - `listScans()` - GET /scans
  - `getVulnerabilityDetails(vulnId)` - GET /vulnerabilities/{id}

**Expected Nessus REST API:**
- Base URL from `NESSUS_URL` environment variable
- Authentication: Custom header with access_key and secret_key
- Response format: JSON
- Client library: node-fetch 3.3.2 (added to dependencies but not used yet)

---

*Integration audit: 2026-04-02*
