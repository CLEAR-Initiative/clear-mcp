import { z } from "zod";
import { fail, ok } from "../errors.js";
import { graphql } from "../gql/index.js";
import { clampLimit, compact } from "./shared.js";
import { defineTool } from "./types.js";

export const SA_HISTORY_LIMIT = { min: 1, max: 25, default: 5 } as const;

export const GET_SA_DOCUMENT = graphql(/* GraphQL */ `
  query ClearGetSituationAnalysis(
    $countryLocationId: String!
    $year: Int
    $windowKind: String
    $windowStart: DateTime
    $schemaVersion: String
  ) {
    situationAnalysis(
      countryLocationId: $countryLocationId
      year: $year
      windowKind: $windowKind
      windowStart: $windowStart
      schemaVersion: $schemaVersion
    ) {
      ...SituationAnalysisFields
    }
  }
  fragment SituationAnalysisFields on SituationAnalysis {
    id
    countryLocationId
    windowKind
    windowStart
    windowEnd
    schemaVersion
    generatedAt
    generatedByModel
    sourceReportIds
    data
  }
`);

export const SA_HISTORY_DOCUMENT = graphql(/* GraphQL */ `
  query ClearSituationAnalysisHistory($countryLocationId: String!, $limit: Int, $schemaVersion: String) {
    situationAnalysesForCountry(countryLocationId: $countryLocationId, limit: $limit, schemaVersion: $schemaVersion) {
      ...SituationAnalysisFields
    }
  }
`);

export const situationAnalysisItem = z.object({
  id: z.string(),
  countryLocationId: z.string(),
  windowKind: z.string().describe("yearly | monthly (pipeline-owned taxonomy)."),
  windowStart: z.string(),
  windowEnd: z.string(),
  schemaVersion: z.string(),
  generatedAt: z.string(),
  generatedByModel: z.string(),
  sourceReportIds: z.array(z.string()).describe("Knowledge-base report ids the analysis cites."),
  availableSections: z.array(z.string()).describe("Every top-level key of the full `data` payload."),
  data: z
    .record(z.string(), z.unknown())
    .describe("LLM-generated analysis, filtered to `sections` when given. Derived from third-party reports."),
});

interface UpstreamSa {
  id: string;
  countryLocationId: string;
  windowKind: string;
  windowStart: string;
  windowEnd: string;
  schemaVersion: string;
  generatedAt: string;
  generatedByModel: string;
  sourceReportIds: string[];
  data: unknown;
}

function project(sa: UpstreamSa, sections: string[] | undefined): z.infer<typeof situationAnalysisItem> {
  const full = (sa.data && typeof sa.data === "object" && !Array.isArray(sa.data) ? sa.data : {}) as Record<
    string,
    unknown
  >;
  const availableSections = Object.keys(full);
  const data = sections
    ? Object.fromEntries(Object.entries(full).filter(([k]) => sections.includes(k)))
    : full;
  return {
    id: sa.id,
    countryLocationId: sa.countryLocationId,
    windowKind: sa.windowKind,
    windowStart: sa.windowStart,
    windowEnd: sa.windowEnd,
    schemaVersion: sa.schemaVersion,
    generatedAt: sa.generatedAt,
    generatedByModel: sa.generatedByModel,
    sourceReportIds: sa.sourceReportIds,
    availableSections,
    data,
  };
}

export const getSituationAnalysisTool = defineTool({
  name: "clear_get_situation_analysis",
  description:
    "Read the current LLM-generated situation analysis for a country (NRC SAF structure: " +
    "context, displacement, needs by sector, scenarios…). `countryLocationId` is a level-0 id " +
    "from clear_find_location. Defaults to this year's yearly bucket; pass `year`, or " +
    "`windowKind` + `windowStart` (midnight UTC on the window's first day) for a finer bucket. " +
    "Payloads are large: pass `sections` (top-level keys of `data`; see `availableSections`) " +
    "to receive only what you need. `history: true` returns one row per year instead " +
    "(`items`, newest first). Returns `item: null` when no snapshot exists yet.",
  input: z.object({
    countryLocationId: z.string().min(1),
    year: z.number().int().optional().describe("Yearly bucket to read; default current year."),
    windowKind: z.string().optional().describe("e.g. \"monthly\"; requires windowStart."),
    windowStart: z.string().optional().describe("ISO-8601 exact bucket start."),
    schemaVersion: z.string().optional().describe("Pin the payload shape; default latest."),
    sections: z.array(z.string()).optional().describe("Top-level keys of `data` to keep."),
    history: z.boolean().optional().describe("Return the yearly trend series instead of one bucket."),
    limit: z.number().int().optional().describe("History rows, clamped to [1, 25]; default 5."),
  }),
  output: z.object({
    item: situationAnalysisItem.nullable().describe("The requested bucket; null in history mode or when absent."),
    items: z.array(situationAnalysisItem).nullable().describe("History rows, newest first; null unless history: true."),
  }),
  async run(input, ctx) {
    if (input.history) {
      const limit = clampLimit(input.limit, SA_HISTORY_LIMIT);
      const res = await ctx.upstream.request({
        document: SA_HISTORY_DOCUMENT,
        variables: compact({ countryLocationId: input.countryLocationId, limit, schemaVersion: input.schemaVersion }),
        toolName: ctx.toolName,
      });
      if (!res.ok) return fail(res.error);
      return ok({ item: null, items: res.data.situationAnalysesForCountry.map((sa) => project(sa, input.sections)) });
    }

    const res = await ctx.upstream.request({
      document: GET_SA_DOCUMENT,
      variables: compact({
        countryLocationId: input.countryLocationId,
        year: input.year,
        windowKind: input.windowKind,
        windowStart: input.windowStart,
        schemaVersion: input.schemaVersion,
      }),
      toolName: ctx.toolName,
    });
    if (!res.ok) return fail(res.error);
    const sa = res.data.situationAnalysis;
    return ok({ item: sa ? project(sa, input.sections) : null, items: null });
  },
});
