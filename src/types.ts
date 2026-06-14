/**
 * Options passed to {@link Duta} when constructing a client.
 */
export interface DutaOptions {
  /**
   * Override the API base URL. Defaults to `https://api.duta.indra.sh`.
   * Useful for local development or self-hosted deployments.
   */
  baseUrl?: string;
  /**
   * Provide a custom `fetch` implementation. Defaults to the global `fetch`.
   * Useful in environments that do not expose a global fetch, or for testing.
   */
  fetch?: typeof fetch;
}

/**
 * Payload for sending an email via {@link Emails.send}.
 */
export interface SendEmailOptions {
  /** Sender address. The domain must be verified in your Duta account. */
  from: string;
  /** One recipient, or an array of recipients. */
  to: string | string[];
  /** Email subject line. */
  subject: string;
  /** HTML body. At least one of `html` or `text` is required. */
  html?: string;
  /** Plain-text body. At least one of `html` or `text` is required. */
  text?: string;
  /** Address that replies should be directed to. */
  replyTo?: string;
  /** Arbitrary key/value metadata attached to the email. */
  tags?: Record<string, string>;
}

/**
 * Returned by {@link Emails.send} on success.
 */
export interface SendEmailResult {
  /** Unique ID of the queued email. Use it with {@link Emails.get}. */
  id: string;
  /** Delivery status. `queued` immediately after sending. */
  status: string;
}

/**
 * A single email record, as returned by {@link Emails.get} and {@link Emails.list}.
 */
export interface Email {
  id: string;
  to: string[];
  from: string;
  replyTo: string | null;
  subject: string;
  html: string | null;
  text: string | null;
  tags: Record<string, string> | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Options for {@link Emails.list}.
 */
export interface ListEmailsOptions {
  /** Page number, starting at 1. */
  page?: number;
  /** Results per page (max 100). */
  limit?: number;
}

/**
 * Returned by {@link Emails.list}.
 */
export interface ListEmailsResult {
  emails: Email[];
  page: number;
  limit: number;
}

/**
 * Every SDK method returns this discriminated union instead of throwing.
 * Inspect `error` first; if it is `null`, `data` is guaranteed to be present.
 *
 * @example
 * ```ts
 * const { data, error } = await duta.emails.send({ ... });
 * if (error) {
 *   console.error(error.message);
 *   return;
 * }
 * console.log(data.id);
 * ```
 */
export type Result<T> =
  | { data: T; error: null }
  | { data: null; error: DutaError };

/**
 * Normalised error returned by every SDK method. Duta's API uses a couple of
 * different error shapes across endpoints; this type flattens them into one.
 */
export interface DutaError {
  /** Machine-readable error name, e.g. `rate_limit_exceeded`, `domain_not_verified`. */
  name: string;
  /** Human-readable description of what went wrong. */
  message: string;
  /** HTTP status code returned by the API. */
  statusCode: number;
  /** Present on 422 suppression errors: the recipient addresses that were blocked. */
  blocked?: string[];
}
