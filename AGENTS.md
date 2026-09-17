# Agent Instructions

> Read `CLAUDE.md` for project context and the hard rules (read-only, stderr-only logging, no PII
> selections) before changing anything under `src/`.

## Issue tracking

Issues and PRDs live in **Exponential** (workspace `clear`, product `clear`, feature
`cmty5pgfd0003jz04pfoyibx0` "CLEAR MCP server") via the `exponential` CLI — not GitHub Issues. See
[docs/agents/issue-tracker.md](docs/agents/issue-tracker.md) for conventions. From an agent, always
prefix calls with `HOME=~/.config/agent-homes/<agent>` so writes are attributed correctly.

```bash
HOME=~/.config/agent-homes/claude exponential tickets list --product clear --status READY_TO_PLAN
HOME=~/.config/agent-homes/claude exponential tickets get <ticket-cuid>
HOME=~/.config/agent-homes/claude exponential tickets update --id <ticket-cuid> --status IN_PROGRESS
HOME=~/.config/agent-homes/claude exponential actions update --id <action-id> --status COMPLETED
HOME=~/.config/agent-homes/claude exponential tickets comment add --id <ticket-cuid> -m "<body>"
```

Use `/start-ticket` and `/ship-ticket` to bookend work on a ticket. Tickets carry numbered
**actions**; work them in order, one commit per action, and mark each `COMPLETED` as its commit lands.

## Git flow

Trunk-based: branch off `main`, PR against `main`. See [docs/agents/git-flow.md](docs/agents/git-flow.md).

## Quality gates

Every PR must pass, locally and in CI (`.github/workflows/ci.yml`):

```bash
bun run codegen && git diff --exit-code src/gql   # generated types in sync with schema + documents
bun run lint
bun run typecheck
bun run build
bun run test
bun scripts/build-mcpb.ts   # Desktop extension: stage, smoke-run under Node, pack (CI uploads it)
```

Nightly (`.github/workflows/nightly.yml`) runs the live suite (`bun run test:live`, gated
`CLEAR_MCP_LIVE=1`) and the snapshot-drift check against staging. **Never mute or make optional** —
it is the only alarm for schema drift and for a changed auth contract.

`schema.graphql` must equal the SDL of the target clear-api. Refresh it with
`CLEAR_API_URL=… CLEAR_API_KEY=… bun run refresh-schema` against dev/staging (introspection is off
in production) and commit the diff together with any tool changes it forces.

## Releasing

One version covers npm, the Claude Code plugin and the Claude Desktop extension (ADR-0008).

```bash
bun run set-version X.Y.Z                      # package.json, .claude-plugin/plugin.json (+ npm pin), mcpb/manifest.json
# PR → merge, then tag the merge commit on main straight away:
git tag vX.Y.Z && git push origin vX.Y.Z
```

The tag runs `.github/workflows/release.yml`: the gates above, `npm publish` (provenance; needs the
`NPM_TOKEN` secret), and a GitHub Release with `clear-mcp-X.Y.Z.mcpb` attached. A `-suffix` version
publishes to npm's `next` tag as a prerelease. Tag promptly — until the tag publishes, the plugin on
`main` pins an npm version that does not exist. Re-running a tag is safe. Never hand-edit a version:
`tests/packaging.test.ts` and the workflow both refuse a mismatch.

## How tools are tested

One seam only: an MCP `Client` over `InMemoryTransport` calling the real server, with `fetch`
replaced by a fixture responder keyed on GraphQL `operationName` (`tests/helpers/seam.ts`). A test
reads as "call tool X with Y → get Z, and the upstream saw W". Do not import `src/tools/*` or
`src/upstream.ts` from a test; if something can't be asserted through a tool call, that is a design
smell to fix in the tool, not in the test.

## Landing the Plane (Session Completion)

**When ending a work session**, complete ALL steps below. Work is NOT complete until `git push`
succeeds.

1. **File tickets for remaining work** — `exponential tickets create --product clear --feature cmty5pgfd0003jz04pfoyibx0 --type <TYPE> --status BACKLOG -t "<title>" -b "<body>"`
2. **Run quality gates** (above)
3. **Update ticket status** — `--status QA` for finished work; leave a comment with handoff context
   on anything still in flight
4. **PUSH TO REMOTE** — `git pull --rebase && git push && git status` must show up to date
5. **Hand off** — provide context for the next session

- NEVER stop before pushing; NEVER say "ready to push when you are"
- If push fails, resolve and retry until it succeeds
