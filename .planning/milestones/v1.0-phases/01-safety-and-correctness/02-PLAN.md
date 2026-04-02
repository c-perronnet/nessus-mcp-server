---
phase: 01-safety-and-correctness
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - src/nessus-api.ts
  - src/tools/scans.ts
  - src/index.ts
autonomous: true
requirements:
  - SAFE-01
  - SAFE-02
  - SAFE-05

must_haves:
  truths:
    - "No console.log calls exist anywhere in src/ (grep returns empty)"
    - "Starting the server without NESSUS_URL, NESSUS_ACCESS_KEY, or NESSUS_SECRET_KEY exits with code 1 and an error message on stderr"
    - "src/tools/scans.ts imports no unused symbols from zod"
    - "The server does not silently enter mock mode when credentials are missing"
  artifacts:
    - path: "src/nessus-api.ts"
      provides: "Logging via console.error only"
      contains: "console.error"
    - path: "src/tools/scans.ts"
      provides: "startScanToolHandler without dead Zod schemas"
    - path: "src/index.ts"
      provides: "Fail-fast credential guard before server creation"
      contains: "process.exit(1)"
  key_links:
    - from: "src/index.ts initializeApi()"
      to: "process.exit(1)"
      via: "missing env var guard fires before createServer()"
      pattern: "process\\.exit\\(1\\)"
    - from: "src/nessus-api.ts"
      to: "stderr"
      via: "console.error (not console.log)"
      pattern: "console\\.error"
---

<objective>
Fix three production blockers in existing source files: stdout contamination from console.log, dead Zod schemas that create confusion, and silent mock fallback that hides missing credentials.

Purpose: These bugs would cause immediate failures with a real MCP client. console.log corrupts the MCP JSON-RPC framing over stdio. Silent mock mode means an operator with missing credentials gets mock data and no error — a dangerous silent failure. Dead Zod schemas are misleading noise.
Output: Three modified source files with the bugs removed; the server now exits immediately with a clear error if credentials are absent.
</objective>

<execution_context>
@/home/c_perronnet/.claude/get-shit-done/workflows/execute-plan.md
@/home/c_perronnet/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md

<interfaces>
<!-- Key interfaces the executor needs. Extracted from codebase. -->

From src/nessus-api.ts (lines 35-48):
```typescript
export const initializeNessusApi = (newConfig: Partial<NessusConfig> = {}) => {
  config = { ...defaultConfig, ...newConfig };

  if (config.url && config.accessKey && config.secretKey) {
    config.useMock = false;
    console.log("Nessus API client initialized with real API credentials");  // SAFE-01: change to console.error
  } else {
    config.useMock = true;
    console.log("Nessus API client initialized in mock mode");              // SAFE-01: change to console.error
  }

  return config;
};
```

From src/tools/scans.ts (lines 79-89):
```typescript
export const startScanToolHandler = async (args: Record<string, unknown>) => {
  try {
    // SAFE-02: These two lines are dead code — delete them
    const targetSchema = z.string().min(1);
    const scanTypeSchema = z.enum(['basic-network-scan', 'web-app-scan', 'compliance-scan']);

    const target = validateTarget(args.target);    // actual validation (keep)
    const scanType = validateScanType(args.scan_type); // actual validation (keep)
    ...
```

From src/index.ts (lines 40-53):
```typescript
const initializeApi = () => {
  const nessusUrl = process.env.NESSUS_URL;
  const nessusAccessKey = process.env.NESSUS_ACCESS_KEY;
  const nessusSecretKey = process.env.NESSUS_SECRET_KEY;

  // SAFE-05: Replace this with a fail-fast guard (see action below)
  return initializeNessusApi({
    url: nessusUrl,
    accessKey: nessusAccessKey,
    secretKey: nessusSecretKey,
    useMock: !(nessusUrl && nessusAccessKey && nessusSecretKey)  // silent mock fallback — REMOVE
  });
};
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix stdout contamination in nessus-api.ts (SAFE-01)</name>
  <files>src/nessus-api.ts</files>
  <action>
In src/nessus-api.ts, replace both `console.log` calls with `console.error`. There are exactly two:

Line 41: `console.log("Nessus API client initialized with real API credentials");`
→ `console.error("Nessus API client initialized with real API credentials");`

Line 44: `console.log("Nessus API client initialized in mock mode");`
→ `console.error("Nessus API client initialized in mock mode");`

No other changes to this file. The mock-mode branch code itself stays — it remains callable for future test isolation; only the log level changes.

After editing, run a grep to confirm zero console.log remain in this file:
```bash
grep "console\.log" src/nessus-api.ts
```
Expected: no output (empty).
  </action>
  <verify>
    <automated>cd /home/c_perronnet/git/monitoring/netbox/tools/nessus-mcp-server && grep -n "console\.log" src/nessus-api.ts && echo "FOUND_CONSOLE_LOG (bad)" || echo "NO_CONSOLE_LOG (correct)"</automated>
  </verify>
  <done>grep "console.log" src/nessus-api.ts returns no matches; both log lines now use console.error.</done>
</task>

<task type="auto">
  <name>Task 2: Remove dead Zod schemas from scans.ts (SAFE-02)</name>
  <files>src/tools/scans.ts</files>
  <action>
In src/tools/scans.ts, remove the two dead Zod schema declarations inside `startScanToolHandler`:

Delete these two lines (lines 82-83):
```typescript
const targetSchema = z.string().min(1);
const scanTypeSchema = z.enum(['basic-network-scan', 'web-app-scan', 'compliance-scan']);
```

After deleting them, check whether `z` (from `import { z } from 'zod'` on line 5) is still used anywhere else in the file. It is not — `z` only appeared in those two dead schema declarations. Therefore also remove the zod import:

Delete line 5:
```typescript
import { z } from 'zod';
```

Do NOT remove the zod package from package.json — it is still used in other files.

After editing, verify:
1. No `z\.` references remain in scans.ts
2. The file still exports all expected symbols (compile check)
  </action>
  <verify>
    <automated>cd /home/c_perronnet/git/monitoring/netbox/tools/nessus-mcp-server && grep -n "targetSchema\|scanTypeSchema\|from 'zod'" src/tools/scans.ts && echo "FOUND (bad)" || echo "CLEAN (correct)"</automated>
  </verify>
  <done>src/tools/scans.ts contains no targetSchema, scanTypeSchema, or zod import; npm run build exits 0 (no broken references).</done>
</task>

<task type="auto">
  <name>Task 3: Add fail-fast credential guard to index.ts (SAFE-05)</name>
  <files>src/index.ts</files>
  <action>
In src/index.ts, replace the body of the `initializeApi()` function (lines 40-53) with a fail-fast guard that exits before any server is created if credentials are missing.

Replace the current function body:
```typescript
const initializeApi = () => {
  // Check for environment variables
  const nessusUrl = process.env.NESSUS_URL;
  const nessusAccessKey = process.env.NESSUS_ACCESS_KEY;
  const nessusSecretKey = process.env.NESSUS_SECRET_KEY;

  // Initialize the API client
  return initializeNessusApi({
    url: nessusUrl,
    accessKey: nessusAccessKey,
    secretKey: nessusSecretKey,
    useMock: !(nessusUrl && nessusAccessKey && nessusSecretKey)
  });
};
```

With the fail-fast version:
```typescript
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

Key points:
- `process.exit(1)` is called INSIDE `initializeApi()`, which is invoked on line 144 BEFORE `createServer()` — this is the correct insertion point per the existing code structure.
- `useMock: false` is hardcoded — no silent fallback.
- The error message enumerates which specific env vars are missing, making it actionable for operators.

After editing, do a functional test: run the compiled server without env vars and confirm it exits with a non-zero code and prints the error to stderr:
```bash
npm run build && node build/index.js 2>&1; echo "EXIT:$?"
```
Expected output includes "Error: Missing required environment variables" and EXIT:1.
  </action>
  <verify>
    <automated>cd /home/c_perronnet/git/monitoring/netbox/tools/nessus-mcp-server && npm run build 2>&1 && node build/index.js 2>&1; echo "EXIT_CODE:$?"</automated>
  </verify>
  <done>Running node build/index.js without NESSUS_URL/NESSUS_ACCESS_KEY/NESSUS_SECRET_KEY set prints "Error: Missing required environment variables" to stderr and exits with code 1. npm run build exits 0.</done>
</task>

</tasks>

<verification>
After all three tasks:

1. No console.log anywhere in src/:
```bash
grep -r "console\.log" src/ && echo "FOUND (fail)" || echo "CLEAN (pass)"
```

2. Startup fail-fast works:
```bash
cd /home/c_perronnet/git/monitoring/netbox/tools/nessus-mcp-server
npm run build
node build/index.js 2>&1; echo "EXIT_CODE:$?"
```
Expected: stderr contains "Missing required environment variables", EXIT_CODE:1

3. Full build still succeeds:
```bash
npm run build
```
Expected: exits 0, zero errors.
</verification>

<success_criteria>
- grep -r "console.log" src/ returns no matches
- node build/index.js (no env vars) exits 1 with a message listing the missing variable names
- src/tools/scans.ts has no zod import and no targetSchema/scanTypeSchema
- npm run build exits 0
</success_criteria>

<output>
After completion, create `.planning/phases/01-safety-and-correctness/01-02-SUMMARY.md`
</output>
