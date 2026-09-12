import { z } from "zod";
import { fail, ok } from "../errors.js";
import { graphql } from "../gql/index.js";
import { compact } from "./shared.js";
import { defineTool } from "./types.js";

/**
 * `locationId` is REQUIRED here even though clear-api's argument is
 * nullable. Its docstring calls null a "country-wide roll-up", but the
 * resolver never picks a country: a null scope reads the bucket keyed on
 * location_id IS NULL and, on the on-demand path, aggregates every report
 * in the window across the whole corpus. With more than one country ingested
 * that silently mixes countries, so this tool never forwards null (decision
 * on ticket 594, 2026-09-12).
 */
export const GET_DATAPOINTS_DOCUMENT = graphql(/* GraphQL */ `
  query ClearGetDatapoints(
    $locationId: String
    $windowKind: String!
    $windowStart: DateTime!
    $windowEnd: DateTime!
    $schemaVersion: String
    $asOf: DateTime
  ) {
    aggregatedDatapoint(
      locationId: $locationId
      windowKind: $windowKind
      windowStart: $windowStart
      windowEnd: $windowEnd
      schemaVersion: $schemaVersion
      asOf: $asOf
    ) {
      id
      locationId
      windowKind
      windowStart
      windowEnd
      schemaVersion
      computedAt
      onDemand
      reportCount
      dataQualityScore
      contributingReportIds
      oldestSourceAt
      newestSourceAt
      data
    }
  }
`);

export const WINDOW_KINDS = ["weekly", "monthly", "yearly", "all"] as const;

/** Calendar-year window in UTC — the default scope. */
export function currentYearWindow(now = new Date()): { windowStart: string; windowEnd: string } {
  const y = now.getUTCFullYear();
  return {
    windowStart: new Date(Date.UTC(y, 0, 1)).toISOString(),
    windowEnd: new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999)).toISOString(),
  };
}

export const datapointsItem = z.object({
  id: z.string(),
  locationId: z.string().nullable(),
  windowKind: z.string(),
  windowStart: z.string(),
  windowEnd: z.string(),
  schemaVersion: z.string(),
  computedAt: z.string(),
  onDemand: z.boolean().describe("True when assembled on this read rather than served from the pre-computed cache."),
  reportCount: z.number().int(),
  dataQualityScore: z.number().describe("0–10 headline quality (clear-pipeline ADR-0005)."),
  contributingReportIds: z.array(z.string()).describe("Knowledge-base report ids behind these numbers — cite them."),
  oldestSourceAt: z.string(),
  newestSourceAt: z.string(),
  data: z
    .record(z.string(), z.unknown())
    .describe(
      "Flat map keyed by field label. Numeric fields carry { value, unit, data_quality, contributing_report_ids, … }; label fields carry { values, contributing_report_ids }; null when unreported.",
    ),
});

export const getDatapointsTool = defineTool({
  name: "clear_get_datapoints",
  description:
    "Read the aggregated quantitative datapoints (displacement, returns, casualties, needs " +
    "figures…) for one location and time window, rolled up from every knowledge-base report in " +
    "scope with per-field data-quality scores and the report ids behind each number. " +
    "`locationId` is required: pass the level-0 country id from clear_find_location, or any " +
    "admin id beneath it. Defaults to the `yearly` window for the current calendar year (UTC); " +
    "pass `windowKind` + `windowStart`/`windowEnd` for a weekly, monthly or all-time bucket. " +
    "Returns `item: null` when no report in scope covers the window.",
  input: z.object({
    locationId: z.string().min(1).describe("Country (level 0) or admin location id from clear_find_location."),
    windowKind: z.enum(WINDOW_KINDS).optional().describe("Default yearly."),
    windowStart: z.string().optional().describe("ISO-8601; default Jan 1 of the current year (UTC)."),
    windowEnd: z.string().optional().describe("ISO-8601; default Dec 31 23:59:59.999 of the current year (UTC)."),
    schemaVersion: z.string().optional().describe("Pin the payload shape; default the pipeline's current version."),
    asOf: z.string().optional().describe("ISO-8601; read the version that was current at this instant."),
  }),
  output: z.object({ item: datapointsItem.nullable() }),
  async run(input, ctx) {
    const defaults = currentYearWindow();
    const res = await ctx.upstream.request({
      document: GET_DATAPOINTS_DOCUMENT,
      variables: compact({
        locationId: input.locationId,
        windowKind: input.windowKind ?? "yearly",
        windowStart: input.windowStart ?? defaults.windowStart,
        windowEnd: input.windowEnd ?? defaults.windowEnd,
        schemaVersion: input.schemaVersion,
        asOf: input.asOf,
      }),
      toolName: ctx.toolName,
    });
    if (!res.ok) return fail(res.error);

    const d = res.data.aggregatedDatapoint;
    if (!d) return ok({ item: null });
    const data = (d.data && typeof d.data === "object" && !Array.isArray(d.data) ? d.data : {}) as Record<string, unknown>;
    return ok({
      item: {
        id: d.id,
        locationId: d.locationId ?? null,
        windowKind: d.windowKind,
        windowStart: d.windowStart,
        windowEnd: d.windowEnd,
        schemaVersion: d.schemaVersion,
        computedAt: d.computedAt,
        onDemand: d.onDemand,
        reportCount: d.reportCount,
        dataQualityScore: d.dataQualityScore,
        contributingReportIds: d.contributingReportIds,
        oldestSourceAt: d.oldestSourceAt,
        newestSourceAt: d.newestSourceAt,
        data,
      },
    });
  },
});
