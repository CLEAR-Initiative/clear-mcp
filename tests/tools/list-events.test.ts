import { afterEach, describe, expect, it } from "vitest";
import { connect, textJson, type Seam } from "../helpers/seam.js";

const LOC = { id: "sdn-nd", name: "North Darfur", level: 1 };
const LONG = "x".repeat(600);

function event(overrides: Record<string, unknown> = {}) {
  return {
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
    generalLocation: { id: "sdn", name: "Sudan", level: 0 },
    signals: [{ id: "s1" }, { id: "s2" }, { id: "s3" }],
    ...overrides,
  };
}

function page(items: unknown[], totalCount = items.length, hasMore = false) {
  return { data: { eventsPage: { items, totalCount, hasMore } } };
}

type ListOut = {
  items: Array<Record<string, unknown> & { content: Record<string, unknown> }>;
  totalCount: number;
  hasMore: boolean;
  limit: number;
  offset: number;
};

describe("clear_list_events", () => {
  let seam: Seam;
  afterEach(async () => {
    await seam?.close();
  });

  it("returns the list envelope with third-party text only under `content`", async () => {
    seam = await connect({ fixtures: { ClearListEvents: page([event()], 42, true) } });
    const result = await seam.callTool("clear_list_events", {});
    expect(result.isError).toBeFalsy();
    const out = result.structuredContent as ListOut;
    expect(out).toEqual({
      items: [
        {
          id: "evt-1",
          severity: 4,
          types: ["CE", "FL"],
          firstSignalCreatedAt: "2026-09-01T10:00:00.000Z",
          lastSignalCreatedAt: "2026-09-03T08:30:00.000Z",
          startedAt: "2026-08-31T00:00:00.000Z",
          signalCount: 3,
          locationId: "sdn-nd",
          locationName: "North Darfur",
          content: { title: "Clashes reported near El Fasher", description: "Short description." },
        },
      ],
      totalCount: 42,
      hasMore: true,
      limit: 10,
      offset: 0,
    });
    expect(textJson(result)).toEqual(out);
    // Title/description live nowhere but `content`.
    const item = out.items[0]!;
    expect(Object.keys(item)).not.toContain("title");
    expect(Object.keys(item)).not.toContain("description");
  });

  it("without teamId the upstream input carries no teamId (global feed) and defaults limit 10 / offset 0", async () => {
    seam = await connect({ fixtures: { ClearListEvents: page([]) } });
    await seam.callTool("clear_list_events", {});
    expect(seam.requests).toHaveLength(1);
    expect(seam.requests[0]!.operationName).toBe("ClearListEvents");
    expect(seam.requests[0]!.variables).toEqual({ input: { limit: 10, offset: 0 } });
  });

  it("forwards every filter verbatim to the upstream input object", async () => {
    seam = await connect({ fixtures: { ClearListEvents: page([]) } });
    const args = {
      teamId: "team-sudan",
      locationId: "sdn-nd",
      eventTypes: ["CE", "FL"],
      severityMin: 2,
      severityMax: 5,
      from: "2026-08-01T00:00:00Z",
      to: "2026-09-01T00:00:00Z",
      orderBy: "SEVERITY_DESC",
      limit: 5,
      offset: 20,
    };
    await seam.callTool("clear_list_events", args);
    expect(seam.requests[0]!.variables).toEqual({ input: args });
    expect(seam.requests[0]!.headers["user-agent"]).toMatch(/\(clear_list_events\)$/);
  });

  it("clamps limit to [1, 25] and offset to >= 0, reporting the clamped values", async () => {
    seam = await connect({ fixtures: { ClearListEvents: page([]) } });
    const big = (await seam.callTool("clear_list_events", { limit: 500, offset: -3 })).structuredContent as ListOut;
    expect(big.limit).toBe(25);
    expect(big.offset).toBe(0);
    expect(seam.requests[0]!.variables).toEqual({ input: { limit: 25, offset: 0 } });

    const small = (await seam.callTool("clear_list_events", { limit: 0 })).structuredContent as ListOut;
    expect(small.limit).toBe(1);
    expect(seam.requests[1]!.variables).toEqual({ input: { limit: 1, offset: 0 } });
  });

  it("truncates descriptions over 500 chars and flags it", async () => {
    seam = await connect({
      fixtures: { ClearListEvents: page([event({ description: LONG }), event({ id: "evt-2" })]) },
    });
    const out = (await seam.callTool("clear_list_events", {})).structuredContent as ListOut;
    const cut = out.items[0]!.content;
    expect(cut.truncated).toBe(true);
    expect((cut.description as string).length).toBe(501); // 500 chars + ellipsis
    expect((cut.description as string).endsWith("…")).toBe(true);
    expect(out.items[1]!.content.truncated).toBeUndefined();
  });

  it("falls back origin → destination → general for the item location, null when unlocated", async () => {
    seam = await connect({
      fixtures: {
        ClearListEvents: page([
          event({ id: "a", originLocation: null, destinationLocation: { id: "d", name: "Dest", level: 2 } }),
          event({ id: "b", originLocation: null, destinationLocation: null }),
          event({ id: "c", originLocation: null, destinationLocation: null, generalLocation: null, signals: [] }),
        ]),
      },
    });
    const out = (await seam.callTool("clear_list_events", {})).structuredContent as ListOut;
    expect(out.items.map((i) => [i.locationId, i.locationName, i.signalCount])).toEqual([
      ["d", "Dest", 3],
      ["sdn", "Sudan", 3],
      [null, null, 0],
    ]);
  });

  it("never selects geometry, comments, feedbacks or signal bodies", async () => {
    seam = await connect({ fixtures: { ClearListEvents: page([]) } });
    await seam.callTool("clear_list_events", {});
    const q = seam.requests[0]!.query;
    expect(q).not.toMatch(/\bgeometry\b|\bcomments\b|\bfeedbacks\b|\bescalations\b|\balerts\b/);
    expect(q).toMatch(/signals\s*\{\s*id\s*\}/);
  });

  it("relays FORBIDDEN / PENDING_APPROVAL from clear-api", async () => {
    seam = await connect({
      fixtures: {
        ClearListEvents: {
          errors: [{ message: "Awaiting approval", extensions: { code: "FORBIDDEN", subCode: "PENDING_APPROVAL" } }],
        },
      },
    });
    const result = await seam.callTool("clear_list_events", {});
    expect(result.isError).toBe(true);
    expect(textJson(result)).toEqual({ code: "FORBIDDEN", subCode: "PENDING_APPROVAL", message: "Awaiting approval" });
  });
});
