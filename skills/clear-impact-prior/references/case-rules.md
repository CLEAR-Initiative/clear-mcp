# What counts as a case

A **case** is one distinct prior occurrence of the same hazard in the same country, inside
the horizon, that you can cite. One entry in `basis` per case; `numberOfCases` equals the
length of `basis`.

## Must hold for every case

| Rule | Check |
|---|---|
| Same hazard type | The prior event's GLIDE code equals the Event's `hazardType` (one of `clear_get_event(...).types`). `FL` is not `FF`; `CE` is not `OT`. |
| Same country | The prior event lies under the Event's level-0 location (`countryLocationId`). A neighbouring country is out, however similar. |
| Inside the horizon | `occurredAt` is within `horizonYears` of now (default 10 years). Older is out. |
| Distinct | One case per prior event. Several reports of the same flood are one case: cite the best source, mention the rest in `note`. |
| Citable | `tier: "clear"` carries `eventId` or `reportId`; `tier: "web"` carries `sourceUrl`. Every case carries a short verbatim `quote`. |
| Not the input Event | Exclude the Event itself and anything that is plainly its earlier phase (same place, continuous dates, same cluster of signals). Those are duplicates, not priors. |

## Scope label

- `district` — the prior shares the Event's level-2 location.
- `country` — same country, different district (or no district known).

The proposal's `geographicScope` is `district` only when **every** case is `district`;
otherwise `country`. Say which cases are district-level in their own `scope` field either way.

## Tiers and order

1. **`clear` — CLEAR Events**: `clear_list_events` filtered by `eventTypes`, `locationId`
   (the country id includes everything beneath it), `from` / `to` for the horizon. Incident-tier
   Events are the strongest cases: they are already in CLEAR's vocabulary and linkable by id.
2. **`clear` — knowledge base**: `clear_search_knowledge_base` with `countryLocationId`,
   `eventTypes`, `from`. A passage that describes a specific prior occurrence (date, place,
   impact) is a case with `reportId` and `sourceUrl`; a general overview is background, not a case.
3. **`web`**: only after 1 and 2. Reputable humanitarian sources. Each case needs a URL and a
   quote. If you cannot quote it, you cannot cite it, so it is not a case.

## What is not a filter

- Season or month of year
- Climate drivers (El Niño, rainfall anomaly)
- Conflict or access context
- Severity

Note them on the case (`note`) when they matter for an analyst's reading. They never decide
whether something is a case.

## When there is no case

Complete the Task **without** `impactPrior`. Record in `result` what you searched (tools,
filters, queries, pages) and the candidates you excluded with the rule that excluded each.
"No prior found" is evidence too; a thin `result` is not.
