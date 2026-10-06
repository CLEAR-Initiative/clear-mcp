import { z } from "zod";
import { fail, ok } from "../errors.js";
import { graphql } from "../gql/index.js";
import { leaseTokenInput, taskItem, toTaskItem, WRITE_ANNOTATIONS } from "./tasks-shared.js";
import { compact } from "./shared.js";
import { defineTool } from "./types.js";

export const COMPLETE_TASK_DOCUMENT = graphql(/* GraphQL */ `
  mutation ClearCompleteTask(
    $id: String!
    $leaseToken: String!
    $result: JSON!
    $usage: TaskUsageInput
    $impactPrior: ImpactPriorInput
  ) {
    completeTask(id: $id, leaseToken: $leaseToken, result: $result, usage: $usage, impactPrior: $impactPrior) {
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

/** A full RFC 3339 date-time, the only form clear-api's DateTime scalar (passed to
 *  Prisma unparsed) accepts; anything else — a date-only "2020-01-01", "March 2020",
 *  an impossible "2020-02-30" — must fail here as BAD_USER_INPUT rather than deep
 *  inside clear-api's transaction. `Date.parse` is too lenient for this. */
const isoDate = z.iso.datetime({ offset: true });

/** One case in an ImpactPrior's evidence basis — the shape clear-api stores verbatim. */
export const impactPriorCase = z.object({
  tier: z.enum(["clear", "web"]).describe("`clear` for a CLEAR Event or knowledge-base passage, `web` for an external source."),
  eventId: z.string().optional().describe("The CLEAR Event id, for a `clear` case drawn from an Event."),
  reportId: z.string().optional().describe("The knowledge-base report id, for a `clear` case drawn from a report."),
  sourceUrl: z.string().optional().describe("The source URL; required for a `web` case."),
  quote: z.string().optional().describe("A short verbatim passage supporting the case."),
  occurredAt: z.string().optional().describe("ISO-8601 date of the prior event."),
  locationLabel: z.string().optional(),
  scope: z.enum(["district", "country"]).describe("`district` if it shares the Event's district, else `country`."),
  note: z.string().optional().describe("Free text, e.g. a seasonality note. Never a filter."),
});

export const impactPriorInput = z.object({
  hazardType: z.string().min(1).describe("GLIDE code; must be one of the Event's `types`."),
  countryLocationId: z.string().min(1).describe("The level-0 ancestor of the Event's primary location (clear_find_location)."),
  geographicScope: z.enum(["district", "country"]).describe("The scope the cases were matched at: `district` only if every case shares the Event's district."),
  horizonYears: z.number().int().positive().describe("From the Task payload (default 10)."),
  populationGroup: z.string().optional(),
  metric: z.string().optional(),
  lowerBound: z.number().optional(),
  upperBound: z.number().optional(),
  numberOfCases: z.number().int().min(1).describe("Must equal the length of `basis`."),
  basis: z.array(impactPriorCase).min(1).describe("One entry per case."),
  validFrom: isoDate.optional().describe("ISO-8601 date-time the prior is valid from, e.g. `2020-01-01T00:00:00Z`."),
  validTo: isoDate.optional().describe("ISO-8601 date-time the prior is valid to, e.g. `2030-01-01T00:00:00Z`."),
  methodVersion: z.string().min(1).describe("The skill's version string, e.g. `clear-impact-prior@0.1.0`."),
});

export const taskUsageInput = z.object({
  model: z.string().min(1).describe("The model id the work ran on."),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative().describe("Computed by you from your own price table."),
});

export const completeTaskTool = defineTool({
  name: "clear_complete_task",
  description:
    "WORKER TOOL (write). Report a claimed Task done. `result` is your raw output, kept for " +
    "audit only. For an `event.impact_prior` Task pass `impactPrior` to propose an ImpactPrior " +
    "(it is stored as `proposed`; a named analyst accepts or rejects it) — or omit it when you " +
    "found no case, which records `no_prior_found` and writes nothing. Report `usage` when " +
    "you can. clear-api validates the proposal against the Event (hazard among its types, " +
    "country its level-0 ancestor, one basis entry per case) and answers BAD_USER_INPUT with " +
    "the reason if it does not fit — fix the proposal, do not fail the Task. Only the lease " +
    "owner, only while LEASED; CANCELLED in the result means the requester withdrew it and " +
    "your result was discarded. CONFLICT / NOT_LEASED means the Task is no longer yours " +
    "(completed, failed or cancelled elsewhere): stop, do not retry.",
  input: z.object({
    id: z.string().trim().min(1).describe("The Task id from clear_claim_tasks."),
    leaseToken: leaseTokenInput,
    result: z.record(z.string(), z.unknown()).describe("Raw output: what you searched, what you found, how you decided."),
    usage: taskUsageInput.optional(),
    impactPrior: impactPriorInput.optional(),
  }),
  output: z.object({ task: taskItem }),
  annotations: WRITE_ANNOTATIONS,
  async run(input, ctx) {
    const res = await ctx.upstream.request({
      document: COMPLETE_TASK_DOCUMENT,
      variables: compact({
        id: input.id,
        leaseToken: input.leaseToken,
        result: input.result,
        usage: input.usage,
        impactPrior: input.impactPrior,
      }),
      toolName: ctx.toolName,
      signal: ctx.signal,
    });
    if (!res.ok) return fail(res.error);
    return ok({ task: toTaskItem(res.data.completeTask) });
  },
});
