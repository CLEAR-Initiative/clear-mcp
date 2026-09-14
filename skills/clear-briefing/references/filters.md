# Filters, paging and counting

## Shared Monitor filters

`clear_list_signals`, `clear_list_events`, `clear_list_alerts` and `clear_count`
all accept:

| Filter | Type | Notes |
|---|---|---|
| `teamId` | string | From `clear_whoami`. Omit for the global feed. |
| `locationId` | string | From `clear_find_location`. Includes descendants. |
| `severityMin` / `severityMax` | int 1–5 | Inclusive bounds. Rows with null severity are excluded by either bound. |
| `from` / `to` | ISO-8601 | Inclusive window on that tier's **primary** timestamp. |

Primary timestamps differ by tier:

- signals → `publishedAt`
- events → the event's first signal time
- alerts → the underlying event's first signal time

Tool-specific filters:

| Tool | Extra filters | Ordering |
|---|---|---|
| `clear_list_signals` | `sourceNames` | `PUBLISHED_DESC` (default), `PUBLISHED_ASC`, `SEVERITY_DESC`, `SEVERITY_ASC` |
| `clear_list_events` | `eventTypes` | `CREATED_DESC` (default), `CREATED_ASC`, `LAST_SIGNAL_DESC`, `LAST_SIGNAL_ASC`, `SEVERITY_DESC`, `SEVERITY_ASC` |
| `clear_list_alerts` | `eventTypes`, `status` | `CREATED_DESC` (default), `CREATED_ASC`, `SEVERITY_DESC`, `SEVERITY_ASC` |

Array filters (`eventTypes`, `sourceNames`, `needSectors`, `locationIds`,
`kinds`) match **ANY** of the values, never all.

## Paging

Offset paging on the Monitor and crisis lists:

```
limit  1–25, default 10      offset  zero-based, default 0
```

Read `hasMore` before offering "more". `totalCount` is the full match count, not
the page size — quoting the page size as a total is the single most common
mistake with these tools.

`clear_list_figures` pages by **cursor**: pass `after: <nextAfter>` from the
previous page while `hasMore` is true.

## Counting instead of paging

`clear_count(entity, groupBy, …filters)` is the only route to totals beyond one
page, and the cheapest way to shape a question before reading rows.

| `groupBy` | Bucket keys |
|---|---|
| `none` (default) | single total |
| `type` | GLIDE code per bucket — or **source name** when `entity: "signal"` |
| `severity` | `"1"`–`"5"` |
| `day` / `week` / `month` | ISO period keys: `YYYY-MM-DD`, `YYYY-Www`, `YYYY-MM` |

Two idioms worth memorising:

```
# Discover the valid filter values before filtering
clear_count(entity: "event", locationId: L, groupBy: "type")

# Is this escalating? Month-on-month volume
clear_count(entity: "event", locationId: L, from: "2026-01-01T00:00:00Z",
            groupBy: "month")
```

## Time windows

All timestamps are ISO-8601, UTC. Prefer explicit instants
(`2026-08-01T00:00:00Z`) over date-only strings, and state the window you used
in your answer — "since 1 August" is a materially different briefing from "in
the last week".
