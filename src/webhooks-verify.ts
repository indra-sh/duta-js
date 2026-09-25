/**
 * Verify a webhook delivery from Duta. Deliveries are signed per the Standard
 * Webhooks spec, as Resend's are: HMAC-SHA256 over "id.timestamp.body", keyed
 * with the base64 part of the whsec_ secret, sent as "v1,<base64>".
 */

export interface WebhookHeaders {
  id: string;
  timestamp: string;
  signature: string;
}

export interface VerifyOptions {
  /** The raw request body, exactly as received. Parsing and re-serialising breaks the signature. */
  payload: string;
  /** The webhook-id, webhook-timestamp and webhook-signature headers (or their svix-* twins). */
  headers: WebhookHeaders | Record<string, string | string[] | undefined> | Headers;
  /** The whsec_ signing secret shown when the endpoint was added. */
  secret: string;
  /** How far the timestamp may be from now. Default 5 minutes. */
  toleranceSeconds?: number;
}

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

const encoder = new TextEncoder();

/**
 * Returns the parsed event when the signature is valid and recent, and throws
 * WebhookVerificationError otherwise. Never trust a body before this passes.
 */
export async function verifyWebhook<T = unknown>(opts: VerifyOptions): Promise<T> {
  const { id, timestamp, signature } = readHeaders(opts.headers);
  if (!id || !timestamp || !signature) {
    throw new WebhookVerificationError('Missing webhook-id, webhook-timestamp or webhook-signature header');
  }

  const sent = Number(timestamp);
  const tolerance = opts.toleranceSeconds ?? 300;
  if (!Number.isInteger(sent) || Math.abs(Date.now() / 1000 - sent) > tolerance) {
    throw new WebhookVerificationError('Timestamp is outside the allowed window');
  }

  const secret = opts.secret.startsWith('whsec_') ? opts.secret.slice('whsec_'.length) : opts.secret;
  let keyBytes: Uint8Array<ArrayBuffer>;
  try {
    keyBytes = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));
  } catch {
    throw new WebhookVerificationError('Signing secret is not valid');
  }
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`${id}.${timestamp}.${opts.payload}`));
  const expected = toBase64(new Uint8Array(mac));

  // The header may carry several signatures, space separated, during a secret rotation.
  const valid = signature
    .split(' ')
    .map((part) => part.split(','))
    .some(([version, sig]) => version === 'v1' && sig !== undefined && timingSafeEqual(sig, expected));
  if (!valid) throw new WebhookVerificationError('Signature does not match');

  try {
    return JSON.parse(opts.payload) as T;
  } catch {
    throw new WebhookVerificationError('Payload is not JSON');
  }
}

function readHeaders(h: VerifyOptions['headers']): Partial<WebhookHeaders> {
  if (typeof Headers !== 'undefined' && h instanceof Headers) {
    return {
      id: h.get('webhook-id') ?? h.get('svix-id') ?? undefined,
      timestamp: h.get('webhook-timestamp') ?? h.get('svix-timestamp') ?? undefined,
      signature: h.get('webhook-signature') ?? h.get('svix-signature') ?? undefined,
    };
  }
  const record = h as Record<string, unknown>;
  if (typeof record['id'] === 'string' && typeof record['signature'] === 'string') {
    return record as unknown as WebhookHeaders;
  }
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(record)) {
    const value = Array.isArray(v) ? v[0] : v;
    if (typeof value === 'string') lower[k.toLowerCase()] = value;
  }
  return {
    id: lower['webhook-id'] ?? lower['svix-id'],
    timestamp: lower['webhook-timestamp'] ?? lower['svix-timestamp'],
    signature: lower['webhook-signature'] ?? lower['svix-signature'],
  };
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Constant time, so the comparison does not leak how much of a guess was right. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
