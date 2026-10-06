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
  kind: "event.impact_prior",
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
  basis: [
    { tier: "clear", eventId: "evt-2021", occurredAt: "2021-08-10", scope: "district", quote: "…" },
    { tier: "web", sourceUrl: "https://example.test/floods-2019", occurredAt: "2019-09-01", scope: "country", quote: "…" },
  ],
  methodVersion: "clear-impact-prior@0.1.0",
};
const USAGE = { model: "anthropic/claude-sonnet-5-5", inputTokens: 12000, outputTokens: 900, costUsd: 0.05 };

describe("Worker task writes", () => {
  let seam: Seam;
  afterEach(async () => {
    await seam?.close();
  });

  it("are absent without the flag", async () => {
    seam = await connect();
    const names = (await seam.client.listTools()).tools.map((t) => t.name);
    for (const n of ["clear_heartbeat_task", "clear_complete_task", "clear_fail_task"]) expect(names).not.toContain(n);
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
