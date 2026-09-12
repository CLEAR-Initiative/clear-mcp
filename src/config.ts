import { z } from "zod";

/** Locales clear-api accepts in `x-force-locale` (see clear-api `isSupportedLocale`). */
export const SUPPORTED_LOCALES = ["en", "ar", "fr", "es"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface Config {
  /** Base URL of the target clear-api (the `/graphql` path is appended). */
  apiUrl: string;
  /** The Consumer's `sk_live_…` key — the only credential the server holds. */
  apiKey: string;
  /** Sent as `x-force-locale` on every upstream request. */
  locale: Locale;
  /** `CLEAR_MCP_RAW_GRAPHQL=1` registers the developer-only Escape hatch. */
  rawGraphql: boolean;
  logLevel: LogLevel;
}

const REQUIRED = ["CLEAR_API_URL", "CLEAR_API_KEY"] as const;

const envSchema = z.object({
  CLEAR_API_URL: z.string().trim().min(1),
  CLEAR_API_KEY: z.string().trim().min(1),
  CLEAR_MCP_LOCALE: z.enum(SUPPORTED_LOCALES).default("en"),
  CLEAR_MCP_RAW_GRAPHQL: z.string().optional(),
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
 * Parse the five `CLEAR_*` environment variables into a `Config`. Missing
 * required variables are reported together, by name, so a Consumer's MCP
 * config can be fixed in one pass. Empty strings count as missing.
 */
export function parseConfig(env: Record<string, string | undefined>): Config {
  const missing = REQUIRED.filter((name) => !env[name] || env[name]!.trim() === "");
  if (missing.length > 0) {
    throw new ConfigError(
      `Missing required environment variable${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
      [...missing],
    );
  }

  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    const variables = parsed.error.issues.map((i) => String(i.path[0]));
    throw new ConfigError(`Invalid environment: ${issues.join("; ")}`, variables);
  }

  const e = parsed.data;
  return {
    apiUrl: normaliseApiUrl(e.CLEAR_API_URL),
    apiKey: e.CLEAR_API_KEY,
    locale: e.CLEAR_MCP_LOCALE,
    // Truthy only for the literal "1" — "true"/"yes" do not enable the hatch.
    rawGraphql: e.CLEAR_MCP_RAW_GRAPHQL === "1",
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
