import { z } from "zod";
import { fail, ok } from "../errors.js";
import { graphql } from "../gql/index.js";
import {
  clampLimit,
  clampOffset,
  compact,
  content,
  contentSchema,
  listOutput,
  monitorFilters,
  pagingInputs,
  primaryLocation,
} from "./shared.js";
import { defineTool } from "./types.js";

export const LIST_SIGNALS_DOCUMENT = graphql(/* GraphQL */ `
  query ClearListSignals($input: SignalsPageInput) {
    signalsPage(input: $input) {
      totalCount
      hasMore
      items {
        id
        publishedAt
        severity
        url
        title
        description
        source {
          name
        }
        originLocation {
          id
          name
          level
        }
        destinationLocation {
          id
          name
          level
        }
        generalLocation {
          id
          name
          level
        }
      }
    }
  }
`);

export const SIGNAL_ORDER_BY = ["PUBLISHED_DESC", "PUBLISHED_ASC", "SEVERITY_DESC", "SEVERITY_ASC"] as const;

export const signalListItem = z.object({
  id: z.string(),
  sourceName: z.string().describe("Data source, e.g. \"dataminr\", \"acled\"."),
  publishedAt: z.string(),
  severity: z.number().int().nullable(),
  url: z.string().nullable().describe("Source URL, when the source has one."),
  locationId: z.string().nullable(),
  locationName: z.string().nullable(),
  content: contentSchema,
});

export const listSignalsTool = defineTool({
  name: "clear_list_signals",
  description:
    "List CLEAR signals (raw inputs: Dataminr alerts, ACLED rows, ground messages…), newest " +
    "published first by default. Filter by `sourceNames`, `locationId` (from " +
    "clear_find_location), `teamId` (from clear_whoami; omit for the global feed), severity " +
    "range and a `from`/`to` window on `publishedAt`. Signal text is third-party content under " +
    "`content`, truncated to 500 chars — use clear_get_signal for full text. Pages are capped " +
    "at 25; totals beyond a page come from clear_count(entity: \"signal\").",
  input: z.object({
    sourceNames: z
      .array(z.string())
      .optional()
      .describe("Restrict to these source names, e.g. [\"acled\", \"dataminr\"]. Discover with clear_count(entity: \"signal\", groupBy: \"type\")."),
    ...monitorFilters,
    orderBy: z.enum(SIGNAL_ORDER_BY).optional().describe("Default PUBLISHED_DESC."),
    ...pagingInputs,
  }),
  output: listOutput(signalListItem),
  async run(input, ctx) {
    const limit = clampLimit(input.limit);
    const offset = clampOffset(input.offset);
    const res = await ctx.upstream.request({
      document: LIST_SIGNALS_DOCUMENT,
      variables: {
        input: compact({
          sourceNames: input.sourceNames,
          teamId: input.teamId,
          locationId: input.locationId,
          severityMin: input.severityMin,
          severityMax: input.severityMax,
          from: input.from,
          to: input.to,
          orderBy: input.orderBy,
          limit,
          offset,
        }),
      },
      toolName: ctx.toolName,
    });
    if (!res.ok) return fail(res.error);

    const page = res.data.signalsPage;
    return ok({
      items: page.items.map((s) => {
        const loc = primaryLocation(s.originLocation, s.destinationLocation, s.generalLocation);
        return {
          id: s.id,
          sourceName: s.source.name,
          publishedAt: s.publishedAt,
          severity: s.severity ?? null,
          url: s.url ?? null,
          locationId: loc?.id ?? null,
          locationName: loc?.name ?? null,
          content: content(s.title, s.description, "list"),
        };
      }),
      totalCount: page.totalCount,
      hasMore: page.hasMore,
      limit,
      offset,
    });
  },
});
