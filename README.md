# Duta SDK

TypeScript/JavaScript client for [Duta](https://duta.indra.sh).

Runs anywhere `fetch` exists: Node 18+, Cloudflare Workers, Vercel Edge, Deno, and the browser. No dependencies.

## Install

```bash
npm install @duta/sdk
```

(or `pnpm add @duta/sdk` / `yarn add @duta/sdk`)

## Quickstart

```ts
import { Duta } from "@duta/sdk";

const duta = new Duta("duta_live_xxx");

const { data, error } = await duta.emails.send({
  from: "hello@yourdomain.com",
  to: "user@example.com",
  subject: "Welcome to Duta",
  html: "<p>Thanks for signing up!</p>",
});

if (error) {
  console.error(error.message);
} else {
  console.log("Sent:", data.id);
}
```

Grab an API key from the [dashboard](https://app.duta.indra.sh). Note that the sender domain has to be verified in your account before it'll send.

## Sending

`to` takes one address or an array:

```ts
await duta.emails.send({
  from: "hello@yourdomain.com",
  to: ["a@example.com", "b@example.com"],
  subject: "Hello both of you",
  text: "Plain text works too.",
});
```

You can send `html`, `text`, or both. `replyTo` and `tags` are optional:

```ts
await duta.emails.send({
  from: "hello@yourdomain.com",
  to: "user@example.com",
  subject: "Your receipt",
  html: "<p>Thanks for your order.</p>",
  replyTo: "support@yourdomain.com",
  tags: { order_id: "1234", plan: "pro" },
});
```

## Error handling

Nothing throws on an API error. You get back `{ data, error }` instead, and exactly one of them is set. So check `error`, and if it's `null` you're good to use `data`.

```ts
const { data, error } = await duta.emails.send({ ... });

if (error) {
  switch (error.name) {
    case "authentication_error":   // bad or missing API key
    case "permission_denied":      // sender domain not verified, or key lacks scope
    case "rate_limit_exceeded":    // slow down
    case "unprocessable_entity":   // e.g. recipient is on the suppression list
      console.error(error.statusCode, error.name, error.message);
  }
  return;
}
```

When a send is rejected because a recipient is on your suppression list, `error.blocked` holds the addresses that were skipped.

## API

### `new Duta(apiKey, options?)`

`options` is optional:

- `baseUrl` (string): point the client somewhere other than `https://api.duta.indra.sh`.
- `fetch` (function): supply your own fetch if there's no global one.

### `duta.emails.send(options)`

| Field | Type | Notes |
|---|---|---|
| `from` | `string` | Required. Domain must be verified. |
| `to` | `string \| string[]` | Required. One recipient or several. |
| `subject` | `string` | Required. |
| `html` | `string` | HTML body. Send `html`, `text`, or both. |
| `text` | `string` | Plain-text body. |
| `replyTo` | `string` | Optional Reply-To address. |
| `tags` | `Record<string, string>` | Optional metadata. |

Returns `{ id, status }`.

### `duta.emails.get(id)`

Fetch one email by its ID. Returns the full record:

```ts
const { data } = await duta.emails.get("a1b2c3...");
// data: { id, to, from, subject, html, text, status, createdAt, ... }
```

### `duta.emails.list({ page?, limit? })`

List emails newest-first. `page` starts at 1, `limit` caps at 100.

```ts
const { data } = await duta.emails.list({ page: 1, limit: 20 });
// data: { emails: [...], page, limit }
```

`get` and `list` read your account's email history, so they need a full-access key. Sending-only keys can call `send` but not these.

## TypeScript

Types come bundled. Import them when you need to type things outside the call site:

```ts
import type { SendEmailOptions, Email, DutaError } from "@duta/sdk";
```

## Coming from Resend?

The `send` shape lines up closely with what you already know, so most code carries over with small renames (for example `replyTo` instead of `reply_to`). A full migration guide is on the way.

## License

MIT
