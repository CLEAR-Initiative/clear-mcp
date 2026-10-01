/**
 * The Tool library's seam, next to the MCP one: the library entry exactly as
 * a Consumer imports it, over the same fixture `fetch` (so every document is
 * still validated against the snapshot). A test reads "run tool X with Y
 * in-process → get outcome Z, and the upstream saw W". Imports nothing from
 * `src/` but `src/library.ts`.
 */
import {
  createLocationIndex,
  createUpstream,
  curatedTools,
  silentLogger,
  type Config,
  type ToolDefinition,
  type ToolOutcome,
} from "../../src/library.js";
import { createFixtureFetch, TEST_ENV, type FixtureFetch, type FixtureResponse, type RecordedRequest, type Responder } from "./seam.js";

export interface LibrarySeam {
  config: Config;
  tools: ToolDefinition[];
  fixtures: FixtureFetch;
  requests: RecordedRequest[];
  /** Parse `args` with the tool's input schema (as an Agent framework does), then `run` it. */
  runTool(name: string, args?: Record<string, unknown>): Promise<ToolOutcome<Record<string, unknown>>>;
}

/** The library equivalent of `connect()` with TEST_ENV — the same Caller, URL and locale. */
export const TEST_CONFIG: Config = {
  apiUrl: TEST_ENV.CLEAR_API_URL,
  apiKey: TEST_ENV.CLEAR_API_KEY,
  locale: "en",
  rawGraphql: false,
  logLevel: "silent",
};

export function createLibrarySeam(opts: {
  config?: Partial<Config>;
  fixtures?: Record<string, Responder | FixtureResponse>;
} = {}): LibrarySeam {
  const config: Config = { ...TEST_CONFIG, ...opts.config };
  const fixtures = createFixtureFetch(opts.fixtures);
  const log = silentLogger();
  const upstream = createUpstream({ config, fetch: fixtures.fetch, log });
  const tools = curatedTools({ locationIndex: createLocationIndex({ upstream, log }) });

  return {
    config,
    tools,
    fixtures,
    requests: fixtures.requests,
    async runTool(name, args = {}) {
      const tool = tools.find((t) => t.name === name);
      if (!tool) throw new Error(`No curated tool named "${name}"`);
      return tool.run(tool.input.parse(args), { config, upstream, log, toolName: tool.name });
    },
  };
}
