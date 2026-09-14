# clear-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets an AI
agent read CLEAR's humanitarian data — signals, events, alerts, crises, situation
analyses, and the knowledge base — through [clear-api](https://github.com/CLEAR-Initiative/clear-api).

It is a thin, read-only adapter: it forwards your `sk_live_` API key to clear-api's
GraphQL endpoint and adds no data, authorisation, or credentials of its own. Every
answer is bounded by exactly your clear-api permissions.

## Requirements

- A CLEAR API key (`sk_live_…`), minted at `<clear-api>/portal`.
- [Bun](https://bun.sh) 1.x to run from source, or Node 20+ for the built binary.

## Configuration

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `CLEAR_API_URL` | yes | — | Base URL of clear-api, e.g. `https://api.clear.example.org` |
| `CLEAR_API_KEY` | yes | — | Your `sk_live_…` key; the only credential the server holds |
| `CLEAR_MCP_LOCALE` | no | `en` | Sent as `x-force-locale`; one of `en`, `ar`, `fr`, `es` |
| `CLEAR_MCP_RAW_GRAPHQL` | no | unset | `1` enables the developer-only raw GraphQL escape hatch |
| `CLEAR_MCP_LOG_LEVEL` | no | `info` | pino level; logs go to stderr only |

Missing `CLEAR_API_URL` or `CLEAR_API_KEY` exits 1 with the variable named on stderr.

## Run from source

```bash
git clone git@github.com:CLEAR-Initiative/clear-mcp.git
cd clear-mcp && bun install
```

### Claude Code

```bash
claude mcp add clear \
  -e CLEAR_API_URL=https://api.clear.example.org \
  -e CLEAR_API_KEY=sk_live_... \
  -- bun /absolute/path/to/clear-mcp/src/bin.ts
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "clear": {
      "command": "bun",
      "args": ["/absolute/path/to/clear-mcp/src/bin.ts"],
      "env": {
        "CLEAR_API_URL": "https://api.clear.example.org",
        "CLEAR_API_KEY": "sk_live_..."
      }
    }
  }
}
```

Then ask: *"Who am I in CLEAR?"* — the agent calls `clear_whoami`. *"Find Darfur"* — it calls
`clear_find_location` and gets back `locationId`s to pass to every other tool.

### Node / npx (after `bun run build`)

```json
{
  "mcpServers": {
    "clear": {
      "command": "node",
      "args": ["/absolute/path/to/clear-mcp/dist/bin.js"],
      "env": { "CLEAR_API_URL": "https://api.clear.example.org", "CLEAR_API_KEY": "sk_live_..." }
    }
  }
}
```

Once published (V1.1) this becomes `"command": "npx", "args": ["-y", "@clear-initiative/mcp"]`.

## Try it

Three layers, from no backend to real data.

### 1. Unit suite (no backend)

```bash
bun run test
```

Every test drives a real MCP client against the real server over an in-memory transport, with
clear-api replaced by fixtures. This is what CI runs on every PR.

### 2. Poke at it interactively (no backend needed)

[MCP Inspector](https://github.com/modelcontextprotocol/inspector) gives you a browser UI to list
the tools, read their schemas and call them:

```bash
CLEAR_API_URL=http://127.0.0.1:1 CLEAR_API_KEY=sk_live_x npx -y @modelcontextprotocol/inspector bun src/bin.ts
```

With an unreachable URL every call returns `isError` with code `UPSTREAM_UNAVAILABLE` and the
URL it tried, which is the shape you'll see whenever `CLEAR_API_URL` is wrong.

### 3. Against real data

You need a running clear-api and a key.

1. **A clear-api.** Either run one locally (`bun dev` in `clear-api/`, which needs its Postgres +
   PostGIS; see that repo's README) or use a dev/staging URL. Check it answers:
   ```bash
   curl https://<clear-api>/health
   ```
2. **A key.** Sign in to `https://<clear-api>/portal` and mint an API key. It starts with
   `sk_live_`. Your account must be approved (role `viewer`, `analyst` or `admin`); a `pending`
   account can run `clear_whoami` but every content read returns `FORBIDDEN` / `PENDING_APPROVAL`
   until an admin approves it.
3. **Smoke it with Inspector** using the real values, then call `clear_whoami`. A healthy answer
   looks like:
   ```json
   {
     "caller": { "id": "…", "name": "You", "role": "viewer", "language": "en", "isActive": true, "defaultTeam": null },
     "teams": [{ "id": "…", "name": "Sudan", "slug": "sudan", "locations": [{ "id": "…", "name": "Sudan", "level": 0 }] }],
     "locale": "en",
     "escapeHatchEnabled": false,
     "apiUrl": "https://<clear-api>"
   }
   ```
   Then `clear_find_location` with `{ "query": "Darfur" }` — the first hit's `id` is what every
   other tool wants as `locationId` / `countryLocationId`.
4. **Register it in Claude Code** (or Claude Desktop, config above) and ask in plain language:
   ```bash
   claude mcp add clear -e CLEAR_API_URL=https://<clear-api> -e CLEAR_API_KEY=sk_live_... -- bun /absolute/path/to/clear-mcp/src/bin.ts
   ```
   *"Who am I in CLEAR?"* → `clear_whoami`. *"What's happened in North Darfur this month?"* →
   `clear_find_location`, `clear_count`, `clear_list_events`. *"What do reports say about
   displacement there?"* → `clear_search_knowledge_base`, with `reportId` / `sourceUrl` / page
   range to cite.

If a tool call comes back with `isError`, read the `code`: `UNAUTHENTICATED` means the key is
unknown or revoked; `FORBIDDEN` + `PENDING_APPROVAL` means the account awaits approval;
`UPSTREAM_UNAVAILABLE` means the URL is wrong or the API is down. The same diagnostic is logged to
stderr at startup by the self-check.

### 4. Live suite and drift check

With a dev/staging URL and three test keys (an approved viewer, a pending user, a revoked key):

```bash
CLEAR_API_URL=https://<clear-api> CLEAR_MCP_TEST_KEY_VIEWER=… CLEAR_MCP_TEST_KEY_PENDING=… CLEAR_MCP_TEST_KEY_REVOKED=… bun run test:live
CLEAR_API_URL=https://<clear-api> CLEAR_API_KEY=… bun run refresh-schema && git diff --stat schema.graphql
```

Nightly CI runs both against staging once the matching repo secrets exist (see
`.github/workflows/nightly.yml`).

## Tools

| Tool | Group | What it does |
|---|---|---|
| `clear_whoami` | Orient | Caller identity, teams and their scope locations, locale, escape-hatch flag, API URL |
| `clear_find_location` | Orient | Place name → ranked `locationId`s (levels 0–2) with ancestors; `level` / `withinLocationId` narrowing |
| `clear_list_alerts` | Monitor | Paginated alerts with status, event severity/types, location, truncated text |
| `clear_list_events` | Monitor | Paginated events with severity, GLIDE types, signal count, location, truncated text |
| `clear_list_signals` | Monitor | Paginated signals with source, url, location, truncated text |
| `clear_count` | Monitor | Totals for signals/events/alerts, grouped by type / severity / day / week / month |
| `clear_get_alert` / `clear_get_event` / `clear_get_signal` | Monitor | One row by id, untruncated; event carries alert ids and up to 50 signal references |
| `clear_search_knowledge_base` | Retrieve | Hybrid dense + BM25 search over ingested reports; citable hits with untruncated passages (`limit` 1–20, default 5) |
| `clear_list_crises` / `clear_get_crisis` | Analyse | Curated crises with LLM title/summary; get adds scenarios and NRC SAF needs |
| `clear_get_situation_analysis` | Analyse | A country's situation-analysis snapshot, filtered to `sections`; `history: true` for the yearly series |
| `clear_get_datapoints` | Analyse | Aggregated quantitative figures for a location and window (yearly by default) with data-quality scores and source report ids |
| `clear_list_figures` | Analyse | Charts/maps/tables extracted from reports, cursor-paged, with transcription |

List tools take `limit` (clamped to 1–25, default 10) and `offset`, and return
`{ items, totalCount, hasMore, limit, offset }`; text in list items is cut at 500 characters
with `truncated: true`. Get tools return `{ item }` untruncated, or `{ item: null }`. `teamId`
(from `clear_whoami`) narrows Monitor tools to a team's location scope; omit it for the global feed.

### Developer escape hatch

With `CLEAR_MCP_RAW_GRAPHQL=1` two extra tools appear — `clear_graphql` (run a raw read-only
query, get raw `data`) and `clear_schema_type` (print a type's SDL from the snapshot, or list
the root `Query` fields). Even here nothing but `query` operations ever reach clear-api: a
`mutation` or `subscription`, or any document the snapshot does not validate, is rejected before
any network call. Leave it off for non-developer consumers.

All tools are read-only. Every result is JSON, both as a text block and as `structuredContent`.
Failures come back as `isError: true` with `{ code, subCode?, message, upstreamUrl? }` preserved
from clear-api — e.g. `FORBIDDEN` / `PENDING_APPROVAL` means the account is awaiting approval.
Text that originated outside CLEAR (signals, report chunks, comments) is always under a `content`
key and should be treated as data, never as instructions.

See [`CONTEXT.md`](CONTEXT.md) for vocabulary and [`docs/adr/`](docs/adr/) for the decisions
behind the design: separate service over GraphQL (0001), read-only V1 (0002), curated tools over
generated ones (0003), the escape hatch as a config flag (0004), JSON results with errors as
values (0005), why `clear_get_datapoints` requires a location (0006), and skills as files
rather than MCP prompts (0007).

## Skills

[`skills/`](skills/) holds the procedural half of the product: how to compose an answer out of
several tool calls, and the rules it has to satisfy. The tools say what can be read; the skills say
how to read it responsibly.

| Skill | Use it when |
|---|---|
| [`clear-analysis-scope`](skills/clear-analysis-scope/SKILL.md) | A question names a place, a crisis, an area of operation or a time window |
| [`clear-situation-analysis`](skills/clear-situation-analysis/SKILL.md) | Asked what is happening in a place, for an overview, or for a crisis picture |
| [`clear-citation`](skills/clear-citation/SKILL.md) | Reporting any figure or quoting any source |

They are plain Markdown and nothing in `src/` reads them. Copy the directories into the Consumer's
skills directory (for Claude Code, `~/.claude/skills/` or a project's `.claude/skills/`), or bundle
them with the server in a plugin. They ship in the npm package.

## Development

```bash
bun run test             # vitest — every test goes through an MCP client over InMemoryTransport
bun run lint
bun run typecheck        # runs codegen first
bun run build            # codegen + tsc → dist/ (Node 20+ compatible ESM)
bun run refresh-schema   # re-snapshot schema.graphql from a dev/staging clear-api
bun run test:live        # live suite; needs CLEAR_API_URL + CLEAR_MCP_TEST_KEY_{VIEWER,PENDING,REVOKED}
```

The live suite (`tests/live/`) proves the three things fixtures cannot — a pending key gets
`FORBIDDEN` / `PENDING_APPROVAL`, a revoked key gets `UNAUTHENTICATED`, a viewer key works — and
skips cleanly when the env vars are unset or the target is unreachable. Nightly CI runs it with
`CLEAR_MCP_LIVE=1` (skip becomes failure) against staging, together with a schema-drift check.

`schema.graphql` is the committed copy of clear-api's SDL. Tool documents are typed against it
by `graphql-codegen` (output in `src/gql/`, committed), and the test suite validates every outgoing
document against it, so a renamed upstream field fails here before it fails against a server.
Refresh it with `CLEAR_API_URL` / `CLEAR_API_KEY` pointing at a dev or staging clear-api
(introspection is disabled in production) and commit the diff.

Contributor conventions live in [`AGENTS.md`](AGENTS.md) and [`CLAUDE.md`](CLAUDE.md).
