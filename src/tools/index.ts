import type { ToolDefinition } from "./types.js";
import { whoamiTool } from "./whoami.js";

/**
 * The Curated tool set, in the order they are listed to the Consumer.
 * Every entry is read-only (ADR-0002); the Escape hatch is registered
 * separately and only when `CLEAR_MCP_RAW_GRAPHQL=1`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const curatedTools: ToolDefinition<any, any>[] = [whoamiTool];
