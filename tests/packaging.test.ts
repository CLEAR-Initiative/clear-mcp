/**
 * The three install channels (npm, the Claude Code plugin, the Claude Desktop
 * extension) each write the version and the server's configuration down
 * separately. Pin them to each other so a release cannot ship a plugin that
 * runs a different server version than its skills describe, or an extension
 * that sets a variable the server does not read. The npm package also
 * carries the Tool library entry (ADR-0009): pin that it ships typed.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
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

const pkg = read<{
  name: string;
  version: string;
  bin: Record<string, string>;
  exports: Record<string, string | Record<string, string>>;
  files: string[];
  dependencies: Record<string, string>;
}>("package.json");
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
      // Nor the Worker tools (ADR-0010): a Worker process sets that flag itself.
      expect(config.env, channel).not.toHaveProperty("CLEAR_MCP_WORKER");
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

describe("Tool library entry", () => {
  // Emit the build into a scratch dir (what `bun run build` puts in dist/) so
  // this holds without a prior build.
  let out: string;
  beforeAll(() => {
    out = mkdtempSync(join(tmpdir(), "clear-mcp-build-"));
    const root = resolve(import.meta.dirname, "..");
    execFileSync(join(root, "node_modules", ".bin", "tsc"), ["-p", "tsconfig.build.json", "--outDir", out], { cwd: root });
  });
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  /** A `./dist/…` path from package.json, in the scratch build. */
  const built = (path: string) => join(out, path.replace(/^\.\/dist\//, ""));

  it("is exported as ./library with types, shipped under dist/", () => {
    expect(pkg.exports["./library"]).toEqual({ types: "./dist/library.d.ts", default: "./dist/library.js" });
    expect(pkg.files).toContain("dist");
    expect(existsSync(built("./dist/library.js"))).toBe(true);
    expect(existsSync(built("./dist/library.d.ts"))).toBe(true);
  });

  it("ships declarations that never reach the MCP SDK or the server", () => {
    // Walk the relative imports of library.d.ts; every one must have shipped.
    const seen = new Set<string>();
    const walk = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      expect(existsSync(file), file).toBe(true);
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/@modelcontextprotocol/);
      for (const [, spec] of source.matchAll(/from "(\.{1,2}\/[^"]+)\.js"/g)) {
        walk(resolve(dirname(file), `${spec}.d.ts`));
      }
    };
    walk(built("./dist/library.d.ts"));
    expect([...seen].some((f) => f.endsWith("/tools/types.d.ts"))).toBe(true);
    expect([...seen].filter((f) => /\/(server|bin|escape-hatch)\.d\.ts$/.test(f))).toEqual([]);
  });

  it("imports only declared dependencies from every shipped .js and .d.ts", () => {
    // A devDependency named here (types included) is missing from a Consumer's install.
    const packageOf = (spec: string) => spec.split("/").slice(0, spec.startsWith("@") ? 2 : 1).join("/");
    const undeclared: string[] = [];
    for (const file of readdirSync(out, { recursive: true, encoding: "utf8" })) {
      if (!/\.(js|d\.ts)$/.test(file)) continue;
      const source = readFileSync(join(out, file), "utf8");
      for (const [, spec] of source.matchAll(/\b(?:from|import)\s*\(?\s*["']([@a-z][\w@./-]*)["']/g)) {
        if (spec!.startsWith("node:") || packageOf(spec!) in pkg.dependencies) continue;
        undeclared.push(`${file}: ${spec}`);
      }
    }
    expect(undeclared).toEqual([]);
  });
});
