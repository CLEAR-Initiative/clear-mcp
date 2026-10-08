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
    $cases: [CaseProposalInput!]
    $methodVersion: String
  ) {
    completeTask(
      id: $id
      leaseToken: $leaseToken
      result: $result
      usage: $usage
      cases: $cases
      methodVersion: $methodVersion
    ) {
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

/** The Domain Ontology's seven metric types — clear-api's `METRIC_TYPES`. A figure names exactly one. */
export const CASE_METRICS = [
  "people_affected",
  "people_displaced_new",
  "people_displaced_cumulative",
  "people_in_need",
  "people_targeted",
  "people_reached",
  "households_affected",
] as const;

/** clear-api's per-completion and per-field limits (`src/utils/case-proposals.ts`), checked here
 *  so a runaway proposal fails before the network rather than as a BAD_USER_INPUT round trip. */
export const CASE_LIMITS = { cases: 50, figures: 20, url: 2048, quote: 4000, label: 500, hazard: 20 } as const;

const isHttpUrl = (value: string): boolean => {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

const figureNumber = z.number().nonnegative();

/** One figure a case's source states — clear-api's `CaseFigureInput`. */
export const caseFigureInput = z
  .object({
    metric: z.enum(CASE_METRICS).describe("Which of the seven metric types the source's figure is. Never convert one into another."),
    value: figureNumber.describe("The figure as a number (2.3 million → 2300000). For a bare range, its midpoint."),
    lowerBound: figureNumber.optional().describe("Only when the source gives one (\"at least\", \"between … and\")."),
    upperBound: figureNumber.optional().describe("Only when the source gives one (\"up to\", \"between … and\")."),
    unit: z.string().optional().describe("e.g. `people`, `households`, `families` — as the source counts."),
    populationGroup: z.string().optional().describe("Only when the source names one, e.g. `children`, `IDPs`, `refugees`."),
  })
  .refine((f) => f.lowerBound === undefined || f.lowerBound <= f.value, { message: "lowerBound must not exceed value" })
  .refine((f) => f.upperBound === undefined || f.upperBound >= f.value, { message: "upperBound must not be below value" });

/** One historical case a web Worker proposes — clear-api's `CaseProposalInput` (V4). */
export const caseProposalInput = z.object({
  sourceUrl: z
    .string()
    .trim()
    .min(1)
    .max(CASE_LIMITS.url)
    .refine(isHttpUrl, { message: "must be an absolute http(s) URL" })
    .describe("The page you opened and quote from. One case per URL per Event; a URL clear_rejected_case_urls returned is never proposed."),
  quote: z
    .string()
    .trim()
    .min(1)
    .max(CASE_LIMITS.quote)
    .describe("The source's own words, verbatim — never a paraphrase or a search snippet. Contains every figure you give."),
  occurredAt: isoDate.describe(
    "When the incident happened (not when it was reported), as an ISO-8601 date-time, e.g. `2021-08-10T00:00:00Z`. " +
      "Within the Task's horizon and not in the future.",
  ),
  locationLabel: z.string().trim().min(1).max(CASE_LIMITS.label).describe("The place as the source names it, e.g. `Ag Geneina, West Darfur`."),
  locationId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("A CLEAR location in the Event's country for that place (clear_find_location), only when you resolved it."),
  hazardType: z.string().trim().min(1).max(CASE_LIMITS.hazard).describe("One of the Event's `types`, spelled exactly as clear_get_event returns it."),
  geographicScope: z.enum(["district", "country"]).describe("`district` if it struck the Event's district, else `country`."),
  figures: z
    .array(caseFigureInput)
    .max(CASE_LIMITS.figures)
    .optional()
    .describe("The outcome figures the source states, each on one metric type. Omit when it states none."),
  matchedEventId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "The CLEAR Event this case describes, when clear_list_events found one (same hazard, same country, " +
        "within about ±3 days, same or parent place). Never the Event being enriched.",
    ),
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
    "audit only. For an `event.impact_prior.web` Task pass `cases` (one per historical " +
    "incident, each with its source, verbatim quote, figures and matched CLEAR Event) and " +
    "`methodVersion`; each case is stored as a `proposed` CaseProposal (a proposed signal) that a " +
    "named analyst accepts or rejects on its own; `cases: []` or no `cases` at all records " +
    "`no_prior_found` when you found nothing. Any other kind completes with `result` only. " +
    "Report `usage` when you can. clear-api validates " +
    "each case against the Event (hazard among its types, country, horizon, matched Event) " +
    "and answers BAD_USER_INPUT naming the bad field — fix the case and complete again, " +
    "do not fail the Task. A case whose URL was already proposed for the Event is skipped. Only the lease " +
    "owner, only while LEASED; CANCELLED in the result means the requester withdrew it and " +
    "your result was discarded. CONFLICT / NOT_LEASED means the Task is no longer yours " +
    "(completed, failed or cancelled elsewhere): stop, do not retry.",
  input: z
    .object({
      id: z.string().trim().min(1).describe("The Task id from clear_claim_tasks."),
      leaseToken: leaseTokenInput,
      result: z.record(z.string(), z.unknown()).describe("Raw output: what you searched, what you found, how you decided."),
      usage: taskUsageInput.optional(),
      cases: z
        .array(caseProposalInput)
        .max(CASE_LIMITS.cases)
        .optional()
        .describe("For an `event.impact_prior.web` Task: one entry per historical case; `[]` (or omitting it) records `no_prior_found`."),
      methodVersion: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe("The skill's version string that produced `cases`, e.g. `clear-impact-prior-web@0.5.0`. Required with a non-empty `cases`."),
    })
    .superRefine((input, ctx) => {
      if (input.cases?.length && input.methodVersion === undefined) {
        ctx.addIssue({ code: "custom", path: ["methodVersion"], message: "required with cases" });
      }
      const seen = new Set<string>();
      input.cases?.forEach((c, i) => {
        if (seen.has(c.sourceUrl)) {
          ctx.addIssue({ code: "custom", path: ["cases", i, "sourceUrl"], message: "repeats an earlier case: one case per URL" });
        }
        seen.add(c.sourceUrl);
      });
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
        cases: input.cases,
        methodVersion: input.methodVersion,
      }),
      toolName: ctx.toolName,
      signal: ctx.signal,
    });
    if (!res.ok) return fail(res.error);
    return ok({ task: toTaskItem(res.data.completeTask) });
  },
});
