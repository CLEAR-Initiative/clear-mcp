---
status: accepted
---

# clear-mcp is a separate service that talks to clear-api over GraphQL

The obvious design was an in-process `/mcp` mount inside clear-api, executing
GraphQL documents against the live schema with the real request `Context` so
auth, team-scope filters, and dataloaders were reused for free. We chose a
separate service instead: clear-mcp is a thin adapter that forwards the
caller's `sk_live_` API key to clear-api and holds no data or authorisation
logic of its own. clear-api stays the single authority — it enforces every
guard on every request regardless of who calls, so the security argument did
not favour either option. What decided it: the MCP surface must be deployable
and versionable independently, rate-limited separately for bursty agent
traffic, pointable at prod / staging / a local clear-api by config, and able to
front other backends later under one endpoint. Being a separate process is
also what lets it run *locally*: the first release is a stdio server spawned by
the developer's MCP client with `CLEAR_API_URL` + `CLEAR_API_KEY` in its
config, so nothing is deployed and no new auth surface exists. The package is
transport-agnostic; a hosted Streamable HTTP mode is a later addition for the
Claude.ai / analyst audience, and is the point at which OAuth becomes
necessary.

## Consequences

- Every tool call costs a network hop to clear-api. Accepted.
- Schema drift (a renamed field silently breaking a tool) is a real risk;
  mitigate with GraphQL codegen against clear-api's schema in CI.
- clear-mcp never sees `Context` internals (translation loader, locale
  resolution, representative-point loader); anything it needs from those must
  be expressed through the public GraphQL surface.
