/**
 * Every Curated tool behaves identically over MCP and through the Tool
 * library (CONTEXT.md, ADR-0009). Each case runs once through the MCP seam
 * and once through the library seam on the same fixtures: the library's
 * ToolOutcome must deep-equal the MCP `structuredContent` (or, on failure,
 * the `isError` JSON), and the upstream must have seen the same requests.
 * Fixtures mirror the per-tool suites in tests/tools/; every curated tool
 * must have at least one case.
 */
import { describe, expect, it } from "vitest";
import { THIRD_PARTY_CONTENT_RULE } from "../../src/library.js";
import { createLibrarySeam } from "../helpers/library-seam.js";
import { connect, textJson, type FixtureResponse, type Responder } from "../helpers/seam.js";

interface ParityCase {
  name: string;
  tool: string;
  args?: Record<string, unknown>;
  /** The Consumer's locale (`CLEAR_MCP_LOCALE` / `Config.locale`); default `en`. */
  locale?: "en" | "ar" | "fr" | "es";
  fixtures: Record<string, Responder | FixtureResponse>;
}

const LOC = { id: "sdn-nd", name: "North Darfur", level: 1 };
const GEN = { id: "sdn", name: "Sudan", level: 0 };
const LONG = "z".repeat(2000);
const FORBIDDEN = {
  errors: [{ message: "Awaiting approval", extensions: { code: "FORBIDDEN", subCode: "PENDING_APPROVAL" } }],
};

const ME = {
  id: "user-1",
  name: "Dev One",
  role: "analyst",
  language: "en",
  isActive: true,
  defaultTeam: { id: "team-sudan", name: "Sudan" },
};
const TEAMS = [{ id: "team-sudan", name: "Sudan", slug: "sudan", locations: [{ id: "loc-sdn", name: "Sudan", level: 0 }] }];

const INDEX_DATA = {
  countries: [
    { id: "sdn", name: "Sudan", level: 0, pCode: "SD", ancestorIds: [] },
    { id: "ssd", name: "South Sudan", level: 0, pCode: "SS", ancestorIds: [] },
    { id: "tcd", name: "Chad", level: 0, pCode: "TD", ancestorIds: [] },
  ],
  states: [
    { id: "sdn-nd", name: "North Darfur", level: 1, pCode: "SD01", ancestorIds: ["sdn"] },
    { id: "sdn-sd", name: "South Darfur", level: 1, pCode: "SD02", ancestorIds: ["sdn"] },
    { id: "tcd-x", name: "Ouaddaï", level: 1, pCode: null, ancestorIds: ["tcd"] },
  ],
  districts: [
    { id: "sdn-nd-ef", name: "El Fasher", level: 2, pCode: "SD01001", ancestorIds: ["sdn-nd", "sdn"] },
    { id: "tcd-dar", name: "Darfour Camp", level: 2, pCode: null, ancestorIds: ["tcd-x", "tcd"] },
  ],
};

/** clear-api localises `Location.name` by `x-force-locale`. */
const AR_NAMES: Record<string, string> = { sdn: "السودان", "sdn-nd": "شمال دارفور", "sdn-sd": "جنوب دارفور", "sdn-nd-ef": "الفاشر" };
const localisedIndex: Responder = (_vars, req) => {
  if (req.headers["x-force-locale"] !== "ar") return { data: INDEX_DATA };
  const tr = (rows: Array<{ id: string; name: string }>) => rows.map((r) => ({ ...r, name: AR_NAMES[r.id] ?? r.name }));
  return { data: { countries: tr(INDEX_DATA.countries), states: tr(INDEX_DATA.states), districts: tr(INDEX_DATA.districts) } };
};

const HIT = {
  id: "chunk-1",
  reportId: "rw-123",
  reportTitle: "Sudan: Humanitarian Update, August 2026",
  sourceUrl: "https://reliefweb.int/report/sudan/123",
  publishedAt: "2026-08-20T00:00:00.000Z",
  pageStart: 3,
  pageEnd: 4,
  score: 0.0312,
  locationIds: ["sdn-nd"],
  eventTypes: ["CE"],
  needSectors: ["Shelter"],
  figureKind: null,
  chunkText: LONG,
};

const alert = (overrides: Record<string, unknown> = {}) => ({
  id: "alrt-1",
  status: "published",
  createdAt: "2026-09-02T12:00:00.000Z",
  event: {
    id: "evt-1",
    severity: 3,
    types: ["FL"],
    title: "Flooding in El Fasher",
    description: "y".repeat(700),
    firstSignalCreatedAt: "2026-09-01T10:00:00.000Z",
    originLocation: null,
    destinationLocation: null,
    generalLocation: LOC,
  },
  ...overrides,
});

const listEvent = (overrides: Record<string, unknown> = {}) => ({
  id: "evt-1",
  severity: 4,
  types: ["CE", "FL"],
  title: "Clashes reported near El Fasher",
  description: "Short description.",
  firstSignalCreatedAt: "2026-09-01T10:00:00.000Z",
  lastSignalCreatedAt: "2026-09-03T08:30:00.000Z",
  startedAt: "2026-08-31T00:00:00.000Z",
  originLocation: LOC,
  destinationLocation: null,
  generalLocation: GEN,
  signals: [{ id: "s1" }, { id: "s2" }, { id: "s3" }],
  ...overrides,
});

const listSignal = (overrides: Record<string, unknown> = {}) => ({
  id: "sig-1",
  publishedAt: "2026-09-03T07:00:00.000Z",
  severity: 2,
  url: "https://example.org/post/1",
  title: "Reports of shelling",
  description: "Residents report shelling overnight.",
  source: { name: "dataminr" },
  originLocation: LOC,
  destinationLocation: null,
  generalLocation: null,
  ...overrides,
});

const EVENT = {
  id: "evt-1",
  severity: 4,
  types: ["CE"],
  title: "Clashes",
  description: LONG,
  firstSignalCreatedAt: "2026-09-01T10:00:00.000Z",
  lastSignalCreatedAt: "2026-09-03T08:30:00.000Z",
  startedAt: null,
  casualties: 12,
  populationAffected: "15000",
  populationDisplaced: null,
  rank: 0.82,
  isDummy: false,
  originLocation: LOC,
  destinationLocation: null,
  generalLocation: GEN,
  alerts: [{ id: "alrt-1", status: "published" }],
  signals: Array.from({ length: 60 }, (_, i) => ({
    id: `sig-${i}`,
    publishedAt: `2026-09-01T10:${String(i).padStart(2, "0")}:00.000Z`,
    source: { name: i % 2 ? "acled" : "dataminr" },
  })),
};

const ALERT = {
  id: "alrt-1",
  status: "published",
  createdAt: "2026-09-02T12:00:00.000Z",
  updatedAt: "2026-09-02T13:00:00.000Z",
  event: {
    id: "evt-1",
    severity: 3,
    types: ["FL"],
    title: "Flooding",
    description: LONG,
    firstSignalCreatedAt: "2026-09-01T10:00:00.000Z",
    lastSignalCreatedAt: "2026-09-02T10:00:00.000Z",
    startedAt: "2026-08-30T00:00:00.000Z",
    originLocation: null,
    destinationLocation: LOC,
    generalLocation: GEN,
  },
};

const SIGNAL = {
  id: "sig-1",
  status: "PROCESSED",
  publishedAt: "2026-09-03T07:00:00.000Z",
  collectedAt: "2026-09-03T07:05:00.000Z",
  processedAt: "2026-09-03T07:10:00.000Z",
  severity: 2,
  casualties: null,
  url: "https://example.org/p/1",
  externalId: "dataminr:abc",
  isDummy: false,
  title: "Shelling",
  description: LONG,
  source: { name: "dataminr", type: "social", reliability: 3 },
  originLocation: LOC,
  destinationLocation: null,
  generalLocation: null,
  events: [{ id: "evt-1" }, { id: "evt-2" }],
};

const crisis = (i: number, overrides: Record<string, unknown> = {}) => ({
  id: `cr-${i}`,
  severity: 4.5,
  enrichmentStatus: "ENRICHED",
  title: `Crisis ${i}`,
  summary: `Summary ${i}`,
  populationAffected: "120000",
  populationInArea: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: `2026-09-0${i}T00:00:00.000Z`,
  generalLocation: GEN,
  events: [{ id: `evt-${i}a` }, { id: `evt-${i}b` }],
  ...overrides,
});

const SA = (overrides: Record<string, unknown> = {}) => ({
  id: "sa-2026",
  countryLocationId: "sdn",
  windowKind: "yearly",
  windowStart: "2026-01-01T00:00:00.000Z",
  windowEnd: "2026-12-31T23:59:59.999Z",
  schemaVersion: "v2",
  generatedAt: "2026-09-07T03:00:00.000Z",
  generatedByModel: "claude-opus-5",
  sourceReportIds: ["rw-1", "rw-2"],
  data: {
    context: { text: "Conflict continues." },
    displacement: { idps: 9_000_000 },
    needs: { Shelter: { severity: 4 } },
    scenarios: [{ name: "Escalation" }],
  },
  ...overrides,
});

const DATAPOINT = {
  id: "adp-1",
  locationId: "sdn",
  windowKind: "yearly",
  windowStart: "2026-01-01T00:00:00.000Z",
  windowEnd: "2026-12-31T23:59:59.999Z",
  schemaVersion: "v2",
  computedAt: "2026-09-07T03:00:00.000Z",
  onDemand: false,
  reportCount: 14,
  dataQualityScore: 6.8,
  contributingReportIds: ["rw-1", "rw-2"],
  oldestSourceAt: "2026-01-10T00:00:00.000Z",
  newestSourceAt: "2026-09-01T00:00:00.000Z",
  data: { idps_total: { value: 9_100_000, unit: "people", data_quality: 7.2, contributing_report_ids: ["rw-1"] }, cholera_cases: null },
};

const figure = (i: number) => ({
  id: `fig-${i}`,
  reportId: "rw-123",
  reportTitle: "Sudan: Humanitarian Update",
  sourceUrl: "https://reliefweb.int/report/sudan/123",
  pageNumber: i,
  kind: "map",
  isFullPage: false,
  s3Key: `figures/rw-123/${i}.png`,
  locationIds: ["sdn-nd"],
  eventTypes: ["CE"],
  needSectors: ["Shelter"],
  timeRangeStart: "2026-08-01T00:00:00.000Z",
  timeRangeEnd: null,
  title: `Figure ${i}`,
  description: "IDP movements",
  transcription: { rows: [["North Darfur", 12000]] },
});

const CASES: ParityCase[] = [
  // Orient
  { name: "identity and scope", tool: "clear_whoami", fixtures: { ClearWhoami: { data: { me: ME, myTeams: TEAMS } } } },
  {
    name: "an UNAUTHENTICATED error",
    tool: "clear_whoami",
    fixtures: {
      ClearWhoami: {
        data: { me: null, myTeams: null },
        errors: [{ message: "You must be logged in", extensions: { code: "UNAUTHENTICATED" } }],
      },
    },
  },
  { name: "me is null", tool: "clear_whoami", fixtures: { ClearWhoami: { data: { me: null, myTeams: [] } } } },
  {
    name: "ranked matches with ancestors",
    tool: "clear_find_location",
    args: { query: "Darfur" },
    fixtures: { ClearLocationIndex: { data: INDEX_DATA } },
  },
  {
    name: "narrowed by level and withinLocationId, limit clamped",
    tool: "clear_find_location",
    args: { query: "sudan", level: 0, withinLocationId: "sdn", limit: 50 },
    fixtures: { ClearLocationIndex: { data: INDEX_DATA } },
  },
  {
    name: "localised names in ar",
    tool: "clear_find_location",
    args: { query: "دارفور" },
    locale: "ar",
    fixtures: { ClearLocationIndex: localisedIndex },
  },
  {
    name: "the index cannot load",
    tool: "clear_find_location",
    args: { query: "Darfur" },
    fixtures: { ClearLocationIndex: { status: 502, body: "bad gateway" } },
  },
  // Retrieve
  {
    name: "citable hits, passage untruncated",
    tool: "clear_search_knowledge_base",
    args: { query: "displacement in North Darfur" },
    fixtures: { ClearSearchKnowledgeBase: { data: { searchKnowledgebase: [HIT, { ...HIT, id: "chunk-2", publishedAt: null, figureKind: "map" }] } } },
  },
  {
    name: "filters forwarded, limit clamped",
    tool: "clear_search_knowledge_base",
    args: { query: "cholera", countryLocationId: "sdn", needSectors: ["WASH"], from: "2026-06-01", to: "2026-09-01", limit: 100 },
    fixtures: { ClearSearchKnowledgeBase: { data: { searchKnowledgebase: [] } } },
  },
  {
    name: "unreachable clear-api",
    tool: "clear_search_knowledge_base",
    args: { query: "cholera" },
    fixtures: { ClearSearchKnowledgeBase: { reject: new Error("ECONNREFUSED") } },
  },
  // Monitor
  {
    name: "alerts with truncated event text",
    tool: "clear_list_alerts",
    args: { status: "published", teamId: "team-sudan", limit: 99 },
    fixtures: { ClearListAlerts: { data: { alertsPage: { items: [alert(), alert({ id: "alrt-2" })], totalCount: 2, hasMore: false } } } },
  },
  { name: "FORBIDDEN", tool: "clear_list_alerts", fixtures: { ClearListAlerts: FORBIDDEN } },
  {
    name: "events with location fallback and truncation",
    tool: "clear_list_events",
    fixtures: {
      ClearListEvents: {
        data: {
          eventsPage: {
            items: [
              listEvent(),
              listEvent({ id: "evt-2", description: "x".repeat(600), originLocation: null }),
              listEvent({ id: "evt-3", originLocation: null, generalLocation: null }),
            ],
            totalCount: 42,
            hasMore: true,
          },
        },
      },
    },
  },
  { name: "FORBIDDEN", tool: "clear_list_events", args: { offset: -3 }, fixtures: { ClearListEvents: FORBIDDEN } },
  {
    name: "signals with sourceName and content",
    tool: "clear_list_signals",
    args: { sourceNames: ["dataminr"], offset: 10 },
    fixtures: {
      ClearListSignals: {
        data: {
          signalsPage: {
            items: [listSignal(), listSignal({ id: "sig-2", url: null, description: "w".repeat(900) })],
            totalCount: 7,
            hasMore: true,
          },
        },
      },
    },
  },
  {
    name: "total with default groupBy",
    tool: "clear_count",
    args: { entity: "event" },
    fixtures: { ClearCount: { data: { entityStats: { total: 128, buckets: [{ key: "total", count: 128 }] } } } },
  },
  {
    name: "grouped by type",
    tool: "clear_count",
    args: { entity: "event", groupBy: "type" },
    fixtures: {
      ClearCount: {
        data: {
          entityStats: {
            total: 30,
            buckets: [
              { key: "CE", count: 18 },
              { key: "FL", count: 12 },
            ],
          },
        },
      },
    },
  },
  { name: "full alert", tool: "clear_get_alert", args: { id: "alrt-1" }, fixtures: { ClearGetAlert: { data: { alert: ALERT } } } },
  { name: "unknown id", tool: "clear_get_alert", args: { id: "x" }, fixtures: { ClearGetAlert: { data: { alert: null } } } },
  {
    name: "full event, signals capped",
    tool: "clear_get_event",
    args: { id: "evt-1" },
    fixtures: { ClearGetEvent: { data: { event: EVENT } } },
  },
  { name: "unknown id", tool: "clear_get_event", args: { id: "nope" }, fixtures: { ClearGetEvent: { data: { event: null } } } },
  { name: "FORBIDDEN", tool: "clear_get_event", args: { id: "evt-1" }, fixtures: { ClearGetEvent: FORBIDDEN } },
  { name: "full signal", tool: "clear_get_signal", args: { id: "sig-1" }, fixtures: { ClearGetSignal: { data: { signal: SIGNAL } } } },
  { name: "unknown id", tool: "clear_get_signal", args: { id: "x" }, fixtures: { ClearGetSignal: { data: { signal: null } } } },
  // Analyse
  {
    name: "paged newest first, summary truncated",
    tool: "clear_list_crises",
    args: { limit: 2 },
    fixtures: { ClearListCrises: { data: { crises: [crisis(1, { summary: "s".repeat(800) }), crisis(3), crisis(2)] } } },
  },
  {
    name: "full crisis",
    tool: "clear_get_crisis",
    args: { id: "cr-1" },
    fixtures: {
      ClearGetCrisis: {
        data: { crisis: crisis(1, { summary: LONG, scenarios: [{ name: "Escalation" }], needs: { WASH: { severity: 3 } } }) },
      },
    },
  },
  {
    name: "pending enrichment",
    tool: "clear_get_crisis",
    args: { id: "cr-2" },
    fixtures: {
      ClearGetCrisis: {
        data: { crisis: crisis(2, { enrichmentStatus: "PENDING", title: null, summary: null, scenarios: null, needs: {} }) },
      },
    },
  },
  { name: "unknown id", tool: "clear_get_crisis", args: { id: "x" }, fixtures: { ClearGetCrisis: { data: { crisis: null } } } },
  {
    name: "current bucket",
    tool: "clear_get_situation_analysis",
    args: { countryLocationId: "sdn" },
    fixtures: { ClearGetSituationAnalysis: { data: { situationAnalysis: SA() } } },
  },
  {
    name: "sections and bucket selectors",
    tool: "clear_get_situation_analysis",
    args: { countryLocationId: "sdn", year: 2025, windowKind: "monthly", windowStart: "2025-06-01T00:00:00.000Z", sections: ["needs", "nope"] },
    fixtures: { ClearGetSituationAnalysis: { data: { situationAnalysis: SA() } } },
  },
  {
    name: "history",
    tool: "clear_get_situation_analysis",
    args: { countryLocationId: "sdn", history: true, sections: ["context"] },
    fixtures: {
      ClearSituationAnalysisHistory: {
        data: { situationAnalysesForCountry: [SA(), SA({ id: "sa-2025", windowStart: "2025-01-01T00:00:00.000Z" })] },
      },
    },
  },
  {
    name: "no snapshot",
    tool: "clear_get_situation_analysis",
    args: { countryLocationId: "sdn" },
    fixtures: { ClearGetSituationAnalysis: { data: { situationAnalysis: null } } },
  },
  {
    name: "aggregated bucket with default window",
    tool: "clear_get_datapoints",
    args: { locationId: "sdn" },
    fixtures: { ClearGetDatapoints: { data: { aggregatedDatapoint: DATAPOINT } } },
  },
  { name: "FORBIDDEN", tool: "clear_get_datapoints", args: { locationId: "sdn" }, fixtures: { ClearGetDatapoints: FORBIDDEN } },
  {
    name: "figures paged by cursor",
    tool: "clear_list_figures",
    args: { reportId: "rw-123", limit: 2, after: "fig-0" },
    fixtures: { ClearListFigures: { data: { reportFigures: [figure(1), figure(2), figure(3)] } } },
  },
];

describe("Tool library parity with MCP", () => {
  it("covers every curated tool", () => {
    const { tools } = createLibrarySeam();
    expect([...new Set(CASES.map((c) => c.tool))].sort()).toEqual(tools.map((t) => t.name).sort());
  });

  it.each(CASES.map((c) => [`${c.tool}: ${c.name}`, c] as const))("%s", async (_label, c) => {
    const locale = c.locale ?? "en";
    const mcp = await connect({ env: { CLEAR_MCP_LOCALE: locale }, fixtures: c.fixtures });
    try {
      const result = await mcp.callTool(c.tool, c.args);
      const library = createLibrarySeam({ config: { locale }, fixtures: c.fixtures });
      const outcome = await library.runTool(c.tool, c.args);

      expect(outcome).toEqual(
        result.isError ? { ok: false, error: textJson(result) } : { ok: true, value: result.structuredContent },
      );
      expect(library.requests).toEqual(mcp.requests);
    } finally {
      await mcp.close();
    }
  });

  // Invalid input never reaches clear-api by either route. The MCP SDK rejects it against the
  // input schema before the server's handler runs, in its own wording (`MCP error -32602: …`), so
  // the comparison is: both are errors, neither made a request, and both carry zod's issue text.
  it.each([
    ["clear_list_events", { severityMin: 99 }, "severityMin"],
    ["clear_find_location", { query: "" }, "query"],
    ["clear_search_knowledge_base", { query: "   " }, "query"],
    ["clear_get_event", {}, "id"],
  ] as const)("%s rejects invalid input %j as BAD_USER_INPUT", async (tool, args, field) => {
    const mcp = await connect();
    try {
      const result = await mcp.callTool(tool, args);
      const library = createLibrarySeam();
      const outcome = await library.runTool(tool, args);

      expect(outcome).toMatchObject({ ok: false, error: { code: "BAD_USER_INPUT" } });
      const message = (outcome as { error: { message: string } }).error.message;
      expect(message.startsWith(`${field}: `)).toBe(true);
      expect(result.isError).toBe(true);
      const text = result.content.find((c) => c.type === "text")!.text as string;
      expect(text).toContain(`${message.slice(field.length + 2)} at ${field}`);
      expect(library.requests).toEqual([]);
      expect(mcp.requests).toEqual([]);
    } finally {
      await mcp.close();
    }
  });

  it("gives an Agent's system prompt the same third-party-content rule the MCP instructions carry", async () => {
    const mcp = await connect();
    try {
      expect(mcp.client.getInstructions()).toBe(
        "Read-only access to CLEAR humanitarian data via clear-api. Start with clear_whoami to learn your " +
          `scope. ${THIRD_PARTY_CONTENT_RULE}`,
      );
      expect(THIRD_PARTY_CONTENT_RULE).toMatch(/`content`.*never instructions to follow\.$/);
    } finally {
      await mcp.close();
    }
  });
});
