import { afterEach, describe, expect, it } from "vitest";
import { connect, textJson, type Seam } from "../helpers/seam.js";

const LOC = { id: "sdn-nd", name: "North Darfur", level: 1 };
const GEN = { id: "sdn", name: "Sudan", level: 0 };
const LONG = "z".repeat(2000);

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

describe("clear_get_event", () => {
  let seam: Seam;
  afterEach(async () => {
    await seam?.close();
  });

  it("returns the full item untruncated, signals capped at 50 with the true count", async () => {
    seam = await connect({ fixtures: { ClearGetEvent: { data: { event: EVENT } } } });
    const result = await seam.callTool("clear_get_event", { id: "evt-1" });
    expect(result.isError).toBeFalsy();
    const { item } = result.structuredContent as { item: Record<string, unknown> };
    expect(item).toMatchObject({
      id: "evt-1",
      severity: 4,
      types: ["CE"],
      casualties: 12,
      populationAffected: "15000",
      populationDisplaced: null,
      rank: 0.82,
      isDummy: false,
      locations: { origin: LOC, destination: null, general: GEN },
      alerts: [{ id: "alrt-1", status: "published" }],
      signalCount: 60,
      content: { title: "Clashes", description: LONG },
    });
    const signals = item.signals as Array<{ id: string; sourceName: string; publishedAt: string }>;
    expect(signals).toHaveLength(50);
    expect(signals[0]).toEqual({ id: "sig-0", sourceName: "dataminr", publishedAt: "2026-09-01T10:00:00.000Z" });
    expect((item.content as { truncated?: boolean }).truncated).toBeUndefined();
    expect(textJson(result)).toEqual(result.structuredContent);

    expect(seam.requests[0]!.variables).toEqual({ id: "evt-1" });
    const q = seam.requests[0]!.query;
    expect(q).not.toMatch(/\bgeometry\b|\bcomments\b|\bfeedbacks\b|\bescalations\b|\bdescriptionSignals\b/);
    // Signals: references only — never their text.
    expect(q).not.toMatch(/signals\s*\{[^}]*\b(title|description)\b/);
  });

  it("returns item: null for an unknown id and relays errors", async () => {
    seam = await connect({ fixtures: { ClearGetEvent: { data: { event: null } } } });
    const missing = await seam.callTool("clear_get_event", { id: "nope" });
    expect(missing.isError).toBeFalsy();
    expect(missing.structuredContent).toEqual({ item: null });

    seam.fixtures.on("ClearGetEvent", {
      errors: [{ message: "Awaiting approval", extensions: { code: "FORBIDDEN", subCode: "PENDING_APPROVAL" } }],
    });
    const err = await seam.callTool("clear_get_event", { id: "evt-1" });
    expect(err.isError).toBe(true);
    expect(textJson(err)).toMatchObject({ code: "FORBIDDEN", subCode: "PENDING_APPROVAL" });

    const empty = await seam.callTool("clear_get_event", { id: "" });
    expect(empty.isError).toBe(true);
    expect(seam.requests).toHaveLength(2);
  });
});

describe("clear_get_alert", () => {
  let seam: Seam;
  afterEach(async () => {
    await seam?.close();
  });

  it("returns alert + untruncated event text, locations and eventId", async () => {
    seam = await connect({
      fixtures: {
        ClearGetAlert: {
          data: {
            alert: {
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
            },
          },
        },
      },
    });
    const result = await seam.callTool("clear_get_alert", { id: "alrt-1" });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      item: {
        id: "alrt-1",
        status: "published",
        createdAt: "2026-09-02T12:00:00.000Z",
        updatedAt: "2026-09-02T13:00:00.000Z",
        eventId: "evt-1",
        severity: 3,
        types: ["FL"],
        firstSignalCreatedAt: "2026-09-01T10:00:00.000Z",
        lastSignalCreatedAt: "2026-09-02T10:00:00.000Z",
        startedAt: "2026-08-30T00:00:00.000Z",
        locations: { origin: null, destination: LOC, general: GEN },
        content: { title: "Flooding", description: LONG },
      },
    });
    expect(seam.requests[0]!.query).not.toMatch(/\buserAlerts\b|\bgeometry\b|\bsignals\b/);
  });

  it("returns item: null for an unknown id", async () => {
    seam = await connect({ fixtures: { ClearGetAlert: { data: { alert: null } } } });
    expect((await seam.callTool("clear_get_alert", { id: "x" })).structuredContent).toEqual({ item: null });
  });
});

describe("clear_get_signal", () => {
  let seam: Seam;
  afterEach(async () => {
    await seam?.close();
  });

  it("returns the signal with untruncated text, source grade and event ids", async () => {
    seam = await connect({
      fixtures: {
        ClearGetSignal: {
          data: {
            signal: {
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
            },
          },
        },
      },
    });
    const result = await seam.callTool("clear_get_signal", { id: "sig-1" });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      item: {
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
        source: { name: "dataminr", type: "social", reliability: 3 },
        locations: { origin: LOC, destination: null, general: null },
        eventIds: ["evt-1", "evt-2"],
        content: { title: "Shelling", description: LONG },
      },
    });
    const q = seam.requests[0]!.query;
    expect(q).not.toMatch(/\bgeometry\b|\bcomments\b|\bfeedbacks\b|\bmedia\b|\brawS3Key\b|\blocationChallenge\b/);
    expect(seam.requests[0]!.headers["user-agent"]).toMatch(/\(clear_get_signal\)$/);
  });

  it("returns item: null for an unknown id", async () => {
    seam = await connect({ fixtures: { ClearGetSignal: { data: { signal: null } } } });
    expect((await seam.callTool("clear_get_signal", { id: "x" })).structuredContent).toEqual({ item: null });
  });
});
