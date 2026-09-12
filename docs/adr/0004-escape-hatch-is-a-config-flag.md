---
status: accepted
---

# The raw GraphQL escape hatch is enabled per Consumer by configuration, never by role

`clear_graphql` and `clear_schema_type` let a developer run any read-only
query and inspect the schema. They register only when the Consumer's config
sets `CLEAR_MCP_RAW_GRAPHQL=1` (the literal `1`; `true` and `yes` do nothing).
The alternatives were "always on" — fine for developers, a liability for the
analyst audience, who would have a tool in context that can pull any field of
any type and whose results are not size-capped — and "on for admins", which
would make the MCP layer reason about clear-api roles it is supposed to know
nothing about (ADR-0001). A config flag keeps the boundary explicit and
per-process: the same binary is a curated product for one Consumer and a
developer console for another, and nothing in the tool set depends on who the
Caller is. Even when enabled, the hatch parses and validates every document
against the committed schema snapshot and rejects any non-`query` operation
before a network call (ADR-0002).

## Consequences

- The hosted V2 mode must never set the flag; it is a local-developer feature.
- `clear_schema_type` reads the snapshot, not the target, so it can describe a
  field the deployed clear-api has since renamed. The nightly drift job is the
  alarm for that.
- `tests/tool-listing.test.ts` asserts the two tools are absent by default and
  present, in that order, when flagged.
