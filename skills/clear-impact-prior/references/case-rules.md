# What counts as a case

A **case** is one distinct prior occurrence of the same hazard in the same country, inside
the horizon, that you can cite from the web. One entry in `basis` per case; `numberOfCases`
equals the length of `basis`.

## Must hold for every case

| Rule | Check |
|---|---|
| Same hazard type | The prior event's GLIDE code equals the Event's `hazardType` (one of `clear_get_event(...).types`). `FL` is not `FF`; `CE` is not `OT`. When a source does not give a code, map its description honestly — a "flash flood" is `FF`, a riverine or seasonal flood `FL` — and say so in `note`. |
| Same country | The prior event lies under the Event's level-0 location (`countryLocationId`). A neighbouring country is out, however similar. |
| Inside the horizon | `occurredAt` is within `horizonYears` of now (default 10 years). Older is out. |
| Distinct | One case per prior event. Several reports of the same flood are one case: cite the best source, mention the rest in `note`. A GLIDE number, where the source gives one, is the cleanest test of distinctness. |
| Citable | `tier: "web"` with a `sourceUrl` you opened, a short verbatim `quote` from that page, and an `occurredAt`. If you cannot quote it, you cannot cite it, so it is not a case. |
| Not the input Event | Exclude the Event itself and anything that is plainly its earlier phase (same place, continuous dates). Those are duplicates, not priors. |

## Scope label

- `district` — the prior struck the Event's level-2 location (by name, from the source).
- `country` — same country, different district (or no district known).

The proposal's `geographicScope` is `district` only when **every** case is `district`;
otherwise `country`. Say which cases are district-level in their own `scope` field either way.

## Sources

This Worker drains `event.impact_prior.web`: the web is the only source, and every case is
`tier: "web"`. Prefer, in order:

1. ReliefWeb disaster pages and situation reports, OCHA, IFRC DREF / emergency appeals, the
   GLIDE registry, UN agency and government disaster-management reports.
2. Reputable media, only to fill a date or impact that a humanitarian source names but does
   not detail.

CLEAR's own Events and knowledge base are **not** sources here. They are the
`event.impact_prior.clear` Worker's Task (Dagster), proposed side by side with yours and
labelled by `sourceKind`; a `tier: "clear"` entry, an `eventId` or a `reportId` in your
basis would count the same evidence twice.

## What is not a filter

- Season or month of year
- Climate drivers (El Niño, rainfall anomaly)
- Conflict or access context
- Severity

Note them on the case (`note`) when they matter for an analyst's reading. They never decide
whether something is a case.

## When there is no case

Complete the Task **without** `impactPrior`. Record in `result` what you searched (queries,
pages opened) and the candidates you excluded with the rule that excluded each.
"No prior found" is evidence too; a thin `result` is not.
