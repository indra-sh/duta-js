import { toDutaError, networkError } from "./errors";
import type {
  Email,
  ListEmailsOptions,
  ListEmailsResult,
  Result,
  SendEmailOptions,
  SendEmailResult,
} from "./types";

/**
 * Minimal shape the {@link Emails} resource needs from the parent client.
 * Keeps this file decoupled from the {@link Duta} class.
 */
export interface RequestContext {
  apiKey: string;
  baseUrl: string;
  fetch: typeof fetch;
}

/**
 * The `emails` resource — send, retrieve, and list emails.
 * Accessed via `duta.emails`.
 */
export class Emails {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * Send a transactional email.
   *
   * @example
   * ```ts
   * const { data, error } = await duta.emails.send({
   *   from: "hello@yourdomain.com",
   *   to: "user@example.com",
   *   subject: "Welcome!",
   *   html: "<p>Thanks for signing up.</p>",
   * });
   * ```
   */
  async send(options: SendEmailOptions): Promise<Result<SendEmailResult>> {
    return this.request<SendEmailResult>("POST", "/v1/email/send", options);
  }

  /**
   * Retrieve a single email by its ID. Requires a full-access API key.
   */
  async get(id: string): Promise<Result<Email>> {
    return this.request<Email>("GET", `/v1/email/${encodeURIComponent(id)}`);
  }

  /**
   * List emails, most recent first. Requires a full-access API key.
   */
  async list(options: ListEmailsOptions = {}): Promise<Result<ListEmailsResult>> {
    const params = new URLSearchParams();
    if (options.page != null) params.set("page", String(options.page));
    if (options.limit != null) params.set("limit", String(options.limit));
    const query = params.toString();
    return this.request<ListEmailsResult>("GET", `/v1/email${query ? `?${query}` : ""}`);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Result<T>> {
    let response: Response;
    try {
      response = await this.ctx.fetch(`${this.ctx.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.ctx.apiKey}`,
          "Content-Type": "application/json",
        },
        body: body == null ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network request failed";
      return { data: null, error: networkError(message) };
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      return { data: null, error: toDutaError(response.status, payload) };
    }

    return { data: payload as T, error: null };
  }
}
