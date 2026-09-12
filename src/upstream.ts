import { graphqlEndpoint, type Config } from "./config.js";
import { ERROR_CODES, type ToolError } from "./errors.js";
import type { Logger } from "./logger.js";
import { USER_AGENT_PREFIX } from "./version.js";

/** Outcome of one upstream request, normalised to a discriminated union. */
export type UpstreamResult<T> = { ok: true; data: T } | { ok: false; error: ToolError };

export interface UpstreamRequest {
  /** The GraphQL document to send verbatim. */
  document: string;
  /** Must match the document's operation name; keys the test fixtures. */
  operationName: string;
  variables?: Record<string, unknown>;
  /** The tool issuing the request, sent in `User-Agent` for clear-api's logs. */
  toolName: string;
}

export interface Upstream {
  request<T>(req: UpstreamRequest): Promise<UpstreamResult<T>>;
  readonly endpoint: string;
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

const TIMEOUT_MS = 10_000;

/**
 * The single GraphQL client. Every request carries the Consumer's key as
 * `Authorization: Bearer`, the configured locale as `x-force-locale`, and
 * `User-Agent: clear-mcp/<version> (<tool>)`. Any failure — transport,
 * non-2xx, GraphQL `errors`, partial data — becomes `{ ok: false, error }`
 * so tools never throw on upstream conditions.
 */
export function createUpstream(opts: {
  config: Config;
  fetch: FetchLike;
  log: Logger;
}): Upstream {
  const endpoint = graphqlEndpoint(opts.config);
  const { fetch, log, config } = opts;

  async function request<T>(req: UpstreamRequest): Promise<UpstreamResult<T>> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${config.apiKey}`,
      "x-force-locale": config.locale,
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": `${USER_AGENT_PREFIX} (${req.toolName})`,
    };
    const body = JSON.stringify({
      query: req.document,
      operationName: req.operationName,
      variables: req.variables ?? {},
    });

    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error({ tool: req.toolName, op: req.operationName, err: message }, "upstream unreachable");
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
        { tool: req.toolName, op: req.operationName, status: response.status, elapsedMs },
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

    let parsed: GraphQLResponseBody<T>;
    try {
      parsed = (await response.json()) as GraphQLResponseBody<T>;
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
      log.warn({ tool: req.toolName, op: req.operationName, code, subCode: error.subCode, elapsedMs }, "upstream error");
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

    log.debug({ tool: req.toolName, op: req.operationName, elapsedMs }, "upstream ok");
    return { ok: true, data: parsed.data };
  }

  return { request, endpoint };
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
