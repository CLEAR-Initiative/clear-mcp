---
name: clear-situation-analysis
description: Compose a situation analysis for a scope from CLEAR — summary, key figures, needs by sector, the event picture, recent alerts and sources — in a fixed section order with a staleness check. Use when asked what is happening in a place, for a country or area overview, or for a crisis picture.
---

# Situation analysis for a scope

Read `clear-analysis-scope` first (it fixes the geography and period) and apply `clear-citation`
throughout (nothing here may state an unsourced figure).

## Section order

Always the same order, whatever the scope:

1. **Header** — scope definition, period, as-of timestamp, staleness
2. **Summary** — what is happening, every statement cited
3. **Key figures** — the quantitative picture, each with unit, source and quality
4. **Needs** — sectors by severity, with the sources behind each
5. **Event picture** — volume and trend, then the heaviest individual events
6. **Recent alerts** — below country level only, last 14 days
7. **Sources** — the provenance block from `clear-citation`

Render the header, summary and key figures eagerly. Everything below is **on request**: name the
sections you have not fetched rather than spending calls nobody asked for. A first pass should cost
about eight tool calls; say so if a scope will cost materially more.

## Where each section comes from

### Header and staleness

Stale means either older than its cadence (country analyses regenerate weekly) or **a new alert has
landed in the scope since it was generated**. Both are checkable now:

1. `clear_get_situation_analysis` → `generatedAt`
2. `clear_list_alerts({ locationId, from: generatedAt, limit: 1 })` → `totalCount > 0` means stale

Always show the as-of time. A cached figure presented as current is the failure mode this section
exists to prevent.

### Summary

**Country scope** — `clear_get_situation_analysis({ countryLocationId, sections: [...] })`. Payloads
are large, so filter. To discover what exists, request one section: the result still reports the
full `availableSections` list, so a single cheap call tells you what else is there. `history: true`
returns the yearly series instead, newest first — that is how you read earlier versions and show a
trend.

**Below country level there is no stored analysis** — `countryLocationId` is a level-0 id. Compose
the summary yourself from key figures, knowledge-base hits and the event picture, and say plainly
that it was composed on the fly rather than read from a stored analysis. (This gap is what
AnalysisScope is meant to close; today it is a real limit, not a formatting choice.)

**Crisis scope** — `clear_get_crisis` gives an LLM title, summary, scenarios and NRC SAF needs.
Machine-generated: cite it as derived, and follow its events for anything factual.

### Key figures

`clear_get_datapoints({ locationId, windowKind, windowStart, windowEnd })` — `locationId` is
required by design (ADR-0006): the nullable upstream argument silently mixes countries, so there is
no "just give me the numbers" call. Defaults to the current calendar year, `yearly`.

`data` is a flat map keyed by field label; numeric fields carry `value`, `unit`, `data_quality` and
`contributing_report_ids`. **Do not add figures across districts** — they come from overlapping
reports and are not additive. Report them per location, or read the parent location instead.

### Needs

- Country: the needs sections of the situation analysis.
- Crisis: `clear_get_crisis` → `content.needs` (NRC SAF JSON, machine-generated only).
- Below country: `clear_search_knowledge_base({ locationIds, needSectors, from, to })`.

Present sectors **by severity**, highest first, each with its rating and the sources behind it.
Sector names are NRC SAF labels (`Shelter`, `WASH`, …) and match `needSectors` on the search and
figures tools.

### Event picture

Volume and shape first, individual rows second:

```
clear_count({ entity: "events", groupBy: "week",     locationId, from, to })   # trend
clear_count({ entity: "events", groupBy: "type",     locationId, from, to })   # GLIDE mix
clear_count({ entity: "events", groupBy: "severity", locationId, from, to })   # weight
clear_list_events({ locationId, from, to, severityMin: 4, limit: 10 })          # the heavy ones
```

`groupBy: "type"` is also how you discover the GLIDE codes in use before filtering by
`eventTypes`. `clear_get_event` adds the full text, alert ids and up to 50 signal references.

Sub-threshold signals — the ones that never became events — are visible through
`clear_list_signals` over the same scope. Rank them by severity, then recency, then how close their
location sits to the scope; treat that ranking as provisional and say so.

### Recent alerts

Below country level only: `clear_list_alerts({ locationId, from: <now − 14 days> })`. A country
scope does not carry this list — the volume drowns the rest of the page.

### Figures and maps

`clear_list_figures({ locationIds, needSectors, kinds: ["map", "chart"] })` returns charts, maps and
tables extracted from reports, with a transcription. The image itself is not fetchable in V1; cite
the report and page and use the transcription for the content.

## What this cannot do

Nothing here persists. There is no scope record, no analysis version, no regeneration, no edit, no
map rendering, no PDF — clear-mcp is read-only (ADR-0002) and those belong to clear-api. Produce the
analysis as text with its provenance block; if the user wants it frozen, saved or published, say
where that actually happens.
