import type { components, operations } from './generated/openapi.js';
import { HttpClient, env, type DutaOptions, type Result } from './http.js';
import { verifyWebhook, type VerifyOptions } from './webhooks-verify.js';

type Schemas = components['schemas'];
type Json<T> = T extends { content: { 'application/json': infer B } } ? B : never;
type Body<Op extends keyof operations> = Json<operations[Op]['requestBody']>;
type Query<Op extends keyof operations> = NonNullable<operations[Op]['parameters']['query']>;
type Ok<Op extends keyof operations, S extends keyof operations[Op]['responses']> = Json<
  operations[Op]['responses'][S]
>;

export type SendEmailOptions = Body<'sendEmail'>;
export type Email = Schemas['Email'];
export type EmailSummary = Schemas['EmailSummary'];
export type Domain = Schemas['Domain'];
export type ApiKey = Schemas['ApiKey'];
export type CreatedApiKey = Schemas['CreatedApiKey'];
export type Webhook = Schemas['Webhook'];
export type CreatedWebhook = Schemas['CreatedWebhook'];
export type WebhookDelivery = Schemas['WebhookDelivery'];
export type Suppression = Schemas['Suppression'];
export type Log = Schemas['Log'];
export type LogSummary = Schemas['LogSummary'];
export type Usage = Schemas['Usage'];
export type SendResult = Schemas['SendResult'];

interface Page<T> {
  object?: 'list';
  data: T[];
  has_more: boolean;
  next: string | null;
}

export interface SendOptions {
  /**
   * Makes the send safe to repeat for 24 hours. When left out the SDK makes
   * one per call, so its own retries can never send twice.
   */
  idempotencyKey?: string;
}

export interface BatchOptions extends SendOptions {
  /** strict (default) sends none if any email is invalid. permissive sends the valid ones. */
  validation?: 'strict' | 'permissive';
}

const enc = encodeURIComponent;

/**
 * The Duta client.
 *
 *     const duta = new Duta(process.env.DUTA_API_KEY);
 *     const { data, error } = await duta.emails.send({ from, to, subject, html });
 *
 * Every method returns `{ data, error }` and never throws for an API error,
 * as Resend's SDK does. Method names follow Resend's, so moving code over is
 * mechanical.
 */
export class Duta {
  readonly #http: HttpClient;

  constructor(apiKey?: string, options: DutaOptions = {}) {
    const key = apiKey ?? env('DUTA_API_KEY');
    if (!key) {
      throw new Error('Missing API key. Pass it to new Duta(key) or set DUTA_API_KEY.');
    }
    this.#http = new HttpClient(key, options);
  }

  readonly emails = {
    /** Send one email. Answers `{ id, status }`. */
    send: (email: SendEmailOptions, options: SendOptions = {}): Promise<Result<Ok<'sendEmail', 202>>> =>
      this.#http.request({
        method: 'POST',
        path: '/emails',
        body: email,
        headers: { 'idempotency-key': options.idempotencyKey ?? newKey() },
        idempotent: true,
      }),

    get: (id: string): Promise<Result<Email>> =>
      this.#http.request({ method: 'GET', path: `/emails/${enc(id)}`, idempotent: true }),

    /** One page, newest first. Pass `next` from a page as `after` for the following one. */
    list: (query: Query<'listEmails'> = {}): Promise<Result<Page<EmailSummary>>> =>
      this.#http.request({ method: 'GET', path: '/emails', query, idempotent: true }),

    /** Every email matching the query, page by page. Throws on an API error. */
    listAll: (query: Omit<Query<'listEmails'>, 'after'> = {}): AsyncGenerator<EmailSummary> =>
      this.#all((after) => this.emails.list({ ...query, after })),
  };

  readonly batch = {
    /** Send up to 100 emails in one request. */
    send: (emails: SendEmailOptions[], options: BatchOptions = {}): Promise<Result<Ok<'sendBatch', 200>>> =>
      this.#http.request({
        method: 'POST',
        path: '/emails/batch',
        body: emails,
        headers: {
          'idempotency-key': options.idempotencyKey ?? newKey(),
          'x-batch-validation': options.validation,
        },
        idempotent: true,
      }),
  };

  readonly domains = {
    create: (domain: Body<'createDomain'>): Promise<Result<Domain>> =>
      this.#http.request({ method: 'POST', path: '/domains', body: domain }),
    list: (): Promise<Result<Ok<'listDomains', 200>>> =>
      this.#http.request({ method: 'GET', path: '/domains', idempotent: true }),
    get: (id: string): Promise<Result<Domain>> =>
      this.#http.request({ method: 'GET', path: `/domains/${enc(id)}`, idempotent: true }),
    /** Check the domain's DNS now rather than waiting for Duta's own check. */
    verify: (id: string): Promise<Result<Schemas['DomainVerify']>> =>
      this.#http.request({ method: 'POST', path: `/domains/${enc(id)}/verify`, idempotent: true }),
    remove: (id: string): Promise<Result<Ok<'deleteDomain', 200>>> =>
      this.#http.request({ method: 'DELETE', path: `/domains/${enc(id)}`, idempotent: true }),
  };

  readonly apiKeys = {
    /** The key is in `token`, and is shown only once. */
    create: (key: Body<'createApiKey'>): Promise<Result<CreatedApiKey>> =>
      this.#http.request({ method: 'POST', path: '/api-keys', body: key }),
    list: (): Promise<Result<Ok<'listApiKeys', 200>>> =>
      this.#http.request({ method: 'GET', path: '/api-keys', idempotent: true }),
    remove: (id: string): Promise<Result<Ok<'deleteApiKey', 200>>> =>
      this.#http.request({ method: 'DELETE', path: `/api-keys/${enc(id)}`, idempotent: true }),
  };

  readonly webhooks = {
    /** The `signing_secret` in the answer is shown only once. */
    create: (webhook: Body<'createWebhook'>): Promise<Result<CreatedWebhook>> =>
      this.#http.request({ method: 'POST', path: '/webhooks', body: webhook }),
    list: (): Promise<Result<Ok<'listWebhooks', 200>>> =>
      this.#http.request({ method: 'GET', path: '/webhooks', idempotent: true }),
    get: (id: string): Promise<Result<Webhook>> =>
      this.#http.request({ method: 'GET', path: `/webhooks/${enc(id)}`, idempotent: true }),
    remove: (id: string): Promise<Result<Ok<'deleteWebhook', 200>>> =>
      this.#http.request({ method: 'DELETE', path: `/webhooks/${enc(id)}`, idempotent: true }),
    /** Enable an endpoint that failed its way to disabled. */
    enable: (id: string): Promise<Result<Ok<'enableWebhook', 200>>> =>
      this.#http.request({ method: 'POST', path: `/webhooks/${enc(id)}/enable`, idempotent: true }),
    /** Send a signed test event to the endpoint. */
    test: (id: string): Promise<Result<Ok<'testWebhook', 200>>> =>
      this.#http.request({ method: 'POST', path: `/webhooks/${enc(id)}/test` }),
    deliveries: (id: string, query: Query<'listWebhookDeliveries'> = {}): Promise<Result<Page<WebhookDelivery>>> =>
      this.#http.request({ method: 'GET', path: `/webhooks/${enc(id)}/deliveries`, query, idempotent: true }),
    /**
     * Check a delivery's signature and return the event. Throws
     * WebhookVerificationError when it is not from Duta or is too old.
     */
    verify: <T = WebhookEvent>(opts: VerifyOptions): Promise<T> => verifyWebhook<T>(opts),
  };

  readonly suppressions = {
    list: (query: Query<'listSuppressions'> = {}): Promise<Result<Page<Suppression>>> =>
      this.#http.request({ method: 'GET', path: '/suppressions', query, idempotent: true }),
    listAll: (query: Omit<Query<'listSuppressions'>, 'after'> = {}): AsyncGenerator<Suppression> =>
      this.#all((after) => this.suppressions.list({ ...query, after })),
    create: (email: string): Promise<Result<Ok<'createSuppression', 201>>> =>
      this.#http.request({ method: 'POST', path: '/suppressions', body: { email }, idempotent: true }),
    /** Only manual entries can be removed. Bounces, complaints and unsubscribes are permanent. */
    remove: (email: string): Promise<Result<Ok<'deleteSuppression', 200>>> =>
      this.#http.request({ method: 'DELETE', path: `/suppressions/${enc(email)}`, idempotent: true }),
  };

  readonly logs = {
    list: (query: Query<'listLogs'> = {}): Promise<Result<Page<LogSummary>>> =>
      this.#http.request({ method: 'GET', path: '/logs', query, idempotent: true }),
    listAll: (query: Omit<Query<'listLogs'>, 'after'> = {}): AsyncGenerator<LogSummary> =>
      this.#all((after) => this.logs.list({ ...query, after })),
    /** A request id from an error or the X-Request-Id header. */
    get: (id: string): Promise<Result<Log>> =>
      this.#http.request({ method: 'GET', path: `/logs/${enc(id)}`, idempotent: true }),
  };

  readonly usage = {
    /** This month's usage, the plan's limits and the last 30 days by status. */
    get: (): Promise<Result<Usage>> => this.#http.request({ method: 'GET', path: '/usage', idempotent: true }),
  };

  async *#all<T>(page: (after: string | undefined) => Promise<Result<Page<T>>>): AsyncGenerator<T> {
    let after: string | undefined;
    do {
      const { data, error } = await page(after);
      if (error) throw Object.assign(new Error(error.message), error);
      yield* data.data;
      after = data.has_more && data.next ? data.next : undefined;
    } while (after);
  }
}

/** A delivery event, as Duta sends it. */
export interface WebhookEvent {
  type:
    | 'email.sent'
    | 'email.delivered'
    | 'email.delivery_delayed'
    | 'email.bounced'
    | 'email.complained'
    | 'email.failed'
    | 'test';
  created_at: string;
  data: {
    email_id: string;
    created_at: string;
    from: string | null;
    to: string[];
    subject: string | null;
    bounce?: { type: string | null; subType: string | null; message: string | null };
    failed?: { reason: string | null };
  };
}

function newKey(): string {
  return `duta-js-${crypto.randomUUID()}`;
}
