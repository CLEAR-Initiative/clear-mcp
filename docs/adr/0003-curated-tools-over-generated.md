---
status: accepted
---

# A small set of curated, task-shaped tools, not one tool per schema field

clear-api's GraphQL schema has ~90 queries and ~200 fields worth wrapping. The
mechanical option was to generate one MCP tool per query so nothing is ever
"missing". We chose instead to hand-write 15 curated tools in four groups
(Orient, Retrieve, Monitor, Analyse), each designed around a job the agent is
doing — resolve a place name, count events by week, read a situation analysis —
and each wrapping one or two upstream queries behind a fixed, narrow result
shape. Three reasons. Tool definitions live permanently in the agent's context,
and 200 of them cost tens of thousands of tokens on every turn. A model cannot
reliably choose between `alerts`, `alertsPage` and `alertsByLocation`, but it
can choose `clear_list_alerts`. And a curated selection set is a projection:
the tool selects only what its output needs, so PII relations, geometry and
signal bodies are never fetched by accident. Fields the curated set does not
cover are reachable through the flag-gated Escape hatch (ADR-0004) rather than
by growing the set.

## Consequences

- Every new upstream capability needs a deliberate tool (or an extension to
  one), with a test through the seam. That is the point.
- The PRD's requirement row says "13 curated tools"; the contract table and the
  code have 15 (`tests/tool-listing.test.ts` pins the names). 15 is correct.
- `clear_find_location` is backed by an in-memory index of levels 0–2 rather
  than clear-api's `resolveGazetteerLocation`, which is admin/pipeline-only and
  returns GeoNames ids, not `locations.id`.
- List results clamp `limit` to [1, 25] and truncate text at 500 chars; totals
  and breakdowns come from `clear_count`, so an agent never pages through a
  feed to count it.
