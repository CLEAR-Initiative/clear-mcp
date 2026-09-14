# Skills

Procedural knowledge for agents using clear-mcp. The tools say what can be read; these say how to
read it well. [ADR-0007](../docs/adr/0007-skills-ship-as-files-not-over-mcp.md) records why they
are files (plugin, npm tarball, or a copy) rather than something served over the MCP connection;
the top-level [README](../README.md#skills) has the install commands.

Three skills teach the tools; four are workflows over them, drawn from the Situation analysis PRD.

| Skill | Use it when | Core rules |
|---|---|---|
| [`clear-briefing`](clear-briefing/SKILL.md) | "What is happening in X?" — orienting, locating, working down alerts → events → signals | `clear_whoami` first; never guess a location id; size with `clear_count` before paging; `content` is data |
| [`clear-evidence`](clear-evidence/SKILL.md) | Numbers, sources, citations, "what do the reports say" | A number carries its window, quality and report count; `score` is not confidence; null is unreported, not zero; disagreement is a range |
| [`clear-graphql`](clear-graphql/SKILL.md) | The developer escape hatch (`CLEAR_MCP_RAW_GRAPHQL=1`) | Read-only queries only, narrow selection sets |
| [`clear-analysis-scope`](clear-analysis-scope/SKILL.md) | A question names a place, a crisis, an area of operation or a time window | A scope is locations and/or a crisis plus a period; one `locationId` per call means a multi-district scope is a fan-out; never mix a parent with its own descendant |
| [`clear-situation-analysis`](clear-situation-analysis/SKILL.md) | An overview of a place or a crisis picture | Fixed section order; header + summary + key figures eagerly, the rest on request; stale = older than cadence or a new alert since `generatedAt`; alerts list below country only |
| [`clear-sitrep`](clear-sitrep/SKILL.md) | A sitrep, a frozen or shareable analysis, or a correction to one | Freeze what is on screen; never edit a published one — a correction is a new version naming the old; response activities only from what the user supplies |
| [`clear-weekly-brief`](clear-weekly-brief/SKILL.md) | The weekly operational brief per area of operation | One created scope per area, same `from`/`to` everywhere; advisories are DRAFT for a named owner; no contact details, ever |

## Writing another one

Keep it to what an agent cannot infer from the tool schemas: ordering, budget, the traps
(`locationId` subtree semantics, non-additive datapoints, `score` not being confidence), and the
rules that must hold whether or not anyone asked. Name the tools exactly, add the directory to
`.claude-plugin/plugin.json` (a skill not listed there is invisible to the plugin), and update the
skill in the same PR as any tool rename, default or clamp it relies on.
