# Architecture Patterns

**Domain:** MCP Server — Tenable.io API Integration
**Researched:** 2026-04-02
**Confidence:** HIGH (based on direct codebase analysis + well-established Tenable.io API patterns)

---

## Recommended Architecture

The target architecture adds a dedicated HTTP client layer between the existing API abstraction and the external Tenable.io cloud service. The current `nessus-api.ts` has `if (config.useMock) { ... } else { throw new Error("Real API not implemented") }` stubs throughout. The change replaces those stubs with real HTTP calls delegated to a new `tenable-client.ts` module.

```
MCP Client (Claude, etc.)
        |  stdio
        v
src/index.ts             [MCP Protocol Layer]
        |  calls handlers
        v
src/tools/scans.ts       [Tool Layer]
src/tools/vulnerabilities.ts
        |  calls API functions
        v
src/nessus-api.ts        [API Abstraction Layer]   <-- mock/real branch lives here
        |                     |
        v                     v
src/mock-data.ts         src/tenable-client.ts     [NEW: HTTP Client Layer]
[Mock Layer]                  |
                              v
                    https://cloud.tenable.com      [Tenable.io REST API]
```

The existing layers remain structurally unchanged. Only `nessus-api.ts` is modified (replacing `throw new Error("Real API not implemented")` with calls to `tenableClient.*`). The new `tenable-client.ts` is purely additive.

---

## Component Boundaries

| Component | File | Responsibility | Communicates With |
|-----------|------|----------------|-------------------|
| MCP Protocol Layer | `src/index.ts` | Protocol framing, tool routing, stdio transport, signal handling | MCP SDK, Tool Layer |
| Tool Layer (Scans) | `src/tools/scans.ts` | Tool schemas, input validation, output formatting (markdown), error wrapping | API Abstraction Layer, Utility Layer |
| Tool Layer (Vulns) | `src/tools/vulnerabilities.ts` | Tool schemas, vuln formatting, search logic | API Abstraction Layer, Utility Layer |
| API Abstraction Layer | `src/nessus-api.ts` | mock/real branching, config state, public API surface | Mock Layer OR HTTP Client Layer |
| HTTP Client Layer | `src/tenable-client.ts` (NEW) | All HTTP calls to Tenable.io, auth headers, response parsing, error normalization, retry/timeout | Tenable.io REST API |
| Mock Layer | `src/mock-data.ts` | In-memory scan state, static vulnerability data, time-simulation | API Abstraction Layer only |
| Utility Layer | `src/utils/error-handling.ts` | Error type enum, validators, MCP error mapping | Tool Layer, MCP Protocol Layer |
| Type Layer | `src/types/tenable.ts` (NEW) | TypeScript interfaces for all Tenable.io API response shapes | HTTP Client Layer, API Abstraction Layer |

**Boundary rules:**
- Tool Layer NEVER imports from `mock-data.ts` directly. (Exception: `vulnerabilities.ts` currently imports mock-data for `search_vulnerabilities` — this must be fixed as part of the integration.)
- HTTP Client Layer NEVER imports MCP SDK types. It is framework-agnostic.
- API Abstraction Layer is the only place that knows whether `useMock` is true or false.
- Mock Layer is a leaf: nothing outside API Abstraction Layer should import it.

---

## Data Flow

### Tool Invocation (real API mode)

```
1. MCP client sends CallToolRequest { name: "start_scan", arguments: { target, scan_type } }
2. index.ts routes to startScanToolHandler(args)
3. Handler calls validateTarget(args.target), validateScanType(args.scan_type)
4. Handler calls nessus-api.startScan(target, scanType)
5. nessus-api checks config.useMock === false
6. nessus-api calls tenableClient.launchScan(target, templateUuid)
7. tenableClient builds HTTP request:
     POST https://cloud.tenable.com/scans
     Headers: X-ApiKeys: accessKey=<key>; secretKey=<key>
              Content-Type: application/json
     Body: { uuid: templateUuid, settings: { name, text_targets: target } }
8. tenableClient parses JSON response, returns typed TenableScan object
9. nessus-api maps TenableScan → internal shape { scan_id, status, message }
10. Handler formats to markdown text
11. MCP response { content: [{ type: "text", text: "..." }] } sent via stdio
```

### Configuration Flow (startup)

```
1. process.env checked for NESSUS_URL, NESSUS_ACCESS_KEY, NESSUS_SECRET_KEY
   (Note: NESSUS_URL is legacy; for Tenable.io cloud it is always https://cloud.tenable.com)
2. initializeNessusApi() sets config.useMock based on key presence
3. tenableClient.ts reads config on first call (or receives config at init)
4. No global state beyond module-scoped config object in nessus-api.ts
```

### Error Flow

```
HTTP 4xx/5xx from Tenable.io
        |
        v
tenableClient.ts normalizes to typed TenableApiError
        |
        v
nessus-api.ts re-throws as generic Error (or NessusError)
        |
        v
Tool handler's try/catch calls handleNessusApiError(error)
        |
        v
createNessusError() maps to McpError with correct ErrorCode
        |
        v
MCP response { isError: true, content: [{ type: "text", text: "Error: ..." }] }
```

---

## Patterns to Follow

### Pattern 1: Mock/Real Branch in API Abstraction Layer

The `if (config.useMock)` branching stays in `nessus-api.ts`. The HTTP client (`tenable-client.ts`) is never instantiated or imported in mock mode.

```typescript
// src/nessus-api.ts
export const startScan = async (target: string, scanType: string) => {
  if (config.useMock) {
    const scanId = createMockScan(target, scanType);
    return { scan_id: scanId, status: "queued", message: "Scan queued successfully" };
  }

  const templateUuid = resolveTemplateUuid(scanType);
  const response = await tenableClient.launchScan(target, templateUuid, config);
  return { scan_id: String(response.scan.id), status: "pending", message: "Scan launched" };
};
```

**Why this pattern:** The tool handlers are already written to call `nessus-api.*` functions. They don't need to change at all when real API is added.

### Pattern 2: Stateless HTTP Client Module

`tenable-client.ts` should be a collection of async functions, not a class. Functions receive the config object rather than holding it as instance state. This is consistent with the ESM module pattern already used throughout.

```typescript
// src/tenable-client.ts
export const launchScan = async (
  target: string,
  templateUuid: string,
  config: TenableConfig
): Promise<TenableLaunchScanResponse> => {
  const response = await fetch(`${config.url}/scans`, {
    method: 'POST',
    headers: buildAuthHeaders(config),
    body: JSON.stringify({ uuid: templateUuid, settings: { name: `MCP scan - ${target}`, text_targets: target } })
  });
  if (!response.ok) await throwTenableError(response);
  return response.json() as Promise<TenableLaunchScanResponse>;
};

const buildAuthHeaders = (config: TenableConfig): Record<string, string> => ({
  'X-ApiKeys': `accessKey=${config.accessKey}; secretKey=${config.secretKey}`,
  'Content-Type': 'application/json',
  'Accept': 'application/json'
});
```

**Why this pattern:** Node.js 22 native `fetch` makes `node-fetch` unnecessary. The stateless design makes testing easy — inject any config object.

### Pattern 3: Response Shape Mapping at the Abstraction Boundary

Tenable.io returns its own data shapes (e.g., `scan.id` is a number, status strings differ from mock). The mapping from Tenable.io shapes to the internal shapes the tool handlers expect happens in `nessus-api.ts`, not in the HTTP client and not in the tool handlers. Tool handlers see the same interface regardless of mock/real mode.

```typescript
// nessus-api.ts maps Tenable response to internal shape
const response = await tenableClient.getScan(scanId, config);
return {
  id: String(response.info.scan_id ?? response.info.object_id),
  status: normalizeScanStatus(response.info.status),
  target: response.info.targets,
  type: response.info.scanner_name
};
```

### Pattern 4: Dedicated Type File for Tenable.io Shapes

All raw Tenable.io API response types go in `src/types/tenable.ts`. This eliminates `any` types throughout and makes the mapping layer explicit.

```typescript
// src/types/tenable.ts
export interface TenableScanListResponse {
  scans: TenableScan[] | null;
  timestamp: number;
}

export interface TenableScan {
  id: number;
  uuid: string;
  name: string;
  status: string;   // "running" | "completed" | "canceled" | "empty" etc.
  targets: string;
  creation_date: number;  // Unix timestamp
  last_modification_date: number;
}
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Importing mock-data.ts from Tool Handlers

**What goes wrong:** `src/tools/vulnerabilities.ts` currently has a dynamic `import('../mock-data.js')` inside `searchVulnerabilitiesToolHandler`. This bypasses the API abstraction layer, meaning in real API mode the handler still searches mock data.

**Why bad:** Mock/real branching must be centralized in `nessus-api.ts`. Once real API integration lands, `search_vulnerabilities` would silently return mock results even in production.

**Instead:** Add a `searchVulnerabilities(keyword: string)` function to `nessus-api.ts` that (a) filters mock data in mock mode, (b) calls `tenableClient.exportVulnerabilities({ filter: keyword })` in real mode.

### Anti-Pattern 2: Logging to stdout

**What goes wrong:** Any `console.log()` call (as opposed to `console.error()`) writes to stdout, which is the MCP stdio transport. The MCP client will receive garbled output mixed with log lines, breaking JSON framing.

**Why bad:** Corrupts the stdio MCP stream. Hard to diagnose because it appears intermittently.

**Instead:** All logging must use `console.error()`. This is already correct in `index.ts` but must be enforced in any new code added to `tenable-client.ts`.

### Anti-Pattern 3: Putting TLS/fetch Configuration Inside Tool Handlers

**What goes wrong:** Placing auth headers, timeout config, or TLS options anywhere above the HTTP client layer.

**Why bad:** Credentials leak into business logic; changes require touching multiple files.

**Instead:** All HTTP configuration (headers, timeouts, TLS, base URL) belongs exclusively in `tenable-client.ts`.

### Anti-Pattern 4: Reusing Tenable.io Scan IDs as Strings Without Normalization

**What goes wrong:** Tenable.io API returns scan IDs as integers. The existing mock layer uses string IDs like `"scan-1234567890-42"`. If tool handlers or validators assume numeric IDs (e.g., `/^\d+$/` check) they will reject mock IDs, and vice versa.

**Why bad:** Breaks mock/real mode symmetry; validators fail in one mode but not the other.

**Instead:** Normalize Tenable.io integer IDs to strings at the API abstraction boundary. Keep the public API surface (`scan_id: string`) consistent with what the tool handlers and validators already expect.

---

## Tenable.io API Endpoint Mapping

The following table maps each existing MCP tool to the Tenable.io REST endpoint it will call. Confidence is MEDIUM — based on training data knowledge of the Tenable.io API; verify against official docs at https://developer.tenable.com/reference before implementing.

| MCP Tool | Current nessus-api.ts function | Tenable.io Endpoint | Notes |
|----------|-------------------------------|---------------------|-------|
| `list_scan_templates` | `getScanTemplates()` | `GET /editor/scan/templates` | Returns array of template objects with `uuid` field |
| `start_scan` | `startScan(target, scanType)` | `POST /scans` | Requires template UUID not name; need uuid→name mapping |
| `get_scan_status` | `getScanStatus(scanId)` | `GET /scans/{scan_id}` | Status in `info.status`; scan_id must be integer |
| `get_scan_results` | `getScanResults(scanId)` | `GET /scans/{scan_id}` | Vulnerabilities in `vulnerabilities[]` array |
| `list_scans` | `listScans()` | `GET /scans` | Returns `scans[]` or null if no scans exist |
| `get_vulnerability_details` | `getVulnerabilityDetails(vulnId)` | `GET /workbenches/vulnerabilities/{plugin_id}/info` | Tenable uses plugin IDs, not CVE IDs, as primary key |
| `search_vulnerabilities` | _(not in nessus-api.ts)_ | `GET /workbenches/vulnerabilities` | Query param `?filter.search_type=and&filter.0.filter=plugin.name&filter.0.quality=match&filter.0.value=<keyword>` |

**Key discovery:** The `get_vulnerability_details` tool uses CVE IDs in its interface (`CVE-2021-44228`), but Tenable.io primarily indexes vulnerabilities by plugin ID (integer). The real implementation will need a translation strategy: either use the workbenches API with a CVE filter, or document that in real mode the `vulnerability_id` parameter should be a Tenable plugin ID.

---

## Suggested Build Order

Dependencies between components determine the correct implementation sequence:

```
1. src/types/tenable.ts          (no dependencies — defines shapes everything else uses)
        |
        v
2. src/tenable-client.ts         (depends on types only — pure HTTP functions)
        |
        v
3. src/nessus-api.ts (modify)    (fill in real branches — depends on tenable-client)
        |
        v
4. src/tools/vulnerabilities.ts  (fix mock-data.ts import — depends on nessus-api)
        |
        v
5. src/utils/error-handling.ts   (extend error types for HTTP/auth errors)
```

**Rationale:**
- Types first because the HTTP client functions need typed return values to avoid `any`.
- HTTP client second because the API abstraction layer's real branches call into it.
- API abstraction third — this is where all the real integration work concentrates.
- Tool handler fix fourth — the `search_vulnerabilities` bypass of the API layer is a bug that must be fixed once the API layer has a real `searchVulnerabilities` function.
- Error handling last (or in parallel with step 4) — new HTTP-specific error types (`RATE_LIMITED`, `AUTH_FAILED`, `TIMEOUT`) should be added after the HTTP client reveals what errors actually surface.

---

## Scalability Considerations

| Concern | Current (mock) | With real API |
|---------|---------------|---------------|
| Rate limiting | Not applicable | Tenable.io enforces per-minute request limits; need backoff/retry in tenable-client.ts |
| Latency | Instantaneous | Scan operations can take minutes; tool responses may need progress framing |
| Scan ID state | In-process Map, lost on restart | Tenable.io is stateful; scan IDs persist server-side, no local state needed |
| Auth expiry | Not applicable | API keys don't expire by default; but credential rotation should be config-driven |
| Concurrency | No concern (mock) | Native fetch handles concurrent requests; no pooling needed at this scale |

---

## Sources

- Direct codebase analysis: `src/nessus-api.ts`, `src/tools/scans.ts`, `src/tools/vulnerabilities.ts`, `src/mock-data.ts`, `src/utils/error-handling.ts`, `src/index.ts` (HIGH confidence — primary source)
- PROJECT.md: API base URL `https://cloud.tenable.com`, auth mechanism (access key + secret key), Node 22 target (HIGH confidence — project-defined)
- Tenable.io API endpoint structure: training data knowledge of the Tenable.io v3 REST API (MEDIUM confidence — verify against https://developer.tenable.com/reference before implementing)
- Node.js 22 native fetch replacing node-fetch: documented in Node.js 22 release notes (HIGH confidence)

---

*Architecture research: 2026-04-02*
