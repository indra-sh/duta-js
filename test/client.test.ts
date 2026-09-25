import { describe, it, expect, vi } from 'vitest';
import spec from '../openapi.json' with { type: 'json' };
import { Duta } from '../src/index.js';

interface Call {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
}

/** A fetch that records each call and answers from a queue, then with `fallback`. */
function fakeFetch(answers: Array<Response | Error> = [], fallback = () => Response.json({})) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      method: init?.method ?? 'GET',
      url: new URL(String(input)),
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const next = answers.shift();
    if (next instanceof Error) throw next;
    return next ?? fallback();
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

const email = { from: 'Kedai <resit@kedai.my>', to: 'siti@example.com', subject: 'Resit', text: 'Terima kasih' };

function errorResponse(status: number, code: string, headers: Record<string, string> = {}) {
  return Response.json(
    { statusCode: status, name: 'x', message: `${code} happened`, code, request_id: 'req_body' },
    { status, headers: { 'x-request-id': 'req_header', ...headers } },
  );
}

describe('Duta client', () => {
  it('sends with the key, a user agent and an idempotency key it made itself', async () => {
    const { fetch, calls } = fakeFetch([Response.json({ id: 'msg_1', status: 'queued' }, { status: 202 })]);
    const duta = new Duta('duta_test', { fetch });

    const { data, error } = await duta.emails.send(email);

    expect(error).toBeNull();
    expect(data).toEqual({ id: 'msg_1', status: 'queued' });
    const call = calls[0]!;
    expect(call.method).toBe('POST');
    expect(call.url.href).toBe('https://api.duta.indra.sh/v1/emails');
    expect(call.headers.get('authorization')).toBe('Bearer duta_test');
    expect(call.headers.get('user-agent')).toMatch(/^duta-js\//);
    expect(call.headers.get('idempotency-key')).toMatch(/^duta-js-/);
    expect(call.body).toEqual(email);
  });

  it('uses the idempotency key it is given', async () => {
    const { fetch, calls } = fakeFetch();
    await new Duta('k', { fetch }).emails.send(email, { idempotencyKey: 'receipt-1042' });
    expect(calls[0]!.headers.get('idempotency-key')).toBe('receipt-1042');
  });

  it('returns an API error as data rather than throwing', async () => {
    const { fetch } = fakeFetch([errorResponse(422, 'validation_failed')]);
    const { data, error } = await new Duta('k', { fetch }).emails.send(email);
    expect(data).toBeNull();
    expect(error).toMatchObject({
      statusCode: 422,
      code: 'validation_failed',
      message: 'validation_failed happened',
      requestId: 'req_body',
    });
  });

  it('falls back to the X-Request-Id header when the body has none', async () => {
    const { fetch } = fakeFetch([new Response('upstream broke', { status: 502, headers: { 'x-request-id': 'req_h' } })]);
    const { error } = await new Duta('k', { fetch, maxRetries: 0 }).domains.list();
    expect(error).toMatchObject({ statusCode: 502, requestId: 'req_h' });
  });

  it('retries a 429 after Retry-After, for any request', async () => {
    const { fetch, calls } = fakeFetch([
      errorResponse(429, 'rate_limited', { 'retry-after': '0' }),
      Response.json({ id: 'dom_1' }, { status: 201 }),
    ]);
    const { data } = await new Duta('k', { fetch }).domains.create({ name: 'kedai.my' });
    expect(data).toEqual({ id: 'dom_1' });
    expect(calls).toHaveLength(2);
  });

  it('retries a send after a 5xx with the same idempotency key', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const { fetch, calls } = fakeFetch([errorResponse(503, 'platform_halted'), Response.json({ id: 'msg_2' })]);
    const pending = new Duta('k', { fetch }).emails.send(email);
    await vi.runAllTimersAsync();
    const { data } = await pending;
    vi.useRealTimers();
    expect(data).toEqual({ id: 'msg_2' });
    expect(calls).toHaveLength(2);
    expect(calls[1]!.headers.get('idempotency-key')).toBe(calls[0]!.headers.get('idempotency-key'));
  });

  it('never retries a 5xx on a write that may have taken effect', async () => {
    const { fetch, calls } = fakeFetch([errorResponse(500, 'internal_error'), Response.json({})]);
    const { error } = await new Duta('k', { fetch }).apiKeys.create({ name: 'CI' });
    expect(error?.code).toBe('internal_error');
    expect(calls).toHaveLength(1);
  });

  it('retries a read after a network failure, and reports one it cannot recover', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const ok = fakeFetch([new TypeError('socket hang up'), Response.json({ id: 'msg_3' })]);
    const pending = new Duta('k', { fetch: ok.fetch }).emails.get('msg_3');
    await vi.runAllTimersAsync();
    expect((await pending).data).toEqual({ id: 'msg_3' });
    vi.useRealTimers();

    const down = fakeFetch([new TypeError('socket hang up')]);
    const { error } = await new Duta('k', { fetch: down.fetch }).webhooks.test('whk_1');
    expect(error).toMatchObject({ statusCode: null, code: 'network_error' });
    expect(down.calls).toHaveLength(1);
  });

  it('pages through every email with listAll', async () => {
    const { fetch, calls } = fakeFetch([
      Response.json({ data: [{ id: 'msg_a' }, { id: 'msg_b' }], has_more: true, next: 'msg_b' }),
      Response.json({ data: [{ id: 'msg_c' }], has_more: false, next: null }),
    ]);
    const ids: string[] = [];
    for await (const e of new Duta('k', { fetch }).emails.listAll({ limit: 2 })) ids.push(e.id);
    expect(ids).toEqual(['msg_a', 'msg_b', 'msg_c']);
    expect(calls[1]!.url.searchParams.get('after')).toBe('msg_b');
    expect(calls[1]!.url.searchParams.get('limit')).toBe('2');
  });

  it('takes a base URL with or without a trailing slash', async () => {
    const { fetch, calls } = fakeFetch();
    await new Duta('k', { fetch, baseUrl: 'http://localhost:8787/' }).usage.get();
    expect(calls[0]!.url.href).toBe('http://localhost:8787/v1/usage');
  });

  it('refuses to start without a key', () => {
    vi.stubEnv('DUTA_API_KEY', '');
    expect(() => new Duta()).toThrow(/Missing API key/);
    vi.unstubAllEnvs();
  });
});

describe('coverage of the API', () => {
  it('calls exactly the operations in the spec', async () => {
    const { fetch, calls } = fakeFetch([], () => Response.json({ data: [], has_more: false, next: null }));
    const duta = new Duta('k', { fetch });

    await duta.emails.send(email);
    await duta.emails.get('msg_1');
    await duta.emails.list();
    await duta.batch.send([email]);
    await duta.domains.create({ name: 'kedai.my' });
    await duta.domains.list();
    await duta.domains.get('dom_1');
    await duta.domains.verify('dom_1');
    await duta.domains.remove('dom_1');
    await duta.apiKeys.create({ name: 'CI' });
    await duta.apiKeys.list();
    await duta.apiKeys.remove('key_1');
    await duta.webhooks.create({ endpoint: 'https://kedai.my/hook' });
    await duta.webhooks.list();
    await duta.webhooks.get('whk_1');
    await duta.webhooks.remove('whk_1');
    await duta.webhooks.enable('whk_1');
    await duta.webhooks.test('whk_1');
    await duta.webhooks.deliveries('whk_1');
    await duta.suppressions.list();
    await duta.suppressions.create('gone@example.com');
    await duta.suppressions.remove('gone@example.com');
    await duta.logs.list();
    await duta.logs.get('req_1');
    await duta.usage.get();

    // Each call as the spec writes it: /emails/{id}, with the /v1 prefix off.
    const templates = Object.keys(spec.paths);
    const made = new Set(
      calls.map((c) => {
        const path = c.url.pathname.replace(/^\/v1/, '');
        const template = templates.find((t) =>
          new RegExp(`^${t.replace(/\{[^}]+\}/g, '[^/]+')}$`).test(path),
        );
        return `${c.method.toLowerCase()} ${template ?? `UNKNOWN ${path}`}`;
      }),
    );

    const inSpec = new Set(
      Object.entries(spec.paths as Record<string, Record<string, unknown>>).flatMap(([path, ops]) =>
        Object.keys(ops).map((method) => `${method} ${path}`),
      ),
    );
    // The archived body is the dashboard's preview, not something an SDK user needs.
    inSpec.delete('get /emails/{id}/body');

    expect([...made].sort()).toEqual([...inSpec].sort());
  });
});
