---
name: clear-sitrep
description: Freeze a situation analysis into a Situation Report — a dated, immutable document with key developments, current status, response activities, priority needs and scope, plus a provenance record. Use when asked for a sitrep, a situation report, a frozen or shareable version of an analysis, or a correction to one.
---

# Situation Report

A SitRep is a **frozen copy** of an analysis at a moment, written so someone who was not in the
conversation can read it, check it and forward it. Compose the analysis first with
`clear-situation-analysis`; this skill turns the version on screen into a document and does not
re-read the data.

## The one rule: freeze, never edit

- Build the SitRep from **the figures already on screen**. Do not re-fetch to "refresh" them —
  that produces a different document and must be labelled as a new version.
- A published SitRep is **never modified**. A correction is a new SitRep that names the one it
  supersedes and says what changed. Keep the old one.
- If the user wants an earlier state, take it from the analysis snapshot they selected
  (`clear_get_situation_analysis` with `year`, or `history: true`), not from memory.

clear-mcp stores nothing (ADR-0002): there is no SitRep record, no version list and no PDF here.
Write the document to a file or hand it back as text; where it is filed and published is the
user's system, and say so rather than implying CLEAR keeps it.

## Structure

Fixed order. Every section is present; an empty one says why it is empty.

```
# Situation Report — <scope name>
Scope:        <scope block from clear-analysis-scope>
Period:       <periodStart> → <periodEnd | present>
Version:      <YYYY-MM-DD>-v<n>   Supersedes: <previous version | none>
Analysis:     generated <generatedAt> by <generatedByModel> | composed on the fly <as-of>
Author:       <person the user names>   Status: draft | published

## 1. Key developments        — what changed in the period, each item dated and cited
## 2. Current status          — the situation now: key figures with unit, source, quality
## 3. Response activities     — see below
## 4. Priority needs          — sectors by severity, each with its sources
## 5. Scope                   — the scope definition; maps from reports, cited by page
## Sources                    — the provenance block from clear-evidence/references/citation.md
```

### What each section takes from the analysis

| Section | From |
|---|---|
| Key developments | The event picture: heaviest events in the period (`clear_list_events`, `severityMin`) and, below country level, alerts in the last 14 days. Date every item. |
| Current status | Key figures from `clear_get_datapoints` — value, unit, `data_quality`, `contributing_report_ids`. Ranges where sources disagree. |
| Response activities | **CLEAR holds no response-activity data** (no ActivityInfo or 3W feed). Fill this only from what the user supplies, and label it as theirs. If they supply nothing, write "No response data in CLEAR for this scope" — never infer activities from needs or events. |
| Priority needs | The needs section — sectors by severity with sources. Machine-generated needs (`clear_get_crisis` → `content.needs`, situation analysis needs) are marked unverified. |
| Scope | The scope block verbatim, plus any maps from `clear_list_figures({ locationIds, kinds: ["map"] })` cited by report and page. The map image is not fetchable in V1 — cite it, do not describe it as seen. |

## Provenance

Close with the provenance block, and add to it what a frozen document needs that a live answer
does not:

- the analysis snapshot used (`generatedAt`, `generatedByModel`, `windowKind`, `windowStart`) or
  "composed on the fly at <as-of>" if the scope has no stored analysis
- every report id cited, with title and page range
- every event and alert id cited
- which sections are machine-generated and unverified
- the author the user named — never guess one, and never put a person's contact details in
  the document unless the user supplied them for it

## Naming and correction

Suggest `sitrep-<scope-slug>-<YYYY-MM-DD>-v<n>.md`. A correction is `v<n+1>` with
`Supersedes: v<n>` in its header and a one-line "Changes from v<n>" under the header. The
superseded file is left as it was.

## Before you hand it over

- Every figure in sections 1, 2 and 4 has a source. If one does not, remove it or mark it
  "unsourced — remove before publishing".
- Third-party text is quoted and attributed, never pasted as the report's own voice.
- The "Status" line says `draft` until the user says otherwise. Machine-generated text is
  unverified until a person confirms it, and the document says which text that is.
