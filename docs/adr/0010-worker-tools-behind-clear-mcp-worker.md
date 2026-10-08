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

The compensating control for an unattended, prompt-injectable Worker comes
in two layers. In clear-mcp, the four typed documents above are the only
writes the process can send: through its tools an injected instruction can at
worst waste a Task, and it cannot promote its own output — the Task writes
carry a per-claim `leaseToken`, and an ImpactPrior lands as `proposed`, which
a named analyst or admin must accept before it counts. In clear-api, the
Caller runs as the narrow `worker` role, which bounds the **key** wherever it
is used — including outside clear-mcp, which matters because a Worker runtime
that can read its own MCP config (a Claude Code routine with a shell, say)
holds the key itself. Since clear-api PR #192 the role reads content like any
approved user and writes nothing but the four Task mutations: every other
mutation refuses `worker` before any lookup, and clear-api's
`tests/schema/worker-write-scope.test.ts` walks the whole `Mutation` type to
keep it that way. (#190, which introduced the role, briefly let it comment,
leave feedback and mint API keys; #192 closed that before either reached
production.) A leaked worker key can therefore at worst read content and
claim, complete or fail Tasks — proposing ImpactPriors no one has accepted;
rotate it by revoking the key or deactivating the worker user.

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

## Amendment (V4, 2026-10-07): cases, and one Worker read

clear-api V4 (its ADR-0010 amendment, #733) makes the **case** the unit an analyst decides:
a web Worker completes an `event.impact_prior.web` Task with `cases` — one CaseProposal per
past incident, with its source, verbatim quote, outcome figures on the Domain Ontology's
seven metric types, and the CLEAR Event it matches — instead of a whole ImpactPrior.

- `clear_complete_task` gains `cases` and `methodVersion`. It is the same mutation, so the
  set of writes clear-mcp can send does not grow. The tool checks locally what clear-api
  checks without a database (URL, date-time, scope, metric, bounds, limits, never `cases`
  with `impactPrior`) so a malformed proposal fails before the network.
- `clear_rejected_case_urls` is a fifth Worker tool and the first **read** among them: the
  source URLs already rejected for an Event, which a web Worker must never propose again.
  It sits behind `CLEAR_MCP_WORKER` rather than among the Curated tools because only a
  Worker has a use for it — an analyst sees rejected cases with their reasons in clear-mvp —
  and clear-api allows it to the `worker` role, platform admins and analysts only. It keeps
  the default read-only annotations; `tests/tool-listing.test.ts` pins it as the one Worker
  tool with `readOnlyHint: true`.
- Rejected: a Curated `clear_list_case_proposals`. Case review is clear-mvp's job, and a
  Curated tool would put a decision queue in every analyst's agent for no workflow that
  needs it.

## Amendment (0.4.1, 2026-10-08): CLEAR's knowledge base before the web

The Dagster Worker (`event.impact_prior.clear`) is being retired from impact priors: its
LLM-proposed CLEAR prior is redundant now that clear-api computes the prior from accepted
history (clear-api #738). It was the only Worker that read CLEAR's **knowledge base**
(ingested ReliefWeb reports), so the web skill takes that over. "CLEAR first" now means its
Events, then `clear_search_knowledge_base` (same country, hazard and horizon), then the web.
A knowledge-base passage is citable as it stands: its `sourceUrl` and a verbatim quote from
its `chunkText`, without opening a page. Its cases are matched against CLEAR's Events like
any other. No new tool: `clear_search_knowledge_base` is an existing read. Method version
`clear-impact-prior-web@0.4.1`.
