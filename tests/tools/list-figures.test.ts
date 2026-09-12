import { afterEach, describe, expect, it } from "vitest";
import { connect, textJson, type Seam } from "../helpers/seam.js";

const figure = (i: number, overrides: Record<string, unknown> = {}) => ({
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
  ...overrides,
});

type Out = { items: Array<{ id: string; content: Record<string, unknown> }>; limit: number; hasMore: boolean; nextAfter: string | null };

describe("clear_list_figures", () => {
  let seam: Seam;
  afterEach(async () => {
    await seam?.close();
  });

  it("maps figures with s3Key as an opaque reference and transcription under content", async () => {
    seam = await connect({ fixtures: { ClearListFigures: { data: { reportFigures: [figure(1)] } } } });
    const result = await seam.callTool("clear_list_figures", { reportId: "rw-123" });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      items: [
        {
          id: "fig-1",
          reportId: "rw-123",
          reportTitle: "Sudan: Humanitarian Update",
          sourceUrl: "https://reliefweb.int/report/sudan/123",
          pageNumber: 1,
          kind: "map",
          isFullPage: false,
          s3Key: "figures/rw-123/1.png",
          locationIds: ["sdn-nd"],
          eventTypes: ["CE"],
          needSectors: ["Shelter"],
          timeRangeStart: "2026-08-01T00:00:00.000Z",
          timeRangeEnd: null,
          content: { title: "Figure 1", description: "IDP movements", transcription: { rows: [["North Darfur", 12000]] } },
        },
      ],
      limit: 10,
      hasMore: false,
      nextAfter: null,
    });
    expect(textJson(result)).toEqual(result.structuredContent);
    // Asks for limit + 1 rows so hasMore is exact in one request.
    expect(seam.requests[0]!.variables).toEqual({ reportId: "rw-123", first: 11 });
    expect(seam.requests[0]!.query).not.toMatch(/\bbbox\b|\bextractedByModel\b/);
  });

  it("forwards filters verbatim (from/to → timeRangeStart/End), clamps limit, pages by cursor", async () => {
    seam = await connect({
      fixtures: { ClearListFigures: { data: { reportFigures: [figure(1), figure(2), figure(3)] } } },
    });
    const out = (
      await seam.callTool("clear_list_figures", {
        locationIds: ["sdn"],
        eventTypes: ["FL"],
        needSectors: ["WASH"],
        kinds: ["chart", "table"],
        from: "2026-01-01",
        to: "2026-06-30",
        limit: 2,
        after: "fig-0",
      })
    ).structuredContent as Out;
    expect(seam.requests[0]!.variables).toEqual({
      locationIds: ["sdn"],
      eventTypes: ["FL"],
      needSectors: ["WASH"],
      kinds: ["chart", "table"],
      timeRangeStart: "2026-01-01",
      timeRangeEnd: "2026-06-30",
      first: 3,
      after: "fig-0",
    });
    expect(out.items.map((i) => i.id)).toEqual(["fig-1", "fig-2"]);
    expect(out).toMatchObject({ limit: 2, hasMore: true, nextAfter: "fig-2" });

    await seam.callTool("clear_list_figures", { limit: 500 });
    expect(seam.requests[1]!.variables).toEqual({ first: 26 });
    expect(seam.requests[1]!.headers["user-agent"]).toMatch(/\(clear_list_figures\)$/);
  });

  it("returns an empty page and relays errors", async () => {
    seam = await connect({ fixtures: { ClearListFigures: { data: { reportFigures: [] } } } });
    expect((await seam.callTool("clear_list_figures", {})).structuredContent).toEqual({
      items: [],
      limit: 10,
      hasMore: false,
      nextAfter: null,
    });
    seam.fixtures.on("ClearListFigures", { errors: [{ message: "nope", extensions: { code: "UNAUTHENTICATED" } }] });
    const err = await seam.callTool("clear_list_figures", {});
    expect(err.isError).toBe(true);
    expect(textJson(err)).toEqual({ code: "UNAUTHENTICATED", message: "nope" });
  });
});
