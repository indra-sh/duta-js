# @duta/sdk

The official Node.js SDK for [Duta](https://duta.indra.sh), transactional email
for Malaysia.

- No dependencies. Runs on Node 18+, Bun, Deno and Cloudflare Workers.
- Method names follow Resend's SDK, so moving code over is mechanical.
- Retries rate limits and server errors safely: every send carries an
  idempotency key, so a retry can never send twice.
- Typed from Duta's OpenAPI spec, including every error `code`.

## Upgrading from 0.1.x

0.2.0 is a new SDK for Duta's current API, not an update of 0.1.x, which was
written for an earlier version of Duta that no longer runs. Install 0.2.0 and
follow this page.

## Install

```sh
npm install @duta/sdk
```

## Send an email

```ts
import { Duta } from '@duta/sdk';

const duta = new Duta(process.env.DUTA_API_KEY);

const { data, error } = await duta.emails.send({
  from: 'Kedai <resit@kedai.my>',
  to: 'siti@example.com',
  subject: 'Resit #1042',
  html: '<p>Terima kasih.</p>',
});

if (error) {
  console.error(error.code, error.message, error.requestId);
} else {
  console.log(data.id);
}
```

Every method returns `{ data, error }` and does not throw for an API error.
`error.requestId` finds the request on the Logs screen in the dashboard.

## Idempotency

Each send gets an idempotency key automatically, so the SDK's own retries are
safe. To make your own retries safe too, give a key that names the message:

```ts
await duta.emails.send(receipt, { idempotencyKey: `receipt-${order.id}` });
```

## Batch

```ts
await duta.batch.send([first, second], { validation: 'permissive' });
```

## Paging

```ts
for await (const email of duta.emails.listAll({ status: 'bounced' })) {
  console.log(email.id);
}
```

`logs.listAll` and `suppressions.listAll` work the same way. `list` returns one
page with `has_more` and `next`.

## Verify webhooks

```ts
const event = await duta.webhooks.verify({
  payload: rawBody, // the raw request body, before JSON parsing
  headers: request.headers,
  secret: process.env.DUTA_WEBHOOK_SECRET,
});
```

It throws `WebhookVerificationError` when the signature is wrong or the
delivery is more than five minutes old.

## Everything else

| | |
|---|---|
| `emails` | `send`, `get`, `list`, `listAll` |
| `batch` | `send` |
| `domains` | `create`, `list`, `get`, `verify`, `remove` |
| `apiKeys` | `create`, `list`, `remove` |
| `webhooks` | `create`, `list`, `get`, `remove`, `enable`, `test`, `deliveries`, `verify` |
| `suppressions` | `create`, `list`, `listAll`, `remove` |
| `logs` | `list`, `listAll`, `get` |
| `usage` | `get` |

## Options

```ts
new Duta(key, {
  baseUrl: 'https://api.duta.indra.sh', // or DUTA_BASE_URL
  timeoutMs: 30_000,                     // per attempt
  maxRetries: 2,
});
```

Full documentation: https://docs.duta.indra.sh
