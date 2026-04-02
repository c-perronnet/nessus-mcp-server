/**
 * Startup credential validation tests.
 *
 * These tests spawn `build/index.js` as a child process with controlled env vars
 * to verify the fail-fast guard in index.ts.  They rely on `npm run build` being
 * current -- beforeAll rebuilds to ensure we test the latest source.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execFile, exec } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

// Rebuild before running these tests so we always test current source
beforeAll(async () => {
  await execAsync('npm run build', {
    cwd: '/home/c_perronnet/git/monitoring/netbox/tools/nessus-mcp-server',
    timeout: 30000,
  });
}, 35000);

describe('startup credential validation', () => {
  it('exits with code 1 when all env vars are missing', async () => {
    try {
      await execFileAsync('node', ['build/index.js'], {
        cwd: '/home/c_perronnet/git/monitoring/netbox/tools/nessus-mcp-server',
        env: {
          PATH: process.env.PATH,
          NODE_PATH: process.env.NODE_PATH,
          NESSUS_URL: '',
          NESSUS_ACCESS_KEY: '',
          NESSUS_SECRET_KEY: '',
        },
        timeout: 5000,
      });
      // If we get here, the process didn't exit with an error -- fail the test
      expect.unreachable('Process should have exited with code 1');
    } catch (error: unknown) {
      const err = error as { code: number; stderr: string };
      expect(err.code).toBe(1);
      expect(err.stderr).toContain('Missing required environment variables');
    }
  });

  it('stderr mentions specific missing variable names', async () => {
    try {
      await execFileAsync('node', ['build/index.js'], {
        cwd: '/home/c_perronnet/git/monitoring/netbox/tools/nessus-mcp-server',
        env: {
          PATH: process.env.PATH,
          NODE_PATH: process.env.NODE_PATH,
          NESSUS_URL: 'https://example.com',
          NESSUS_ACCESS_KEY: '',
          NESSUS_SECRET_KEY: '',
        },
        timeout: 5000,
      });
      expect.unreachable('Process should have exited with code 1');
    } catch (error: unknown) {
      const err = error as { code: number; stderr: string };
      expect(err.code).toBe(1);
      expect(err.stderr).toContain('NESSUS_ACCESS_KEY');
      expect(err.stderr).toContain('NESSUS_SECRET_KEY');
      // NESSUS_URL was provided, so it should NOT appear in the missing list
      expect(err.stderr).not.toMatch(/Missing.*NESSUS_URL/);
    }
  });
});
