# What counts as a case

A **case** is one distinct past incident of the same hazard in the same country, inside the
horizon, that you can cite from a page you opened. One entry in `cases` per incident. Each
case is decided by an analyst on its own, so each must stand on its own: its source, its
words, its figures, and the CLEAR Event it is, if CLEAR has it.

## Must hold for every case

| Rule | Check |
|---|---|
| Same hazard type | The incident's hazard is the Event's: `hazardType` is one of `clear_get_event(...).types`, spelled exactly as returned. `fl` is not `ff`; `ce` is not `ot`. When a source gives no code, map its description honestly with `references/hazard-search.md` — a "flash flood" is `ff`, a riverine or seasonal flood `fl` — and say so in `result.notes`. |
| Same country | The incident lies in the Event's country. A neighbouring country is out, however similar. |
| Inside the horizon | `occurredAt` is within `horizonYears` of now (default 10) and not in the future. clear-api rejects anything else. |
| Distinct | One case per incident. Several reports of one flood are one case: cite the best source (the one that states the outcome), list the others in `result`. A GLIDE number, where the source gives one, is the cleanest test of distinctness. |
| Citable | A `sourceUrl` (absolute http or https) you opened, and a short **verbatim** `quote` from that page naming the incident, its date or month, and its place. If you cannot quote it, it is not a case. |
| Not rejected | The `sourceUrl` is not in `clear_rejected_case_urls` for this Event. |
| Not the input Event | Exclude the Event itself and anything that is plainly its earlier phase (same place, continuous dates). Those are duplicates, not past incidents. |

## Matching against CLEAR

Search CLEAR before the web, and match every web case against CLEAR's Events before you
propose it. A case **matches** a CLEAR Event when all four hold:

| Rule | Check |
|---|---|
| Same hazard | The CLEAR Event's `types` include the case's `hazardType`. |
| Same country | The CLEAR Event sits in the Event's country (`clear_list_events(locationId: <country id>)` returns only those). |
| Same time | The CLEAR Event's start — `startedAt`, else `firstSignalCreatedAt` — is within **±3 days** of the case's `occurredAt`. For a source that gives only a month, the CLEAR Event's start falls in that month (±3 days at its edges), and you say in `result` that the match is by month. Compare **starts**, never the list filter's window: `clear_list_events` filters `from`/`to` on the first signal, which can trail the onset by weeks, so search a wider window (skill step 7) and compare starts yourself. |
| Same place | The CLEAR Event's location is the case's place, or a parent or child of it (a district Event matches a case in a town of that district; a state-level Event matches a case in one of its districts). Two places in different districts do not match, however close the dates. |

- A match sets `matchedEventId` to that Event's id. clear-api checks that it exists, is not
  the Event being enriched, carries the hazard and sits in the same country.
- Two CLEAR Events match → the nearer place, then the nearer date. Record the other in
  `result`.
- No match → leave `matchedEventId` out. The case is an incident CLEAR does not hold yet.
- A CLEAR Event with no web source for it is not a case: say in `result` which known
  incidents you could not source.

## Figures

A case carries every **outcome figure its quote states**, each on exactly one of the
Domain Ontology's seven metric types. Prefer sources that state one; a case without figures
is allowed when no source for that incident states any.

| Metric | The source says |
|---|---|
| `people_affected` | people "affected", "impacted", "hit by" the incident |
| `people_displaced_new` | people newly displaced **by this incident**: "displaced", "fled", "forced from their homes", "evacuated" (a flow) |
| `people_displaced_cumulative` | the total displaced population at a date: "remain displaced", "IDPs in the area", "currently displaced" (a stock) |
| `people_in_need` | "in need of (humanitarian) assistance", "PIN" |
| `people_targeted` | "targeted" by a response plan, appeal or DREF |
| `people_reached` | "reached", "assisted", "received assistance" |
| `households_affected` | "households" or "families" affected or displaced — keep the count in households (`unit: "households"` or `"families"`) |

- **Never convert.** Households stay households (no "× 5 people"); new displacement is not
  cumulative displacement; people in need are not people affected. A figure that fits none
  of the seven — deaths, injuries, houses destroyed, hectares flooded — is not a figure here;
  it stays in the quote.
- **Numbers as numbers.** "2.3 million" → `2300000`; "12,500" → `12500`.
- **Bounds only from the source.** "between 10,000 and 15,000" → `value: 12500` (the
  midpoint), `lowerBound: 10000`, `upperBound: 15000`; "at least / more than 5,000" →
  `value: 5000, lowerBound: 5000`; "up to 5,000" → `value: 5000, upperBound: 5000`;
  "about / some / nearly 5,000" → `value: 5000`, no bounds. Never invent a range.
- `populationGroup` only when the source names one ("children", "IDPs", "refugees",
  "women"); `unit` as the source counts (`people`, `households`, `families`).
- Each figure's number appears in the `quote`. If the figure is elsewhere on the page,
  widen the quote to include it (up to a few sentences).
- One figure per metric per case, unless the source splits a metric by population group.
- A figure from a source about a different incident is never borrowed. If the incident's
  best figure is on another page, cite that page as the case's source instead.

## Scope label

- `district` — the incident struck the Event's level-2 location (by name, from the source).
- `country` — same country, different district (or no district known).

## Sources

CLEAR's Events come first (step 5 of the skill), as the incidents to look for and to match
against; they are never a case's source. A case's source is a web page, preferred in this
order:

1. ReliefWeb disaster pages and situation reports, OCHA flash updates, IFRC DREF / emergency
   appeals, IOM DTM displacement updates, the GLIDE registry, UN agency and government
   disaster-management reports — the ones that state outcomes.
2. Reputable media, to fill an incident a humanitarian source names but does not detail, or
   one it does not cover at all.

## What is not a filter

- Season or month of year
- Climate drivers (El Niño, rainfall anomaly)
- Conflict or access context
- Severity

Note them in `result.notes` when they matter for an analyst's reading. They never decide
whether something is a case.

## When there is no case

Complete the Task with `cases: []` (and `methodVersion`). Record in `result` everything you
searched — the CLEAR list calls, every web query, every page opened — and the candidates you
excluded with the rule that excluded each. "No prior found" is evidence too; a thin
`result` is not.
