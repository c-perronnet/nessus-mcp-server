# Technology Stack

**Analysis Date:** 2026-04-02

## Languages

**Primary:**
- TypeScript 5.8.2 - All source code in `src/` directory

**Secondary:**
- JavaScript - Runtime execution via Node.js

## Runtime

**Environment:**
- Node.js 16 or higher (ES2022 target, Node16 module resolution)

**Package Manager:**
- npm - `package.json` lockfile: `package-lock.json` present

## Frameworks

**Core:**
- @modelcontextprotocol/sdk 1.8.0 - MCP server implementation and protocol handling

**Build/Dev:**
- TypeScript 5.8.2 - Language transpilation to JavaScript
- tsc (TypeScript Compiler) - Build process configured in `package.json` scripts

## Key Dependencies

**Critical:**
- @modelcontextprotocol/sdk 1.8.0 - Provides Server, StdioServerTransport, and MCP protocol types
  - Imported in `src/index.ts` for server initialization
  - Provides error handling via ErrorCode and McpError types

**Infrastructure:**
- node-fetch 3.3.2 - HTTP client for making requests (prepared for real Nessus API integration)
  - Location: `package.json` dependencies
  - Used for future REST API calls to Nessus instances

**Validation:**
- zod 3.24.2 - Runtime type validation and schema definition
  - Currently used in `src/tools/scans.ts` for input validation (Zod enum for scan types)
  - Enables runtime schema validation for tool parameters

**Development:**
- @types/node 22.13.14 - TypeScript type definitions for Node.js standard library

## Configuration

**Environment:**
- Nessus API credentials via environment variables (optional):
  - `NESSUS_URL` - Nessus instance URL (e.g., `https://your-nessus-instance:8834`)
  - `NESSUS_ACCESS_KEY` - Tenable Nessus API access key
  - `NESSUS_SECRET_KEY` - Tenable Nessus API secret key
- Server runs in mock mode when credentials are not provided

**Build:**
- `tsconfig.json` - TypeScript compiler configuration:
  - Target: ES2022
  - Module system: Node16 (ESM)
  - Strict mode enabled
  - Output directory: `./build`
  - Source root: `./src`

**Scripts:**
- `npm run build` - Compile TypeScript and set executable permissions on build output
- `npm start` - Run compiled server: `node build/index.js`
- `npm run dev` - Build and run in development mode

## Platform Requirements

**Development:**
- Node.js 16+ installed
- npm or compatible package manager
- TypeScript compiler (installed via npm)

**Production:**
- Node.js 16+ runtime
- Built JavaScript output in `build/` directory
- Environment variables for Nessus API (optional for mock mode)

**Deployment:**
- Server runs via stdio transport - compatible with Claude for Desktop and other MCP clients
- Entry point: `/build/index.js` (executable)
- Executable permission required on binary: `chmod 755 build/index.js` (set during build)

---

*Stack analysis: 2026-04-02*
