# Phase 1: Safety and Correctness — Research

**Researched:** 2026-04-02
**Domain:** Node.js 22 TypeScript configuration, MCP stdio transport hygiene, startup validation
**Confidence:** HIGH

---

## Summary

Phase 1 consists entirely of mechanical fixes to known pre-existing bugs confirmed by direct codebase inspection. No new libraries are introduced, no new modules are created, and no Tenable.io API calls are involved. Every change in this phase operates on existing files with well-understood semantics.

The five requirements address three categories of problems: (1) stdout contamination that corrupts the MCP JSON-RPC wire protocol (`console.log` calls in `nessus-api.ts`), (2) stale configuration that mismatches the declared Node.js 22 runtime — the `tsconfig.json` targets `Node16` module resolution and is missing the `DOM` lib needed for native `fetch` type recognition, and the `node-fetch` package remains as a dead dependency — and (3) silent failure modes at startup where missing API credentials cause the server to quietly enter mock mode instead of exiting with an error.

All fixes are self-contained. The planner can map each requirement directly to a single file and a specific line-level change. No external research is needed; all findings come from direct codebase inspection confirmed against official TypeScript and Node.js documentation.

**Primary recommendation:** Apply the five changes in order (stdout fix → tsconfig → package.json → dead code removal → startup validation). Each change is independent; they can be done in one commit.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SAFE-01 | Server uses `console.error` exclusively for logging (no stdout contamination of MCP stdio transport) | Confirmed: `console.log` found on lines 41 and 44 of `src/nessus-api.ts`; `src/index.ts` already uses `console.error` correctly. Fix: replace two `console.log` calls. |
| SAFE-02 | Dead Zod schemas removed from `scans.ts` (no duplicate validation paths) | Confirmed: `targetSchema` (line 82) and `scanTypeSchema` (line 83) declared in `startScanToolHandler` but never used — `validateTarget()` and `validateScanType()` are called instead. Fix: delete the two `const` declarations and the `z` import if it becomes unused. |
| SAFE-03 | `tsconfig.json` targets Node 22 with `lib: ["ES2022", "DOM"]` and `moduleResolution: NodeNext` | Confirmed: current `tsconfig.json` has `"module": "Node16"`, `"moduleResolution": "Node16"`, and no `lib` entry. Native `fetch` types require `"DOM"` in `lib`; `NodeNext` is the correct resolution for Node 22 ESM. Fix: update three fields in `tsconfig.json`. |
| SAFE-04 | `node-fetch` dependency removed; all HTTP calls use Node 22 native `fetch` | Confirmed: `"node-fetch": "^3.3.2"` present in `package.json` `dependencies`. No import of `node-fetch` exists anywhere in `src/` — it was never actually used in code. Fix: remove from `package.json` and run `npm install`. |
| SAFE-05 | Server validates API credentials at startup and fails fast with clear error if missing (no silent mock fallback) | Confirmed: `src/index.ts` `initializeApi()` silently sets `useMock: true` when credentials are absent. `initializeNessusApi()` in `nessus-api.ts` logs a mock-mode message and proceeds. Fix: add an explicit guard in `initializeApi()` that calls `process.exit(1)` with a clear error message when any of the three required env vars (`NESSUS_URL`, `NESSUS_ACCESS_KEY`, `NESSUS_SECRET_KEY`) is missing. |
</phase_requirements>

---

## Standard Stack

### Core (no changes — existing stack is correct)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| TypeScript | 5.8.2 | Language | Keep as-is |
| `@modelcontextprotocol/sdk` | ^1.8.0 | MCP protocol | Keep as-is |
| `zod` | ^3.24.2 | Runtime validation | Keep (used elsewhere); remove dead schemas only |
| Node.js | 22 LTS | Runtime | Already the target runtime — tsconfig must match |

### What to Remove

| Package | Location | Reason |
|---------|----------|--------|
| `node-fetch` | `package.json` `dependencies` | Never imported in source; Node 22 has stable native `fetch` |

### Installation (after removal)

```bash
npm uninstall node-fetch
```

No packages to add in this phase.

---

## Architecture Patterns

### Pattern 1: MCP stdio Transport — stdout Hygiene

**What:** The MCP stdio transport sends JSON-RPC messages over stdout. Any non-JSON bytes written to stdout (e.g., from `console.log`) corrupt the framing and prevent MCP clients from connecting.

**Rule:** All diagnostic output MUST use `console.error` (writes to stderr), never `console.log` (writes to stdout).

**Current violation in `src/nessus-api.ts`:**
```typescript
// Line 41 — MUST become console.error
console.log("Nessus API client initialized with real API credentials");
// Line 44 — MUST become console.error
console.log("Nessus API client initialized in mock mode");
```

**Correct pattern (already used in `src/index.ts`):**
```typescript
console.error(`Nessus MCP Server starting in ${apiConfig.useMock ? 'mock' : 'real API'} mode`);
```

### Pattern 2: TypeScript `lib` for Native Fetch Types

**What:** Node.js 22 exposes `fetch`, `Request`, `Response`, `Headers` as globals. TypeScript does not include these types in `ES2022` alone — they live in the `DOM` lib. Without `"DOM"` in the `lib` array, TypeScript reports `Cannot find name 'fetch'` even though it exists at runtime.

**Current `tsconfig.json` (incomplete):**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16"
  }
}
```

**Correct `tsconfig.json` for Node 22:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

**Why `NodeNext` vs `Node16`:** `NodeNext` is the forward-compatible alias that tracks the current LTS's module semantics. `Node16` was the alias for Node.js 16 specifically. For Node 22, `NodeNext` is the correct choice. The observable behavior difference is minimal for this project (both resolve ESM `.js` extensions correctly), but `NodeNext` is the officially recommended setting for current Node.js.

### Pattern 3: Fail-Fast Startup Validation

**What:** MCP servers are long-running daemon processes launched by MCP clients. If the server starts silently in mock mode when credentials are missing, the MCP client gets no error — it just gets mock data. The correct behavior is to exit with a non-zero code and a message on stderr before the MCP server even starts.

**Current behavior (silent mock fallback):**
```typescript
// src/index.ts — initializeApi()
return initializeNessusApi({
  url: nessusUrl,
  accessKey: nessusAccessKey,
  secretKey: nessusSecretKey,
  useMock: !(nessusUrl && nessusAccessKey && nessusSecretKey)  // silently sets mock=true
});
```

**Required behavior (fail fast):**
```typescript
const initializeApi = () => {
  const nessusUrl = process.env.NESSUS_URL;
  const nessusAccessKey = process.env.NESSUS_ACCESS_KEY;
  const nessusSecretKey = process.env.NESSUS_SECRET_KEY;

  if (!nessusUrl || !nessusAccessKey || !nessusSecretKey) {
    console.error(
      'Error: Missing required environment variables.\n' +
      'Set NESSUS_URL, NESSUS_ACCESS_KEY, and NESSUS_SECRET_KEY before starting the server.'
    );
    process.exit(1);
  }

  return initializeNessusApi({
    url: nessusUrl,
    accessKey: nessusAccessKey,
    secretKey: nessusSecretKey,
    useMock: false
  });
};
```

**Note on mock mode:** The research summary references "preserve mock mode alongside real API" as a project decision, but SAFE-05 explicitly states the server must NOT silently enter mock mode. The resolution: mock mode may be preserved as an explicit opt-in (e.g., via a `NESSUS_MOCK=true` env var), but absent explicit opt-in, missing credentials must produce a fatal error. The planner should decide whether to implement an explicit `NESSUS_MOCK` escape hatch or simply remove mock mode from startup entirely. Given Phase 1 scope, the safest approach is fail-fast on missing credentials without adding a new env var — mock mode can be revisited in Phase 4 (testing) where it is needed for unit tests.

### Pattern 4: Dead Code Removal (Zod Schemas)

**What:** `startScanToolHandler` in `src/tools/scans.ts` declares two Zod schemas that are never called:

```typescript
// Lines 82–83 in src/tools/scans.ts — DEAD CODE, delete these
const targetSchema = z.string().min(1);
const scanTypeSchema = z.enum(['basic-network-scan', 'web-app-scan', 'compliance-scan']);

// Actual validation uses these functions (correct, keep):
const target = validateTarget(args.target);
const scanType = validateScanType(args.scan_type);
```

After removing the dead schemas, check whether `import { z } from 'zod'` on line 5 is still needed by any other code in the file. Inspection shows `z` is only used by those two dead schemas — the `zod` import itself becomes unused and should also be removed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Native fetch type declarations | Custom `declare global { fetch: ... }` | Add `"DOM"` to tsconfig `lib` | Official TypeScript pattern; covers all fetch globals (Request, Response, Headers, etc.) |
| Startup validation framework | Custom validator class | Inline guard + `process.exit(1)` | 5 lines; no abstraction needed at this scope |

---

## Common Pitfalls

### Pitfall 1: Forgetting to Run `npm install` After `node-fetch` Removal
**What goes wrong:** `package.json` updated but `node_modules` not cleaned; the package remains importable. TypeScript compilation sees no error. Only at runtime or CI does the discrepancy surface.
**How to avoid:** Run `npm install` (or `npm ci`) immediately after modifying `package.json`. Verify `node-fetch` no longer appears in `node_modules/.package-lock.json`.

### Pitfall 2: `Node16` vs `NodeNext` — Breaking ESM Resolution
**What goes wrong:** Changing `moduleResolution` from `Node16` to `NodeNext` with `module: "NodeNext"` has no breaking effect on this project because all imports already use explicit `.js` extensions (ESM-correct). However, if any import was written without the extension, the change would surface a previously-hidden error.
**How to avoid:** After updating `tsconfig.json`, run `npm run build` and verify clean compilation. The build is the correctness check.

### Pitfall 3: `process.exit(1)` Before Transport Connect
**What goes wrong:** If `process.exit(1)` is called after `server.connect(transport)`, the MCP client may already have the transport open and get a broken pipe instead of a clean error. The startup validation must run before `createServer()` and `transport.connect()`.
**How to avoid:** The guard belongs in `initializeApi()`, which is called on line 144 of `index.ts` before `createServer()` is called. This is already the correct insertion point.

### Pitfall 4: Mock Mode and Phase 4 Testing
**What goes wrong:** Removing silent mock fallback now means Phase 4 unit tests (which rely on mock mode for isolation) cannot start the server without real credentials.
**How to avoid:** This is acceptable: Phase 4 tests should test individual functions, not the server's `main()` startup path. Unit tests import `nessus-api.ts` functions directly and pass mock config explicitly — they never call `main()`. The startup credential guard only affects `main()`. No conflict.

### Pitfall 5: `console.log` Regression
**What goes wrong:** Future code changes reintroduce `console.log` calls, re-corrupting the MCP transport.
**How to avoid:** After Phase 1, a grep check (`grep -r 'console\.log' src/`) serves as a manual regression guard. Phase 4 can add this as an automated lint rule.

---

## Code Examples

### Verified: `tsconfig.json` for Node 22 ESM + Native Fetch

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

Source: TypeScript official docs — `lib` configuration; `NodeNext` is documented as the correct `moduleResolution` for current Node.js versions.

### Verified: Startup Credential Guard

```typescript
// In src/index.ts, initializeApi() function
const initializeApi = () => {
  const nessusUrl = process.env.NESSUS_URL;
  const nessusAccessKey = process.env.NESSUS_ACCESS_KEY;
  const nessusSecretKey = process.env.NESSUS_SECRET_KEY;

  if (!nessusUrl || !nessusAccessKey || !nessusSecretKey) {
    const missing = [
      !nessusUrl && 'NESSUS_URL',
      !nessusAccessKey && 'NESSUS_ACCESS_KEY',
      !nessusSecretKey && 'NESSUS_SECRET_KEY'
    ].filter(Boolean).join(', ');
    console.error(`Error: Missing required environment variables: ${missing}`);
    console.error('Set NESSUS_URL, NESSUS_ACCESS_KEY, and NESSUS_SECRET_KEY to start the server.');
    process.exit(1);
  }

  return initializeNessusApi({
    url: nessusUrl,
    accessKey: nessusAccessKey,
    secretKey: nessusSecretKey,
    useMock: false
  });
};
```

---

## State of the Art

| Old Approach | Current Approach | Applies To |
|--------------|------------------|------------|
| `"module": "Node16"` / `"moduleResolution": "Node16"` | `"module": "NodeNext"` / `"moduleResolution": "NodeNext"` | TypeScript config for Node 22 |
| `node-fetch` npm package | Node.js built-in `fetch` (stable since Node 18) | HTTP client |
| Silent mock fallback on missing credentials | `process.exit(1)` with explicit error message | MCP server startup |

---

## Open Questions

1. **Mock mode escape hatch for Phase 4 tests**
   - What we know: Phase 4 testing plan relies on mock mode for unit tests. SAFE-05 removes silent mock fallback.
   - What's unclear: Should Phase 1 add an explicit `NESSUS_MOCK=true` env var to opt into mock mode, or is that deferred to Phase 4?
   - Recommendation: Defer to Phase 4. Phase 4 unit tests import functions directly and do not invoke `main()`. No escape hatch is needed in Phase 1. The planner should note this as a Phase 4 concern.

2. **`nessus-api.ts` `initializeNessusApi` mock-mode log messages**
   - What we know: Lines 41 and 44 in `nessus-api.ts` use `console.log` (SAFE-01). After SAFE-05, the "mock mode" branch (`config.useMock = true; console.log(...)`) can never be reached from normal startup.
   - What's unclear: Should the unreachable mock-mode initialization message be removed entirely, or converted to `console.error` and left as dead code?
   - Recommendation: Convert both to `console.error` for SAFE-01 compliance; leave the mock-mode branch code as-is (it's still callable from tests). This is the minimal-change approach.

---

## File Impact Summary

| File | Change | Requirement |
|------|--------|-------------|
| `src/nessus-api.ts` | Replace 2× `console.log` with `console.error` | SAFE-01 |
| `src/tools/scans.ts` | Delete `targetSchema`, `scanTypeSchema` declarations; remove `import { z }` | SAFE-02 |
| `tsconfig.json` | Add `lib: ["ES2022", "DOM"]`; change `module` and `moduleResolution` to `NodeNext` | SAFE-03 |
| `package.json` | Remove `node-fetch` from `dependencies`; run `npm install` | SAFE-04 |
| `src/index.ts` | Add credential guard with `process.exit(1)` before server creation | SAFE-05 |

Total changed files: 5. No new files. No new dependencies.

---

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection — `src/nessus-api.ts` lines 41, 44 (`console.log`); `src/tools/scans.ts` lines 82–83 (dead Zod schemas); `tsconfig.json` (`Node16` module, missing `lib`); `package.json` (`node-fetch` present); `src/index.ts` (silent mock fallback in `initializeApi`)
- `.planning/codebase/CONCERNS.md` — documents `console.log` stdout risk, dead Zod schemas, missing `node-fetch` note
- `.planning/research/SUMMARY.md` — Phase 1 scope confirmed as mechanical fixes only
- TypeScript docs — `lib: ["DOM"]` required for native fetch types; `NodeNext` is the recommended `moduleResolution` for current Node.js (not `Node16`)
- Node.js 22 release notes — native `fetch` stable since Node 18, no polyfill needed

### Secondary (MEDIUM confidence)

- Node.js changelog — `fetch` stable and unflagged since Node 21.x; confirmed available in Node 22 LTS

### Tertiary (LOW confidence)

- None for this phase. All findings are direct codebase facts.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — direct inspection of package.json and tsconfig.json
- Architecture: HIGH — all changes are single-file, line-level; no design decisions required
- Pitfalls: HIGH — derived from direct codebase analysis and MCP stdio transport semantics

**Research date:** 2026-04-02
**Valid until:** This research does not expire — it describes the current state of specific files, not evolving ecosystem patterns.
