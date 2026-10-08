import { z } from "zod";
import { fail, ok } from "../errors.js";
import { graphql } from "../gql/index.js";
import { leaseTokenInput, taskItem, toTaskItem, WRITE_ANNOTATIONS } from "./tasks-shared.js";
import { defineTool } from "./types.js";

export const FAIL_TASK_DOCUMENT = graphql(/* GraphQL */ `
  mutation ClearFailTask($id: String!, $leaseToken: String!, $error: String!) {
    failTask(id: $id, leaseToken: $leaseToken, error: $error) {
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

export const failTaskTool = defineTool({
  name: "clear_fail_task",
  description:
    "WORKER TOOL (write). Give a claimed Task up with an error you could not recover from " +
    "(a tool kept failing, the Event could not be read, the result could not be validated). " +
    "The Task returns to PENDING for another attempt while attempts remain, and becomes FAILED " +
    "with your error as its `lastError` — shown to the requester — once `maxAttempts` claims are " +
    "used. Finding no prior is NOT a failure: complete with clear_complete_task instead — " +
    "`cases: []` for an `event.impact_prior.web` Task. Only " +
    "the lease owner, only while LEASED; CONFLICT / NOT_LEASED means it is no longer yours to " +
    "fail — stop.",
  input: z.object({
    id: z.string().trim().min(1).describe("The Task id from clear_claim_tasks."),
    leaseToken: leaseTokenInput,
    error: z.string().trim().min(1).max(2000).describe("What went wrong, in one or two sentences a requester can act on."),
  }),
  output: z.object({ task: taskItem }),
  annotations: WRITE_ANNOTATIONS,
  async run(input, ctx) {
    const res = await ctx.upstream.request({
      document: FAIL_TASK_DOCUMENT,
      variables: { id: input.id, leaseToken: input.leaseToken, error: input.error },
      toolName: ctx.toolName,
      signal: ctx.signal,
    });
    if (!res.ok) return fail(res.error);
    return ok({ task: toTaskItem(res.data.failTask) });
  },
});
