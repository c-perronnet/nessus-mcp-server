# Phase 4: Test Suite - Research

**Researched:** 2026-04-02
**Domain:** Vitest testing for ESM/TypeScript MCP server with mocked fetch
**Confidence:** HIGH

## Summary

Phase 4 adds automated tests for the Nessus MCP server. The project uses Node 22 LTS with native `fetch`, ESM modules (`"type": "module"` in package.json), and TypeScript with `module: "NodeNext"`. Vitest is the designated test framework (decided in Phase 1). No test infrastructure currently exists -- no test files, no vitest config, no test script in package.json.

The core testing challenge is mocking the global `fetch` function to isolate `tenable-client.ts` from the network, and testing tool handlers in mock mode (which the codebase already supports via `initializeNessusApi({ useMock: true })`). The startup credential check uses `process.exit(1)` which requires careful handling in tests.

**Primary recommendation:** Use Vitest with `vi.stubGlobal('fetch', ...)` for HTTP client tests, mock mode for tool handler tests, and `vi.spyOn(process, 'exit')` for the startup credential test.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TEST-01 | Vitest test framework configured and working with ESM/TypeScript | Vitest config pattern, package.json scripts, tsconfig compatibility verified |
| TEST-02 | Unit tests for `tenable-client.ts` HTTP functions (mocked fetch) | `vi.stubGlobal('fetch', ...)` pattern documented with code examples |
| TEST-03 | Unit tests for input validation functions in `error-handling.ts` | Pure functions, straightforward assertion testing -- no mocking needed |
| TEST-04 | Tool handler tests for all 7 tools in mock mode | Use `initializeNessusApi({ useMock: true })` -- mock mode already built in |
| TEST-05 | Startup credential validation tested (fail-fast path) | Mock `process.exit` and `process.env` to test `initializeApi()` in index.ts |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | ^4.x | Test runner and assertion library | ESM-native, TypeScript-native, project decision from Phase 1 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none needed) | - | - | Mock mode is built into the codebase; `vi.stubGlobal` handles fetch mocking |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| vitest | jest | Jest ESM support is experimental and fragile; Vitest is the project decision |
| vitest-fetch-mock | vi.stubGlobal | vitest-fetch-mock adds convenience API but vi.stubGlobal is sufficient for this scope |

**Installation:**
```bash
npm install -D vitest
```

## Architecture Patterns

### Recommended Test Structure
```
tests/
  tenable-client.test.ts     # TEST-02: HTTP client unit tests (mocked fetch)
  error-handling.test.ts      # TEST-03: Validation function unit tests
  tool-handlers.test.ts       # TEST-04: All 7 tool handlers in mock mode
  startup.test.ts             # TEST-05: Credential validation / fail-fast
```

### Pattern 1: Mocking Global Fetch for TenableClient
**What:** Use `vi.stubGlobal` to replace the native `fetch` with a mock, then construct a `TenableClient` and call its methods.
**When to use:** All `tenable-client.ts` tests (TEST-02).
**Key detail:** The `TenableClient` constructor wraps `fetch` in `p-throttle`. The throttled wrapper captures the `fetch` reference at construction time. Therefore, stub `fetch` BEFORE constructing the client.
**Example:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TenableClient } from '../src/tenable-client.js';

describe('TenableClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: TenableClient;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    client = new TenableClient({
      baseUrl: 'https://cloud.tenable.com',
      accessKey: 'test-access',
      secretKey: 'test-secret',
      maxRetries: 0,        // disable retries for fast tests
      rateLimitPerMin: 600, // high limit so throttle doesn't delay tests
    });
  });

  it('sends X-ApiKeys header', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    await client.get('/test');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://cloud.tenable.com/test',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-ApiKeys': 'accessKey=test-access;secretKey=test-secret',
        }),
      }),
    );
  });
});
```

### Pattern 2: Tool Handlers in Mock Mode
**What:** Call `initializeNessusApi({ useMock: true })` then invoke tool handlers directly.
**When to use:** All 7 tool handler tests (TEST-04).
**Key detail:** Mock mode is already built into `nessus-api.ts`. When `useMock: true`, handlers use `mock-data.ts` -- no network calls, no need to mock fetch.
**Example:**
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { initializeNessusApi } from '../src/nessus-api.js';
import { listScanTemplatesToolHandler } from '../src/tools/scans.js';

describe('list_scan_templates handler (mock mode)', () => {
  beforeAll(() => {
    initializeNessusApi({ useMock: true });
  });

  it('returns scan templates', async () => {
    const result = await listScanTemplatesToolHandler();
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.templates).toBeInstanceOf(Array);
    expect(parsed.templates.length).toBeGreaterThan(0);
  });
});
```

### Pattern 3: Testing Startup Credential Check
**What:** The `initializeApi()` function in `index.ts` calls `process.exit(1)` when env vars are missing. Test by mocking `process.exit` and clearing env vars.
**When to use:** TEST-05.
**Key detail:** `initializeApi` is not exported -- it is a module-level function. Two approaches:
  - **Option A (recommended):** Import `index.ts` dynamically with cleared env vars, spy on `process.exit`.
  - **Option B:** Extract `initializeApi` to a separate exported function (requires minor refactor).

Since `initializeApi` is called inside `main()` and `main()` is auto-invoked at module load, the simplest test approach is to spawn a child process and check the exit code and stderr output.

**Example (child process approach):**
```typescript
import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

describe('Startup credential validation', () => {
  it('exits with code 1 when env vars are missing', async () => {
    try {
      await execFileAsync('node', ['build/index.js'], {
        env: { ...process.env, NESSUS_URL: '', NESSUS_ACCESS_KEY: '', NESSUS_SECRET_KEY: '' },
        timeout: 5000,
      });
      expect.unreachable('Should have exited with non-zero code');
    } catch (error: any) {
      expect(error.code).toBe(1);
      expect(error.stderr).toContain('Missing required environment variables');
    }
  });
});
```

### Anti-Patterns to Avoid
- **Importing index.ts in-process for startup test:** The module auto-runs `main()` which connects to stdio transport. This will hang or interfere with the test runner. Use child process spawn instead.
- **Forgetting to disable retries in TenableClient tests:** Default `maxRetries: 3` means a failing fetch will retry 3 times with backoff, making tests slow. Always set `maxRetries: 0` in tests.
- **Forgetting to set high rate limit in tests:** Default `rateLimitPerMin: 100` means p-throttle allows ~16 requests per 10 seconds. Multiple rapid test calls will be delayed. Set `rateLimitPerMin: 600` or higher.
- **Testing real API by accident:** Never leave real credentials in test env. Mock mode or stubbed fetch only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fetch mocking | Custom fetch interceptor | `vi.stubGlobal('fetch', vi.fn())` | Built into Vitest, auto-cleaned with `unstubGlobals: true` |
| Mock mode for handlers | Custom mock layer | `initializeNessusApi({ useMock: true })` | Already built into the codebase |
| Response factories | Ad-hoc JSON objects | `new Response(JSON.stringify(data), { status, headers })` | Node 22 has native `Response` class |

## Common Pitfalls

### Pitfall 1: `.js` Extensions in Test Imports
**What goes wrong:** Vitest resolves TypeScript files directly, but the project uses NodeNext which requires `.js` extensions in imports.
**Why it happens:** The source code uses `import { ... } from './utils/error-handling.js'` -- Vitest handles this correctly, resolving `.js` to the `.ts` source.
**How to avoid:** Use `.js` extensions in test file imports too (e.g., `import { ... } from '../src/tenable-client.js'`). Vitest will resolve them to `.ts` files.
**Warning signs:** "Cannot find module" errors during test runs.

### Pitfall 2: p-throttle Delays in Tests
**What goes wrong:** Tests run slowly because p-throttle enforces rate limits between test calls.
**Why it happens:** Default config allows ~16 requests per 10-second window.
**How to avoid:** Set `rateLimitPerMin: 6000` (or very high) when constructing TenableClient in tests.
**Warning signs:** Tests take >1 second each for simple fetch mocks.

### Pitfall 3: p-retry Retries on Intentional Failures
**What goes wrong:** Testing error paths (e.g., 500 response) causes 3 retry attempts before failing.
**Why it happens:** Default `maxRetries: 3` in TenableClient.
**How to avoid:** Set `maxRetries: 0` in test TenableClient constructor.
**Warning signs:** Error path tests take 5+ seconds.

### Pitfall 4: AbortError from p-retry vs DOMException AbortError
**What goes wrong:** p-retry's `AbortError` (non-retryable signal) is a different class from `DOMException` with name `'AbortError'`.
**Why it happens:** TenableClient uses `new AbortError(msg)` from p-retry for non-retryable HTTP errors (400, 401, 403, 404, 409). The catch block checks for `statusCode` property. `DOMException` AbortError comes from `AbortController.abort()`.
**How to avoid:** When testing HTTP error paths, the mock fetch should return a `Response` with the appropriate status code -- the client handles classification internally.

### Pitfall 5: Startup Test Requires Built JS
**What goes wrong:** The child process test for startup credential validation runs `node build/index.js`, which requires a prior `npm run build`.
**Why it happens:** Vitest runs TypeScript source directly, but child process spawns Node on compiled output.
**How to avoid:** Either ensure `npm run build` runs before tests (add to test script), or use `tsx` to run the TypeScript source directly in the child process. Simplest: just document that build must be current.

## Code Examples

### Vitest Configuration File
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    restoreMocks: true,
    unstubGlobals: true,
  },
});
```

### package.json Test Script
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

### Testing HTTP Error Mapping (tenable-client)
```typescript
it('maps 401 to AUTH_FAILED error', async () => {
  mockFetch.mockResolvedValueOnce(
    new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' })
  );
  await expect(client.get('/test')).rejects.toThrow('HTTP 401');
});

it('maps 429 to RATE_LIMITED error', async () => {
  // With maxRetries: 0, the 429 still gets caught and mapped
  mockFetch.mockResolvedValueOnce(
    new Response('Too Many Requests', {
      status: 429,
      headers: { 'retry-after': '60' },
    })
  );
  await expect(client.get('/test')).rejects.toThrow();
});
```

### Testing Validation Functions (error-handling)
```typescript
import { validateScanId, validateTarget, validateScanType, validateVulnerabilityId } from '../src/utils/error-handling.js';

describe('validateTarget', () => {
  it('accepts valid IP address', () => {
    expect(validateTarget('192.168.1.1')).toBe('192.168.1.1');
  });

  it('accepts CIDR notation', () => {
    expect(validateTarget('10.0.0.0/24')).toBe('10.0.0.0/24');
  });

  it('throws on empty target', () => {
    expect(() => validateTarget('')).toThrow('Target is required');
  });

  it('throws on invalid characters', () => {
    expect(() => validateTarget(';<script>')).toThrow();
  });
});
```

### Testing Tool Handler with Mock Mode
```typescript
import { startScanToolHandler } from '../src/tools/scans.js';

it('returns scan_id for valid start_scan request', async () => {
  const result = await startScanToolHandler({
    target: '192.168.1.1',
    scan_type: 'basic-network-scan',
  });
  expect(result.isError).toBeUndefined();
  const parsed = JSON.parse(result.content[0].text);
  expect(parsed.scan_id).toBeDefined();
  expect(parsed.status).toBe('queued');
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| jest + ts-jest + ESM hacks | vitest (ESM-native) | 2023+ | No transform config needed |
| node-fetch + jest.mock() | native fetch + vi.stubGlobal | Node 18+/22 | Simpler mocking, no extra dependencies |
| Custom mock servers (nock, msw) | vi.stubGlobal('fetch') | For unit tests | Lighter weight for unit-level HTTP mocking |

## Open Questions

1. **Startup test approach: child process vs refactor**
   - What we know: `initializeApi()` is not exported and `main()` auto-runs on import. Child process approach works but requires built JS.
   - What's unclear: Whether a minor refactor to export `initializeApi` is acceptable.
   - Recommendation: Use child process approach -- it tests the real startup behavior without code changes. Ensure `npm run build` is current.

2. **Mock mode state leakage between tests**
   - What we know: `initializeNessusApi()` mutates module-level `config` and `client` variables in `nessus-api.ts`.
   - What's unclear: Whether calling `initializeNessusApi({ useMock: true })` in one test file affects another.
   - Recommendation: Call `initializeNessusApi({ useMock: true })` in a `beforeEach` or `beforeAll` in every test file that needs it. Vitest runs files in isolation by default (separate worker threads).

## Sources

### Primary (HIGH confidence)
- [Vitest Config Documentation](https://vitest.dev/config/) - v4.1.2 configuration options
- [Vitest Mocking Globals](https://vitest.dev/guide/mocking/globals) - vi.stubGlobal pattern
- [Vitest Vi API](https://vitest.dev/api/vi.html) - stubGlobal, unstubAllGlobals

### Secondary (MEDIUM confidence)
- [Vitest ESM + NodeNext issue #5820](https://github.com/vitest-dev/vitest/issues/5820) - .js extension resolution confirmed working
- [TechResolve: Vitest .js extensions](https://techresolve.blog/2025/12/11/how-to-not-require-js-extension-when-writing-vi/) - confirms Vitest resolves .js to .ts

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Vitest is the project's declared choice, verified current and compatible
- Architecture: HIGH - Based on direct reading of source code and official Vitest docs
- Pitfalls: HIGH - Derived from actual code analysis (p-throttle wrapping, p-retry defaults, process.exit pattern)

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable domain, Vitest API is mature)
