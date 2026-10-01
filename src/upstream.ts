import { graphqlEndpoint, type Config, type Credential } from "./config.js";
import { ERROR_CODES, type ToolError } from "./errors.js";
import type { TypedDocumentString } from "./gql/graphql.js";
import { silentLogger, type Logger } from "./logger.js";
import { USER_AGENT_PREFIX } from "./version.js";

/** Outcome of one upstream request, normalised to a discriminated union. */
export type UpstreamResult<T> = { ok: true; data: T } | { ok: false; error: ToolError };

export interface UpstreamRequest<TData, TVariables> {
  /**
   * A codegen-typed document from `src/gql` (the tool's projection — no
   * post-hoc field stripping) or, for the Escape hatch, a raw string.
   */
  document: TypedDocumentString<TData, TVariables> | string;
  /** Defaults to the document's operation name; keys the test fixtures. */
  operationName?: string;
  variables?: TVariables;
  /** The tool issuing the request, sent in `User-Agent` for clear-api's logs. */
  toolName: string;
}

export interface Upstream {
  request<TData, TVariables = Record<string, never>>(
    req: UpstreamRequest<TData, TVariables>,
  ): Promise<UpstreamResult<TData>>;
  readonly endpoint: string;
}

/** First operation name in a document, or null for an anonymous operation. */
export function operationNameOf(document: string): string | null {
  const m = /\b(?:query|mutation|subscription)\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(document);
  return m?.[1] ?? null;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

interface GraphQLErrorShape {
  message?: string;
  extensions?: { code?: unknown; subCode?: unknown } & Record<string, unknown>;
}

interface GraphQLResponseBody<T> {
  data?: T | null;
  errors?: GraphQLErrorShape[];
}

export const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * The only headers a `headers` credential forwards. A Consumer may hand over
 * its whole incoming request's headers; anything else (`content-length`,
 * `host`, `origin`, `x-forwarded-*`…) is dropped, since it describes that
 * request, not the Caller — and some of it makes fetch refuse to send.
 */
export const FORWARDED_CREDENTIAL_HEADERS = ["authorization", "cookie"] as const;

/**
 * The headers that authenticate as the Caller: `authorization: Bearer` for
 * an API key, or the allowlisted forwarded headers, sent lower-cased and
 * unchanged — nothing of clear-mcp's own. Names match case-insensitively;
 * when several casings are given, the exact lower-case one wins, else the
 * first in insertion order.
 */
export function credentialHeaders(credential: Credential): Record<string, string> {
  if (credential.kind === "apiKey") return { authorization: `Bearer ${credential.key}` };
  const out: Record<string, string> = {};
  for (const name of FORWARDED_CREDENTIAL_HEADERS) {
    const value = Object.hasOwn(credential.headers, name)
      ? credential.headers[name]
      : Object.entries(credential.headers).find(([k]) => k.toLowerCase() === name)?.[1];
    if (value !== undefined) out[name] = value;
  }
  return out;
}

/**
 * The single GraphQL client. Every request carries the Caller's credential
 * (see `credentialHeaders`), the configured locale as `x-force-locale`, and
 * `User-Agent: clear-mcp/<version> (<tool>)`. Any failure — transport,
 * non-2xx, GraphQL `errors`, partial data — becomes `{ ok: false, error }`
 * so tools never throw on upstream conditions.
 */
export function createUpstream(opts: {
  config: Config;
  /** Defaults to global fetch. */
  fetch?: FetchLike;
  /** Defaults to a silent logger (a Tool library Consumer may bring its own pino). */
  log?: Logger;
  /** Per-request deadline; defaults to 10 s. Injectable so tests can hit it. */
  timeoutMs?: number;
}): Upstream {
  const endpoint = graphqlEndpoint(opts.config);
  const { config } = opts;
  const fetch: FetchLike = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const log = opts.log ?? silentLogger();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request<TData, TVariables>(
    req: UpstreamRequest<TData, TVariables>,
  ): Promise<UpstreamResult<TData>> {
    const query = String(req.document);
    const operationName = req.operationName ?? operationNameOf(query) ?? undefined;
    const credential = credentialHeaders(config.credential);
    const headers: Record<string, string> = {
      ...credential,
      "x-force-locale": config.locale,
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": `${USER_AGENT_PREFIX} (${req.toolName})`,
    };
    const body = JSON.stringify({ query, operationName, variables: req.variables ?? {} });

    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      const message = timedOut ? `timed out after ${timeoutMs} ms` : describeFetchError(err, Object.values(credential));
      log.error({ tool: req.toolName, op: operationName, err: message }, "upstream unreachable");
      return {
        ok: false,
        error: {
          code: ERROR_CODES.UPSTREAM_UNAVAILABLE,
          message: `clear-api at ${endpoint} is unreachable: ${message}`,
          upstreamUrl: endpoint,
        },
      };
    }

    const elapsedMs = Date.now() - started;

    if (!response.ok) {
      const text = await safeText(response);
      log.error(
        { tool: req.toolName, op: operationName, status: response.status, elapsedMs },
        "upstream non-2xx",
      );
      return {
        ok: false,
        error: {
          code: ERROR_CODES.UPSTREAM_UNAVAILABLE,
          message: `clear-api at ${endpoint} responded ${response.status}${text ? `: ${truncate(text, 200)}` : ""}`,
          upstreamUrl: endpoint,
        },
      };
    }

    let parsed: GraphQLResponseBody<TData>;
    try {
      parsed = (await response.json()) as GraphQLResponseBody<TData>;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: {
          code: ERROR_CODES.UPSTREAM_UNAVAILABLE,
          message: `clear-api at ${endpoint} returned a non-JSON body: ${message}`,
          upstreamUrl: endpoint,
        },
      };
    }

    if (parsed.errors && parsed.errors.length > 0) {
      const first = parsed.errors[0]!;
      const ext = first.extensions ?? {};
      const code = typeof ext.code === "string" && ext.code ? ext.code : ERROR_CODES.UPSTREAM_ERROR;
      const error: ToolError = { code, message: first.message ?? "clear-api returned an error" };
      if (typeof ext.subCode === "string" && ext.subCode) error.subCode = ext.subCode;
      log.warn({ tool: req.toolName, op: operationName, code, subCode: error.subCode, elapsedMs }, "upstream error");
      return { ok: false, error };
    }

    if (parsed.data === undefined || parsed.data === null) {
      return {
        ok: false,
        error: {
          code: ERROR_CODES.UPSTREAM_ERROR,
          message: "clear-api returned no data and no errors",
        },
      };
    }

    log.debug({ tool: req.toolName, op: operationName, elapsedMs }, "upstream ok");
    return { ok: true, data: parsed.data };
  }

  return { request, endpoint };
}

/**
 * The fetch failure and its `cause` (Node's fetch says only "fetch failed";
 * the reason — DNS, refused, a bad header — is in the cause), on one line,
 * with every credential value redacted: a header error can echo the value.
 */
function describeFetchError(err: unknown, secrets: string[]): string {
  const parts = [err instanceof Error ? err.message : String(err)];
  const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : undefined;
  if (cause && cause !== parts[0]) parts.push(cause);
  let text = parts.join(": ");
  for (const secret of secrets) if (secret) text = text.split(secret).join("[redacted]");
  return truncate(text.replace(/[\r\n]+/g, " "), 300);
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
