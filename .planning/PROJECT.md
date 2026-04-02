# Nessus MCP Server

## What This Is

An MCP (Model Context Protocol) server that connects AI assistants to Tenable.io's cloud vulnerability management platform. Exposes 7 MCP tools for scan management and vulnerability lookup, enabling AI-driven security workflows. Production-ready with real Tenable.io API integration, typed responses, retry/throttle handling, and a 64-test automated suite.

## Core Value

AI assistants can trigger, monitor, and retrieve results from real Tenable.io vulnerability scans through a reliable, secure MCP interface.

## Requirements

### Validated

- ✓ MCP server scaffolding with stdio transport — existing
- ✓ Tool schema/handler pattern for scan and vulnerability tools — existing
- ✓ Mock mode for development/demo without real API — existing
- ✓ Centralized error handling with MCP error code mapping — existing
- ✓ Input validation for scan IDs, targets, vulnerability IDs, scan types — existing
- ✓ 7 MCP tools defined — existing
- ✓ Node.js 22 LTS with native fetch, NodeNext modules — v1.0
- ✓ Real Tenable.io cloud API integration for all 7 tools — v1.0
- ✓ Centralized HTTP client with auth, timeout, retry, rate limiting — v1.0
- ✓ Typed interfaces for all Tenable.io API responses — v1.0
- ✓ Automated test suite (64 tests, vitest) — v1.0
- ✓ Production error handling (structured MCP errors, exponential backoff) — v1.0
- ✓ Credential validation at startup with fail-fast — v1.0

### Active

(None — define in next milestone via `/gsd:new-milestone`)

### Out of Scope

- Nessus Professional (on-prem) support — targeting Tenable.io cloud only
- New MCP tools beyond current 7 — keep existing tool surface
- Web UI or CLI interface — this is an MCP server only
- Scan scheduling or policy compliance tools — defer to future
- Report export functionality — defer to future
- Offline mode — real-time API is core value

## Context

- Part of the monitoring/netbox tooling ecosystem
- Tenable.io REST API with API key authentication (access key + secret key)
- Tenable.io API base: `https://cloud.tenable.com`
- Tech stack: TypeScript, ESM, MCP SDK v1.29.0, vitest, p-retry, p-throttle
- 2,727 LOC across src/ and tests/
- Node.js 22 LTS required (uses `AbortSignal.timeout`, native fetch)
- Mock mode preserved for development/testing (`initializeNessusApi({ useMock: true })`)

## Constraints

- **Target Platform**: Node.js 22 LTS
- **API Target**: Tenable.io cloud API (not on-prem Nessus Professional)
- **Transport**: MCP stdio only (no HTTP MCP transport needed)
- **Tool Surface**: Keep existing 7 tools, no additions

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Target Tenable.io cloud, not Nessus Professional | User's environment is cloud-hosted | ✓ Good |
| Node 22 LTS | Current LTS, native fetch, modern ESM | ✓ Good |
| Keep mock mode alongside real API | Useful for development and testing | ✓ Good — used extensively in test suite |
| No new MCP tools | Scope control — make existing tools production-ready first | ✓ Good |
| TenableClient singleton inside nessus-api.ts | Keep HTTP wiring internal to API layer | ✓ Good — clean separation |
| Two-step create+launch for startScan | Tenable.io requires separate POST calls | ✓ Good — matches API design |
| Permissive target validation | Tenable handles server-side validation for CIDR/ranges | ✓ Good — avoids false rejections |
| Workbenches API for vulnerability search | `filter.0.filter=plugin_name` syntax confirmed working | ✓ Good |
| vi.stubGlobal for fetch mocking in tests | Native approach, no additional mocking library needed | ✓ Good |
| Child process spawn for startup tests | Avoids importing index.ts which auto-runs main() | ✓ Good |

---
*Last updated: 2026-04-02 after v1.0 milestone*
