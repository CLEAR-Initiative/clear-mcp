import { afterEach, describe, expect, it } from "vitest";
import { connect, textJson, type Seam } from "../helpers/seam.js";

describe("clear_count", () => {
  let seam: Seam;
  afterEach(async () => {
    await seam?.close();
  });

  it("returns total + buckets and defaults groupBy to none", async () => {
    seam = await connect({
      fixtures: { ClearCount: { data: { entityStats: { total: 128, buckets: [{ key: "total", count: 128 }] } } } },
    });
    const result = await seam.callTool("clear_count", { entity: "event" });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      entity: "event",
      groupBy: "none",
      total: 128,
      buckets: [{ key: "total", count: 128 }],
    });
    expect(textJson(result)).toEqual(result.structuredContent);
    expect(seam.requests[0]!.variables).toEqual({ input: { entity: "event", groupBy: "none" } });
    expect(seam.requests[0]!.operationName).toBe("ClearCount");
  });

  it("groups by type to discover GLIDE codes, forwarding every filter verbatim", async () => {
    seam = await connect({
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
    });
    const args = {
      entity: "event",
      groupBy: "type",
      teamId: "team-1",
      locationId: "sdn-nd",
      eventTypes: ["CE", "FL"],
      severityMin: 2,
      severityMax: 5,
      from: "2026-08-01",
      to: "2026-09-01",
    };
    const out = (await seam.callTool("clear_count", args)).structuredContent as { buckets: unknown[] };
    expect(out.buckets).toEqual([
      { key: "CE", count: 18 },
      { key: "FL", count: 12 },
    ]);
    expect(seam.requests[0]!.variables).toEqual({ input: args });
    expect(seam.requests[0]!.headers["user-agent"]).toMatch(/\(clear_count\)$/);
  });

  it("supports week buckets for signals and rejects an unknown entity or groupBy up front", async () => {
    seam = await connect({
      fixtures: {
        ClearCount: {
          data: { entityStats: { total: 5, buckets: [{ key: "2026-W35", count: 2 }, { key: "2026-W36", count: 3 }] } },
        },
      },
    });
    const out = (await seam.callTool("clear_count", { entity: "signal", groupBy: "week" })).structuredContent as {
      groupBy: string;
      buckets: Array<{ key: string }>;
    };
    expect(out.groupBy).toBe("week");
    expect(out.buckets.map((b) => b.key)).toEqual(["2026-W35", "2026-W36"]);

    const badEntity = await seam.callTool("clear_count", { entity: "crisis" });
    expect(badEntity.isError).toBe(true);
    const badGroup = await seam.callTool("clear_count", { entity: "event", groupBy: "year" });
    expect(badGroup.isError).toBe(true);
    expect(seam.requests).toHaveLength(1);
  });

  it("relays upstream errors", async () => {
    seam = await connect({
      fixtures: {
        ClearCount: { errors: [{ message: "Awaiting approval", extensions: { code: "FORBIDDEN", subCode: "PENDING_APPROVAL" } }] },
      },
    });
    const result = await seam.callTool("clear_count", { entity: "alert" });
    expect(result.isError).toBe(true);
    expect(textJson(result)).toMatchObject({ code: "FORBIDDEN", subCode: "PENDING_APPROVAL" });
  });
});
