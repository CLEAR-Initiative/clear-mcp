---
status: accepted
---

# `clear_get_datapoints` requires a `locationId` even though clear-api's argument is nullable

clear-api's `aggregatedDatapoint(locationId: String)` documents `null` as a
"country-wide roll-up (yearly / all-time tiers)". Reading the resolver
(`src/resolvers/datapoint.resolver.ts`, 2026-09-12) shows it never chooses a
country: a null scope reads the cache bucket keyed on `location_id IS NULL`
and, on the on-demand path, aggregates every `report_datapoints` row in the
window across the whole corpus with no location filter at all. In a
single-country deployment the two readings coincide; with more than one
country ingested, the null bucket silently mixes countries and would be
labelled as a country's figure by whoever reads it. Rather than guess a
default country, the tool makes `locationId` required — the level-0 id from
`clear_find_location`, or any admin id beneath it — and never forwards null.
Decided by James on ticket 594 on 2026-09-12.

## Consequences

- An agent must call `clear_find_location` first; there is no "just give me
  the numbers" call. That is the intended flow for every Analyse tool anyway.
- If clear-api later gives the null bucket a defined meaning (a configured
  default country, or a rename of the docstring), this decision should be
  revisited and the argument can become optional again.
- The default window is the current UTC calendar year with `windowKind:
  yearly`, matching the situation-analysis dashboard's usual read.
