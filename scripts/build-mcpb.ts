#!/usr/bin/env bun
/**
 * Build the Claude Desktop extension: `build/clear-mcp-<version>.mcpb`.
 *
 *   bun run build:mcpb
 *
 * An `.mcpb` is a zip of the server plus its production `node_modules` and
 * `mcpb/manifest.json`; Claude Desktop runs it on its bundled Node and prompts
 * for the manifest's `user_config` (the API key goes to the OS keychain). The
 * bundle is staged in `build/mcpb/` from the same `dist/` npm publishes, with
 * production dependencies installed from `bun.lock`, then smoke-run under Node
 * before packing — a dependency missing from the bundle fails here, not on a
 * Consumer's machine.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const stage = resolve(root, "build/mcpb");
const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { version: string };
const out = resolve(root, `build/clear-mcp-${version}.mcpb`);

function run(cmd: string, args: string[], cwd = root): void {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (r.status !== 0) {
    process.stderr.write(`build-mcpb: \`${cmd} ${args.join(" ")}\` exited ${r.status}\n`);
    process.exit(1);
  }
}

if (!existsSync(resolve(root, "dist/bin.js"))) {
  process.stderr.write("build-mcpb: dist/bin.js missing — run `bun run build` first\n");
  process.exit(1);
}

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const f of ["dist", "schema.graphql", "package.json", "bun.lock", "LICENSE", "README.md"]) {
  cpSync(resolve(root, f), resolve(stage, f), { recursive: true });
}
cpSync(resolve(root, "mcpb/manifest.json"), resolve(stage, "manifest.json"));

run("bun", ["install", "--production", "--frozen-lockfile", "--ignore-scripts"], stage);
rmSync(resolve(stage, "bun.lock"));

// The staged server must load under Node with only its bundled dependencies:
// with no env it exits 1 naming CLEAR_API_KEY, after every import resolved.
const smoke = spawnSync("node", ["dist/bin.js"], { cwd: stage, env: { PATH: process.env.PATH ?? "" }, encoding: "utf8" });
if (smoke.status !== 1 || !smoke.stderr.includes("CLEAR_API_KEY")) {
  process.stderr.write(`build-mcpb: staged server failed its smoke run (exit ${smoke.status}):\n${smoke.stderr}\n`);
  process.exit(1);
}

rmSync(out, { force: true });
run("bunx", ["mcpb", "pack", stage, out]);
process.stderr.write(`build-mcpb: wrote ${out}\n`);
