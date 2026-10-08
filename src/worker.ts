import { claimTasksTool } from "./tools/claim-tasks.js";
import { completeTaskTool } from "./tools/complete-task.js";
import { failTaskTool } from "./tools/fail-task.js";
import { heartbeatTaskTool } from "./tools/heartbeat-task.js";
import { rejectedCaseUrlsTool } from "./tools/rejected-case-urls.js";
import type { ToolDefinition } from "./tools/types.js";

/**
 * The Worker tools (ADR-0010, amending ADR-0002): the four Task writes a
 * Task Worker drains clear-api's queue with, plus the one read only a web
 * Worker needs (`clear_rejected_case_urls`, V4). Registered by the MCP server
 * only when `CLEAR_MCP_WORKER=1`, and never part of the Curated set or the
 * Tool library — a Consumer that is not a Worker never sees them. The
 * Escape hatch still rejects every mutation: these typed tools are the only
 * write path, and the Caller's `worker` role in clear-api bounds what they
 * can touch (Tasks it holds; `proposed` CaseProposals — proposed signals — a
 * person must accept).
 */
export const workerTools: ToolDefinition[] = [
  claimTasksTool,
  heartbeatTaskTool,
  completeTaskTool,
  failTaskTool,
  rejectedCaseUrlsTool,
];
