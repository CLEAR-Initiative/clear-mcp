# CLEAR MCP

The Model Context Protocol server that lets an AI agent read CLEAR's humanitarian
data — signals, events, alerts, crises, situation analyses, and the knowledge
base — through clear-api. Domain terms for the data itself (Signal, Event, Alert,
Crisis, Location, Data Source, Push Feed…) are owned by clear-api's
[CONTEXT.md](../clear-api/CONTEXT.md) and are not redefined here.

## Language

**Tool**:
One named, typed operation an agent can call. Each tool wraps one or two
clear-api queries behind a fixed, narrow result shape.
_Avoid_: endpoint, command, function

**Curated tool**:
A tool designed around a job the agent is doing (find a location, count events,
read a situation analysis) rather than mirroring a clear-api field one-to-one.
The curated tools are the product.
_Avoid_: wrapper, generated tool

**Escape hatch**:
The developer-only raw GraphQL tool, off by default, that accepts any read-only
query against clear-api. Never on for non-developer audiences.
_Avoid_: admin mode, power mode, passthrough

**Schema snapshot**:
The committed copy of clear-api's GraphQL SDL that clear-mcp is built and
tested against. Drift between the snapshot and clear-api is a contract break.
_Avoid_: schema cache, introspection result

**Consumer**:
The MCP client on whose behalf tools run — in v1 a developer's Claude Code /
Claude Desktop, later an analyst's Claude.ai.
_Avoid_: user (ambiguous with clear-api's User), client (ambiguous with the
GraphQL client inside clear-mcp)

**Caller**:
The clear-api identity the Consumer's API key resolves to. Every tool runs with
exactly the Caller's permissions; clear-mcp adds none of its own.
_Avoid_: principal, service account

**Third-party content**:
Free text that originated outside CLEAR — signal bodies, report chunks,
comments — and is therefore attacker-writable. Every tool returns it under a
distinct `content` key and declares it as data, never as instructions.
_Avoid_: payload, body, raw text

## Tool groups

**Orient**:
Tools the agent calls first to learn its own scope and to resolve place names
to CLEAR locations.

**Retrieve**:
Knowledge-base search over ingested reports.

**Monitor**:
Listing, counting, and fetching along the Signals → Events → Alerts ladder.

**Analyse**:
The curated tier: crises, situation analyses, aggregated datapoints, figures.

## Relationships

- A **Consumer** authenticates as exactly one **Caller**; clear-mcp never holds
  credentials for anyone else
- Every **Curated tool** and the **Escape hatch** is read-only in v1
- The **Escape hatch** is enabled per **Consumer** by configuration, never
  by role
