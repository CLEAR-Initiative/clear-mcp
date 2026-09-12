import { z } from "zod";
import { fail, ok } from "../errors.js";
import { graphql } from "../gql/index.js";
import { compact, eventTypesFilter, monitorFilters } from "./shared.js";
import { defineTool } from "./types.js";

export const COUNT_DOCUMENT = graphql(/* GraphQL */ `
  query ClearCount($input: EntityStatsInput!) {
    entityStats(input: $input) {
      total
      buckets {
        key
        count
      }
    }
  }
`);

export const COUNT_ENTITY = ["signal", "event", "alert"] as const;
export const COUNT_GROUP_BY = ["none", "type", "severity", "day", "week", "month"] as const;

export const countTool = defineTool({
  name: "clear_count",
  description:
    "Count signals, events or alerts matching a filter, optionally grouped. This is the only " +
    "way to get totals beyond a single page of a list tool. `groupBy: \"type\"` returns one " +
    "bucket per GLIDE event-type code (for signals, per source name) — use it to discover the " +
    "`eventTypes` / `sourceNames` values other tools accept. `groupBy: \"severity\"` buckets " +
    "1–5; `day`/`week`/`month` bucket by the entity's primary timestamp with ISO keys " +
    "(YYYY-MM-DD, YYYY-Www, YYYY-MM). Filters match the list tools: `locationId` from " +
    "clear_find_location, `teamId` from clear_whoami (omit for global).",
  input: z.object({
    entity: z.enum(COUNT_ENTITY).describe("What to count."),
    groupBy: z.enum(COUNT_GROUP_BY).optional().describe("Default \"none\" — a single total."),
    ...monitorFilters,
    eventTypes: eventTypesFilter,
  }),
  output: z.object({
    entity: z.enum(COUNT_ENTITY),
    groupBy: z.enum(COUNT_GROUP_BY),
    total: z.number().int(),
    buckets: z.array(
      z.object({
        key: z.string().describe("GLIDE code / source name, severity as a string, or an ISO period."),
        count: z.number().int(),
      }),
    ),
  }),
  async run(input, ctx) {
    const groupBy = input.groupBy ?? "none";
    const res = await ctx.upstream.request({
      document: COUNT_DOCUMENT,
      variables: {
        input: compact({
          entity: input.entity,
          groupBy,
          teamId: input.teamId,
          locationId: input.locationId,
          eventTypes: input.eventTypes,
          severityMin: input.severityMin,
          severityMax: input.severityMax,
          from: input.from,
          to: input.to,
        }),
      },
      toolName: ctx.toolName,
    });
    if (!res.ok) return fail(res.error);

    const stats = res.data.entityStats;
    return ok({
      entity: input.entity,
      groupBy,
      total: stats.total,
      buckets: stats.buckets.map((b) => ({ key: b.key, count: b.count })),
    });
  },
});
