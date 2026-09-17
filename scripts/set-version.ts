#!/usr/bin/env bun
/**
 * Set the release version everywhere it is written down, in one step:
 *
 *   bun run set-version 0.2.0
 *
 * - `package.json` `version` — what npm publishes and `User-Agent` reports
 * - `.claude-plugin/plugin.json` `version`, and the `@clear-initiative/mcp@<version>`
 *   pin its `mcpServers` entry runs, so plugin skills and server move together
 * - `mcpb/manifest.json` `version` — the Claude Desktop extension
 *
 * `tests/packaging.test.ts` fails if they disagree, and the release workflow
 * refuses a `v*` tag that does not match them.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  process.stderr.write("usage: bun run set-version <semver>, e.g. 0.2.0\n");
  process.exit(1);
}

const root = resolve(import.meta.dirname, "..");

function update(path: string, edit: (json: Record<string, unknown>) => void): void {
  const file = resolve(root, path);
  const json = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  edit(json);
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  process.stderr.write(`set-version: ${path} → ${version}\n`);
}

update("package.json", (pkg) => {
  pkg.version = version;
});
update(".claude-plugin/plugin.json", (plugin) => {
  plugin.version = version;
  const servers = plugin.mcpServers as Record<string, { args: string[] }>;
  for (const server of Object.values(servers)) {
    server.args = server.args.map((a) => a.replace(/^@clear-initiative\/mcp@.*$/, `@clear-initiative/mcp@${version}`));
  }
});
update("mcpb/manifest.json", (manifest) => {
  manifest.version = version;
});
