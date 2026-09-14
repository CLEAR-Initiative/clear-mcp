# Escape-hatch query patterns

Worked, read-only queries for the usual reasons to reach past the curated tools.
Verify field names against the snapshot with `clear_schema_type` before running
anything here — the snapshot is the authority, this file is a starting point.

## Fields a curated tool deliberately drops

The curated tools project narrowly. When you need something they leave out, ask
for exactly that field and nothing else.

```graphql
query EventExtras($id: String!) {
  event(id: $id) {
    id
    rank
    isDummy
    casualties
    populationDisplaced
  }
}
```

## Paging a list the curated tool caps at 25

```graphql
query EventsPage($input: EventsPageInput) {
  eventsPage(input: $input) {
    totalCount
    hasMore
    items { id severity types firstSignalCreatedAt }
  }
}
```

```json
{ "input": { "locationId": "loc_…", "limit": 100, "offset": 0,
             "orderBy": "SEVERITY_DESC" } }
```

Nothing clamps `limit` here. Keep the selection set to the handful of fields you
are actually going to use, or the result will be unusable.

## Checking a value before filtering on it

Cheaper than trial and error against a list tool:

```graphql
query TypeMix($input: EntityStatsInput!) {
  entityStats(input: $input) { total buckets { key count } }
}
```

```json
{ "input": { "entity": "event", "groupBy": "type", "locationId": "loc_…" } }
```

(`clear_count` does this already — use the curated tool unless you need a filter
it does not expose.)

## Multiple operations in one document

Legal, but you must say which one to run:

```
clear_graphql(
  query: "query A { … } query B { … }",
  operationName: "B"
)
```

## Shapes to avoid

```graphql
# ✗ Returns a polygon that will swamp the context
query { location(id: "loc_…") { geometry } }

# ✗ Walks the whole admin subtree
query { location(id: "loc_…") { children { children { id name } } } }

# ✗ Personal data; out of bounds regardless of what the key can read
query { me { email } }

# ✗ Full signal bodies via the event; use clear_get_signal for the ones you need
query { event(id: "evt_…") { signals { title description } } }
```

## Before you run anything

1. Does a `clear_*` tool already answer this? Use it.
2. Have you checked the input type with `clear_schema_type`?
3. Is the selection set the minimum that answers the question?
4. Is there a page-size argument you have left unbounded?
