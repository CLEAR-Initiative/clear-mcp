import { afterEach, describe, expect, it } from "vitest";
import { connect, textJson, type Seam } from "../helpers/seam.js";

const ROW = {
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

describe("clear_get_datapoints", () => {
  let seam: Seam;
  afterEach(async () => {
    await seam?.close();
  });

  it("returns the aggregated bucket with onDemand and defaults to this calendar year, yearly", async () => {
    seam = await connect({ fixtures: { ClearGetDatapoints: { data: { aggregatedDatapoint: ROW } } } });
    const result = await seam.callTool("clear_get_datapoints", { locationId: "sdn" });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ item: ROW });
    expect(textJson(result)).toEqual(result.structuredContent);

    const y = new Date().getUTCFullYear();
    expect(seam.requests[0]!.variables).toEqual({
      locationId: "sdn",
      windowKind: "yearly",
      windowStart: `${y}-01-01T00:00:00.000Z`,
      windowEnd: `${y}-12-31T23:59:59.999Z`,
    });
    expect(seam.requests[0]!.operationName).toBe("ClearGetDatapoints");
    expect(seam.requests[0]!.query).not.toMatch(/\bestimatedCurrentTotals\b|\bvalidFrom\b/);
    expect(seam.requests[0]!.headers["user-agent"]).toMatch(/\(clear_get_datapoints\)$/);
  });

  it("forwards an explicit window, schemaVersion and asOf verbatim", async () => {
    seam = await connect({ fixtures: { ClearGetDatapoints: { data: { aggregatedDatapoint: null } } } });
    const args = {
      locationId: "sdn-nd",
      windowKind: "monthly",
      windowStart: "2026-06-01T00:00:00.000Z",
      windowEnd: "2026-06-30T23:59:59.999Z",
      schemaVersion: "v1",
      asOf: "2026-07-01T00:00:00.000Z",
    };
    const result = await seam.callTool("clear_get_datapoints", args);
    expect(result.structuredContent).toEqual({ item: null });
    expect(seam.requests[0]!.variables).toEqual(args);
  });

  it("requires locationId — never forwards a null scope — and rejects unknown windowKind", async () => {
    seam = await connect({ fixtures: { ClearGetDatapoints: { data: { aggregatedDatapoint: ROW } } } });
    const missing = await seam.callTool("clear_get_datapoints", {});
    expect(missing.isError).toBe(true);
    const empty = await seam.callTool("clear_get_datapoints", { locationId: "" });
    expect(empty.isError).toBe(true);
    const badKind = await seam.callTool("clear_get_datapoints", { locationId: "sdn", windowKind: "daily" });
    expect(badKind.isError).toBe(true);
    expect(seam.requests).toHaveLength(0);
  });

  it("relays upstream errors", async () => {
    seam = await connect({
      fixtures: {
        ClearGetDatapoints: { errors: [{ message: "Awaiting approval", extensions: { code: "FORBIDDEN", subCode: "PENDING_APPROVAL" } }] },
      },
    });
    const err = await seam.callTool("clear_get_datapoints", { locationId: "sdn" });
    expect(err.isError).toBe(true);
    expect(textJson(err)).toMatchObject({ code: "FORBIDDEN", subCode: "PENDING_APPROVAL" });
  });
});
