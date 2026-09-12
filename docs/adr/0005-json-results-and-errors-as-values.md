---
status: accepted
---

# Tool results are structured JSON, and upstream failures are returned as values, not thrown

Every tool returns the same JSON twice — as a `text` block and as
`structuredContent` validated against the tool's `outputSchema` — and every
failure comes back as `isError: true` with a `{ code, subCode?, message,
upstreamUrl? }` object preserved verbatim from clear-api's GraphQL
`extensions`. Markdown results were rejected because they read better but lose
the ids and structure the model needs to chain calls (a `locationId` from one
tool into the next). Throwing on upstream errors was rejected because the MCP
SDK surfaces a thrown error as a generic protocol failure, and the message
clear-api writes for `FORBIDDEN` / `PENDING_APPROVAL` ("your account is
awaiting approval") is meant to be relayed to the human as-is rather than
retried. Text that originated outside CLEAR — signal bodies, report chunks,
comments, LLM summaries derived from them — is returned only under a `content`
key so the agent can treat it as data, never as instructions; this is the same
threat that motivates ADR-0002.

## Consequences

- A tool never throws for an upstream condition. `UPSTREAM_UNAVAILABLE`
  carries the configured URL so a misconfigured `CLEAR_API_URL` is diagnosable
  from the tool result alone.
- `me` is unguarded in clear-api and returns `null` for an unknown key, so
  `clear_whoami` selects `myTeams` (which is `requireAuth`) in the same
  document to turn a revoked key into `UNAUTHENTICATED`; a `pending` user's
  `clear_whoami` succeeds and only content reads raise `PENDING_APPROVAL`.
- There is no per-tool `locale` argument. `x-force-locale` is a process-level
  config choice because a non-`en` locale can enqueue translation work in
  clear-api, and that side effect should not be in the model's hands.
