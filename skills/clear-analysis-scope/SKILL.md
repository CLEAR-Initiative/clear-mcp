---
name: clear-analysis-scope
description: Fix what an answer is about before reading any CLEAR data — the locations and/or crisis plus the period — and apply that scope consistently to every tool call, including multi-district scopes that need a fan-out. Use whenever a question names a place, a crisis, an area of operation or a time window.
---

# Analysis scope

Every CLEAR answer is about a **scope**: a geography plus a period. Fix it first, restate it to
the user, and apply it to every subsequent call. An answer whose scope is implicit is an answer
nobody can check.

`clear-briefing` explains how `clear_whoami` and `clear_find_location` behave; this skill is
about what you do with their output. clear-mcp is read-only (ADR-0002) and holds no state, so a
scope here is a **convention carried in the conversation**, not a stored entity:

```json
{
  "locations": [{ "id": "…", "name": "North Darfur", "level": 1, "pCode": "SD05" }],
  "aboutCrisisId": null,
  "periodStart": "2026-01-01",
  "periodEnd": null,
  "teamId": null
}
```

`periodEnd: null` means rolling (up to now). Restate this block at the top of anything you produce.

## Validity

Reject a scope that has **neither locations nor a crisis** — there is nothing to filter by, and a
whole-corpus read silently mixes countries (ADR-0006). `periodEnd` must be on or after
`periodStart`.

Free geometry (a drawn box or polygon) **cannot be expressed through this server**:
`clear_find_location` covers levels 0–2 only. If the user wants an arbitrary area, say so and offer
the nearest administrative approximation — a list of districts — rather than pretending.

## Scope kinds

| Kind | How to build it |
|---|---|
| Country (default) | The team's level-0 location from `clear_whoami`, or `clear_find_location(level: 0)`. |
| Crisis | `clear_list_crises` → pick by `location` / `content.title`, keep its `id` and `eventIds`. There is no location filter on that tool: page it and match client-side. |
| Created (area of operation, district group) | One `clear_find_location(level: 2, withinLocationId: <country>)` per district; the scope is the union of the ids. |
| Custom geometry | Not available. Approximate with districts and say that is what you did. |

When a scope covers several districts, or a name was ambiguous (equal top `score`s), state the
resolved list and get agreement **before** spending a call per district.

## Applying a scope

- **Monitor tools take exactly one `locationId`**, meaning "this location or anything beneath
  it". A multi-district scope is therefore *one call per district*, unioned client-side and
  deduplicated by row `id`.
- **Never mix a parent and one of its own descendants** in the same scope — the subtree semantics
  double-count every row under the child.
- **Totals come from `clear_count`, never from paging.** For a multi-district scope, sum
  `clear_count` per district; if the districts are disjoint the sum is exact.
- **`teamId` and `locationId` are different narrowings.** `teamId` applies the team's location
  scope; `locationId` applies the geography you resolved. Use one deliberately; do not assume they
  agree.
- **Period**: pass the scope's period as `from` / `to` on the Monitor tools and
  `windowStart` / `windowEnd` on `clear_get_datapoints`. The Analyse tools default to the current
  UTC calendar year; if your scope's period differs, pass it explicitly rather than accepting the
  default silently.
- **`clear_get_situation_analysis` takes a level-0 id only.** Below country level there is no
  stored analysis to read — compose from datapoints, knowledge base and events instead
  (`clear-situation-analysis`).

## Cost

One `clear_find_location` per distinct name; keep the ids for the rest of the conversation. Do not
enumerate a country's districts speculatively — read the country scope first and drill only where
the user asks. A district-by-district sweep of a whole country is the single most expensive thing
you can do here; if it is genuinely needed, say what it will cost before starting.
