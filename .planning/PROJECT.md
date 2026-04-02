# Nessus MCP Server

## What This Is

An MCP (Model Context Protocol) server that connects AI assistants to Tenable.io's cloud vulnerability management platform. It exposes scan management and vulnerability lookup as MCP tools, enabling AI-driven security workflows. Currently mock-only — needs real Tenable.io API integration, Node.js modernization, and production hardening.

## Core Value

AI assistants can trigger, monitor, and retrieve results from real Tenable.io vulnerability scans through a reliable, secure MCP interface.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. Inferred from existing codebase. -->

- ✓ MCP server scaffolding with stdio transport — existing
- ✓ Tool schema/handler pattern for scan and vulnerability tools — existing
- ✓ Mock mode for development/demo without real API — existing
- ✓ Centralized error handling with MCP error code mapping — existing
- ✓ Input validation for scan IDs, targets, vulnerability IDs, scan types — existing
- ✓ 7 MCP tools defined (list templates, start scan, scan status, scan results, list scans, vuln details, search vulns) — existing

### Active

- [ ] Replace all mock API calls with real Tenable.io cloud API integration
- [ ] Update to Node.js 22 LTS (remove node-fetch, use native fetch, update TS target)
- [ ] Fix security issues (TLS handling, credential validation, stdout leakage)
- [ ] Fix bugs (dead zod code in scan handler, inconsistent validation in search handler)
- [ ] Add proper TypeScript types for Tenable.io API responses (remove `any` types)
- [ ] Add automated test suite
- [ ] Production-ready error handling (retry logic, rate limiting, timeout handling)

### Out of Scope

- Nessus Professional (on-prem) support — targeting Tenable.io cloud only
- New MCP tools beyond current 7 — keep existing tool surface, just make it real
- Web UI or CLI interface — this is an MCP server only
- Scan scheduling or policy compliance tools — defer to future
- Report export functionality — defer to future

## Context

- Part of the monitoring/netbox tooling ecosystem
- Tenable.io REST API uses API key authentication (access key + secret key)
- Tenable.io API base: `https://cloud.tenable.com`
- Current codebase is TypeScript with ESM modules, MCP SDK v1.8.0
- `node-fetch` dependency can be removed with Node 22 (native fetch available)
- Nessus/Tenable.io often has self-signed certs in dev — need TLS config
- Mock mode should be preserved for development/demo use

## Constraints

- **Target Platform**: Node.js 22 LTS
- **API Target**: Tenable.io cloud API (not on-prem Nessus Professional)
- **Transport**: MCP stdio only (no HTTP MCP transport needed)
- **Testing**: Build against Tenable.io API docs — real instance testing deferred
- **Tool Surface**: Keep existing 7 tools, no additions

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Target Tenable.io cloud, not Nessus Professional | User's environment is cloud-hosted | — Pending |
| Node 22 LTS | Current LTS, native fetch, modern ESM | — Pending |
| Keep mock mode alongside real API | Useful for development and demos | — Pending |
| No new MCP tools | Scope control — make existing tools production-ready first | — Pending |

---
*Last updated: 2026-04-02 after initialization*
