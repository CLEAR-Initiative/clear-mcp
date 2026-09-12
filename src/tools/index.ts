import type { LocationIndex } from "../location-index.js";
import { countTool } from "./count.js";
import { createFindLocationTool } from "./find-location.js";
import { listAlertsTool } from "./list-alerts.js";
import { listEventsTool } from "./list-events.js";
import { listSignalsTool } from "./list-signals.js";
import type { ToolDefinition } from "./types.js";
import { whoamiTool } from "./whoami.js";

export interface ToolDeps {
  locationIndex: LocationIndex;
}

/**
 * The Curated tool set, in the order they are listed to the Consumer.
 * Every entry is read-only (ADR-0002); the Escape hatch is registered
 * separately and only when `CLEAR_MCP_RAW_GRAPHQL=1`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function curatedTools(deps: ToolDeps): ToolDefinition<any, any>[] {
  return [
    // Orient
    whoamiTool,
    createFindLocationTool(deps.locationIndex),
    // Monitor
    listAlertsTool,
    listEventsTool,
    listSignalsTool,
    countTool,
  ];
}
