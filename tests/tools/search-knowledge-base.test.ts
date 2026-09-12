import { afterEach, describe, expect, it } from "vitest";
import { connect, textJson, type Seam } from "../helpers/seam.js";

const LONG = "Displacement figures rose sharply. ".repeat(60); // ~2100 chars

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

describe("clear_search_knowledge_base", () => {
  let seam: Seam;
  afterEach(async () => {
    await seam?.close();
  });

  it("returns citable hits with the passage untruncated under content", async () => {
    seam = await connect({ fixtures: { ClearSearchKnowledgeBase: { data: { searchKnowledgebase: [HIT] } } } });
    const result = await seam.callTool("clear_search_knowledge_base", { query: "displacement in North Darfur" });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      items: [
        {
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
          content: { chunkText: LONG },
        },
      ],
      count: 1,
      limit: 5,
    });
    expect(textJson(result)).toEqual(result.structuredContent);
    // Default limit 5, no filters object when none given.
    expect(seam.requests[0]!.variables).toEqual({ query: "displacement in North Darfur", limit: 5 });
    expect(seam.requests[0]!.operationName).toBe("ClearSearchKnowledgeBase");
    expect(seam.requests[0]!.query).not.toMatch(/\bfigureS3Key\b/);
  });

  it("forwards filters into KnowledgebaseFilters (timeRange from from/to) and clamps limit to [1, 20]", async () => {
    seam = await connect({ fixtures: { ClearSearchKnowledgeBase: { data: { searchKnowledgebase: [] } } } });
    await seam.callTool("clear_search_knowledge_base", {
      query: "cholera",
      countryLocationId: "sdn",
      locationIds: ["sdn-nd", "sdn-sd"],
      eventTypes: ["EP"],
      needSectors: ["WASH", "Health"],
      from: "2026-06-01",
      to: "2026-09-01",
      limit: 100,
    });
    expect(seam.requests[0]!.variables).toEqual({
      query: "cholera",
      filters: {
        countryLocationId: "sdn",
        locationIds: ["sdn-nd", "sdn-sd"],
        eventTypes: ["EP"],
        needSectors: ["WASH", "Health"],
        timeRange: { from: "2026-06-01", to: "2026-09-01" },
      },
      limit: 20,
    });

    await seam.callTool("clear_search_knowledge_base", { query: "cholera", from: "2026-06-01", limit: 0 });
    expect(seam.requests[1]!.variables).toEqual({
      query: "cholera",
      filters: { timeRange: { from: "2026-06-01" } },
      limit: 1,
    });
    expect(seam.requests[1]!.headers["user-agent"]).toMatch(/\(clear_search_knowledge_base\)$/);
  });

  it("keeps figure hits' kind and nulls a missing publishedAt", async () => {
    seam = await connect({
      fixtures: {
        ClearSearchKnowledgeBase: {
          data: { searchKnowledgebase: [{ ...HIT, id: "chunk-2", figureKind: "map", publishedAt: null }] },
        },
      },
    });
    const out = (await seam.callTool("clear_search_knowledge_base", { query: "map" })).structuredContent as {
      items: Array<{ figureKind: string | null; publishedAt: string | null }>;
    };
    expect(out.items[0]).toMatchObject({ figureKind: "map", publishedAt: null });
  });

  it("rejects an empty query before any request and relays upstream errors", async () => {
    seam = await connect({
      fixtures: {
        ClearSearchKnowledgeBase: {
          errors: [{ message: "Awaiting approval", extensions: { code: "FORBIDDEN", subCode: "PENDING_APPROVAL" } }],
        },
      },
    });
    const empty = await seam.callTool("clear_search_knowledge_base", { query: " " });
    expect(empty.isError).toBe(true);
    expect(seam.requests).toHaveLength(0);

    const err = await seam.callTool("clear_search_knowledge_base", { query: "x" });
    expect(err.isError).toBe(true);
    expect(textJson(err)).toMatchObject({ code: "FORBIDDEN", subCode: "PENDING_APPROVAL" });
  });
});
