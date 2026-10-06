import { z } from "zod";

/**
 * The Task projection every Worker tool returns (ADR-0010). The same fields
 * are selected in each tool's document — codegen needs literal documents, so
 * the selection is repeated rather than shared as a fragment — and shaped
 * here once. `leaseToken` is the Worker's own secret: clear-api returns it to
 * the lease owner only, and every later write must carry it.
 */
export const taskItem = z.object({
  id: z.string(),
  kind: z.string().describe("The kind of work, e.g. `event.impact_prior`."),
  subjectType: z.string().describe("e.g. `event`."),
  subjectId: z.string().describe("The subject's id — pass to clear_get_event for an `event`."),
  payload: z.unknown().describe("Per-kind inputs, e.g. `{ horizonYears: 10 }`."),
  status: z.string().describe("PENDING | LEASED | COMPLETED | FAILED | CANCELLED."),
  leaseToken: z
    .string()
    .nullable()
    .describe("Minted by the claim; required by heartbeat, complete and fail. Null when not the lease owner."),
  leaseExpiresAt: z.string().nullable().describe("Heartbeat before this to keep the lease."),
  attempts: z.number().int(),
  maxAttempts: z.number().int(),
  cancelRequestedAt: z
    .string()
    .nullable()
    .describe("Set when the requester cancelled: stop work; the next write ends the Task CANCELLED."),
  outcome: z.string().nullable().describe("After completion: `produced` or `no_prior_found` for an ImpactPrior Task."),
  lastError: z.string().nullable(),
  completedAt: z.string().nullable(),
});
export type TaskItem = z.infer<typeof taskItem>;

/** What every Worker document selects on a Task, as clear-api returns it. */
export interface UpstreamTask {
  id: string;
  kind: string;
  subjectType: string;
  subjectId: string;
  payload: unknown;
  status: string;
  leaseToken?: string | null;
  leaseExpiresAt?: string | null;
  attempts: number;
  maxAttempts: number;
  cancelRequestedAt?: string | null;
  outcome?: string | null;
  lastError?: string | null;
  completedAt?: string | null;
}

export function toTaskItem(t: UpstreamTask): TaskItem {
  return {
    id: t.id,
    kind: t.kind,
    subjectType: t.subjectType,
    subjectId: t.subjectId,
    payload: t.payload,
    status: t.status,
    leaseToken: t.leaseToken ?? null,
    leaseExpiresAt: t.leaseExpiresAt ?? null,
    attempts: t.attempts,
    maxAttempts: t.maxAttempts,
    cancelRequestedAt: t.cancelRequestedAt ?? null,
    outcome: t.outcome ?? null,
    lastError: t.lastError ?? null,
    completedAt: t.completedAt ?? null,
  };
}

/** The lease's secret, as every write tool takes it. */
export const leaseTokenInput = z
  .string()
  .min(1)
  .describe("The `leaseToken` clear_claim_tasks returned for this Task. A stale one is FORBIDDEN / NOT_LEASE_OWNER.");

/** Worker tools write; say so to the client (the server's default is read-only). */
export const WRITE_ANNOTATIONS = { readOnlyHint: false, destructiveHint: false } as const;
