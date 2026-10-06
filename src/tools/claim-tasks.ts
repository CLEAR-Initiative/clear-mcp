import { z } from "zod";
import { fail, ok } from "../errors.js";
import { graphql } from "../gql/index.js";
import { taskItem, toTaskItem, WRITE_ANNOTATIONS } from "./tasks-shared.js";
import { defineTool } from "./types.js";

/** clear-api clamps to its own TASK_CLAIM_MAX (10 by default); this is the tool's. */
export const CLAIM_LIMIT = { min: 1, max: 10, default: 1 } as const;

export const CLAIM_TASKS_DOCUMENT = graphql(/* GraphQL */ `
  mutation ClearClaimTasks($kind: String!, $limit: Int) {
    claimTasks(kind: $kind, limit: $limit) {
      id
      kind
      subjectType
      subjectId
      payload
      status
      leaseToken
      leaseExpiresAt
      attempts
      maxAttempts
      cancelRequestedAt
      outcome
      lastError
      completedAt
    }
  }
`);

export const claimTasksTool = defineTool({
  name: "clear_claim_tasks",
  description:
    "WORKER TOOL (write). Lease up to `limit` of the oldest claimable Tasks of `kind` from " +
    "clear-api's Task queue — PENDING ones, or ones whose previous lease lapsed. Each returned " +
    "Task is yours for TASK_LEASE_MINUTES (15 by default): keep its `leaseToken`, heartbeat it " +
    "with clear_heartbeat_task while you work, and finish it with clear_complete_task or " +
    "clear_fail_task. An empty list means nothing is waiting. Requires the `worker` role.",
  input: z.object({
    kind: z.string().trim().min(1).describe("The kind of work to drain, e.g. `event.impact_prior`."),
    limit: z
      .number()
      .int()
      .optional()
      .describe(`Clamped to [${CLAIM_LIMIT.min}, ${CLAIM_LIMIT.max}]; default ${CLAIM_LIMIT.default}. Claim only what you will finish.`),
  }),
  output: z.object({
    tasks: z.array(taskItem),
    count: z.number().int(),
  }),
  annotations: WRITE_ANNOTATIONS,
  async run(input, ctx) {
    const limit = Math.min(CLAIM_LIMIT.max, Math.max(CLAIM_LIMIT.min, input.limit ?? CLAIM_LIMIT.default));
    const res = await ctx.upstream.request({
      document: CLAIM_TASKS_DOCUMENT,
      variables: { kind: input.kind, limit },
      toolName: ctx.toolName,
      signal: ctx.signal,
    });
    if (!res.ok) return fail(res.error);
    const tasks = res.data.claimTasks.map(toTaskItem);
    return ok({ tasks, count: tasks.length });
  },
});
