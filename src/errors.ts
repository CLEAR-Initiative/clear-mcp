/**
 * The error object a tool returns (as a JSON `text` block with `isError: true`).
 * `code` / `subCode` / `message` are preserved verbatim from clear-api's
 * GraphQL `extensions` so the agent can relay e.g. "your account is awaiting
 * approval" instead of retrying.
 */
export interface ToolError {
  code: string;
  subCode?: string;
  message: string;
  upstreamUrl?: string;
}

export const ERROR_CODES = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  UPSTREAM_ERROR: "UPSTREAM_ERROR",
  UPSTREAM_UNAVAILABLE: "UPSTREAM_UNAVAILABLE",
  BAD_USER_INPUT: "BAD_USER_INPUT",
} as const;

export type ToolOutcome<T> = { ok: true; value: T } | { ok: false; error: ToolError };

export function ok<T>(value: T): ToolOutcome<T> {
  return { ok: true, value };
}

export function fail<T = never>(error: ToolError): ToolOutcome<T> {
  return { ok: false, error };
}
