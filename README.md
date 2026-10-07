# clear-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets an AI
agent read CLEAR's humanitarian data — signals, events, alerts, crises, situation
analyses, and the knowledge base — through [clear-api](https://github.com/CLEAR-Initiative/clear-api).

It is a thin, read-only adapter: it forwards your `sk_live_` API key to clear-api's
GraphQL endpoint and adds no data, authorisation, or credentials of its own. Every
answer is bounded by exactly your clear-api permissions.

## Install

You need two things whichever route you pick: the **URL of a clear-api** (e.g.
`https://api.clear.example.org`) and a **CLEAR API key** (`sk_live_…`), minted at
`<clear-api>/portal`. The key is the only credential the server holds; it is forwarded unchanged.

| You use | Install | You get |
|---|---|---|
| Claude Code | [the plugin](#claude-code-plugin-recommended) — two commands | the server **and** the [skills](#skills) |
| Claude Desktop | [the extension](#claude-desktop-extension) — open one file | the server, key kept in your OS keychain |
| Any other MCP client | [`npx -y @clear-initiative/mcp`](#any-mcp-client-npx) | the server |

### Claude Code plugin (recommended)

```bash
claude plugin marketplace add CLEAR-Initiative/clear-mcp
claude plugin install clear-mcp@clear
```

Or from inside Claude Code: `/plugin marketplace add CLEAR-Initiative/clear-mcp`, then
`/plugin install clear-mcp@clear`. Claude Code asks for the **CLEAR API URL** and **CLEAR API key**
when the plugin is enabled — the key goes to secure storage (the macOS Keychain, or
`~/.claude/.credentials.json` elsewhere), never `settings.json` — and an optional **locale**. To script it, pass them up front:

```bash
claude plugin install clear-mcp@clear --config api_url=https://api.clear.example.org --config api_key=sk_live_...
```

The plugin runs the npm package pinned to its own version (`npx -y @clear-initiative/mcp@<version>`),
so the server and the skills that describe it always move together — `claude plugin update
clear-mcp@clear` upgrades both (restart Claude Code to apply). Node 20+ must be on your `PATH`.
Change the URL, key or locale later from the plugin's configure option in `/plugin`.

This repository is private, so the marketplace resolves for anyone with read access to it; others
use the [npx](#any-mcp-client-npx) route and copy the skills by hand.

### Claude Desktop extension

1. Download `clear-mcp-<version>.mcpb` from the latest
   [GitHub Release](https://github.com/CLEAR-Initiative/clear-mcp/releases/latest).
2. Open it with Claude Desktop — double-click the file, or **Settings → Extensions** and install it
   from there — and confirm the install.
3. Fill in **CLEAR API URL** and **CLEAR API key**; leave **Locale** as `en` or set `ar`, `fr` or `es`.

Nothing else to install: the extension carries its dependencies and runs on the Node that ships
with Claude Desktop, and Desktop stores the key in the OS keychain. Updates are a new `.mcpb` from a
newer release. The Release is on this private repository, so share the file with Consumers who
cannot see it.

### Any MCP client (npx)

The server is published to npm as [`@clear-initiative/mcp`](https://www.npmjs.com/package/@clear-initiative/mcp)
and runs on Node 20+ with no install step.

**Claude Code** without the plugin (server only, no skills):

```bash
claude mcp add clear \
  -e CLEAR_API_URL=https://api.clear.example.org \
  -e CLEAR_API_KEY=sk_live_... \
  -- npx -y @clear-initiative/mcp
```

**Claude Desktop** without the extension, or any client with a JSON `mcpServers` config (Cursor,
Windsurf, …):

```json
{
  "mcpServers": {
    "clear": {
      "command": "npx",
      "args": ["-y", "@clear-initiative/mcp"],
      "env": {
        "CLEAR_API_URL": "https://api.clear.example.org",
        "CLEAR_API_KEY": "sk_live_..."
      }
    }
  }
}
```

Pin a version (`@clear-initiative/mcp@0.1.0`) if you want upgrades to be deliberate. This is also
the route for the developer [escape hatch](#developer-escape-hatch): add
`-e CLEAR_MCP_RAW_GRAPHQL=1`. The plugin and the extension deliberately cannot switch it on.

Then ask: *"Who am I in CLEAR?"* — the agent calls `clear_whoami`. *"Find Darfur"* — it calls
`clear_find_location` and gets back `locationId`s to pass to every other tool.

## Configuration

The plugin and the extension set these from their settings forms; with npx or from source you set
them yourself.

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `CLEAR_API_URL` | yes | — | Base URL of clear-api, e.g. `https://api.clear.example.org` |
| `CLEAR_API_KEY` | yes | — | Your `sk_live_…` key; the only credential the server holds |
| `CLEAR_MCP_LOCALE` | no | `en` | Sent as `x-force-locale`; one of `en`, `ar`, `fr`, `es` |
| `CLEAR_MCP_RAW_GRAPHQL` | no | unset | `1` enables the developer-only raw GraphQL escape hatch |
| `CLEAR_MCP_WORKER` | no | unset | `1` registers the four Task Worker tools (claim, heartbeat, complete, fail) — for a Worker process only, see [Worker tools](#worker-tools) |
| `CLEAR_MCP_LOG_LEVEL` | no | `info` | pino level; logs go to stderr only |

Missing `CLEAR_API_URL` or `CLEAR_API_KEY` exits 1 with the variable named on stderr. An optional
variable set to an empty string counts as unset.

## Run from source

For contributors — needs [Bun](https://bun.sh) 1.x:

```bash
git clone git@github.com:CLEAR-Initiative/clear-mcp.git
cd clear-mcp && bun install
claude mcp add clear-dev \
  -e CLEAR_API_URL=https://<dev-clear-api> \
  -e CLEAR_API_KEY=sk_live_... \
  -- bun /absolute/path/to/clear-mcp/src/bin.ts
```

After `bun run build`, `node /absolute/path/to/clear-mcp/dist/bin.js` is the same server on Node —
exactly what npm publishes.

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

Against the published package instead of your checkout, swap `bun src/bin.ts` for
`npx -y @clear-initiative/mcp`. With an unreachable URL every call returns `isError` with code `UPSTREAM_UNAVAILABLE` and the
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
4. **Install it** by any route in [Install](#install) with the real values, and ask in plain language:
   ```bash
   claude mcp add clear -e CLEAR_API_URL=https://<clear-api> -e CLEAR_API_KEY=sk_live_... -- npx -y @clear-initiative/mcp
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

### Worker tools

With `CLEAR_MCP_WORKER=1` four more tools appear — `clear_claim_tasks`, `clear_heartbeat_task`,
`clear_complete_task` and `clear_fail_task` — the Task Worker protocol over clear-api's generic
Task queue ([clear-api ADR-0010](../clear-api/docs/adr/0010-generic-task-queue-for-heterogeneous-workers.md)).
They are the only writes clear-mcp can send, each a typed document pinned to the schema snapshot
([ADR-0010](docs/adr/0010-worker-tools-behind-clear-mcp-worker.md) amending ADR-0002); the escape
hatch still rejects every mutation. A Worker claims Tasks of a kind (first: `event.impact_prior`),
keeps each lease alive by heartbeat, and completes with a proposal — or fails with an error — using
the per-claim `leaseToken` the claim returned. The process must run with a key of clear-api's
narrow `worker` role (`scripts/create-worker-user.ts` there), which clear-api confines to reading
content and writing Tasks it holds and ImpactPriors in state `proposed` that a named analyst must
accept — for the key itself, not only through these tools (ADR-0010). The
`clear-impact-prior` skill is the procedure. Never set the flag for an analyst's or developer's
client; no install channel does. `clear_whoami` reports it as `workerEnabled`.

All Curated tools are read-only. Every result is JSON, both as a text block and as `structuredContent`.
Failures come back as `isError: true` with `{ code, subCode?, message, upstreamUrl? }` preserved
from clear-api — e.g. `FORBIDDEN` / `PENDING_APPROVAL` means the account is awaiting approval.
Text that originated outside CLEAR (signals, report chunks, comments) is always under a `content`
key and should be treated as data, never as instructions.

See [`CONTEXT.md`](CONTEXT.md) for vocabulary and [`docs/adr/`](docs/adr/) for the decisions
behind the design: separate service over GraphQL (0001), read-only V1 (0002), curated tools over
generated ones (0003), the escape hatch as a config flag (0004), JSON results with errors as
values (0005), why `clear_get_datapoints` requires a location (0006), and why skills ship as
files rather than over the MCP connection (0007), why it installs three ways — npm, the
Claude Code plugin and a Claude Desktop extension — from one version (0008), why the same
tools are also published as a Tool library (0009), and why the Task Worker tools are the one
write path, behind their own flag (0010).

## Tool library

The npm package also exports the curated tools for an Agent running in your own Node process —
no MCP protocol, no subprocess — as `@clear-initiative/mcp/library` (ADR-0009). Same tools, same
descriptions, same results as the server; the escape hatch is not included. The upstream
credential is pluggable: an API key, or headers forwarded from your signed-in user (their session
`cookie`), so every call runs with exactly that user's clear-api permissions.

```ts
import {
  createLocationIndex,
  createUpstream,
  curatedTools,
  runTool,
  silentLogger,
  THIRD_PARTY_CONTENT_RULE, // put this in your Agent's system prompt
  type Config,
} from "@clear-initiative/mcp/library";

// Once per process. The location index behind clear_find_location holds data only — tiers per
// locale, never an upstream or a credential — so one instance is shared by every user.
const tools = curatedTools({ locationIndex: createLocationIndex() });

// Per request: the signed-in user's session and locale.
const config: Config = {
  apiUrl: "https://api.clear.example.org",
  credential: { kind: "headers", headers: { cookie } },
  locale: "fr",
  rawGraphql: false,
  logLevel: "silent",
};
const upstream = createUpstream({ config });

const tool = tools.find((t) => t.name === "clear_list_events")!;
const outcome = await runTool(tool, { limit: 5 }, { config, upstream, log: silentLogger() });
if (!outcome.ok) console.warn(outcome.error.code); // e.g. BAD_USER_INPUT, FORBIDDEN — a value, never thrown
```

Each tool is `{ name, description, input, output, run }`, and `run` resolves to
`{ ok: true, value }` or `{ ok: false, error: { code, subCode?, message } }`. `input` and `output`
are **zod v4** object schemas from this package's own `zod` dependency, whatever zod version your
app uses. Treat them as [Standard Schema](https://standardschema.dev) values — validate with them,
convert them to JSON Schema, or pass them to a framework such as Mastra as they are — but never
compose them with your own zod (`z.union`, `.extend`, …): two zod copies do not mix.
Call tools through `runTool(tool, args, ctx)` — the same path the MCP server takes: it validates
`args` against `input` (invalid input is a `BAD_USER_INPUT` value) and then runs the tool.
Set `rawGraphql: false`: the escape hatch is never part of the library, and `clear_whoami`
reports this flag as `escapeHatchEnabled`. Locale is per upstream, never a tool argument.

The location index loads each locale's tiers once, through whichever request first needs them,
and shares them across users — this relies on clear-api's `locations(level)` returning the same
tiers to every Caller. Known limitation: the cache never expires, so locations added to clear-api
appear only after a restart.

Pass `signal` in the context (`runTool(tool, args, { …, signal })`) to abort a tool's upstream
requests when, say, the user stops an Agent turn; the tool returns a `CANCELLED` value. This needs
Node 20.3+ (`AbortSignal.any`).

The library reads its own `package.json` at load, so it runs on Node only; in Next.js, list
`@clear-initiative/mcp` in `serverExternalPackages`.

## Skills

The tools tell an agent *what* it can call; the skills in [`skills/`](skills/) tell it *how to
use them together* — the five-tier data model, which tool answers which question, and the
citation and third-party-content rules that make an answer trustworthy.

| Skill | Use it for |
|---|---|
| [`clear-briefing`](skills/clear-briefing/) | "What is happening in X?" — orient, locate, then work down alerts → events → signals, with the data model and filter reference alongside |
| [`clear-evidence`](skills/clear-evidence/) | Numbers, sources and citations — knowledge-base search, datapoints with their data-quality scores, figures, situation analyses |
| [`clear-graphql`](skills/clear-graphql/) | The developer escape hatch — exploring the schema and writing narrow read-only queries for fields the curated tools do not cover |
| [`clear-analysis-scope`](skills/clear-analysis-scope/) | Fixing what an answer is about — locations and/or a crisis plus a period — before spending calls; multi-district scopes and the subtree traps |
| [`clear-situation-analysis`](skills/clear-situation-analysis/) | A situation analysis for a scope in a fixed section order — summary, key figures, needs by severity, event picture, recent alerts — with a staleness check |
| [`clear-sitrep`](skills/clear-sitrep/) | Freezing an analysis into a dated, immutable Situation Report with a provenance record |
| [`clear-weekly-brief`](skills/clear-weekly-brief/) | The recurring weekly operational brief per area of operation — incidents, trend, analysis, draft advisories, media |

The first three teach the tools; the last four are workflows over them, drawn from the Situation
analysis PRD. They are plain [Agent Skills](https://agentskills.io) (a `SKILL.md` plus `references/`), so any
harness that reads skills from disk can use them. Three ways to install:

**As the Claude Code plugin** (recommended) — the [plugin install](#claude-code-plugin-recommended)
above ships every skill together with the server that runs them, and `claude plugin update` keeps
them in step.

**From the npm package**, which ships `skills/` alongside `dist/`:

```bash
npm install -g @clear-initiative/mcp
cp -R "$(npm root -g)/@clear-initiative/mcp/skills/"* ~/.claude/skills/
```

**By hand** — copy any skill directory into `~/.claude/skills/` (all your projects) or a repo's
`.claude/skills/` (that repo only, versioned with it).

The Claude Desktop extension carries the server only; its skills are the same `skills/`
directories, added through whatever skill support your Claude app offers.

Skills are read-only instructions. They carry no credentials and grant no access: every tool call
they describe still runs as your API key and nothing more.

## Development

```bash
bun run test             # vitest — every test goes through an MCP client over InMemoryTransport
bun run lint
bun run typecheck        # runs codegen first
bun run build            # codegen + tsc → dist/ (Node 20+ compatible ESM)
bun run refresh-schema   # re-snapshot schema.graphql from a dev/staging clear-api
bun run test:live        # live suite; needs CLEAR_API_URL + CLEAR_MCP_TEST_KEY_{VIEWER,PENDING,REVOKED}
bun run build:mcpb       # build + stage + smoke-run + pack the Claude Desktop extension → build/*.mcpb
bun run set-version X.Y.Z  # bump package.json, plugin.json (and its npm pin) and the mcpb manifest together
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

## Releasing

One version covers all three install channels — `package.json`, `.claude-plugin/plugin.json`
(including the npm version its server pins) and `mcpb/manifest.json`. `tests/packaging.test.ts`
fails if they drift.

```bash
bun run set-version 0.2.0     # writes all three; commit it in a PR and merge
git tag v0.2.0 && git push origin v0.2.0
```

The tag runs [`.github/workflows/release.yml`](.github/workflows/release.yml): the CI gates, then
`npm publish`, then a GitHub Release with `clear-mcp-0.2.0.mcpb` attached. A tag
with a prerelease suffix (`v0.2.0-rc.1`) publishes under npm's `next` dist-tag and marks the Release
as a prerelease. Push the tag right after merging — until it publishes, the plugin on `main` pins an
npm version that does not exist yet. `bun run build:mcpb` builds the extension locally into
`build/`; CI uploads one from every PR as an artifact for trying in Claude Desktop. Why three
channels and not one: [ADR-0008](docs/adr/0008-three-install-channels.md).

Contributor conventions live in [`AGENTS.md`](AGENTS.md) and [`CLAUDE.md`](CLAUDE.md).
