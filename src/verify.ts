/**
 * Verify that an incoming webhook request was sent by Duta.
 *
 * Duta signs every outbound webhook with HMAC-SHA256 using the signing secret
 * you received when you created the endpoint. The signature is sent in the
 * `X-Duta-Signature` header as `sha256=<hex>`.
 *
 * @param payload   The raw request body as a string. Do NOT parse it first.
 * @param signature The value of the `X-Duta-Signature` header.
 * @param secret    Your webhook signing secret (`whsec_...`).
 * @returns         `true` if the signature is valid, `false` otherwise.
 *
 * @example
 * ```ts
 * // Express
 * app.post("/webhook", express.text({ type: "*\/*" }), async (req, res) => {
 *   const valid = await verifyWebhook(
 *     req.body,
 *     req.headers["x-duta-signature"] as string,
 *     process.env.DUTA_WEBHOOK_SECRET!,
 *   );
 *   if (!valid) return res.status(401).send("Invalid signature");
 *   // handle event...
 * });
 *
 * // Next.js App Router
 * export async function POST(req: Request) {
 *   const body = await req.text();
 *   const valid = await verifyWebhook(
 *     body,
 *     req.headers.get("x-duta-signature") ?? "",
 *     process.env.DUTA_WEBHOOK_SECRET!,
 *   );
 *   if (!valid) return new Response("Invalid signature", { status: 401 });
 *   const event = JSON.parse(body);
 *   // handle event...
 * }
 * ```
 */
export async function verifyWebhook(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  try {
    const hex = signature.replace(/^sha256=/, "");
    if (!hex) return false;

    const sigBytes = new Uint8Array(
      hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)),
    );

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    return crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(payload));
  } catch {
    return false;
  }
}
