import { Emails } from "./emails";
import type { DutaOptions } from "./types";

const DEFAULT_BASE_URL = "https://api.duta.indra.sh";

/**
 * The Duta client. Create one with your API key, then use the resources on it.
 *
 * @example
 * ```ts
 * import { Duta } from "@duta/sdk";
 *
 * const duta = new Duta("duta_live_xxx");
 *
 * await duta.emails.send({
 *   from: "hello@yourdomain.com",
 *   to: "user@example.com",
 *   subject: "Hello",
 *   text: "It works!",
 * });
 * ```
 */
export class Duta {
  /** The `emails` resource — send, retrieve, and list emails. */
  readonly emails: Emails;

  /**
   * @param apiKey  Your Duta API key (`duta_live_...`). Create one in the dashboard.
   * @param options Optional overrides — custom `baseUrl` or `fetch` implementation.
   */
  constructor(apiKey: string, options: DutaOptions = {}) {
    if (!apiKey) {
      throw new Error(
        "A Duta API key is required. Create one at https://app.duta.indra.sh and pass it to `new Duta(apiKey)`.",
      );
    }

    const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    const fetchImpl = options.fetch ?? globalThis.fetch;

    if (typeof fetchImpl !== "function") {
      throw new Error(
        "No global `fetch` was found in this environment. Pass one via `new Duta(apiKey, { fetch })`.",
      );
    }

    const ctx = { apiKey, baseUrl, fetch: fetchImpl.bind(globalThis) };
    this.emails = new Emails(ctx);
  }
}
