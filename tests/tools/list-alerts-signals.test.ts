import { afterEach, describe, expect, it } from "vitest";
import { connect, textJson, type Seam } from "../helpers/seam.js";

const LOC = { id: "sdn-nd", name: "North Darfur", level: 1 };
const LONG = "y".repeat(700);

type ListOut = {
  items: Array<Record<string, unknown> & { content: Record<string, unknown> }>;
  totalCount: number;
  hasMore: boolean;
  limit: number;
  offset: number;
};

describe("clear_list_alerts", () => {
  let seam: Seam;
  afterEach(async () => {
    await seam?.close();
  });

  const alert = (overrides: Record<string, unknown> = {}) => ({
    id: "alrt-1",
    status: "published",
    createdAt: "2026-09-02T12:00:00.000Z",
    event: {
      id: "evt-1",
      severity: 3,
      types: ["FL"],
      title: "Flooding in El Fasher",
      description: "Rivers burst their banks.",
      firstSignalCreatedAt: "2026-09-01T10:00:00.000Z",
      originLocation: null,
      destinationLocation: null,
      generalLocation: LOC,
    },
    ...overrides,
  });

  it("maps alert + event fields into the envelope with text under `content`", async () => {
    seam = await connect({
      fixtures: { ClearListAlerts: { data: { alertsPage: { items: [alert()], totalCount: 1, hasMore: false } } } },
    });
    const result = await seam.callTool("clear_list_alerts", { status: "published" });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      items: [
        {
          id: "alrt-1",
          status: "published",
          createdAt: "2026-09-02T12:00:00.000Z",
          eventId: "evt-1",
          severity: 3,
          types: ["FL"],
          firstSignalCreatedAt: "2026-09-01T10:00:00.000Z",
          locationId: "sdn-nd",
          locationName: "North Darfur",
          content: { title: "Flooding in El Fasher", description: "Rivers burst their banks." },
        },
      ],
      totalCount: 1,
      hasMore: false,
      limit: 10,
      offset: 0,
    });
    expect(textJson(result)).toEqual(result.structuredContent);
    expect(seam.requests[0]!.variables).toEqual({ input: { status: "published", limit: 10, offset: 0 } });
  });

  it("forwards filters verbatim, clamps paging, and omits teamId for the global feed", async () => {
    seam = await connect({
      fixtures: { ClearListAlerts: { data: { alertsPage: { items: [], totalCount: 0, hasMore: false } } } },
    });
    const args = {
      teamId: "team-1",
      locationId: "sdn",
      eventTypes: ["FL"],
      severityMin: 1,
      severityMax: 3,
      from: "2026-01-01",
      to: "2026-12-31",
      orderBy: "SEVERITY_ASC",
    };
    await seam.callTool("clear_list_alerts", { ...args, limit: 99, offset: -1 });
    expect(seam.requests[0]!.variables).toEqual({ input: { ...args, limit: 25, offset: 0 } });
    expect(seam.requests[0]!.headers["user-agent"]).toMatch(/\(clear_list_alerts\)$/);

    await seam.callTool("clear_list_alerts", {});
    expect(seam.requests[1]!.variables).toEqual({ input: { limit: 10, offset: 0 } });
    expect(seam.requests[1]!.query).not.toMatch(/\buserAlerts\b|\bgeometry\b|\bcomments\b/);
  });

  it("truncates event descriptions at 500 chars", async () => {
    seam = await connect({
      fixtures: {
        ClearListAlerts: {
          data: {
            alertsPage: {
              items: [alert({ event: { ...alert().event, description: LONG } })],
              totalCount: 1,
              hasMore: false,
            },
          },
        },
      },
    });
    const out = (await seam.callTool("clear_list_alerts", {})).structuredContent as ListOut;
    expect(out.items[0]!.content.truncated).toBe(true);
    expect((out.items[0]!.content.description as string).length).toBe(501);
  });

  it("rejects an unknown status before contacting clear-api", async () => {
    seam = await connect();
    const result = await seam.callTool("clear_list_alerts", { status: "live" });
    expect(result.isError).toBe(true);
    expect(seam.requests).toHaveLength(0);
  });
});

describe("clear_list_signals", () => {
  let seam: Seam;
  afterEach(async () => {
    await seam?.close();
  });

  const signal = (overrides: Record<string, unknown> = {}) => ({
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

  it("maps signal fields with sourceName and text under `content`", async () => {
    seam = await connect({
      fixtures: { ClearListSignals: { data: { signalsPage: { items: [signal()], totalCount: 7, hasMore: true } } } },
    });
    const result = await seam.callTool("clear_list_signals", {});
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      items: [
        {
          id: "sig-1",
          sourceName: "dataminr",
          publishedAt: "2026-09-03T07:00:00.000Z",
          severity: 2,
          url: "https://example.org/post/1",
          locationId: "sdn-nd",
          locationName: "North Darfur",
          content: { title: "Reports of shelling", description: "Residents report shelling overnight." },
        },
      ],
      totalCount: 7,
      hasMore: true,
      limit: 10,
      offset: 0,
    });
  });

  it("forwards sourceNames and the shared filters verbatim; clamps paging", async () => {
    seam = await connect({
      fixtures: { ClearListSignals: { data: { signalsPage: { items: [], totalCount: 0, hasMore: false } } } },
    });
    const args = {
      sourceNames: ["acled", "dataminr"],
      teamId: "team-1",
      locationId: "sdn",
      severityMin: 4,
      from: "2026-09-01T00:00:00Z",
      orderBy: "PUBLISHED_ASC",
    };
    await seam.callTool("clear_list_signals", { ...args, limit: 3, offset: 6 });
    expect(seam.requests[0]!.variables).toEqual({ input: { ...args, limit: 3, offset: 6 } });
    expect(seam.requests[0]!.query).not.toMatch(/\bgeometry\b|\bcomments\b|\bfeedbacks\b|\bevents\b|\bmedia\b|\brawS3Key\b/);
  });

  it("truncates long signal text, nulls a missing url, and relays upstream errors", async () => {
    seam = await connect({
      fixtures: {
        ClearListSignals: {
          data: { signalsPage: { items: [signal({ url: null, description: LONG })], totalCount: 1, hasMore: false } },
        },
      },
    });
    const out = (await seam.callTool("clear_list_signals", {})).structuredContent as ListOut;
    expect(out.items[0]!.url).toBeNull();
    expect(out.items[0]!.content.truncated).toBe(true);

    seam.fixtures.on("ClearListSignals", {
      errors: [{ message: "You must be logged in", extensions: { code: "UNAUTHENTICATED" } }],
    });
    const err = await seam.callTool("clear_list_signals", {});
    expect(err.isError).toBe(true);
    expect(textJson(err)).toEqual({ code: "UNAUTHENTICATED", message: "You must be logged in" });
  });
});
