/**
 * clear_claim_tasks (ADR-0010): the first Worker tool. Present only under
 * CLEAR_MCP_WORKER=1, write-annotated, forwarding the claim mutation with
 * the limit clamped, and relaying clear-api's errors as values.
 */
import { afterEach, describe, expect, it } from "vitest";
import { connect, textJson, type Seam } from "../helpers/seam.js";

const WORKER_ENV = { CLEAR_MCP_WORKER: "1" } as const;

const LEASED = {
  id: "task-1",
  kind: "event.impact_prior",
  subjectType: "event",
  subjectId: "evt-9",
  payload: { horizonYears: 10 },
  status: "LEASED",
  leaseToken: "8c1f2a0e-0000-4000-8000-000000000001",
  leaseExpiresAt: "2026-10-06T14:15:00.000Z",
  attempts: 1,
  maxAttempts: 3,
  cancelRequestedAt: null,
  outcome: null,
  lastError: null,
  completedAt: null,
};

describe("clear_claim_tasks", () => {
  let seam: Seam;
  afterEach(async () => {
    await seam?.close();
  });

  it("is absent without the flag, and calling it then is an error before any request", async () => {
    seam = await connect();
    const names = (await seam.client.listTools()).tools.map((t) => t.name);
    expect(names).not.toContain("clear_claim_tasks");
    const denied = await seam.callTool("clear_claim_tasks", { kind: "event.impact_prior" });
    expect(denied.isError).toBe(true);
    expect(seam.requests).toHaveLength(0);
  });

  it("is listed as a write tool with the flag", async () => {
    seam = await connect({ env: WORKER_ENV });
    const tool = (await seam.client.listTools()).tools.find((t) => t.name === "clear_claim_tasks");
    expect(tool).toBeDefined();
    expect(tool!.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(tool!.outputSchema).toBeDefined();
  });

  it("leases Tasks of a kind and returns them with their leaseToken", async () => {
    seam = await connect({ env: WORKER_ENV, fixtures: { ClearClaimTasks: { data: { claimTasks: [LEASED] } } } });
    const result = await seam.callTool("clear_claim_tasks", { kind: "event.impact_prior" });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ tasks: [LEASED], count: 1 });
    expect(textJson(result)).toEqual(result.structuredContent);

    const req = seam.requests[0]!;
    expect(req.operationName).toBe("ClearClaimTasks");
    expect(req.query).toMatch(/^\s*mutation ClearClaimTasks/);
    expect(req.variables).toEqual({ kind: "event.impact_prior", limit: 1 });
    expect(req.headers.authorization).toBe("Bearer sk_live_test_key_000");
    expect(req.headers["user-agent"]).toMatch(/\(clear_claim_tasks\)$/);
  });

  it("clamps limit to [1, 10] and returns an empty list when nothing is waiting", async () => {
    seam = await connect({ env: WORKER_ENV, fixtures: { ClearClaimTasks: { data: { claimTasks: [] } } } });
    const none = await seam.callTool("clear_claim_tasks", { kind: "event.impact_prior", limit: 50 });
    expect(none.structuredContent).toEqual({ tasks: [], count: 0 });
    expect(seam.requests[0]!.variables).toEqual({ kind: "event.impact_prior", limit: 10 });
    await seam.callTool("clear_claim_tasks", { kind: "event.impact_prior", limit: 0 });
    expect(seam.requests[1]!.variables).toEqual({ kind: "event.impact_prior", limit: 1 });
  });

  it("rejects an empty kind locally and relays FORBIDDEN for a non-worker key as a value", async () => {
    seam = await connect({
      env: WORKER_ENV,
      fixtures: {
        ClearClaimTasks: { errors: [{ message: "Insufficient permissions", extensions: { code: "FORBIDDEN" } }] },
      },
    });
    const bad = await seam.callTool("clear_claim_tasks", { kind: " " });
    expect(bad.isError).toBe(true);
    expect(seam.requests).toHaveLength(0);

    const forbidden = await seam.callTool("clear_claim_tasks", { kind: "event.impact_prior" });
    expect(forbidden.isError).toBe(true);
    expect(textJson(forbidden)).toMatchObject({ code: "FORBIDDEN", message: "Insufficient permissions" });
  });
});
