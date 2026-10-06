import { z } from "zod";
import { fail, ok } from "../errors.js";
import { graphql } from "../gql/index.js";
import { leaseTokenInput, taskItem, toTaskItem, WRITE_ANNOTATIONS } from "./tasks-shared.js";
import { defineTool } from "./types.js";

export const HEARTBEAT_TASK_DOCUMENT = graphql(/* GraphQL */ `
  mutation ClearHeartbeatTask($id: String!, $leaseToken: String!) {
    heartbeatTask(id: $id, leaseToken: $leaseToken) {
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

export const heartbeatTaskTool = defineTool({
  name: "clear_heartbeat_task",
  description:
    "WORKER TOOL (write). Keep a claimed Task's lease alive: extends `leaseExpiresAt` by " +
    "TASK_LEASE_MINUTES from now. Call it about every 5 minutes while working. Read `status` " +
    "in the result: CANCELLED means the requester withdrew the Task — stop and discard your " +
    "work. FORBIDDEN / NOT_LEASE_OWNER means the lease lapsed and was reclaimed; CONFLICT / " +
    "NOT_LEASED means the Task is no longer LEASED at all (failed, completed or cancelled " +
    "elsewhere). In both cases stop and do not complete it. Only the lease owner, only while LEASED.",
  input: z.object({
    id: z.string().trim().min(1).describe("The Task id from clear_claim_tasks."),
    leaseToken: leaseTokenInput,
  }),
  output: z.object({ task: taskItem }),
  annotations: WRITE_ANNOTATIONS,
  async run(input, ctx) {
    const res = await ctx.upstream.request({
      document: HEARTBEAT_TASK_DOCUMENT,
      variables: { id: input.id, leaseToken: input.leaseToken },
      toolName: ctx.toolName,
      signal: ctx.signal,
    });
    if (!res.ok) return fail(res.error);
    return ok({ task: toTaskItem(res.data.heartbeatTask) });
  },
});
