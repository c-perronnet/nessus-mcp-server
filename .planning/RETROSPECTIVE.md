# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Nessus MCP Server

**Shipped:** 2026-04-02
**Phases:** 4 | **Plans:** 8 | **Sessions:** 1

### What Was Built
- Node 22 LTS modernization (native fetch, NodeNext, removed node-fetch)
- Centralized TenableClient with auth, timeout, retry (p-retry), and rate throttling (p-throttle)
- All 7 MCP tools wired to real Tenable.io API (scans via REST, vulnerabilities via Workbenches)
- Typed interfaces for all API responses (15+ types in tenable.ts)
- 64-test vitest suite: validators, HTTP client, all 7 handlers, startup validation
- Dependency security fix (MCP SDK 1.8.0 → 1.29.0)

### What Worked
- Wave-based execution kept phases ordered correctly — Phase 2 HTTP client was available for Phase 3 tools
- Mock mode (`initializeNessusApi({ useMock: true })`) made tool handler testing trivial — no complex mocking needed
- Research phase caught Tenable.io API quirks early (two-step scan flow, Workbenches filter syntax, null scans array)
- `vi.stubGlobal('fetch', ...)` pattern for HTTP client testing was clean and reliable

### What Was Inefficient
- Phase 3 ROADMAP.md and REQUIREMENTS.md checkboxes were not updated during execution — caused 16 unchecked requirements at milestone audit
- Phase 1 verification flagged SAFE-05 as a gap (nessus-api.ts silent mock default) but the SUMMARY and REQUIREMENTS marked it complete — 3-source disagreement
- Phase 3 ROADMAP progress table showed "Not started" despite completion — state tracking gap

### Patterns Established
- `getClient()` guard pattern for singleton module initialization
- Two-step API flows (create + launch) for Tenable.io scan operations
- Multi-shape response formatters with field-presence detection
- Child process spawn for testing modules that auto-run main() on import

### Key Lessons
1. **State tracking must happen atomically with execution** — the documentation gaps (unchecked requirements, stale progress table) all came from Phase 3 execution not calling the completion tooling
2. **Verification catches real issues** — the SAFE-05 defense-in-depth gap was a legitimate finding even though user-facing behavior was correct
3. **Research phases save time** — Workbenches API filter syntax, two-step scan flow, and null scans array handling were all caught before coding

### Cost Observations
- Model mix: ~80% opus (execution), ~20% sonnet (verification/checking)
- Sessions: 1 (full milestone in single context)
- Notable: All 4 phases planned and executed sequentially in one session

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | 1 | 4 | Initial milestone — established GSD workflow |

### Cumulative Quality

| Milestone | Tests | Coverage | Dependencies |
|-----------|-------|----------|-------------|
| v1.0 | 64 | validators + HTTP + handlers + startup | 5 runtime + 3 dev |

### Top Lessons (Verified Across Milestones)

1. State tracking must be atomic with execution (v1.0 — Phase 3 documentation gaps)
2. Research before planning catches API quirks early (v1.0 — Tenable.io specifics)
