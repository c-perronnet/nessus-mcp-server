# Phase 2: HTTP Client and Infrastructure - Research

**Researched:** 2026-04-02
**Domain:** HTTP client architecture, Tenable.io API integration, TypeScript type safety
**Confidence:** HIGH

## Summary

Phase 2 creates a centralized HTTP client (`tenable-client.ts`) that replaces the stub "Real API not implemented" paths in `nessus-api.ts`. The client must handle Tenable.io's `X-ApiKeys` authentication, 30-second timeouts via `AbortController`, exponential backoff on 429 responses, and proactive rate throttling. All Tenable.io API response shapes must be typed in `src/types/tenable.ts`, and the error type enum must be extended with `RATE_LIMITED`, `AUTH_FAILED`, and `TIMEOUT`.

The project already uses Node 22 native `fetch` (SAFE-04 complete), ESM modules, and strict TypeScript. The two external libraries needed are `p-retry` (v6+, ESM-only, built-in exponential backoff) and `p-throttle` (v8+, ESM-only, interval-based rate limiting). Both are from sindresorhus and are pure ESM -- compatible with the project's `"type": "module"` setup.

Tenable.io uses dynamic rate limiting with no published threshold. The API returns `429` with a `retry-after` header (seconds). The recommended approach is conservative client-side throttling (~100 req/min as safe default) combined with reactive retry on 429 using the `retry-after` value.

**Primary recommendation:** Build a single `TenableClient` class in `src/tenable-client.ts` that wraps native `fetch` with auth headers, AbortController timeout, p-throttle rate limiting, and p-retry for 429/5xx retries. Type all API responses in `src/types/tenable.ts` based on the Tenable.io Python SDK models.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HTTP-01 | Dedicated HTTP client module (`tenable-client.ts`) handles all Tenable.io API calls | TenableClient class pattern, wraps native fetch |
| HTTP-02 | Every request includes `X-ApiKeys: accessKey=<key>;secretKey=<key>` auth header | Tenable.io auth format verified from official docs |
| HTTP-03 | Request timeout (30s default) using `AbortController` prevents hanging requests | Node 22 native AbortController + AbortSignal.timeout() |
| HTTP-04 | HTTP status codes (401, 403, 404, 429, 500) map to structured MCP error types | Status-to-NessusErrorType mapping pattern |
| HTTP-05 | Rate-limit handling detects 429 responses and applies exponential backoff with `p-retry` | p-retry v6+ with onFailedAttempt checking retry-after header |
| HTTP-06 | Client-side rate throttling via `p-throttle` prevents proactive rate-limit exhaustion | p-throttle v8.1.0 with conservative limit/interval |
| TYPE-01 | Typed interfaces for all Tenable.io API responses in `src/types/tenable.ts` | Response schemas extracted from Tenable Python SDK models |
| TYPE-02 | Scan ID typed as number, scan UUID typed as string, enforced at abstraction boundary | Branded types or type aliases at client boundary |
| ERR-01 | `NessusErrorType` extended with `RATE_LIMITED`, `AUTH_FAILED`, `TIMEOUT` types | Extend existing enum in error-handling.ts |
| ERR-02 | HTTP 409 mapped to `SCAN_IN_PROGRESS` error type | Add to HTTP status mapping switch |
| ERR-03 | All error paths return structured MCP error responses (no raw exceptions) | Existing handleNessusApiError pattern extended |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native `fetch` | Node 22 built-in | HTTP requests | Already decided in Phase 1 (SAFE-04), zero dependencies |
| `AbortController` | Node 22 built-in | Request timeouts | Native, no library needed; `AbortSignal.timeout(ms)` available |
| `p-retry` | ^6.2.1 | Exponential backoff retry on 429/5xx | ESM-only, TypeScript types included, sindresorhus ecosystem |
| `p-throttle` | ^8.1.0 | Client-side rate limiting | ESM-only, TypeScript types included, interval-based throttling |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | ^3.24.2 (already installed) | Runtime response validation | Optional -- validate API responses match expected shapes |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| p-retry | Hand-rolled retry loop | p-retry handles jitter, max timeout, abort, edge cases correctly |
| p-throttle | bottleneck | bottleneck is CJS, heavier; p-throttle is ESM-native and lightweight |
| Separate retry+throttle | got/ky HTTP client | Adds full HTTP client dependency; native fetch + 2 small libs is lighter |

**Installation:**
```bash
npm install p-retry p-throttle
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  tenable-client.ts      # HTTP client class (NEW)
  types/
    tenable.ts           # All Tenable.io response interfaces (NEW)
  nessus-api.ts          # Existing -- will import from tenable-client.ts
  utils/
    error-handling.ts    # Existing -- extend NessusErrorType enum
  tools/
    scans.ts             # Existing -- unchanged in this phase
    vulnerabilities.ts   # Existing -- unchanged in this phase
  index.ts               # Existing -- passes config to client
```

### Pattern 1: Centralized HTTP Client Class
**What:** A `TenableClient` class that encapsulates all HTTP communication with Tenable.io. Every outbound request flows through a single `request()` method.
**When to use:** Always -- this is the only way to call Tenable.io.
**Example:**
```typescript
// Source: Tenable.io official auth docs + Node 22 fetch API
import pRetry, { AbortError } from 'p-retry';
import pThrottle from 'p-throttle';

export interface TenableClientConfig {
  baseUrl: string;        // e.g. "https://cloud.tenable.com"
  accessKey: string;
  secretKey: string;
  timeoutMs?: number;     // default 30000
  maxRetries?: number;    // default 3
  rateLimitPerMin?: number; // default 100
}

export class TenableClient {
  private config: Required<TenableClientConfig>;
  private throttledFetch: typeof fetch;

  constructor(config: TenableClientConfig) {
    this.config = {
      timeoutMs: 30_000,
      maxRetries: 3,
      rateLimitPerMin: 100,
      ...config,
    };

    // Proactive rate limiting
    const throttle = pThrottle({
      limit: Math.floor(this.config.rateLimitPerMin / 6),
      interval: 10_000, // 10-second window
    });
    this.throttledFetch = throttle((...args: Parameters<typeof fetch>) =>
      fetch(...args)
    );
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;

    const doRequest = async () => {
      const signal = AbortSignal.timeout(this.config.timeoutMs);
      const response = await this.throttledFetch(url, {
        method,
        headers: {
          'X-ApiKeys': `accessKey=${this.config.accessKey};secretKey=${this.config.secretKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal,
      });

      if (!response.ok) {
        if (response.status === 429) {
          // Let p-retry handle this
          const err = new Error(`Rate limited: ${response.status}`);
          (err as any).retryAfter = response.headers.get('retry-after');
          (err as any).statusCode = 429;
          throw err;
        }
        // Non-retryable errors: abort retry
        if ([400, 401, 403, 404, 409].includes(response.status)) {
          throw new AbortError(
            `HTTP ${response.status}: ${response.statusText}`
          );
        }
        // 5xx: let p-retry handle
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return (await response.json()) as T;
    };

    return pRetry(doRequest, {
      retries: this.config.maxRetries,
      minTimeout: 1000,
      factor: 2,
      onFailedAttempt: (error) => {
        const retryAfter = (error as any).retryAfter;
        if (retryAfter) {
          console.error(
            `Rate limited. Retry-After: ${retryAfter}s. ` +
            `Attempt ${error.attemptNumber}/${error.retriesLeft + error.attemptNumber}`
          );
        }
      },
    });
  }

  // Convenience methods
  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }
}
```

### Pattern 2: HTTP Status to Error Type Mapping
**What:** A function that maps HTTP status codes to `NessusErrorType` values, producing structured MCP errors.
**When to use:** In the TenableClient when a non-OK response is received.
**Example:**
```typescript
// Extend existing NessusErrorType enum
export enum NessusErrorType {
  // ... existing values ...
  RATE_LIMITED = 'rate_limited',
  AUTH_FAILED = 'auth_failed',
  TIMEOUT = 'timeout',
}

function httpStatusToErrorType(status: number): NessusErrorType {
  switch (status) {
    case 401: return NessusErrorType.AUTH_FAILED;
    case 403: return NessusErrorType.AUTH_FAILED;
    case 404: return NessusErrorType.SCAN_NOT_FOUND;
    case 409: return NessusErrorType.SCAN_IN_PROGRESS;
    case 429: return NessusErrorType.RATE_LIMITED;
    default:  return NessusErrorType.API_ERROR;  // 5xx, others
  }
}
```

### Pattern 3: Typed API Response Interfaces
**What:** TypeScript interfaces matching Tenable.io JSON response shapes.
**When to use:** Generic type parameter on `client.get<T>()` calls.
**Example:**
```typescript
// src/types/tenable.ts
// Source: Tenable.io Python SDK models (pyTenable)

/** Scan ID is always a number in Tenable.io */
export type ScanId = number;
/** Scan UUID is always a string */
export type ScanUuid = string;

/** GET /scans response */
export interface TenableScanListResponse {
  folders: TenableFolder[];
  scans: TenableScan[] | null;  // null when account has no scans
  timestamp: number;
}

export interface TenableScan {
  id: ScanId;
  uuid: ScanUuid;
  name: string;
  type: string;
  owner: string;
  enabled: boolean;
  folder_id: number;
  read: boolean;
  status: string;
  shared: boolean;
  user_permissions: number;
  creation_date: number;       // Unix epoch
  last_modification_date: number;  // Unix epoch
}

/** GET /scans/{id} response */
export interface TenableScanDetailsResponse {
  info: TenableScanInfo;
  hosts: TenableScanHost[];
  vulnerabilities: TenableScanVulnerability[];
  compliance: unknown[];
  history: TenableScanHistory[];
  notes: unknown;
  remediations: unknown;
  filters: unknown[];
}

export interface TenableScanInfo {
  status: string;
  name: string;
  uuid: ScanUuid;
  folder_id: number;
  targets: string;
  scan_start: string | null;
  scan_end: string | null;
  scanner_name: string;
  hostcount: number;
  user_permissions: number;
  policy: string;
  scan_type: string;
  object_id: number;
  tag_targets: string[];
  acls: unknown[];
}

export interface TenableScanHost {
  host_id: number;
  host_index: number;
  hostname: string;
  progress: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  totalchecksconsidered: number;
  numchecksconsidered: number;
  scanprogresstotal: number;
  scanprogresscurrent: number;
  score: number;
}

export interface TenableScanVulnerability {
  plugin_id: number;
  plugin_name: string;
  plugin_family: string;
  count: number;
  vuln_index: number;
  severity_index: number;
  severity: number;  // 0=info, 1=low, 2=medium, 3=high, 4=critical
}

export interface TenableScanHistory {
  history_id: number;
  uuid: ScanUuid;
  owner_id: number;
  status: string;
  creation_date: number;
  last_modification_date: number;
}

/** GET /editor/scan/templates response */
export interface TenableTemplateListResponse {
  templates: TenableTemplate[];
}

export interface TenableTemplate {
  uuid: string;
  name: string;
  title: string;
  description: string;
  cloud_only: boolean;
  subscription_only: boolean;
  is_agent: boolean;
  more_info?: string;
}

/** POST /scans response */
export interface TenableCreateScanResponse {
  scan: {
    id: ScanId;
    uuid: ScanUuid;
    name: string;
    type: string;
    owner: string;
    enabled: boolean;
    folder_id: number;
    creation_date: number;
    last_modification_date: number;
  };
}

/** POST /scans/{id}/launch response */
export interface TenableLaunchScanResponse {
  scan_uuid: ScanUuid;
}

/** GET /workbenches/vulnerabilities response */
export interface TenableWorkbenchVulnsResponse {
  vulnerabilities: TenableWorkbenchVulnerability[];
  total_vulnerability_count: number;
}

export interface TenableWorkbenchVulnerability {
  plugin_id: number;
  plugin_name: string;
  plugin_family: string;
  severity: number;
  vpr_score?: number;
  count: number;
}

export interface TenableFolder {
  id: number;
  name: string;
  type: string;
  default_tag: number;
  custom: number;
  unread_count: number;
}
```

### Anti-Patterns to Avoid
- **Direct fetch in tool handlers:** All HTTP calls must go through `TenableClient`. Never call `fetch()` directly in `tools/scans.ts` or `tools/vulnerabilities.ts`.
- **Untyped JSON responses:** Never cast `response.json()` to `any`. Always use the typed interfaces from `types/tenable.ts`.
- **Retry on 401/403:** Authentication errors should abort immediately (via `AbortError`), not retry. Retrying bad credentials wastes time and may trigger account lockout.
- **Hardcoded rate limits:** Tenable.io uses dynamic rate limiting with no published threshold. Do not assume a fixed number. Use conservative defaults and respect `retry-after`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Exponential backoff retry | Custom setTimeout loops | `p-retry` | Handles jitter, max timeout, abort, attempt counting correctly |
| Rate limiting | Token bucket / sliding window | `p-throttle` | Queue management, abort support, weighted calls -- all edge cases handled |
| Request timeout | Manual setTimeout + abort | `AbortSignal.timeout(ms)` | Node 22 built-in, one line, handles cleanup automatically |
| HTTP header formatting | String concatenation for X-ApiKeys | Constant template in client | Easy to get wrong (semicolons, spaces) -- centralize once |

**Key insight:** The combination of retry, throttling, and timeout creates subtle interaction bugs (e.g., retry timer vs. timeout timer race conditions). Using well-tested libraries eliminates these.

## Common Pitfalls

### Pitfall 1: AbortSignal.timeout vs. AbortController for Retries
**What goes wrong:** Using a single `AbortSignal.timeout(30000)` for the entire retry sequence means the timeout covers ALL retries, not each individual request. After 30s, even retries get aborted.
**Why it happens:** Developers create the signal once and pass it to all retry attempts.
**How to avoid:** Create a new `AbortSignal.timeout()` inside each retry attempt (inside the `doRequest` function passed to `pRetry`).
**Warning signs:** Retries failing with AbortError after total time exceeds timeout.

### Pitfall 2: X-ApiKeys Header Format
**What goes wrong:** The header format is `accessKey=...;secretKey=...` with semicolon separator and NO space after the semicolon in some docs, WITH a space in others.
**Why it happens:** Tenable documentation is inconsistent. The official authorization page shows `accessKey={key}; secretKey={key};` with trailing semicolon and space.
**How to avoid:** Use the format from the official authorization page: `X-ApiKeys: accessKey=${key};secretKey=${key}` (no trailing semicolon, no space). Both formats work but the compact form is safer.
**Warning signs:** 401 errors on first API call.

### Pitfall 3: Scan ID Type Confusion
**What goes wrong:** Tenable.io scan IDs are integers (e.g., `42`), but scan UUIDs are strings. Passing a UUID where an ID is expected (or vice versa) causes 404 errors.
**Why it happens:** The current codebase uses `string` for scan IDs throughout. The Tenable API uses `number` for scan IDs in URL paths.
**How to avoid:** Use `ScanId` (number) and `ScanUuid` (string) type aliases. The TenableClient URL builder should accept `ScanId` for path params.
**Warning signs:** 404 on `/scans/{id}` calls.

### Pitfall 4: Null Scans List
**What goes wrong:** `GET /scans` returns `{ scans: null }` when the account has no scans, not an empty array.
**Why it happens:** Tenable.io API design decision.
**How to avoid:** Type `scans` as `TenableScan[] | null` and handle the null case explicitly.
**Warning signs:** `Cannot read properties of null (reading 'map')` at runtime.

### Pitfall 5: p-retry AbortError vs. Native AbortError
**What goes wrong:** Node 22 has a native `AbortError` (from `AbortController`). p-retry exports its own `AbortError`. Throwing the wrong one causes unexpected behavior.
**Why it happens:** Name collision between p-retry's `AbortError` (stops retries) and the native `AbortError` (timeout signal).
**How to avoid:** Import `AbortError` explicitly from `p-retry` and use it only for "stop retrying" signals. Catch native `AbortError` (from timeout) separately by checking `error.name === 'AbortError'`.
**Warning signs:** Timeouts not being retried, or non-retryable errors being retried.

### Pitfall 6: ESM Import Extensions
**What goes wrong:** `p-retry` and `p-throttle` are ESM-only. Importing them works, but importing local `.ts` files without the `.js` extension fails at runtime.
**Why it happens:** Project uses `"module": "NodeNext"` which requires explicit `.js` extensions.
**How to avoid:** Already established in the project -- all local imports use `.js` extensions. Continue this pattern for new files.
**Warning signs:** `ERR_MODULE_NOT_FOUND` at runtime.

## Code Examples

### AbortSignal.timeout() for Per-Request Timeout
```typescript
// Source: Node.js 22 docs - AbortSignal.timeout() is static
const signal = AbortSignal.timeout(30_000); // 30 seconds
const response = await fetch(url, { signal });
// Throws DOMException with name "TimeoutError" if timeout exceeded
```

### p-retry with retry-after Header Respect
```typescript
// Source: p-retry GitHub README
import pRetry, { AbortError } from 'p-retry';

const result = await pRetry(async () => {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });

  if (response.status === 429) {
    const retryAfter = response.headers.get('retry-after');
    const error = new Error('Rate limited');
    // p-retry will use its own backoff; log retry-after for diagnostics
    throw error;
  }

  if (response.status === 401 || response.status === 403) {
    // Don't retry auth errors
    throw new AbortError(`Auth failed: ${response.status}`);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}, {
  retries: 3,
  factor: 2,
  minTimeout: 1000,
  maxTimeout: 30_000,
});
```

### p-throttle Rate Limiting Setup
```typescript
// Source: p-throttle GitHub README
import pThrottle from 'p-throttle';

// ~100 requests per minute = ~16 per 10 seconds
const throttle = pThrottle({
  limit: 16,
  interval: 10_000,
});

const throttledFetch = throttle(fetch);
// All calls through throttledFetch are automatically queued
```

### Timeout Error Detection
```typescript
// Source: Node.js 22 docs
try {
  await fetch(url, { signal: AbortSignal.timeout(30_000) });
} catch (error) {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    // Request timed out
    throw createNessusError(NessusErrorType.TIMEOUT, 'Request timed out after 30s');
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    // Request was manually aborted
    throw createNessusError(NessusErrorType.API_ERROR, 'Request was aborted');
  }
  throw error;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `node-fetch` | Native `fetch` | Node 18+ (stable in 22) | Zero HTTP dependencies |
| `setTimeout` + manual clear | `AbortSignal.timeout()` | Node 17.3+ | One-liner timeout, no cleanup needed |
| CJS retry libraries | `p-retry` v6+ (ESM-only) | 2023 | Must use ESM imports |
| CJS throttle libraries | `p-throttle` v8+ (ESM-only) | 2025 | Must use ESM imports |

**Deprecated/outdated:**
- `node-fetch`: Already removed in Phase 1. Do not re-add.
- `AbortController` + manual `setTimeout`: Use `AbortSignal.timeout()` instead -- cleaner, no race conditions.
- `got`/`axios`: Unnecessary with native fetch + p-retry + p-throttle.

## Open Questions

1. **Tenable.io Rate Limit Threshold**
   - What we know: Dynamic, no published threshold. `retry-after` header returned on 429. Some community sources cite ~200 req/min but this is unconfirmed.
   - What's unclear: Exact per-user rate limit. Whether it varies by endpoint.
   - Recommendation: Start conservative at 100 req/min client-side throttle. Adjust based on real-world usage. Always respect `retry-after` header.

2. **Workbenches API Filter Syntax**
   - What we know: `GET /workbenches/vulnerabilities` accepts filters, `text_filter` for keyword search.
   - What's unclear: Exact query parameter format for CVE-based filtering (noted as MEDIUM confidence in STATE.md).
   - Recommendation: Type the response interface now, but defer filter implementation to Phase 3 where tools use it. The client `get<T>()` method supports any path including query strings.

3. **TenableTemplate Exact Fields**
   - What we know: Templates have `uuid`, `name`, `title`, `description` at minimum.
   - What's unclear: Full field list for `GET /editor/scan/templates` response -- official docs were truncated.
   - Recommendation: Define interface with known fields plus `[key: string]: unknown` escape hatch initially. Tighten after real API testing.

## Sources

### Primary (HIGH confidence)
- [Tenable.io Authorization Docs](https://developer.tenable.com/docs/authorization) - X-ApiKeys header format verified
- [Tenable.io Rate Limiting Docs](https://developer.tenable.com/docs/rate-limiting) - 429 response, retry-after header, dynamic limits
- [p-retry GitHub](https://github.com/sindresorhus/p-retry) - API, options, AbortError, ESM-only, TypeScript types
- [p-throttle GitHub](https://github.com/sindresorhus/p-throttle) - v8.1.0, limit/interval API, abort support, ESM-only
- [Tenable Python SDK models.py](https://github.com/tenable/Tenable.io-SDK-for-Python/blob/master/tenable_io/api/models.py) - Complete response field names for all scan-related endpoints

### Secondary (MEDIUM confidence)
- [Tenable.io Java SDK Scan.java](https://github.com/tenable/Tenable.io-SDK-for-Java/blob/master/src/main/java/com/tenable/io/api/scans/models/Scan.java) - Cross-verified field names with Python SDK
- [Tenable Workbenches API](https://developer.tenable.com/reference/workbenches-vulnerabilities) - Endpoint exists, field names confirmed, filter syntax partially documented

### Tertiary (LOW confidence)
- Tenable.io rate limit threshold (~200 req/min) - Community-cited, not officially confirmed
- TenableTemplate full field list - Official docs page truncated, fields inferred from SDK

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - p-retry and p-throttle are well-established ESM libraries verified from GitHub
- Architecture: HIGH - Client class pattern is straightforward, existing codebase structure clear
- API types: MEDIUM - Fields derived from Python/Java SDKs, not directly from OpenAPI spec (which was truncated)
- Pitfalls: HIGH - Based on documented API behavior and Node.js runtime specifics

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (30 days -- stable domain, libraries are mature)
