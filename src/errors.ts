import type { DutaError } from "./types";

/**
 * Canonical error names keyed by HTTP status. Duta's API returns a bare
 * `{ error: string }` on most endpoints but `{ statusCode, name, message }`
 * on rate-limit responses; this maps either into a stable, machine-readable
 * name so SDK consumers can branch on `error.name` reliably.
 */
const NAME_BY_STATUS: Record<number, string> = {
  400: "validation_error",
  401: "authentication_error",
  403: "permission_denied",
  404: "not_found",
  422: "unprocessable_entity",
  429: "rate_limit_exceeded",
  500: "internal_server_error",
};

/**
 * Turn a parsed (or unparsable) API error response into a normalised
 * {@link DutaError}. Accepts both of Duta's error shapes.
 */
export function toDutaError(statusCode: number, body: unknown): DutaError {
  const fallbackName = NAME_BY_STATUS[statusCode] ?? "api_error";

  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;

    // Rate-limit shape: { statusCode, name, message }
    if (typeof b.name === "string" && typeof b.message === "string") {
      return {
        name: b.name,
        message: b.message,
        statusCode,
        ...(Array.isArray(b.blocked) ? { blocked: b.blocked as string[] } : {}),
      };
    }

    // Common shape: { error: string, blocked?: string[] }
    if (typeof b.error === "string") {
      return {
        name: fallbackName,
        message: b.error,
        statusCode,
        ...(Array.isArray(b.blocked) ? { blocked: b.blocked as string[] } : {}),
      };
    }
  }

  return {
    name: fallbackName,
    message: `Request failed with status ${statusCode}`,
    statusCode,
  };
}

/**
 * Error used when the network request itself fails (DNS, timeout, offline) —
 * i.e. we never got an HTTP response.
 */
export function networkError(message: string): DutaError {
  return { name: "network_error", message, statusCode: 0 };
}
