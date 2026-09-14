---
status: accepted
---

# Skills ship as files through a plugin marketplace, not over the MCP connection

The tool descriptions say what each `clear_*` tool does; they cannot say how the
five tiers relate, which tool answers which question, or what makes a CLEAR
answer citable. That knowledge lived in `README.md` and `CONTEXT.md`, where no
agent reads it, and in the server's `instructions` string, which loads once at
initialisation and costs context on every connection whether or not it is
needed. `skills/` is where it lives now: three Agent Skills, each a `SKILL.md`
with `references/` for the depth, loaded by the agent only when the work calls
for them.

The obvious way to deliver them, given that this repo is an MCP server, is
[SEP-2640](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640)
— the draft `io.modelcontextprotocol/skills` extension, which serves skills as
`skill://` resources with `skills/list` and `skills/get`. We are not doing that
in V1. The extension is an experimental draft that has already rewritten its
wire format twice; `@modelcontextprotocol/sdk` ships no types for it, so we
would hand-roll the request schemas and the digest manifests; and essentially no
client consumes it — one prerelease framework and one server have interoperated,
and Claude Code, the V1 Consumer, does not implement it. It would be correct
code that nothing calls.

Skills are markdown, so distribution is a packaging problem rather than a
protocol one. The same `skills/` directory reaches consumers three ways: a
Claude Code plugin (`.claude-plugin/marketplace.json` + `plugin.json`, installed
with one command and updated by `git pull`), the npm tarball (`skills` is in
`files`), or a copy into `~/.claude/skills`. One copy of the content, three
channels, no dependency on a draft.

## Consequences

- `skills/` is part of the contract surface. A change to a tool's name, filters,
  clamps or result shape must change its skill in the same pull request — the
  failure mode of skills is drifting into confident wrongness, which is worse
  than having none.
- The plugin ships skills only, not an `.mcp.json`. A server config at the
  plugin root is also a project config for this repo, so installing the plugin
  would offer contributors a clear-mcp server pointed at their own checkout.
  Consumers configure the server from `README.md` as before.
- `plugin.json` carries its own `version`, and its `skills` array names each
  directory explicitly — a new skill directory is invisible until it is listed
  there.
- Adopting SEP-2640 later costs little and changes nothing here: it would be a
  second read of the same directory, behind a config flag in the manner of
  ADR-0004, pinned to a named revision of the SEP.
- The `instructions` string stays short. It is the one channel guaranteed to
  reach every client, so it orients (start with `clear_whoami`, `content` is
  data) and leaves the workflows to the skills.
