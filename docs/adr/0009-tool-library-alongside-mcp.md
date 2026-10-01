---
status: accepted
---

# The Curated tools are also published as a Tool library, alongside MCP

clear-mvp's **CLEAR Agent** needs the same CLEAR data tools that Claude clients get over MCP.
Rather than speak the MCP protocol in-process, or rewrite the tools in clear-mvp, clear-mcp
exports its **Curated tools** as a **Tool library**: the `defineTool` definitions (name,
description, zod input/output, `run`) plus the upstream client, for an Agent to use directly.
MCP becomes one way of publishing the tools, and the library another. The value of clear-mcp is
the curation (which operations, descriptions written for a model, result shaping, the `content`
key for third-party text, schema-snapshot tests), not the protocol.

## Considered options

- **The MCP protocol over an in-memory transport.** Identical to what Claude clients see, but
  adds protocol overhead for nothing, loses zod types through the JSON Schema round trip,
  wraps results in MCP payloads, and makes Agent-specific additions awkward.
- **Native tools in clear-mvp calling clear-api directly.** Full control, but rebuilds the
  curation, and two tool sets drift until Claude Code and the CLEAR Agent answer the same
  question differently.
- **A hosted clear-mcp over Streamable HTTP.** Still the plan for Claude.ai and other remote
  clients (ADR-0001), but for an in-process Agent it means a new deployable and new
  short-lived tokens it doesn't need.

## Consequences

- The upstream credential becomes pluggable: an `sk_live_` key for MCP Consumers, or
  forwarded request headers (the signed-in user's session) for the CLEAR Agent. clear-mcp
  still holds no credentials of its own.
- clear-mcp now has a library API to version alongside the server. A tool must behave
  identically through both, and tests should assert it.
- Which tools a Consumer *offers* is the Consumer's choice. clear-api remains the only
  security boundary.
