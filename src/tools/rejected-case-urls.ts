import { z } from "zod";
import { fail, ok } from "../errors.js";
import { graphql } from "../gql/index.js";
import { defineTool } from "./types.js";

export const REJECTED_CASE_URLS_DOCUMENT = graphql(/* GraphQL */ `
  query ClearRejectedCaseUrls($eventId: String!) {
    rejectedCaseUrls(eventId: $eventId)
  }
`);

/**
 * The one read among the Worker tools (ADR-0010, V4 amendment): the source
 * URLs an analyst already rejected as cases for an Event. A web Worker reads
 * it before it searches and never proposes one of them again. Registered with
 * the other Worker tools under `CLEAR_MCP_WORKER=1` because only a Worker
 * needs it (clear-api allows the `worker` role, platform admins and analysts);
 * it writes nothing, so it keeps the default read-only annotations.
 */
export const rejectedCaseUrlsTool = defineTool({
  name: "clear_rejected_case_urls",
  description:
    "WORKER TOOL (read). The source URLs an analyst has already rejected as cases for an Event " +
    "(the Task's `subjectId`). Call it once per `event.impact_prior.web` Task, before you search, " +
    "and never propose any of these URLs again for that Event — not even with new figures or a " +
    "new quote. A URL already proposed or accepted for the Event is skipped by clear-api on " +
    "completion anyway; this list is the one you must also keep out of your research.",
  input: z.object({
    eventId: z.string().trim().min(1).describe("The Event id — the claimed Task's `subjectId`."),
  }),
  output: z.object({
    eventId: z.string(),
    urls: z.array(z.string()).describe("Rejected source URLs, oldest rejection first. Empty when none."),
  }),
  async run(input, ctx) {
    const res = await ctx.upstream.request({
      document: REJECTED_CASE_URLS_DOCUMENT,
      variables: { eventId: input.eventId },
      toolName: ctx.toolName,
      signal: ctx.signal,
    });
    if (!res.ok) return fail(res.error);
    return ok({ eventId: input.eventId, urls: res.data.rejectedCaseUrls });
  },
});
