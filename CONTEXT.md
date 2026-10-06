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
The client on whose behalf tools run — either an MCP client (a developer's Claude
Code / Claude Desktop, later an analyst's Claude.ai) or an Agent that uses the
**Tool library** in-process (clear-mvp's CLEAR Agent).
_Avoid_: user (ambiguous with clear-api's User), client (ambiguous with the
GraphQL client inside clear-mcp)

**Caller**:
The clear-api identity the Consumer's credential resolves to — an API key for MCP
clients, the signed-in user's session for the CLEAR Agent. Every tool runs with
exactly the Caller's permissions; clear-mcp adds none of its own.
_Avoid_: principal, service account

**Third-party content**:
Free text that originated outside CLEAR — signal bodies, report chunks,
comments — and is therefore attacker-writable. Every tool returns it under a
distinct `content` key and declares it as data, never as instructions.
_Avoid_: payload, body, raw text

**Install channel**:
One of the three ways a release reaches a Consumer — the npm package
(`npx -y @clear-initiative/mcp`), the Claude Code plugin (server and skills),
or the Claude Desktop extension (`.mcpb`). All three carry the same version
and the same server.
_Avoid_: distribution, flavour, edition

**Tool library**:
The **Curated tools** offered directly to an Agent running in the same process,
without the MCP protocol in between. Same tools, same descriptions, same results
as the MCP server — MCP is one way of publishing them, the Tool library another.
_Avoid_: SDK, client library, "MCP-less mode"

**Worker tools**:
The four Task writes — claim, heartbeat, complete, fail — a **Task Worker** drains
clear-api's Task queue with. Registered only when the process sets
`CLEAR_MCP_WORKER=1`; never a **Curated tool**, never in the **Tool library**, never
set by an **Install channel**. The only writes clear-mcp can send (ADR-0010).
_Avoid_: mutation tools, write mode, admin tools

**Task Worker**:
A process that claims Tasks from clear-api and completes them: the scheduled
Claude Code routine running the ImpactPrior skill, Dagster, a third-party agent.
Runs as clear-api's narrow `worker` role, which bounds what the **Worker tools**
can touch. Defined in clear-api's CONTEXT.md ("Tasks and Workers"); the CLEAR
Agent is never one.
_Avoid_: agent, bot, enricher

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
- Every **Curated tool** and the **Escape hatch** is read-only; the **Worker tools** are the one write path, under their own flag (ADR-0010)
- The **Escape hatch** is enabled per **Consumer** by configuration, never
  by role
- Every **Curated tool** behaves identically over MCP and through the **Tool library**
- clear-api alone decides what a **Caller** may see; a **Consumer** may choose which
  tools it *offers*, but that choice is never the security boundary
