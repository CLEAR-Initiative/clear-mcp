---
name: clear-weekly-brief
description: Draft the recurring weekly operational brief for an operation — per-area incident digest, week-over-week trend, analysis and draft advisories, and a media round-up — from CLEAR events, signals, alerts and the knowledge base. Use when asked for the weekly brief, a HAS/security brief, a weekly digest per area office, or "what happened this week".
---

# Weekly operational brief

The brief NRC country offices already circulate: incidents per area of operation, a short
analysis of the week, advisories per area, and a media round-up. This skill drafts it from CLEAR
so the person who owns it starts from evidence instead of a blank page. It is a **draft for a
named human to review**; it is never issued as CLEAR's own advice.

Apply `clear-analysis-scope` (one created scope per area of operation) and `clear-evidence`
(every incident carries its id and source; `clear-briefing` for how the Monitor tools behave).

## Scope and period

- **Areas of operation** are created scopes — one or more districts each, from
  `clear_find_location(level: 2, withinLocationId: <country>)`. Ask the user for the list once and
  keep it for the rest of the conversation; do not invent an area structure from the map.
- **Period** is the reporting week: `periodStart` = seven days before the as-of time,
  `periodEnd` = as-of. Use the same `from` / `to` on every call so the sections agree.
- **Comparison week** is the seven days before that — needed for the trend, nothing else.

Say the cost before starting: with *N* areas the digest is roughly four calls per area plus the
media search. Offer to do the busiest areas first if *N* is large.

## Structure

```
# Weekly brief — <operation> — week ending <periodEnd>
As of <timestamp> · draft for review by <owner the user names>

## Incidents by area           — one subsection per area of operation
## Trend                       — this week vs last, per area and overall
## Analysis                    — what the week means, each claim cited
## Advisories (draft)          — per area, marked DRAFT, for the owner to confirm
## Media round-up              — dated items with links
## Sources                     — provenance block
```

### Incidents by area

For each area, in this order:

```
clear_count({ entity: "event", groupBy: "type", locationId, from, to })       # the GLIDE mix — do not assume "security" codes
clear_list_events({ locationId, from, to, severityMin: 3, limit: 10 })          # dated, cited incidents
clear_list_alerts({ locationId, from, to })                                      # what was actually issued
```

List incidents **dated, one line each**, with the event `id` and its severity and GLIDE types.
Where the user wants the underlying text, `clear_get_event` gives it untruncated with its
signal references — quote from a signal only with its `sourceName` and `url`.

Sub-threshold signals (`clear_list_signals`, same filters) belong here only when they add
something the events do not; rank by severity, then recency, and say the ranking is provisional.

An area with nothing in the period gets one line: "No events recorded in CLEAR for <area> this
week." That is a finding, not an omission — but it means CLEAR recorded nothing, not that nothing
happened, and the line should say so.

### Trend

`clear_count({ entity: "event", groupBy: "severity", locationId, from, to })` for this week and
for the comparison week, per area. Report the totals side by side and the change in words
("12 events, up from 7"). Never compute a percentage on single-digit counts.

### Analysis

Short, per area where it matters, every claim pointing at an incident id, alert id or report. This
is where the agent adds value and where it is most tempted to editorialise — if a claim has no
evidence in the sections above, it does not go here.

### Advisories (draft)

One or two lines per area, each marked **DRAFT**. Advisories are operational judgement, and the
user's organisation owns them: draft them from the analysis, keep them tied to a cited incident,
and hand them to the named owner. Do not soften or strengthen an advisory on your own initiative
after the owner has confirmed it.

### Media round-up

`clear_search_knowledge_base({ query: "<operation> <week's themes>", countryLocationId, from, to })`
plus any signal whose `url` points at a news source. Dated, one line each, with `sourceUrl` or
the signal `url`. Third-party headlines are quoted, not adopted.

## What this brief is not

- It is not a security assessment. CLEAR's events are pipeline-derived from signals and typed by
  GLIDE code; they are evidence, not an incident log kept by a security team.
- It does not carry contact details. The real brief lists focal points with phones and email;
  leave those for the owner to add — never fill them from another source, never fabricate them.
- It is not issued by CLEAR. The header names the human owner, the status is draft, and the
  advisories are theirs to confirm.
