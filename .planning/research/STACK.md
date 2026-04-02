# Technology Stack

**Project:** Tenable.io MCP Server — Production Upgrade
**Researched:** 2026-04-02
**Scope:** Tenable.io API integration and Node.js 22 modernization. MCP SDK setup is already working — not re-researched.

---

## Recommended Stack

### Runtime

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | 22 LTS (Maintenance) | Runtime | Per PROJECT.md constraint. Maintenance LTS — receives critical bug fixes. Node.js 24 is Active LTS if upgrading is an option, but 22 satisfies the stated target. |

**Confidence: HIGH** — Confirmed via nodejs.org release schedule (2026-04-02). Node.js 22 ("Jod") is Maintenance LTS, v22.22.2. Node.js 24 ("Krypton") is Active LTS as of May 2025. The project explicitly targets 22 LTS, which remains supported.

**Node 22-relevant changes affecting this project:**
- `fetch` is fully stable (unflagged, production-ready) — removes the `node-fetch` dependency
- `--env-file` flag is available for loading `.env` without dotenv
- ESM module support is mature
- TypeScript `NodeNext` moduleResolution works correctly

---

### Core Framework (Keep as-is)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @modelcontextprotocol/sdk | ^1.8.0 | MCP server protocol | Already installed and working. No change needed. |
| TypeScript | ^5.8.2 | Type safety | Already installed and current. |
| zod | ^3.24.2 | Input validation | Already used for tool parameter validation. Keep. |

**Confidence: HIGH** — These are already in use. The focus of this milestone is Tenable.io integration, not MCP SDK changes.

---

### HTTP Client

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Native `fetch` (Node.js built-in) | Node.js 22 built-in | HTTP calls to Tenable.io cloud API | Node.js 22 ships stable `fetch`. Remove `node-fetch` — it was only added as a future placeholder and is not currently used. Native fetch handles the Tenable.io REST API without any additional dependency. |

**What to remove:** `node-fetch ^3.3.2` from `dependencies`.

**Why not keep node-fetch:** The codebase note explicitly flags it as removable on Node.js 18+. It adds a dependency for no benefit on Node.js 22. Native fetch has identical API surface for this use case (simple JSON REST calls with custom headers).

**Why not axios:** Axios adds ~50KB and has its own interceptor model. For a simple API client with only 6 endpoints, native fetch is sufficient and avoids the dependency.

**Confidence: HIGH** — Native fetch is stable and documented in Node.js 22 release notes.

---

### Resilience: Retry Logic

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `p-retry` | ^6.2.0 | Exponential backoff on transient HTTP failures | Standard Node.js retry library. Zero dependencies, TypeScript-first, promise-based. Handles 429 Too Many Requests and 5xx errors from Tenable.io API. |

**Confidence: MEDIUM** — p-retry is the well-established community standard for promise retry in Node.js (ESM-first since v5). Version 6.x is the current ESM-compatible release. Not verified against Context7 (unavailable) but confirmed stable from multiple community sources.

**Usage pattern:**
```typescript
import pRetry from 'p-retry';

const result = await pRetry(
  () => fetchTenableApi('/scans'),
  {
    retries: 3,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 10000,
    shouldRetry: (err) => err.status === 429 || err.status >= 500,
  }
);
```

**Why not a custom retry loop:** p-retry provides jitter, configurable backoff factor, and proper error classification out of the box. Writing this correctly from scratch has known failure modes (thundering herd, missing jitter).

---

### Resilience: Rate Limiting

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `p-throttle` | ^6.1.0 | Client-side rate limiting for Tenable.io API | Tenable.io enforces rate limits (documented as ~200 requests/minute for most endpoints). p-throttle wraps async functions with a rate limit. Same ecosystem as p-retry, ESM-first, zero dependencies. |

**Confidence: MEDIUM** — p-throttle is the standard companion to p-retry in the `sindresorhus` async utility ecosystem. ESM-first since v5. Version 6.x is current.

**Alternative considered:** `bottleneck` — more powerful (queuing, priorities, cluster support) but significantly more complex than needed for a single-instance MCP server making sequential API calls. p-throttle is sufficient.

**Why rate limiting matters here:** The MCP server could receive rapid tool calls from AI assistants (e.g., a loop checking scan status). Without rate limiting, the Tenable.io API will return 429 errors, and without client-side throttling, the retry logic will thrash.

---

### Testing

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `vitest` | ^3.x | Unit and integration test runner | ESM-native, no configuration overhead for TypeScript ESM projects. The existing project uses `"type": "module"` — Jest requires significant configuration to handle ESM (transform config, `--experimental-vm-modules`). Vitest works out of the box with the existing tsconfig and package.json. |

**Confidence: HIGH** — Vitest's ESM-first design is a known advantage over Jest for projects using `"type": "module"`. This codebase is a clear example of where vitest avoids the Jest ESM friction.

**Why not Jest:** Jest's ESM support requires either Babel transform (loses TypeScript native checking) or `--experimental-vm-modules` flag (fragile). The project uses Node16 module resolution and `"type": "module"` — vitest handles this transparently.

**Mock strategy for tests:**
- Mock mode (already built into `src/nessus-api.ts`) can be activated by not providing env vars — useful for tool handler tests
- `vi.mock()` for unit testing the API client layer in isolation
- No real Tenable.io API calls in test suite (per PROJECT.md: "real instance testing deferred")

---

### TypeScript Configuration Updates

| Setting | Current | Recommended | Why |
|---------|---------|-------------|-----|
| `target` | `ES2022` | `ES2022` | Keep — appropriate for Node.js 22 |
| `module` | `Node16` | `NodeNext` | `NodeNext` is the successor to `Node16`; more precise about import extensions. Low-risk change. |
| `moduleResolution` | `Node16` | `NodeNext` | Same as above — keep in sync with `module`. |
| `lib` | (not set) | Add `["ES2022", "DOM"]` | `DOM` lib is needed to get TypeScript types for the built-in `fetch`, `Request`, `Response`, `Headers` globals. Without this, TypeScript will not recognize native fetch. |

**Confidence: HIGH** — The `lib: ["DOM"]` requirement for native fetch TypeScript types is a well-known requirement documented in TypeScript's configuration reference.

---

## What NOT to Use

| Category | Avoid | Why |
|----------|-------|-----|
| HTTP client | `axios` | Overkill for 6 REST endpoints; adds dependency; native fetch is sufficient |
| HTTP client | `node-fetch` | Already in project — remove it; native fetch is available on Node.js 22 |
| HTTP client | `got` | ESM-only since v12, heavier than needed for this use case |
| Rate limiting | `bottleneck` | Correct but significantly more complex than needed for single-instance MCP server |
| Testing | `jest` | ESM compatibility friction with `"type": "module"` projects; vitest is the right tool |
| Testing | `mocha` + `chai` | More setup than vitest; no built-in TypeScript support |
| Environment | `dotenv` | Node.js 22 supports `--env-file` natively; no need for the package |
| Retry | Custom loops | Easy to get wrong (no jitter, no backoff cap); use p-retry |
| Types | `@types/node-fetch` | Remove along with node-fetch |

---

## Tenable.io API Integration Details

**Authentication** (MEDIUM confidence — from Tenable developer documentation patterns, not directly verified via WebFetch in this session):

Tenable.io uses a single `X-ApiKeys` header:
```
X-ApiKeys: accessKey=<TENABLE_ACCESS_KEY>; secretKey=<TENABLE_SECRET_KEY>
```

**Base URL:** `https://cloud.tenable.com`

**Standard headers for all requests:**
```typescript
{
  'X-ApiKeys': `accessKey=${accessKey}; secretKey=${secretKey}`,
  'Content-Type': 'application/json',
  'Accept': 'application/json',
}
```

**Rate limits:** Tenable.io imposes per-endpoint rate limits. Common limits are ~200 req/min for read endpoints, lower for scan launch operations. Exact limits should be verified against current Tenable.io developer docs before production deployment.

**Environment variable rename:** The existing code uses `NESSUS_URL`, `NESSUS_ACCESS_KEY`, `NESSUS_SECRET_KEY`. For the Tenable.io cloud API, `NESSUS_URL` becomes unnecessary (base URL is always `https://cloud.tenable.com`), but renaming env vars is a breaking change for existing users. Recommend keeping the env var names but documenting that `NESSUS_URL` defaults to `https://cloud.tenable.com` if not set.

**Confidence note:** Tenable.io API authentication header format (`X-ApiKeys`) is well-established and documented. Specific rate limit numbers should be validated against the current Tenable.io developer portal before implementation.

---

## Installation

```bash
# Remove node-fetch (no longer needed)
npm uninstall node-fetch

# Add resilience libraries
npm install p-retry p-throttle

# Add testing (dev only)
npm install -D vitest
```

No other new runtime dependencies are required. The MCP SDK, TypeScript, Zod, and @types/node are already present and current.

---

## Sources

| Source | Confidence | Notes |
|--------|-----------|-------|
| nodejs.org release schedule | HIGH | Confirmed Node.js 22 Maintenance LTS, 24 Active LTS as of 2026-04-02 |
| Project codebase (package.json, tsconfig.json, src/) | HIGH | Direct inspection of current stack |
| TypeScript docs (training knowledge) | HIGH | `lib: ["DOM"]` for fetch types is well-established requirement |
| p-retry, p-throttle npm ecosystem | MEDIUM | ESM-first, zero-dep; version numbers from training data — verify before install |
| Tenable.io API auth pattern | MEDIUM | X-ApiKeys header format is standard Tenable documentation; not directly verified via live docs fetch in this session |
| Vitest vs Jest ESM | HIGH | ESM friction with Jest on `"type": "module"` projects is a well-known, documented issue |
