---
phase: 01-safety-and-correctness
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - tsconfig.json
  - package.json
autonomous: true
requirements:
  - SAFE-03
  - SAFE-04

must_haves:
  truths:
    - "TypeScript compilation succeeds with no errors after tsconfig changes"
    - "node-fetch is absent from node_modules and package.json after removal"
    - "Native fetch types (Request, Response, Headers) are recognized by TypeScript without errors"
  artifacts:
    - path: "tsconfig.json"
      provides: "Node 22 TypeScript configuration"
      contains: "NodeNext"
    - path: "package.json"
      provides: "Clean dependency list without node-fetch"
  key_links:
    - from: "tsconfig.json"
      to: "src/**/*.ts"
      via: "TypeScript compiler uses lib: [ES2022, DOM] and moduleResolution: NodeNext"
      pattern: "NodeNext"
    - from: "package.json"
      to: "node_modules"
      via: "npm install removes node-fetch"
      pattern: "node-fetch absent"
---

<objective>
Update TypeScript configuration for Node 22 LTS and remove the unused node-fetch dependency.

Purpose: The current tsconfig.json targets Node16 module resolution and lacks the DOM lib needed for native fetch types. node-fetch is listed as a dependency but is never imported anywhere in source — it is dead weight that conflicts with the intent to use Node 22 native fetch. These are prerequisite fixes before any real API HTTP code can be written.
Output: Updated tsconfig.json with NodeNext + ES2022+DOM; package.json without node-fetch; clean node_modules.
</objective>

<execution_context>
@/home/c_perronnet/.claude/get-shit-done/workflows/execute-plan.md
@/home/c_perronnet/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update tsconfig.json for Node 22 LTS</name>
  <files>tsconfig.json</files>
  <action>
Replace the contents of tsconfig.json with the Node 22-correct configuration. The required changes are:
- Add `"lib": ["ES2022", "DOM"]` — DOM is required for TypeScript to recognize the native fetch globals (fetch, Request, Response, Headers, AbortController). Without it, TypeScript reports "Cannot find name 'fetch'" even though it exists at runtime in Node 22.
- Change `"module": "Node16"` to `"module": "NodeNext"` — NodeNext is the forward-compatible alias for the current Node.js LTS; Node16 was for Node.js 16 specifically.
- Change `"moduleResolution": "Node16"` to `"moduleResolution": "NodeNext"` — must match module setting.

All other fields stay exactly as they are. The final tsconfig.json must be:

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

After writing the file, run `npm run build` and confirm it exits 0 with no TypeScript errors.
  </action>
  <verify>
    <automated>cd /home/c_perronnet/git/monitoring/netbox/tools/nessus-mcp-server && npm run build 2>&1 | tail -5 && echo "BUILD_EXIT:$?"</automated>
  </verify>
  <done>npm run build exits 0 with no TypeScript errors; tsconfig.json contains "NodeNext" for both module and moduleResolution, and "DOM" in the lib array.</done>
</task>

<task type="auto">
  <name>Task 2: Remove node-fetch dependency</name>
  <files>package.json</files>
  <action>
Remove node-fetch from the project. node-fetch is listed in package.json dependencies but is never imported anywhere in src/ — confirmed by grep. Node 22 provides stable native fetch; the package is dead weight.

Run:
```bash
npm uninstall node-fetch
```

This both removes it from package.json and cleans node_modules. After running, verify:
1. "node-fetch" does not appear in package.json dependencies
2. node_modules/node-fetch directory does not exist
3. `npm run build` still exits 0 (no source file imports node-fetch, so removing it cannot break compilation)
  </action>
  <verify>
    <automated>cd /home/c_perronnet/git/monitoring/netbox/tools/nessus-mcp-server && npm uninstall node-fetch && npm run build 2>&1 | tail -3 && echo "BUILD_EXIT:$?" && grep -c "node-fetch" package.json && echo "node-fetch grep count (expect 0)"</automated>
  </verify>
  <done>"node-fetch" does not appear in package.json; node_modules/node-fetch directory is absent; npm run build exits 0.</done>
</task>

</tasks>

<verification>
Run the full build after both tasks complete:
```bash
cd /home/c_perronnet/git/monitoring/netbox/tools/nessus-mcp-server && npm run build
```
Expected: exits 0, zero TypeScript errors.

Spot-check tsconfig.json contains exactly:
- `"lib": ["ES2022", "DOM"]`
- `"module": "NodeNext"`
- `"moduleResolution": "NodeNext"`

Confirm node-fetch is gone:
```bash
grep "node-fetch" package.json && echo "FOUND" || echo "ABSENT (correct)"
```
</verification>

<success_criteria>
- tsconfig.json has lib ["ES2022", "DOM"], module NodeNext, moduleResolution NodeNext
- package.json has no node-fetch entry
- npm run build exits 0 with no errors
</success_criteria>

<output>
After completion, create `.planning/phases/01-safety-and-correctness/01-01-SUMMARY.md`
</output>
