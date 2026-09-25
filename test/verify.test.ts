import { describe, it, expect, vi, afterEach } from 'vitest';
import fixture from './fixtures/webhook.json' with { type: 'json' };
import { Duta, verifyWebhook, WebhookVerificationError } from '../src/index.js';

/**
 * The fixture is a delivery signed by Duta's own webhook signer
 * (scripts/fixtures.ts), so these check the SDK against what Duta sends.
 * The clock is set to the moment it was signed.
 */

const { secret, body, timestamp, headers } = fixture;

afterEach(() => vi.useRealTimers());

function at(seconds: number) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(seconds * 1000);
}

describe('verifying webhooks', () => {
  it('accepts a delivery signed by Duta and returns the event', async () => {
    at(timestamp + 10);
    const event = await verifyWebhook<{ type: string }>({ payload: body, headers, secret });
    expect(event.type).toBe('email.delivered');
  });

  it('reads the svix-* headers, a Headers object and Resend-style named headers', async () => {
    at(timestamp);
    const svixOnly = {
      'svix-id': headers['svix-id'],
      'svix-timestamp': headers['svix-timestamp'],
      'svix-signature': headers['svix-signature'],
    };
    await expect(verifyWebhook({ payload: body, headers: svixOnly, secret })).resolves.toBeTruthy();
    await expect(verifyWebhook({ payload: body, headers: new Headers(headers), secret })).resolves.toBeTruthy();
    await expect(
      new Duta('k').webhooks.verify({
        payload: body,
        headers: { id: headers['webhook-id'], timestamp: headers['webhook-timestamp'], signature: headers['webhook-signature'] },
        secret,
      }),
    ).resolves.toBeTruthy();
  });

  it('refuses a body changed after signing', async () => {
    at(timestamp);
    await expect(
      verifyWebhook({ payload: body.replace('delivered', 'bounced'), headers, secret }),
    ).rejects.toBeInstanceOf(WebhookVerificationError);
  });

  it('refuses the wrong secret', async () => {
    at(timestamp);
    await expect(
      verifyWebhook({ payload: body, headers, secret: `whsec_${'cd34'.repeat(8)}` }),
    ).rejects.toThrow(/does not match/);
  });

  it('refuses an old delivery replayed with its original signature', async () => {
    at(timestamp + 3600);
    await expect(verifyWebhook({ payload: body, headers, secret })).rejects.toThrow(/outside the allowed window/);
  });

  it('refuses a delivery with no signature headers', async () => {
    await expect(verifyWebhook({ payload: body, headers: {}, secret })).rejects.toThrow(/Missing/);
  });
});
