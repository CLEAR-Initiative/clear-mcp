import { afterEach, describe, expect, it } from "vitest";
import { connect, textJson, type Seam } from "../helpers/seam.js";

const LOC = { id: "sdn", name: "Sudan", level: 0 };
const LONG = "s".repeat(800);

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
  generalLocation: LOC,
  events: [{ id: `evt-${i}a` }, { id: `evt-${i}b` }],
  ...overrides,
});

describe("clear_list_crises", () => {
  let seam: Seam;
  afterEach(async () => {
    await seam?.close();
  });

  it("pages client-side, newest updated first, summary truncated, scenarios/needs not selected", async () => {
    seam = await connect({
      fixtures: { ClearListCrises: { data: { crises: [crisis(1, { summary: LONG }), crisis(3), crisis(2)] } } },
    });
    const result = await seam.callTool("clear_list_crises", { limit: 2 });
    expect(result.isError).toBeFalsy();
    const out = result.structuredContent as {
      items: Array<{ id: string; content: { truncated?: boolean; summary: string } }>;
      totalCount: number;
      hasMore: boolean;
      limit: number;
      offset: number;
    };
    expect(out.items.map((i) => i.id)).toEqual(["cr-3", "cr-2"]);
    expect(out).toMatchObject({ totalCount: 3, hasMore: true, limit: 2, offset: 0 });
    expect(out.items[0]).toEqual({
      id: "cr-3",
      severity: 4.5,
      enrichmentStatus: "ENRICHED",
      location: LOC,
      eventIds: ["evt-3a", "evt-3b"],
      populationAffected: "120000",
      populationInArea: null,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-09-03T00:00:00.000Z",
      content: { title: "Crisis 3", summary: "Summary 3" },
    });
    expect(textJson(result)).toEqual(out);

    const second = (await seam.callTool("clear_list_crises", { limit: 2, offset: 2 })).structuredContent as typeof out;
    expect(second.items.map((i) => i.id)).toEqual(["cr-1"]);
    expect(second.hasMore).toBe(false);
    expect(second.items[0]!.content.truncated).toBe(true);
    expect(second.items[0]!.content.summary.length).toBe(501);

    for (const r of seam.requests) {
      expect(r.operationName).toBe("ClearListCrises");
      expect(r.variables).toEqual({});
      expect(r.query).not.toMatch(/\bscenarios\b|\bneeds\b|\bcomments\b|\bfeedbacks\b|\battachments\b|\bgeometry\b/);
    }
  });

  it("clamps limit and offset and relays errors", async () => {
    seam = await connect({ fixtures: { ClearListCrises: { data: { crises: [] } } } });
    const out = (await seam.callTool("clear_list_crises", { limit: 99, offset: -5 })).structuredContent as {
      limit: number;
      offset: number;
      items: unknown[];
    };
    expect(out).toEqual({ items: [], totalCount: 0, hasMore: false, limit: 25, offset: 0 });

    seam.fixtures.on("ClearListCrises", { errors: [{ message: "nope", extensions: { code: "UNAUTHENTICATED" } }] });
    const err = await seam.callTool("clear_list_crises", {});
    expect(err.isError).toBe(true);
    expect(textJson(err)).toEqual({ code: "UNAUTHENTICATED", message: "nope" });
  });
});

describe("clear_get_crisis", () => {
  let seam: Seam;
  afterEach(async () => {
    await seam?.close();
  });

  it("returns the full crisis with untruncated summary, scenarios and needs under content", async () => {
    const scenarios = [{ name: "Escalation", likelihood: "high" }];
    const needs = { Shelter: { severity: 4 }, WASH: { severity: 3 } };
    seam = await connect({
      fixtures: { ClearGetCrisis: { data: { crisis: crisis(1, { summary: LONG, scenarios, needs }) } } },
    });
    const result = await seam.callTool("clear_get_crisis", { id: "cr-1" });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      item: {
        id: "cr-1",
        severity: 4.5,
        enrichmentStatus: "ENRICHED",
        location: LOC,
        eventIds: ["evt-1a", "evt-1b"],
        populationAffected: "120000",
        populationInArea: null,
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
        content: { title: "Crisis 1", summary: LONG, scenarios, needs },
      },
    });
    expect(seam.requests[0]!.variables).toEqual({ id: "cr-1" });
    expect(seam.requests[0]!.query).not.toMatch(/\bcomments\b|\bfeedbacks\b|\battachments\b|\bgeometry\b/);
  });

  it("returns item: null for an unknown id and nulls scenarios while PENDING", async () => {
    seam = await connect({ fixtures: { ClearGetCrisis: { data: { crisis: null } } } });
    expect((await seam.callTool("clear_get_crisis", { id: "x" })).structuredContent).toEqual({ item: null });

    seam.fixtures.on("ClearGetCrisis", {
      data: { crisis: crisis(2, { enrichmentStatus: "PENDING", title: null, summary: null, scenarios: null, needs: {} }) },
    });
    const out = (await seam.callTool("clear_get_crisis", { id: "cr-2" })).structuredContent as {
      item: { enrichmentStatus: string; content: Record<string, unknown> };
    };
    expect(out.item.enrichmentStatus).toBe("PENDING");
    expect(out.item.content).toEqual({ title: null, summary: null, scenarios: null, needs: {} });
  });
});
