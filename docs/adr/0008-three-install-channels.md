---
status: accepted
---

# One release, three install channels: npm, the Claude Code plugin, a Claude Desktop extension

Until now a Consumer cloned this repo, ran `bun install`, and pointed their MCP
client at an absolute path to `src/bin.ts`. That is a developer's install, and
the V1 Consumer list already includes people who are not developers. Every
release now reaches Consumers three ways, each built from the same `dist/`:

1. **npm** — `@clear-initiative/mcp`, published from a `v*` tag. `npx -y @clear-initiative/mcp` works in any MCP client that can
   launch a command, on Node 20+.
2. **The Claude Code plugin** — `.claude-plugin/plugin.json` declares the server
   inline in `mcpServers`, running `npx -y @clear-initiative/mcp@<version>`, and
   declares `userConfig` for the API URL, the API key (`sensitive`, so it lands
   in the keychain rather than `settings.json`) and the locale. One plugin
   install gives the server and the skills that describe it.
3. **A Claude Desktop extension** — `clear-mcp-<version>.mcpb`, built from
   `mcpb/manifest.json` by `scripts/build-mcpb.ts` and attached to the GitHub
   Release. It bundles production `node_modules`, runs on Desktop's own Node,
   and prompts through `user_config` with the key stored in the OS keychain —
   no terminal, no Node, no JSON.

Alternatives considered:

- **npm only.** Solves "no clone, no build" but still asks every Consumer to
  hand-write JSON containing their key in plain text, and leaves the skills a
  separate install that can drift from the server they describe.
- **A hosted, remote MCP server.** The easiest install of all — a URL — but it
  is a new deployable with its own auth story, and ADR-0001 leaves a hosted
  Streamable HTTP mode as a later addition (V2). It stays there.
- **A root `.mcp.json` for the plugin.** Rejected in ADR-0007 because it doubles
  as this repo's project config. Declaring the server inside `plugin.json` has
  no such side effect: it exists only for someone who installed the plugin.
- **The plugin running an unpinned `@clear-initiative/mcp` (latest).** Upgrades
  would then land without the skills that describe them. The pin keeps the
  plugin's skills and server one version.

## Consequences

- One version, written in three files — `package.json`,
  `.claude-plugin/plugin.json` (with its npm pin) and `mcpb/manifest.json`.
  `bun run set-version` writes all three; `tests/packaging.test.ts` fails if
  they disagree; the release workflow refuses a tag that does not match them.
- The plugin on `main` pins a version that exists on npm only once its tag has
  been released. Tag the version-bump merge promptly.
- The packaging test also pins what the one-click channels may set: exactly
  `CLEAR_API_URL`, `CLEAR_API_KEY` and `CLEAR_MCP_LOCALE`, each from a declared
  setting, with the key required and sensitive. Neither may set
  `CLEAR_MCP_RAW_GRAPHQL` — the escape hatch stays a deliberate developer act
  (ADR-0004), reachable through npx or source only.
- Settings forms pass an untouched optional field as `""`, so the server treats
  an empty optional variable as unset rather than as invalid.
- The extension's `tools` list is display metadata for Desktop's install screen;
  the packaging test holds it equal to the tools the server actually lists.
- Publishing is public on npm, from a repository that is private. The package
  holds no credentials or data — it is the adapter only (ADR-0001) — but its
  compiled source and `skills/` are readable by anyone. The `.mcpb` Release
  asset is only as visible as the repository.
- No npm provenance. The registry rejects a provenance bundle from a private
  source repository (`E422 … repository visibility: "private"`, found on the
  first release). Turn `publishConfig.provenance` back on if the repository
  becomes public.
- Human setup, once: the `@clear-initiative` npm org and the `NPM_TOKEN` repo
  secret.
