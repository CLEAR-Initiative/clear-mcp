---
status: accepted
---

# v1 is strictly read-only, including the raw GraphQL escape hatch

clear-mcp exposes no mutation tools in v1, and the developer-only
`clear_graphql` escape hatch (behind `CLEAR_MCP_RAW_GRAPHQL=1`) rejects any
document containing a `mutation` operation even when enabled. The reason is
specific to CLEAR: much of what an agent reads through these tools is
attacker-writable text — raw X posts, WhatsApp ground messages, third-party
PDFs — that lands directly in the model's context. With a read-only server an
injection can at worst mislead an answer; with writes it could create signals,
escalate events, or edit a crisis under the caller's valid API key, and
clear-api would correctly honour it. Writes will arrive later behind their own
flag with per-call confirmation, and get their own ADR then. Do not "fix" this
by adding a create tool.
