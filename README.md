# Duta SDK

The official TypeScript/JavaScript SDK for [Duta](https://duta.indra.sh) — transactional email for developers.

Works in Node.js 18+, Cloudflare Workers, Vercel Edge, Deno, and the browser. Zero dependencies.

## Install

```bash
npm install @duta/sdk
# or
pnpm add @duta/sdk
# or
yarn add @duta/sdk
```

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

Get your API key from the [dashboard](https://app.duta.indra.sh). The sender domain must be
verified in your account first.

## Error handling

Methods never throw on API errors — they return a `{ data, error }` result. Inspect `error`
first; when it is `null`, `data` is guaranteed to be present.

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

## API

### `new Duta(apiKey, options?)`

| Option    | Type            | Default                       | Description                          |
| --------- | --------------- | ----------------------------- | ------------------------------------ |
| `baseUrl` | `string`        | `https://api.duta.indra.sh`   | Override the API base URL.           |
| `fetch`   | `typeof fetch`  | global `fetch`                | Custom fetch implementation.         |

### `duta.emails.send(options)`

| Field     | Type                       | Required | Description                                |
| --------- | -------------------------- | -------- | ------------------------------------------ |
| `from`    | `string`                   | yes      | Sender address (domain must be verified).  |
| `to`      | `string \| string[]`       | yes      | One or more recipients.                    |
| `subject` | `string`                   | yes      | Subject line.                              |
| `html`    | `string`                   | one of   | HTML body.                                 |
| `text`    | `string`                   | one of   | Plain-text body.                           |
| `replyTo` | `string`                   | no       | Reply-To address.                          |
| `tags`    | `Record<string, string>`   | no       | Arbitrary metadata.                        |

Returns `{ id, status }`.

### `duta.emails.get(id)`

Retrieve a single email. Requires a full-access API key.

### `duta.emails.list({ page?, limit? })`

List emails, most recent first. Requires a full-access API key.

## License

MIT
