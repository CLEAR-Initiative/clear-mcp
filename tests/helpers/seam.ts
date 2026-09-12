/**
 * The one test seam: an MCP Client linked to the real McpServer through
 * InMemoryTransport, with `fetch` replaced by a fixture responder keyed on
 * GraphQL `operationName`. Tests call tools and assert on the result and on
 * what the "upstream" saw — nothing is imported from src/tools or
 * src/upstream directly.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Writable } from "node:stream";
import pino from "pino";
import { parseConfig } from "../../src/config.js";
import { createServer, type ClearMcpServer } from "../../src/server.js";
import type { FetchLike } from "../../src/upstream.js";

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  operationName: string;
  query: string;
  variables: Record<string, unknown>;
}

/** A GraphQL response body, or a full HTTP-level override. */
export type FixtureResponse =
  | { data?: unknown; errors?: Array<{ message: string; extensions?: Record<string, unknown> }> }
  | { status: number; body?: string; contentType?: string }
  | { reject: Error };

export type Responder = (
  variables: Record<string, unknown>,
  request: RecordedRequest,
) => FixtureResponse | Promise<FixtureResponse>;

export interface FixtureFetch {
  fetch: FetchLike;
  requests: RecordedRequest[];
  /** Register (or replace) the responder for an operation. */
  on(operationName: string, responder: Responder | FixtureResponse): void;
}

export function createFixtureFetch(initial: Record<string, Responder | FixtureResponse> = {}): FixtureFetch {
  const responders = new Map<string, Responder>();
  const requests: RecordedRequest[] = [];

  function on(operationName: string, responder: Responder | FixtureResponse) {
    responders.set(operationName, typeof responder === "function" ? responder : () => responder);
  }
  for (const [op, r] of Object.entries(initial)) on(op, r);

  const fetch: FetchLike = async (url, init) => {
    const body = JSON.parse(String(init.body)) as {
      query: string;
      operationName: string;
      variables?: Record<string, unknown>;
    };
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init.headers ?? {}) as Record<string, string>)) {
      headers[k.toLowerCase()] = v;
    }
    const recorded: RecordedRequest = {
      url,
      method: init.method ?? "GET",
      headers,
      operationName: body.operationName,
      query: body.query,
      variables: body.variables ?? {},
    };
    requests.push(recorded);

    const responder = responders.get(body.operationName);
    if (!responder) {
      throw new Error(`No fixture responder registered for operation "${body.operationName}"`);
    }
    const res = await withAbort(responder(recorded.variables, recorded), init.signal ?? undefined);

    if ("reject" in res) throw res.reject;
    if ("status" in res) {
      return new Response(res.body ?? "", {
        status: res.status,
        headers: { "content-type": res.contentType ?? "text/plain" },
      });
    }
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  return { fetch, requests, on };
}

/** Reject when the request's AbortSignal fires (so timeouts are testable). */
function withAbort<T>(p: T | Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return Promise.resolve(p);
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    Promise.resolve(p).then(resolve, reject);
  });
}

/** A responder that never answers — pair with a short `upstreamTimeoutMs`. */
export const NEVER: Responder = () => new Promise<FixtureResponse>(() => {});

export const TEST_ENV = {
  CLEAR_API_URL: "https://api.clear.test",
  CLEAR_API_KEY: "sk_live_test_key_000",
} as const;

export interface LogLine {
  level: number;
  msg: string;
  [key: string]: unknown;
}

export interface Seam {
  client: Client;
  fixtures: FixtureFetch;
  requests: RecordedRequest[];
  /** Every pino line the server wrote (parsed JSON), for asserting diagnostics. */
  logs: LogLine[];
  selfCheck: ClearMcpServer["selfCheck"];
  callTool(name: string, args?: Record<string, unknown>): Promise<CallToolResult>;
  close(): Promise<void>;
}

/**
 * Connect a fresh client/server pair. `env` overrides are merged over
 * TEST_ENV so a test can flip the locale or the escape hatch.
 */
export async function connect(opts: {
  env?: Record<string, string | undefined>;
  fixtures?: Record<string, Responder | FixtureResponse>;
  upstreamTimeoutMs?: number;
} = {}): Promise<Seam> {
  const config = parseConfig({ ...TEST_ENV, ...opts.env });
  const fixtures = createFixtureFetch(opts.fixtures);
  const logs: LogLine[] = [];
  const log = pino(
    { level: "trace" },
    new Writable({
      write(chunk, _enc, cb) {
        for (const line of String(chunk).split("\n")) {
          if (line.trim()) logs.push(JSON.parse(line) as LogLine);
        }
        cb();
      },
    }),
  );
  const { server, selfCheck } = createServer({
    config,
    fetch: fixtures.fetch,
    log,
    upstreamTimeoutMs: opts.upstreamTimeoutMs,
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "seam-test-client", version: "0.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return {
    client,
    fixtures,
    requests: fixtures.requests,
    logs,
    selfCheck,
    callTool: (name, args = {}) =>
      client.callTool({ name, arguments: args }) as Promise<CallToolResult>,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

/** Parse the JSON text block every tool result carries. */
export function textJson(result: CallToolResult): unknown {
  const block = result.content.find((c) => c.type === "text");
  if (!block || block.type !== "text") throw new Error("result has no text block");
  return JSON.parse(block.text);
}
