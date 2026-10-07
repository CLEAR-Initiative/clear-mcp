/**
 * clear_heartbeat_task, clear_complete_task, clear_fail_task (ADR-0010): the
 * three writes on a claimed Task. Each forwards the leaseToken verbatim,
 * returns the Task as clear-api left it, and relays the lease errors a
 * Worker branches on (NOT_LEASE_OWNER, NOT_LEASED) as values.
 */
import { afterEach, describe, expect, it } from "vitest";
import { connect, textJson, type Seam } from "../helpers/seam.js";

const WORKER_ENV = { CLEAR_MCP_WORKER: "1" } as const;
const TOKEN = "8c1f2a0e-0000-4000-8000-000000000001";

const TASK = {
  id: "task-1",
  kind: "event.impact_prior.web",
  subjectType: "event",
  subjectId: "evt-9",
  payload: { horizonYears: 10 },
  status: "LEASED",
  leaseToken: TOKEN,
  leaseExpiresAt: "2026-10-06T14:15:00.000Z",
  attempts: 1,
  maxAttempts: 3,
  cancelRequestedAt: null,
  outcome: null,
  lastError: null,
  completedAt: null,
};

const PROPOSAL = {
  hazardType: "FL",
  countryLocationId: "loc-sdn",
  geographicScope: "district",
  horizonYears: 10,
  numberOfCases: 2,
  // A whole-prior proposal, as a non-web Worker (`.clear`) still sends it; a
  // web Worker sends `cases` instead (V4, below).
  basis: [
    { tier: "clear", eventId: "evt-2021", occurredAt: "2021-08-10", scope: "district" },
    { tier: "clear", reportId: "rep-2019", occurredAt: "2019-09-01", scope: "country", quote: "…" },
  ],
  methodVersion: "clear-impact-prior-clear@0.1.0",
};

/** Two V4 cases a web Worker proposes: one matched to a CLEAR Event, with figures; one new to CLEAR, with none. */
const CASES = [
  {
    sourceUrl: "https://reliefweb.int/report/sudan/floods-2021",
    quote: "Flooding in Ag Geneina on 10 August 2021 displaced between 10,000 and 15,000 people.",
    occurredAt: "2021-08-10T00:00:00Z",
    locationLabel: "Ag Geneina, West Darfur",
    locationId: "loc-geneina",
    hazardType: "fl",
    geographicScope: "district",
    figures: [{ metric: "people_displaced_new", value: 12500, lowerBound: 10000, upperBound: 15000, unit: "people" }],
    matchedEventId: "evt-2021",
  },
  {
    sourceUrl: "https://example.test/floods-2019",
    quote: "Heavy rains caused floods across Sudan in September 2019.",
    occurredAt: "2019-09-01T00:00:00Z",
    locationLabel: "Sudan",
    hazardType: "fl",
    geographicScope: "country",
  },
];
const METHOD = "clear-impact-prior-web@0.4.0";
const USAGE = { model: "anthropic/claude-sonnet-5-5", inputTokens: 12000, outputTokens: 900, costUsd: 0.05 };

describe("Worker task writes", () => {
  let seam: Seam;
  afterEach(async () => {
    await seam?.close();
  });

  it("are absent without the flag", async () => {
    seam = await connect();
    const names = (await seam.client.listTools()).tools.map((t) => t.name);
    for (const n of ["clear_heartbeat_task", "clear_complete_task", "clear_fail_task", "clear_rejected_case_urls"]) {
      expect(names).not.toContain(n);
    }
  });

  it("clear_rejected_case_urls forwards the Event id and returns the rejected URLs", async () => {
    const urls = ["https://example.test/rejected-1", "https://example.test/rejected-2"];
    seam = await connect({ env: WORKER_ENV, fixtures: { ClearRejectedCaseUrls: { data: { rejectedCaseUrls: urls } } } });
    const result = await seam.callTool("clear_rejected_case_urls", { eventId: "evt-9" });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ eventId: "evt-9", urls });
    expect(textJson(result)).toEqual(result.structuredContent);
    expect(seam.requests[0]!.operationName).toBe("ClearRejectedCaseUrls");
    expect(seam.requests[0]!.variables).toEqual({ eventId: "evt-9" });
    const tool = (await seam.client.listTools()).tools.find((t) => t.name === "clear_rejected_case_urls");
    expect(tool!.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });

    const blank = await seam.callTool("clear_rejected_case_urls", { eventId: " " });
    expect(blank.isError).toBe(true);
    expect(seam.requests).toHaveLength(1);
  });

  it("clear_rejected_case_urls relays clear-api's refusal as a value", async () => {
    seam = await connect({
      env: WORKER_ENV,
      fixtures: { ClearRejectedCaseUrls: { errors: [{ message: "Forbidden", extensions: { code: "FORBIDDEN" } }] } },
    });
    const r = await seam.callTool("clear_rejected_case_urls", { eventId: "evt-9" });
    expect(r.isError).toBe(true);
    expect(textJson(r)).toMatchObject({ code: "FORBIDDEN" });
  });

  it("clear_heartbeat_task forwards id and leaseToken and returns the extended lease", async () => {
    const extended = { ...TASK, leaseExpiresAt: "2026-10-06T14:30:00.000Z" };
    seam = await connect({ env: WORKER_ENV, fixtures: { ClearHeartbeatTask: { data: { heartbeatTask: extended } } } });
    const result = await seam.callTool("clear_heartbeat_task", { id: "task-1", leaseToken: TOKEN });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ task: extended });
    expect(seam.requests[0]!.operationName).toBe("ClearHeartbeatTask");
    expect(seam.requests[0]!.variables).toEqual({ id: "task-1", leaseToken: TOKEN });
    const tool = (await seam.client.listTools()).tools.find((t) => t.name === "clear_heartbeat_task");
    expect(tool!.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
  });

  it("clear_heartbeat_task surfaces a cancellation as the Task's status", async () => {
    const cancelled = { ...TASK, status: "CANCELLED", leaseExpiresAt: null, cancelRequestedAt: "2026-10-06T14:05:00.000Z" };
    seam = await connect({ env: WORKER_ENV, fixtures: { ClearHeartbeatTask: { data: { heartbeatTask: cancelled } } } });
    const out = (await seam.callTool("clear_heartbeat_task", { id: "task-1", leaseToken: TOKEN })).structuredContent as {
      task: { status: string; cancelRequestedAt: string | null };
    };
    expect(out.task.status).toBe("CANCELLED");
    expect(out.task.cancelRequestedAt).toBe("2026-10-06T14:05:00.000Z");
  });

  it("clear_complete_task sends result, usage and the ImpactPrior proposal verbatim", async () => {
    const done = { ...TASK, status: "COMPLETED", outcome: "produced", leaseExpiresAt: null, completedAt: "2026-10-06T14:20:00.000Z" };
    seam = await connect({ env: WORKER_ENV, fixtures: { ClearCompleteTask: { data: { completeTask: done } } } });
    const result = await seam.callTool("clear_complete_task", {
      id: "task-1",
      leaseToken: TOKEN,
      result: { searched: ["clear_list_events", "web"], cases: 2 },
      usage: USAGE,
      impactPrior: PROPOSAL,
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ task: done });
    expect(textJson(result)).toEqual(result.structuredContent);
    expect(seam.requests[0]!.operationName).toBe("ClearCompleteTask");
    expect(seam.requests[0]!.variables).toEqual({
      id: "task-1",
      leaseToken: TOKEN,
      result: { searched: ["clear_list_events", "web"], cases: 2 },
      usage: USAGE,
      impactPrior: PROPOSAL,
    });
  });

  it("clear_complete_task sends a web Worker's cases and methodVersion verbatim (V4)", async () => {
    const done = { ...TASK, status: "COMPLETED", outcome: "produced", leaseExpiresAt: null, completedAt: "2026-10-06T14:20:00.000Z" };
    seam = await connect({ env: WORKER_ENV, fixtures: { ClearCompleteTask: { data: { completeTask: done } } } });
    const result = await seam.callTool("clear_complete_task", {
      id: "task-1",
      leaseToken: TOKEN,
      result: { searched: { clear: 2, web: 9 }, matched: 1 },
      cases: CASES,
      methodVersion: METHOD,
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ task: done });
    expect(seam.requests[0]!.variables).toEqual({
      id: "task-1",
      leaseToken: TOKEN,
      result: { searched: { clear: 2, web: 9 }, matched: 1 },
      cases: CASES,
      methodVersion: METHOD,
    });
  });

  it("clear_complete_task with an empty cases list sends it, for no_prior_found on a .web Task", async () => {
    const none = { ...TASK, status: "COMPLETED", outcome: "no_prior_found", leaseExpiresAt: null, completedAt: "2026-10-06T14:20:00.000Z" };
    seam = await connect({ env: WORKER_ENV, fixtures: { ClearCompleteTask: { data: { completeTask: none } } } });
    const result = await seam.callTool("clear_complete_task", {
      id: "task-1",
      leaseToken: TOKEN,
      result: { cases: 0 },
      cases: [],
      methodVersion: METHOD,
    });
    expect((result.structuredContent as { task: { outcome: string } }).task.outcome).toBe("no_prior_found");
    expect(seam.requests[0]!.variables).toEqual({ id: "task-1", leaseToken: TOKEN, result: { cases: 0 }, cases: [], methodVersion: METHOD });
  });

  it("clear_complete_task rejects malformed cases locally — nothing reaches clear-api", async () => {
    seam = await connect({ env: WORKER_ENV });
    const [c] = CASES;
    const fig = c!.figures[0]!;
    for (const args of [
      // Cases need a methodVersion, and never ride with an impactPrior.
      { cases: CASES },
      { cases: CASES, methodVersion: METHOD, impactPrior: PROPOSAL },
      { cases: [], methodVersion: METHOD, impactPrior: PROPOSAL },
      // The URL is an absolute http(s) URL, given once per completion.
      { cases: [{ ...c, sourceUrl: "ftp://example.test/x" }], methodVersion: METHOD },
      { cases: [{ ...c, sourceUrl: "reliefweb.int/report" }], methodVersion: METHOD },
      { cases: [c, { ...CASES[1], sourceUrl: c!.sourceUrl }], methodVersion: METHOD },
      // A date-time, not a date or a month.
      { cases: [{ ...c, occurredAt: "2021-08-10" }], methodVersion: METHOD },
      { cases: [{ ...c, occurredAt: "August 2021" }], methodVersion: METHOD },
      // Required text, a known scope.
      { cases: [{ ...c, quote: "  " }], methodVersion: METHOD },
      { cases: [{ ...c, geographicScope: "region" }], methodVersion: METHOD },
      // Figures: one of the seven metric types, non-negative, ordered bounds.
      { cases: [{ ...c, figures: [{ ...fig, metric: "people_killed" }] }], methodVersion: METHOD },
      { cases: [{ ...c, figures: [{ ...fig, value: -1, lowerBound: undefined }] }], methodVersion: METHOD },
      { cases: [{ ...c, figures: [{ ...fig, lowerBound: 20000 }] }], methodVersion: METHOD },
      { cases: [{ ...c, figures: [{ ...fig, upperBound: 100 }] }], methodVersion: METHOD },
      // At most 50 cases per completion.
      {
        cases: Array.from({ length: 51 }, (_, i) => ({ ...c, sourceUrl: `https://example.test/${i}` })),
        methodVersion: METHOD,
      },
    ]) {
      const r = await seam.callTool("clear_complete_task", { id: "task-1", leaseToken: TOKEN, result: {}, ...args });
      expect(r.isError, JSON.stringify(args).slice(0, 200)).toBe(true);
    }
    expect(seam.requests).toHaveLength(0);
  });

  it("clear_complete_task relays clear-api's verdict on a case it cannot check locally", async () => {
    seam = await connect({
      env: WORKER_ENV,
      fixtures: {
        ClearCompleteTask: {
          errors: [{ message: "cases[0].matchedEventId names an Event outside the Event's country", extensions: { code: "BAD_USER_INPUT" } }],
        },
      },
    });
    const r = await seam.callTool("clear_complete_task", { id: "task-1", leaseToken: TOKEN, result: {}, cases: CASES, methodVersion: METHOD });
    expect(r.isError).toBe(true);
    expect(textJson(r)).toMatchObject({ code: "BAD_USER_INPUT", message: expect.stringContaining("matchedEventId") });
  });

  it("clear_complete_task without a proposal records no_prior_found and omits the optional variables", async () => {
    const none = { ...TASK, status: "COMPLETED", outcome: "no_prior_found", leaseExpiresAt: null, completedAt: "2026-10-06T14:20:00.000Z" };
    seam = await connect({ env: WORKER_ENV, fixtures: { ClearCompleteTask: { data: { completeTask: none } } } });
    const result = await seam.callTool("clear_complete_task", { id: "task-1", leaseToken: TOKEN, result: { cases: 0 } });
    expect((result.structuredContent as { task: { outcome: string } }).task.outcome).toBe("no_prior_found");
    expect(seam.requests[0]!.variables).toEqual({ id: "task-1", leaseToken: TOKEN, result: { cases: 0 } });
  });

  it("clear_complete_task rejects a malformed proposal locally — zero cases, a bad scope, a bad tier, a bad date", async () => {
    seam = await connect({ env: WORKER_ENV });
    for (const impactPrior of [
      { ...PROPOSAL, numberOfCases: 0, basis: [] },
      { ...PROPOSAL, geographicScope: "continent" },
      { ...PROPOSAL, basis: [{ tier: "rumour", scope: "country" }] },
      { ...PROPOSAL, validFrom: "last spring" },
      // Date.parse accepts these; clear-api's Prisma layer does not.
      { ...PROPOSAL, validFrom: "2020-01-01" },
      { ...PROPOSAL, validTo: "2020-02-30T00:00:00Z" },
    ]) {
      // The SDK rejects it against the input schema before `run` (an MCP-level
      // error text, not our JSON value) — either way nothing reaches clear-api.
      const r = await seam.callTool("clear_complete_task", { id: "task-1", leaseToken: TOKEN, result: {}, impactPrior });
      expect(r.isError).toBe(true);
    }
    expect(seam.requests).toHaveLength(0);
  });

  it("clear_fail_task forwards the error and returns the Task's new status", async () => {
    // lastError is redacted for a worker (requester and admins only), so the real response carries null.
    const retry = { ...TASK, status: "PENDING", leaseToken: null, leaseExpiresAt: null, lastError: null };
    seam = await connect({ env: WORKER_ENV, fixtures: { ClearFailTask: { data: { failTask: retry } } } });
    const result = await seam.callTool("clear_fail_task", { id: "task-1", leaseToken: TOKEN, error: "model timed out" });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ task: retry });
    expect(seam.requests[0]!.operationName).toBe("ClearFailTask");
    expect(seam.requests[0]!.variables).toEqual({ id: "task-1", leaseToken: TOKEN, error: "model timed out" });

    const empty = await seam.callTool("clear_fail_task", { id: "task-1", leaseToken: TOKEN, error: "  " });
    expect(empty.isError).toBe(true);
    expect(seam.requests).toHaveLength(1);
  });

  it("relays the lease errors a Worker branches on, with subCode preserved", async () => {
    seam = await connect({
      env: WORKER_ENV,
      fixtures: {
        ClearHeartbeatTask: {
          errors: [{ message: "Your lease on this Task lapsed and was reclaimed; this leaseToken is stale", extensions: { code: "FORBIDDEN", subCode: "NOT_LEASE_OWNER" } }],
        },
        ClearCompleteTask: {
          errors: [{ message: "Task is COMPLETED, not LEASED", extensions: { code: "CONFLICT", subCode: "NOT_LEASED" } }],
        },
      },
    });
    const stale = await seam.callTool("clear_heartbeat_task", { id: "task-1", leaseToken: "old" });
    expect(stale.isError).toBe(true);
    expect(textJson(stale)).toMatchObject({ code: "FORBIDDEN", subCode: "NOT_LEASE_OWNER" });
    const gone = await seam.callTool("clear_complete_task", { id: "task-1", leaseToken: TOKEN, result: {} });
    expect(textJson(gone)).toMatchObject({ code: "CONFLICT", subCode: "NOT_LEASED" });
  });
});
