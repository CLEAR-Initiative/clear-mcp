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

Then ask: *"Who am I in CLEAR?"* — the agent calls `clear_whoami`.

## Tools

| Tool | Group | What it does |
|---|---|---|
| `clear_whoami` | Orient | Caller identity, teams and their scope locations, locale, escape-hatch flag, API URL |

All tools are read-only. See [`CONTEXT.md`](CONTEXT.md) for vocabulary and
[`docs/adr/`](docs/adr/) for the decisions behind the design.

## Development

```bash
bun run test        # vitest — every test goes through an MCP client over InMemoryTransport
bun run lint
bun run typecheck
bun run build       # tsc → dist/ (Node 20+ compatible ESM)
```
