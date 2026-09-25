/**
 * The HTTP layer every resource goes through: authentication, timeouts,
 * retries and the error shape. It uses the global fetch, so the SDK runs on
 * Node 18+, Bun, Deno and Cloudflare Workers without a dependency.
 */

export const VERSION = '0.2.0';
const DEFAULT_BASE_URL = 'https://api.duta.indra.sh';

export interface DutaOptions {
  /** Defaults to https://api.duta.indra.sh, or DUTA_BASE_URL when set. */
  baseUrl?: string;
  /** Per attempt. Default 30 seconds. */
  timeoutMs?: number;
  /** Retries after the first attempt, for rate limits, server errors and network failures. Default 2. */
  maxRetries?: number;
  /** A fetch to use in place of the global one, for tests or a proxy. */
  fetch?: typeof fetch;
}

/**
 * An error from the API, or from reaching it. The fields follow Duta's error
 * body: `name` is the Resend-compatible name, `code` is Duta's finer one and
 * `requestId` finds the request on the Logs screen.
 */
export interface DutaError {
  statusCode: number | null;
  name: string;
  code: string;
  message: string;
  requestId: string | null;
  detail?: Record<string, unknown>;
}

export type Result<T> = { data: T; error: null } | { data: null; error: DutaError };

export interface RequestOptions {
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH';
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  headers?: Record<string, string | undefined>;
  /**
   * The request is safe to send twice: reads, deletes, and writes that carry
   * an Idempotency-Key. Only these are retried after a server error or a
   * network failure, where the first attempt may have taken effect.
   */
  idempotent?: boolean;
}

export class HttpClient {
  readonly #key: string;
  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #maxRetries: number;
  readonly #fetch: typeof fetch;

  constructor(apiKey: string, options: DutaOptions = {}) {
    this.#key = apiKey;
    this.#baseUrl = (options.baseUrl ?? env('DUTA_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.#timeoutMs = options.timeoutMs ?? 30_000;
    this.#maxRetries = Math.max(0, options.maxRetries ?? 2);
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async request<T>(opts: RequestOptions): Promise<Result<T>> {
    const url = new URL(`${this.#baseUrl}/v1${opts.path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }

    const headers: Record<string, string> = {
      authorization: `Bearer ${this.#key}`,
      'user-agent': `duta-js/${VERSION}`,
      accept: 'application/json',
    };
    for (const [k, v] of Object.entries(opts.headers ?? {})) if (v !== undefined) headers[k] = v;
    const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    if (body !== undefined) headers['content-type'] = 'application/json';

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.#fetch(url, {
          method: opts.method,
          headers,
          ...(body === undefined ? {} : { body }),
          signal: AbortSignal.timeout(this.#timeoutMs),
        });
      } catch (err) {
        const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
        if (opts.idempotent && attempt < this.#maxRetries) {
          await sleep(backoffMs(attempt));
          continue;
        }
        return failure({
          statusCode: null,
          name: timedOut ? 'timeout' : 'network_error',
          code: timedOut ? 'timeout' : 'network_error',
          message: timedOut
            ? `Duta did not answer within ${this.#timeoutMs / 1000}s`
            : `Could not reach Duta: ${err instanceof Error ? err.message : String(err)}`,
          requestId: null,
        });
      }

      // A 429 was refused before any work, so any request may repeat it. A
      // 5xx may have done its work, so only a request safe to repeat does.
      const retryable = res.status === 429 || (res.status >= 500 && opts.idempotent === true);
      if (retryable && attempt < this.#maxRetries) {
        await res.body?.cancel().catch(() => {});
        await sleep(retryAfterMs(res) ?? backoffMs(attempt));
        continue;
      }

      const requestId = res.headers.get('x-request-id');
      const text = await res.text();
      const json = text ? safeJson(text) : null;

      if (res.ok) return { data: json as T, error: null };

      const e = (json ?? {}) as Partial<{ name: string; code: string; message: string; detail: Record<string, unknown>; request_id: string }>;
      return failure({
        statusCode: res.status,
        name: e.name ?? 'application_error',
        code: e.code ?? 'internal_error',
        message: e.message ?? `Duta answered ${res.status}`,
        requestId: e.request_id ?? requestId,
        ...(e.detail ? { detail: e.detail } : {}),
      });
    }
  }
}

function failure(error: DutaError): Result<never> {
  return { data: null, error };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** 0.5s, 1s, 2s... with jitter, so clients that failed together do not retry together. */
function backoffMs(attempt: number): number {
  const base = Math.min(8_000, 500 * 2 ** attempt);
  return base / 2 + Math.random() * (base / 2);
}

function retryAfterMs(res: Response): number | null {
  const header = res.headers.get('retry-after');
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.min(seconds, 60) * 1000;
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, Math.min(at - Date.now(), 60_000));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** An environment variable, where the runtime has them. */
export function env(name: string): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[name] || undefined;
}
