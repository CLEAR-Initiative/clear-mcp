---
status: accepted
amends: 0002
---

# Worker tools behind `CLEAR_MCP_WORKER`, the one write path

ADR-0002 made v1 strictly read-only because much of what an agent reads
through these tools is attacker-writable text, and a write-capable server
would let an injection create signals, escalate events or edit a crisis under
the caller's valid key. That reasoning stands. This ADR amends it for one
narrow case: a **Task Worker** draining clear-api's generic Task queue
(clear-api ADR-0010) — first, a scheduled Claude Code routine producing
ImpactPriors — needs to claim, heartbeat, complete and fail Tasks, and the
only door to clear-api's database is GraphQL.

**Decision**: four typed Worker tools — `clear_claim_tasks`,
`clear_heartbeat_task`, `clear_complete_task`, `clear_fail_task` — registered
only when the process sets `CLEAR_MCP_WORKER=1` (the literal `1`, as for the
escape hatch, ADR-0004). They are not Curated tools: not in the Tool library
(ADR-0009), not in any install channel's settings, absent from `tools/list`
for every other Consumer. The escape hatch still rejects any `mutation` or
`subscription` before a network call; these four documents are the only
writes clear-mcp can ever send, and each is pinned to the schema snapshot.

The compensating control for an unattended, prompt-injectable Worker is not
in clear-mcp at all: the Caller runs as clear-api's narrow `worker` role,
which can write nothing but Tasks it holds the lease on (each write carries a
per-claim `leaseToken`) and ImpactPriors in state `proposed`, which a named
analyst or admin must accept before they count. An injected instruction can
at worst waste a Task; it cannot touch Signals, Events, Alerts or Crises, and
it cannot promote its own output.

## Considered options

- **Enable mutations through the escape hatch for Workers.** ADR-0002 says
  explicitly not to; it would also hand a Worker every mutation in the
  schema, bounded only by the role, with no typed contract or tests.
- **A role gate instead of a config flag.** Rejected for the same reason as
  ADR-0004: clear-mcp would have to reason about clear-api roles, and the
  same binary would behave differently per Caller. A flag keeps it a
  per-process choice.
- **A separate "clear-worker" package.** One more thing to version and
  release for four tools that share the upstream client, the snapshot and
  the seam; the flag achieves the isolation.

## Consequences

- `ToolDefinition` gains an optional `annotations` override; the Worker tools
  register with `readOnlyHint: false, destructiveHint: false`. Every other
  tool stays `readOnlyHint: true`, and `tests/tool-listing.test.ts` pins both
  lists.
- `tests/packaging.test.ts` pins that neither the plugin nor the `.mcpb`
  sets `CLEAR_MCP_WORKER`; the routine sets it in its own environment.
- `clear_whoami` reports `workerEnabled` beside `escapeHatchEnabled`.
- The hosted V2 mode must never set the flag.
