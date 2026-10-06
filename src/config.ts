import { z } from "zod";

/** Locales clear-api accepts in `x-force-locale` (see clear-api `isSupportedLocale`). */
export const SUPPORTED_LOCALES = ["en", "ar", "fr", "es"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * How every upstream request authenticates as the Caller — the only
 * credential clear-mcp ever holds, forwarded unchanged (ADR-0009). An MCP
 * Consumer's `sk_live_…` key, or, for a Tool library Consumer, request
 * headers forwarded from the signed-in user (their session `cookie`).
 */
export type Credential =
  | { kind: "apiKey"; key: string }
  | { kind: "headers"; headers: Record<string, string> };

export interface Config {
  /** Base URL of the target clear-api (the `/graphql` path is appended). */
  apiUrl: string;
  /** The Caller's credential. `parseConfig` (env) always yields an `apiKey`. */
  credential: Credential;
  /** Sent as `x-force-locale` on every upstream request. */
  locale: Locale;
  /** `CLEAR_MCP_RAW_GRAPHQL=1` registers the developer-only Escape hatch. */
  rawGraphql: boolean;
  /**
   * `CLEAR_MCP_WORKER=1` registers the Worker tools — the four Task writes
   * (claim, heartbeat, complete, fail) a Task Worker drains clear-api's queue
   * with (ADR-0010). Off by default and never set by an install channel;
   * optional so a Tool library Consumer's `Config` is unchanged (the
   * library never offers them).
   */
  worker?: boolean;
  logLevel: LogLevel;
}

const REQUIRED = ["CLEAR_API_URL", "CLEAR_API_KEY"] as const;

const envSchema = z.object({
  CLEAR_API_URL: z.string().trim().min(1),
  CLEAR_API_KEY: z.string().trim().min(1),
  CLEAR_MCP_LOCALE: z.enum(SUPPORTED_LOCALES).default("en"),
  CLEAR_MCP_RAW_GRAPHQL: z.string().optional(),
  CLEAR_MCP_WORKER: z.string().optional(),
  CLEAR_MCP_LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
});

/** Thrown by `parseConfig`; the message names the offending variable(s). */
export class ConfigError extends Error {
  constructor(
    message: string,
    public readonly variables: string[],
  ) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Parse the six `CLEAR_*` environment variables into a `Config`. Missing
 * required variables are reported together, by name, so a Consumer's MCP
 * config can be fixed in one pass. Empty strings count as missing (required)
 * or unset (optional).
 */
export function parseConfig(env: Record<string, string | undefined>): Config {
  const missing = REQUIRED.filter((name) => !env[name] || env[name]!.trim() === "");
  if (missing.length > 0) {
    throw new ConfigError(
      `Missing required environment variable${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
      [...missing],
    );
  }

  // Installers that template env from a settings form (the Claude Code plugin's
  // userConfig, a Claude Desktop extension's user_config) pass an untouched
  // optional field as "" rather than leaving it unset — treat that as unset.
  const present = Object.fromEntries(Object.entries(env).filter(([, v]) => v === undefined || v.trim() !== ""));
  const parsed = envSchema.safeParse(present);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    const variables = parsed.error.issues.map((i) => String(i.path[0]));
    throw new ConfigError(`Invalid environment: ${issues.join("; ")}`, variables);
  }

  const e = parsed.data;
  return {
    apiUrl: normaliseApiUrl(e.CLEAR_API_URL),
    credential: { kind: "apiKey", key: e.CLEAR_API_KEY },
    locale: e.CLEAR_MCP_LOCALE,
    // Truthy only for the literal "1" — "true"/"yes" do not enable the hatch.
    rawGraphql: e.CLEAR_MCP_RAW_GRAPHQL === "1",
    // Same rule: only the literal "1" turns the Worker tools on.
    worker: e.CLEAR_MCP_WORKER === "1",
    logLevel: e.CLEAR_MCP_LOG_LEVEL,
  };
}

/** Strip a trailing slash and a trailing `/graphql` so the base is canonical. */
function normaliseApiUrl(raw: string): string {
  let url = raw.replace(/\/+$/, "");
  if (url.endsWith("/graphql")) url = url.slice(0, -"/graphql".length);
  return url;
}

/** The single upstream endpoint every request is POSTed to. */
export function graphqlEndpoint(config: Pick<Config, "apiUrl">): string {
  return `${config.apiUrl}/graphql`;
}
