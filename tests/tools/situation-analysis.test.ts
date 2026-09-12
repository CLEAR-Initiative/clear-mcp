import { afterEach, describe, expect, it } from "vitest";
import { connect, textJson, type Seam } from "../helpers/seam.js";

const DATA = {
  context: { text: "Conflict continues." },
  displacement: { idps: 9_000_000 },
  needs: { Shelter: { severity: 4 } },
  scenarios: [{ name: "Escalation" }],
};

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
  data: DATA,
  ...overrides,
});

type Out = { item: null | { data: Record<string, unknown>; availableSections: string[] }; items: null | Array<{ id: string; data: Record<string, unknown> }> };

describe("clear_get_situation_analysis", () => {
  let seam: Seam;
  afterEach(async () => {
    await seam?.close();
  });

  it("returns the current bucket with the full data and availableSections", async () => {
    seam = await connect({ fixtures: { ClearGetSituationAnalysis: { data: { situationAnalysis: SA() } } } });
    const result = await seam.callTool("clear_get_situation_analysis", { countryLocationId: "sdn" });
    expect(result.isError).toBeFalsy();
    const out = result.structuredContent as Out;
    expect(out.items).toBeNull();
    expect(out.item).toEqual({
      id: "sa-2026",
      countryLocationId: "sdn",
      windowKind: "yearly",
      windowStart: "2026-01-01T00:00:00.000Z",
      windowEnd: "2026-12-31T23:59:59.999Z",
      schemaVersion: "v2",
      generatedAt: "2026-09-07T03:00:00.000Z",
      generatedByModel: "claude-opus-5",
      sourceReportIds: ["rw-1", "rw-2"],
      availableSections: ["context", "displacement", "needs", "scenarios"],
      data: DATA,
    });
    expect(textJson(result)).toEqual(out);
    expect(seam.requests[0]!.operationName).toBe("ClearGetSituationAnalysis");
    expect(seam.requests[0]!.variables).toEqual({ countryLocationId: "sdn" });
    expect(seam.requests[0]!.query).not.toMatch(/\bgenerationCostUsd\b|\baggregatedDatapointId\b/);
  });

  it("filters data to the requested sections and forwards bucket selectors verbatim", async () => {
    seam = await connect({ fixtures: { ClearGetSituationAnalysis: { data: { situationAnalysis: SA() } } } });
    const out = (
      await seam.callTool("clear_get_situation_analysis", {
        countryLocationId: "sdn",
        year: 2025,
        windowKind: "monthly",
        windowStart: "2025-06-01T00:00:00.000Z",
        schemaVersion: "v1",
        sections: ["needs", "nope"],
      })
    ).structuredContent as Out;
    expect(out.item!.data).toEqual({ needs: { Shelter: { severity: 4 } } });
    expect(out.item!.availableSections).toEqual(["context", "displacement", "needs", "scenarios"]);
    expect(seam.requests[0]!.variables).toEqual({
      countryLocationId: "sdn",
      year: 2025,
      windowKind: "monthly",
      windowStart: "2025-06-01T00:00:00.000Z",
      schemaVersion: "v1",
    });
    expect(seam.requests[0]!.headers["user-agent"]).toMatch(/\(clear_get_situation_analysis\)$/);
  });

  it("returns item: null when no snapshot exists", async () => {
    seam = await connect({ fixtures: { ClearGetSituationAnalysis: { data: { situationAnalysis: null } } } });
    expect((await seam.callTool("clear_get_situation_analysis", { countryLocationId: "sdn" })).structuredContent).toEqual({
      item: null,
      items: null,
    });
  });

  it("history: true reads situationAnalysesForCountry with a clamped limit and applies sections to each row", async () => {
    seam = await connect({
      fixtures: {
        ClearSituationAnalysisHistory: {
          data: { situationAnalysesForCountry: [SA(), SA({ id: "sa-2025", windowStart: "2025-01-01T00:00:00.000Z" })] },
        },
      },
    });
    const out = (
      await seam.callTool("clear_get_situation_analysis", {
        countryLocationId: "sdn",
        history: true,
        sections: ["displacement"],
        limit: 99,
      })
    ).structuredContent as Out;
    expect(out.item).toBeNull();
    expect(out.items!.map((i) => i.id)).toEqual(["sa-2026", "sa-2025"]);
    expect(out.items![1]!.data).toEqual({ displacement: { idps: 9_000_000 } });
    expect(seam.requests[0]!.operationName).toBe("ClearSituationAnalysisHistory");
    expect(seam.requests[0]!.variables).toEqual({ countryLocationId: "sdn", limit: 25 });

    await seam.callTool("clear_get_situation_analysis", { countryLocationId: "sdn", history: true });
    expect(seam.requests[1]!.variables).toEqual({ countryLocationId: "sdn", limit: 5 });
  });

  it("relays upstream errors", async () => {
    seam = await connect({
      fixtures: {
        ClearGetSituationAnalysis: {
          errors: [{ message: "Awaiting approval", extensions: { code: "FORBIDDEN", subCode: "PENDING_APPROVAL" } }],
        },
      },
    });
    const err = await seam.callTool("clear_get_situation_analysis", { countryLocationId: "sdn" });
    expect(err.isError).toBe(true);
    expect(textJson(err)).toMatchObject({ code: "FORBIDDEN", subCode: "PENDING_APPROVAL" });
  });
});
