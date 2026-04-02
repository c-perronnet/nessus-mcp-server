/**
 * Centralized HTTP client for the Tenable.io REST API.
 *
 * All outbound requests flow through this client, which provides:
 * - X-ApiKeys authentication header (HTTP-02)
 * - Per-request AbortSignal.timeout (HTTP-03)
 * - HTTP status-to-NessusErrorType mapping (HTTP-04)
 * - Exponential-backoff retries via p-retry (HTTP-05)
 * - Client-side rate throttling via p-throttle (HTTP-06)
 */

import pRetry, { AbortError } from 'p-retry';
import pThrottle from 'p-throttle';
import {
  NessusErrorType,
  createNessusError,
  httpStatusToErrorType,
} from './utils/error-handling.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface TenableClientConfig {
  baseUrl: string;
  accessKey: string;
  secretKey: string;
  /** Request timeout in milliseconds. @default 30_000 */
  timeoutMs?: number;
  /** Maximum retry attempts for retryable errors. @default 3 */
  maxRetries?: number;
  /** Target rate limit in requests per minute. @default 100 */
  rateLimitPerMin?: number;
}

interface ResolvedConfig {
  baseUrl: string;
  accessKey: string;
  secretKey: string;
  timeoutMs: number;
  maxRetries: number;
  rateLimitPerMin: number;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class TenableClient {
  private readonly config: ResolvedConfig;
  private readonly throttledFetch: typeof fetch;

  constructor(config: TenableClientConfig) {
    this.config = {
      baseUrl: config.baseUrl,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      timeoutMs: config.timeoutMs ?? 30_000,
      maxRetries: config.maxRetries ?? 3,
      rateLimitPerMin: config.rateLimitPerMin ?? 100,
    };

    // Rate-limit to ~rateLimitPerMin using a 10-second sliding window (HTTP-06)
    const throttle = pThrottle({
      limit: Math.floor(this.config.rateLimitPerMin / 6),
      interval: 10_000,
    });

    this.throttledFetch = throttle((...args: Parameters<typeof fetch>) =>
      fetch(...args),
    );
  }

  // -------------------------------------------------------------------------
  // Core request method (HTTP-01)
  // -------------------------------------------------------------------------

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'X-ApiKeys': `accessKey=${this.config.accessKey};secretKey=${this.config.secretKey}`,
      Accept: 'application/json',
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      return await pRetry(
        async () => {
          // Fresh AbortSignal per attempt to avoid stale-signal pitfall (HTTP-03)
          const signal = AbortSignal.timeout(this.config.timeoutMs);

          const response = await this.throttledFetch(url, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal,
          });

          if (!response.ok) {
            const status = response.status;

            if (status === 429) {
              const retryAfter = response.headers.get('retry-after');
              if (retryAfter) {
                console.error(`Rate limited (429). Retry-After: ${retryAfter}`);
              }
              const err = new Error(`Rate limited (HTTP 429)`);
              (err as Error & { statusCode: number }).statusCode = status;
              throw err; // retryable
            }

            if (status === 400 || status === 401 || status === 403 || status === 404 || status === 409) {
              const err = new AbortError(`HTTP ${status}: ${response.statusText}`);
              (err as unknown as Record<string, unknown>).statusCode = status;
              throw err; // non-retryable
            }

            if (status >= 500) {
              const err = new Error(`Server error (HTTP ${status})`);
              (err as Error & { statusCode: number }).statusCode = status;
              throw err; // retryable
            }

            // Unexpected status -- treat as non-retryable
            const err = new AbortError(`Unexpected HTTP ${status}`);
            (err as unknown as Record<string, unknown>).statusCode = status;
            throw err;
          }

          return (await response.json()) as T;
        },
        {
          retries: this.config.maxRetries,
          factor: 2,
          minTimeout: 1_000,
        },
      );
    } catch (error: unknown) {
      // Already an McpError (from createNessusError) -- re-throw as-is
      if (error instanceof Error && error.constructor.name === 'McpError') {
        throw error;
      }

      // Error with statusCode from our HTTP handling
      if (
        error instanceof Error &&
        'statusCode' in error &&
        typeof (error as Error & { statusCode: number }).statusCode === 'number'
      ) {
        const statusCode = (error as Error & { statusCode: number }).statusCode;
        throw createNessusError(
          httpStatusToErrorType(statusCode),
          error.message,
        );
      }

      // Native DOMException: timeout or abort
      if (error instanceof DOMException) {
        if (error.name === 'TimeoutError') {
          throw createNessusError(
            NessusErrorType.TIMEOUT,
            `Request to ${path} timed out after ${this.config.timeoutMs}ms`,
          );
        }
        if (error.name === 'AbortError') {
          throw createNessusError(
            NessusErrorType.API_ERROR,
            'Request aborted',
          );
        }
      }

      // Generic fallback
      const message =
        error instanceof Error ? error.message : String(error);
      throw createNessusError(NessusErrorType.API_ERROR, message);
    }
  }

  // -------------------------------------------------------------------------
  // Convenience methods
  // -------------------------------------------------------------------------

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }
}
