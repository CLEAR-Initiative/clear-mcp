/**
 * The three install channels (npm, the Claude Code plugin, the Claude Desktop
 * extension) each write the version and the server's configuration down
 * separately. Pin them to each other so a release cannot ship a plugin that
 * runs a different server version than its skills describe, or an extension
 * that sets a variable the server does not read.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { connect, type Seam } from "./helpers/seam.js";

const read = <T>(path: string): T => JSON.parse(readFileSync(resolve(import.meta.dirname, "..", path), "utf8")) as T;

interface ServerConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
}
interface UserConfigOption {
  required?: boolean;
  sensitive?: boolean;
}

const pkg = read<{ name: string; version: string; bin: Record<string, string>; files: string[] }>("package.json");
const plugin = read<{ version: string; mcpServers: Record<string, ServerConfig>; userConfig: Record<string, UserConfigOption> }>(
  ".claude-plugin/plugin.json",
);
const manifest = read<{
  version: string;
  server: { entry_point: string; mcp_config: ServerConfig };
  user_config: Record<string, UserConfigOption>;
  tools: { name: string }[];
}>("mcpb/manifest.json");

/** `${user_config.x}` placeholders referenced by an env block. */
const placeholders = (env: Record<string, string>) =>
  Object.values(env).flatMap((v) => [...v.matchAll(/\$\{user_config\.(\w+)\}/g)].map((m) => m[1]));

describe("install channels", () => {
  let seam: Seam;
  afterEach(async () => {
    await seam?.close();
  });

  it("carry one version, and the plugin runs exactly that npm version", () => {
    expect(plugin.version).toBe(pkg.version);
    expect(manifest.version).toBe(pkg.version);
    expect(plugin.mcpServers.clear.command).toBe("npx");
    expect(plugin.mcpServers.clear.args).toEqual(["-y", `${pkg.name}@${pkg.version}`]);
  });

  it("set the same variables, from settings each channel declares, with the key kept secret", () => {
    for (const [channel, config, options] of [
      ["plugin", plugin.mcpServers.clear, plugin.userConfig],
      ["mcpb", manifest.server.mcp_config, manifest.user_config],
    ] as const) {
      expect(Object.keys(config.env).sort(), channel).toEqual(["CLEAR_API_KEY", "CLEAR_API_URL", "CLEAR_MCP_LOCALE"]);
      expect(placeholders(config.env).sort(), channel).toEqual(Object.keys(options).sort());
      expect(options.api_url.required, channel).toBe(true);
      expect(options.api_key, channel).toMatchObject({ required: true, sensitive: true });
      // The escape hatch is developer-only (ADR-0004): no one-click channel may switch it on.
      expect(config.env, channel).not.toHaveProperty("CLEAR_MCP_RAW_GRAPHQL");
    }
  });

  it("point the extension at the published entrypoint", () => {
    expect(manifest.server.entry_point).toBe(pkg.bin["clear-mcp"]);
    expect(manifest.server.mcp_config.args).toEqual([`\${__dirname}/${pkg.bin["clear-mcp"]}`]);
    expect(pkg.files).toEqual(expect.arrayContaining(["dist", "schema.graphql", "skills"]));
  });

  it("list the tools the server actually serves in the extension manifest", async () => {
    seam = await connect();
    const { tools } = await seam.client.listTools();
    expect(manifest.tools.map((t) => t.name)).toEqual(tools.map((t) => t.name));
  });
});
