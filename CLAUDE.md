# CLAUDE.md

Project context for AI coding assistants working in `clear-mcp`.

## What this is

A Model Context Protocol server that lets an AI agent read CLEAR's humanitarian data through
[clear-api](https://github.com/CLEAR-Initiative/clear-api)'s GraphQL endpoint. It is a **thin,
read-only adapter**: it forwards the Consumer's `sk_live_` key and holds no data, authorisation, or
credentials of its own. Vocabulary lives in [CONTEXT.md](CONTEXT.md); the decisions with a "why" in
[docs/adr/](docs/adr/) (0001–0008). The full decision record — implementation decisions, tool
contract table, constraints and every rejected alternative — is the "Agent PRD" section of the
feature's PRD page in Exponential: `HOME=~/.config/agent-homes/claude exponential pages get
cmty5qb4v0001l204e01rydet --json` (feature `cmty5pgfd0003jz04pfoyibx0`). When you make a decision
that is not derivable from the code, add an ADR here and, if it changes a contract, a comment on
the ticket. Tickets live in Exponential (see `AGENTS.md`).

## Tech stack

- **Runtime**: Bun for development and tests; build output (`dist/`) runs on Node 20+ (`npx`)
- **Distribution** (ADR-0008): npm `@clear-initiative/mcp`, the Claude Code plugin (`.claude-plugin/`,
  server + skills), and a Claude Desktop extension (`mcpb/` → `.mcpb`) — one version, one `dist/`
- **Language**: TypeScript, strict, ES2023, NodeNext ESM (relative imports carry `.js`)
- **Protocol**: `@modelcontextprotocol/sdk` — `McpServer`, stdio transport in V1
- **Schemas**: zod v4 for config and tool input/output (the SDK derives JSON Schema from them)
- **GraphQL**: committed `schema.graphql` snapshot + `@graphql-codegen` client preset → `src/gql`
- **Logging**: pino to file descriptor 2 only
- **Tests**: vitest, one seam (see below)

## Commands

```bash
bun install
bun run dev              # bun src/bin.ts (needs CLEAR_API_URL + CLEAR_API_KEY)
bun run test             # vitest run
bun run lint             # eslint .
bun run typecheck        # codegen + tsc --noEmit
bun run build            # codegen + tsc → dist/
bun run codegen          # regenerate src/gql from schema.graphql + documents
bun run refresh-schema   # re-snapshot schema.graphql from a live dev/staging clear-api
bun run build:mcpb       # build + stage + smoke-run + pack the Desktop extension → build/*.mcpb
bun run set-version X.Y.Z  # bump package.json, plugin.json (+ its npm pin), mcpb/manifest.json together
```

Release: `bun run set-version X.Y.Z` in a PR → merge → `git tag vX.Y.Z && git push origin vX.Y.Z`.
`.github/workflows/release.yml` publishes to npm and attaches the `.mcpb` to a GitHub Release.

## Module map

| Module | Responsibility |
|---|---|
| `src/config.ts` | Parses the five `CLEAR_*` env vars with zod; missing required vars → exit 1, named on stderr |
| `src/upstream.ts` | The single GraphQL client. Adds `Authorization`, `x-force-locale`, `User-Agent: clear-mcp/<version> (<tool>)`; normalises every failure to `{ ok: false, error: ToolError }` |
| `src/server.ts` | `createServer({ config, fetch })` — builds the `McpServer`, registers tools, exposes `selfCheck()` |
| `src/tools/*` | One module per Curated tool: `{ name, description, input, output, run }` via `defineTool` |
| `src/location-index.ts` | In-memory levels 0–2 index behind `clear_find_location`; loaded once per process |
| `src/gql/` | Generated — never edit by hand; commit the output |
| `src/bin.ts` | stdio entrypoint |
| `skills/` | The Agent Skills shipped to Consumers — `clear-briefing`, `clear-evidence`, `clear-graphql` teach the tools; `clear-analysis-scope`, `clear-situation-analysis`, `clear-sitrep`, `clear-weekly-brief` are analysis workflows over them. Plain markdown; distributed as a Claude Code plugin via `.claude-plugin/` and in the npm tarball (ADR-0007) |
| `scripts/refresh-schema.ts` | Introspects a clear-api and rewrites `schema.graphql` |
| `.claude-plugin/` | The Claude Code plugin + marketplace: `plugin.json` lists the skills and declares the server (`mcpServers` → pinned `npx @clear-initiative/mcp@<version>`, `userConfig` for URL / key / locale) |
| `mcpb/manifest.json` | The Claude Desktop extension manifest (`user_config`, display `tools` list) |
| `scripts/build-mcpb.ts` | Stages `dist/` + production `node_modules` in `build/mcpb/`, smoke-runs it on Node, packs `build/clear-mcp-<version>.mcpb` |
| `scripts/set-version.ts` | Writes one version into `package.json`, `plugin.json` (and its npm pin) and `mcpb/manifest.json` |
| `tests/packaging.test.ts` | Pins the three install channels to one version, the same env vars, and the served tool list |
| `tests/helpers/seam.ts` | The test seam: MCP Client ↔ real server over `InMemoryTransport`, fixture `fetch` keyed by operation name, every document validated against the snapshot |

## Adding a tool

1. Create `src/tools/<name>.ts` exporting a `defineTool({...})` whose document is `graphql(/* GraphQL */ \`...\`)`.
   The selection set **is** the projection — select only what the output needs.
2. Add it to `curatedTools` in `src/tools/index.ts` (keep the `clear_` prefix).
3. `bun run codegen`, then write `tests/tools/<name>.test.ts` through the seam: happy path, the
   upstream request shape (variables forwarded verbatim), and any clamping/truncation rule.
4. Add a row to the README tools table.
5. Add it to the `tools` list in `mcpb/manifest.json` (`tests/packaging.test.ts` holds it equal to
   the served list).
6. Update the skill that covers it — `skills/clear-briefing` for Orient/Monitor,
   `skills/clear-evidence` for Retrieve/Analyse, `skills/clear-graphql` for the escape hatch.
   A tool's name, filters, clamps or result shape changing without its skill changing is the
   one way these skills fail badly (ADR-0007). The workflow skills call tools by name too —
   `grep -rn <tool> skills/` before you rename anything.

Result conventions: lists return `{ items, totalCount, hasMore, limit, offset }` with `limit`
clamped to [1, 25] (default 10) and long descriptions cut at 500 chars with `truncated: true`;
gets return `{ item }` / `{ item: null }` untruncated. Third-party text (signal bodies, report
chunks, comments) goes only under a `content` key.

## Hard rules

- **No mutation tools, ever, in V1** (ADR-0002). `clear_graphql` rejects non-`query` documents
  before any network call. Do not "fix" a missing write by adding a create tool.
- **stdout is the protocol channel.** Log to stderr only; no `console.log` anywhere in `src/`.
- **Never select** `Location.geometry`, `Location.children`, `Location.metadata`,
  `Event.signals { … }` beyond ids, `User.email`, `UserAlert`, `Notification`, or any org/user
  relation.
- **Every upstream request** carries `Authorization`, `x-force-locale`, and
  `User-Agent: clear-mcp/<version> (<tool>)` — only `src/upstream.ts` talks to the network.
- **At most two upstream requests per curated tool call**; `clear_find_location` amortises its
  load to once per process.
- **The server holds exactly one credential** (the Consumer's key) and forwards it unchanged.
- **One version, three channels.** Never hand-edit a version: `bun run set-version`. The plugin and the
  `.mcpb` may set only `CLEAR_API_URL`, `CLEAR_API_KEY` (sensitive) and `CLEAR_MCP_LOCALE` — never
  `CLEAR_MCP_RAW_GRAPHQL` (ADR-0004, ADR-0008).
- **Errors are values.** Tools return `isError: true` with `{ code, subCode?, message, upstreamUrl? }`
  preserved from clear-api's `extensions`; never throw on upstream conditions.
