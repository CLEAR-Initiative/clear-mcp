import { afterEach, describe, expect, it } from "vitest";
import { connect, textJson, type Seam } from "../helpers/seam.js";

const SUDAN = { id: "sdn", name: "Sudan", level: 0, pCode: "SD", ancestorIds: [] };
const CHAD = { id: "tcd", name: "Chad", level: 0, pCode: "TD", ancestorIds: [] };
const SOUTH_SUDAN = { id: "ssd", name: "South Sudan", level: 0, pCode: "SS", ancestorIds: [] };
const NORTH_DARFUR = { id: "sdn-nd", name: "North Darfur", level: 1, pCode: "SD01", ancestorIds: ["sdn"] };
const SOUTH_DARFUR = { id: "sdn-sd", name: "South Darfur", level: 1, pCode: "SD02", ancestorIds: ["sdn"] };
const KASSALA_STATE = { id: "sdn-ks", name: "Kassala", level: 1, pCode: "SD05", ancestorIds: ["sdn"] };
const EL_FASHER = { id: "sdn-nd-ef", name: "El Fasher", level: 2, pCode: "SD01001", ancestorIds: ["sdn-nd", "sdn"] };
const KASSALA_LOC = { id: "sdn-ks-ks", name: "Kassala", level: 2, pCode: "SD05001", ancestorIds: ["sdn-ks", "sdn"] };
const DARFUR_TCD = { id: "tcd-dar", name: "Darfour Camp", level: 2, pCode: null, ancestorIds: ["tcd-x", "tcd"] };
const OUADDAI = { id: "tcd-x", name: "Ouaddaï", level: 1, pCode: null, ancestorIds: ["tcd"] };

const INDEX_DATA = {
  countries: [SUDAN, CHAD, SOUTH_SUDAN],
  states: [NORTH_DARFUR, SOUTH_DARFUR, KASSALA_STATE, OUADDAI],
  districts: [EL_FASHER, KASSALA_LOC, DARFUR_TCD],
};

type Items = { items: Array<{ id: string; name: string; level: number; score: number; ancestors: unknown[] }>; totalCount: number; hasMore: boolean; limit: number };

describe("clear_find_location", () => {
  let seam: Seam;
  afterEach(async () => {
    await seam?.close();
  });

  it("ranks exact > prefix > word-prefix > substring and returns ancestors with level", async () => {
    seam = await connect({ fixtures: { ClearLocationIndex: { data: INDEX_DATA } } });
    const result = await seam.callTool("clear_find_location", { query: "Darfur" });
    expect(result.isError).toBeFalsy();
    const out = result.structuredContent as Items;
    // "Darfur" is a word-prefix/substring of North/South Darfur (70) and a
    // prefix of "Darfour Camp"? No — "darfour" ≠ "darfur", so it's absent.
    expect(out.items.map((i) => i.name)).toEqual(["North Darfur", "South Darfur"]);
    expect(out.items[0]).toEqual({
      id: "sdn-nd",
      name: "North Darfur",
      level: 1,
      pCode: "SD01",
      ancestors: [{ id: "sdn", name: "Sudan", level: 0 }],
      score: 70,
    });
    expect(out.totalCount).toBe(2);
    expect(out.hasMore).toBe(false);
    expect(textJson(result)).toEqual(out);
  });

  it("puts an exact match first and orders ties by level then name", async () => {
    seam = await connect({ fixtures: { ClearLocationIndex: { data: INDEX_DATA } } });
    const out = (await seam.callTool("clear_find_location", { query: "kassala" })).structuredContent as Items;
    expect(out.items.map((i) => [i.id, i.score])).toEqual([
      ["sdn-ks", 100],
      ["sdn-ks-ks", 100],
    ]);
    // A district's ancestors list nearest-first.
    expect(out.items[1]!.ancestors).toEqual([
      { id: "sdn-ks", name: "Kassala", level: 1 },
      { id: "sdn", name: "Sudan", level: 0 },
    ]);
  });

  it("matches case- and diacritic-insensitively on a prefix", async () => {
    seam = await connect({ fixtures: { ClearLocationIndex: { data: INDEX_DATA } } });
    const out = (await seam.callTool("clear_find_location", { query: "ouaddai" })).structuredContent as Items;
    expect(out.items.map((i) => i.id)).toEqual(["tcd-x"]);
    const sud = (await seam.callTool("clear_find_location", { query: "sud" })).structuredContent as Items;
    // prefix (80) beats word-prefix (70): Sudan before South Sudan.
    expect(sud.items.map((i) => [i.name, i.score])).toEqual([
      ["Sudan", 80],
      ["South Sudan", 70],
    ]);
  });

  it("narrows by level and by withinLocationId (via ancestorIds)", async () => {
    seam = await connect({ fixtures: { ClearLocationIndex: { data: INDEX_DATA } } });
    const byLevel = (await seam.callTool("clear_find_location", { query: "kassala", level: 2 })).structuredContent as Items;
    expect(byLevel.items.map((i) => i.id)).toEqual(["sdn-ks-ks"]);

    const withinChad = (await seam.callTool("clear_find_location", { query: "dar", withinLocationId: "tcd" })).structuredContent as Items;
    expect(withinChad.items.map((i) => i.id)).toEqual(["tcd-dar"]);

    const withinNd = (await seam.callTool("clear_find_location", { query: "fasher", withinLocationId: "sdn-nd" })).structuredContent as Items;
    expect(withinNd.items.map((i) => i.id)).toEqual(["sdn-nd-ef"]);

    // withinLocationId includes the location itself.
    const self = (await seam.callTool("clear_find_location", { query: "sudan", withinLocationId: "sdn" })).structuredContent as Items;
    expect(self.items.map((i) => i.id)).toEqual(["sdn"]);
  });

  it("clamps limit to [1, 10] with default 5 and reports hasMore", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `w${i}`,
      name: `Wadi ${String(i).padStart(2, "0")}`,
      level: 2,
      pCode: null,
      ancestorIds: ["sdn"],
    }));
    seam = await connect({
      fixtures: { ClearLocationIndex: { data: { countries: [SUDAN], states: [], districts: many } } },
    });
    const dflt = (await seam.callTool("clear_find_location", { query: "wadi" })).structuredContent as Items;
    expect(dflt.limit).toBe(5);
    expect(dflt.items).toHaveLength(5);
    expect(dflt.totalCount).toBe(12);
    expect(dflt.hasMore).toBe(true);

    const big = (await seam.callTool("clear_find_location", { query: "wadi", limit: 50 })).structuredContent as Items;
    expect(big.limit).toBe(10);
    expect(big.items).toHaveLength(10);

    const small = (await seam.callTool("clear_find_location", { query: "wadi", limit: 0 })).structuredContent as Items;
    expect(small.limit).toBe(1);
    expect(small.items).toHaveLength(1);
  });

  it("loads the index once per process (one upstream request across calls) and never selects geometry", async () => {
    seam = await connect({ fixtures: { ClearLocationIndex: { data: INDEX_DATA } } });
    await seam.callTool("clear_find_location", { query: "sudan" });
    await seam.callTool("clear_find_location", { query: "chad" });
    await seam.callTool("clear_find_location", { query: "nowhere" });
    expect(seam.requests).toHaveLength(1);
    const req = seam.requests[0]!;
    expect(req.operationName).toBe("ClearLocationIndex");
    expect(req.headers["user-agent"]).toMatch(/\(clear_find_location\)$/);
    expect(req.query).not.toMatch(/\bgeometry\b|\bchildren\b|\bmetadata\b|\bparent\b/);
    expect(req.query).toMatch(/locations\(level: 0\)/);
    expect(req.query).toMatch(/locations\(level: 2\)/);
  });

  it("returns an empty result for no matches and rejects an empty query", async () => {
    seam = await connect({ fixtures: { ClearLocationIndex: { data: INDEX_DATA } } });
    const none = await seam.callTool("clear_find_location", { query: "Atlantis" });
    expect(none.isError).toBeFalsy();
    expect(none.structuredContent).toEqual({ items: [], totalCount: 0, hasMore: false, limit: 5 });

    // The SDK validates arguments against inputSchema before the tool runs
    // and relays the failure as a text isError naming the field.
    const empty = await seam.callTool("clear_find_location", { query: "   " });
    expect(empty.isError).toBe(true);
    const text = empty.content.find((c) => c.type === "text");
    expect(text && text.type === "text" ? text.text : "").toContain("query");
  });

  it("relays an upstream error when the index cannot load, and retries on the next call", async () => {
    seam = await connect({
      fixtures: {
        ClearLocationIndex: { reject: new Error("ECONNREFUSED") },
      },
    });
    const first = await seam.callTool("clear_find_location", { query: "sudan" });
    expect(first.isError).toBe(true);
    expect(textJson(first)).toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
      upstreamUrl: "https://api.clear.test/graphql",
    });

    seam.fixtures.on("ClearLocationIndex", { data: INDEX_DATA });
    const second = await seam.callTool("clear_find_location", { query: "sudan" });
    expect(second.isError).toBeFalsy();
    expect(seam.requests).toHaveLength(2);
  });
});
