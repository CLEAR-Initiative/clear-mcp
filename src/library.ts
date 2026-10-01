/**
 * The Tool library (ADR-0009): the Curated tools for an Agent running in the
 * same process, without the MCP protocol in between. Same tools, same
 * descriptions, same results as the server — `tests/library/parity.test.ts`
 * holds that. Published as `@clear-initiative/mcp/library`.
 *
 * Must never import `server.ts` (or anything else that loads the MCP SDK):
 * an in-process Consumer neither needs the protocol nor should bundle it.
 * `tests/library/entry.test.ts` holds that too. The Escape hatch is not
 * part of the library — a Consumer gets the Curated tools only.
 */
export { SUPPORTED_LOCALES, type Config, type Credential, type Locale } from "./config.js";
export { ERROR_CODES, type ToolError, type ToolOutcome } from "./errors.js";
export { createLocationIndex, type LocationIndex } from "./location-index.js";
export { silentLogger, type Logger } from "./logger.js";
export { curatedTools, type ToolDeps } from "./tools/index.js";
export type { ToolContext, ToolDefinition } from "./tools/types.js";
export { createUpstream, type FetchLike, type Upstream } from "./upstream.js";
