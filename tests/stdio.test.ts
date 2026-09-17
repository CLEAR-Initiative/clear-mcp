/**
 * The real binary over real stdio: config failures exit 1 naming the
 * variable, and a Consumer can complete `initialize` + `tools/list`.
 * Uses `bun src/bin.ts` so no build step is needed; the built `dist/bin.js`
 * is exercised by CI's build step.
 */
import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";

const BIN = ["src/bin.ts"];

function runBin(env: Record<string, string>): Promise<{ code: number | null; stderr: string; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn("bun", BIN, { env: { PATH: process.env.PATH ?? "", ...env }, cwd: process.cwd() });
    let stderr = "";
    let stdout = "";
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.on("close", (code) => resolve({ code, stderr, stdout }));
  });
}

describe("stdio entrypoint", () => {
  it("exits 1 naming the missing variables when CLEAR_API_URL / CLEAR_API_KEY are unset", async () => {
    const { code, stderr, stdout } = await runBin({});
    expect(code).toBe(1);
    expect(stderr).toContain("CLEAR_API_URL");
    expect(stderr).toContain("CLEAR_API_KEY");
    expect(stdout).toBe("");
  });

  it("exits 1 naming only the one variable that is missing", async () => {
    const { code, stderr } = await runBin({ CLEAR_API_URL: "http://localhost:4000" });
    expect(code).toBe(1);
    expect(stderr).toContain("CLEAR_API_KEY");
    expect(stderr).not.toContain("CLEAR_API_URL");
  });

  it("rejects an unsupported CLEAR_MCP_LOCALE", async () => {
    const { code, stderr } = await runBin({
      CLEAR_API_URL: "http://localhost:4000",
      CLEAR_API_KEY: "sk_live_x",
      CLEAR_MCP_LOCALE: "de",
    });
    expect(code).toBe(1);
    expect(stderr).toContain("CLEAR_MCP_LOCALE");
  });

  it("answers initialize and lists tools over stdio even when the self-check fails", async () => {
    // 127.0.0.1:1 refuses connections, so the startup `me` query fails fast.
    const transport = new StdioClientTransport({
      command: "bun",
      args: BIN,
      env: {
        PATH: process.env.PATH ?? "",
        CLEAR_API_URL: "http://127.0.0.1:1",
        CLEAR_API_KEY: "sk_live_x",
        CLEAR_MCP_LOG_LEVEL: "error",
        // Plugin and Desktop-extension installers pass an untouched optional
        // field as "" — it must fall back to the default, not fail validation.
        CLEAR_MCP_LOCALE: "",
      },
      stderr: "pipe",
    });
    let stderr = "";
    transport.stderr?.on("data", (d) => (stderr += String(d)));
    const client = new Client({ name: "stdio-test", version: "0.0.0" });
    try {
      await client.connect(transport);
      const info = client.getServerVersion();
      expect(info?.name).toBe("clear-mcp");
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain("clear_whoami");
      expect(names).toContain("clear_find_location");
      expect(names.every((n) => n.startsWith("clear_"))).toBe(true);

      // A tool call carries the same diagnostic the self-check logged.
      const result = await client.callTool({ name: "clear_whoami", arguments: {} });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
      expect(JSON.parse(text)).toMatchObject({
        code: "UPSTREAM_UNAVAILABLE",
        upstreamUrl: "http://127.0.0.1:1/graphql",
      });

      // The self-check failure went to stderr only (stdout stayed protocol-clean,
      // or the client above would have failed to parse a frame).
      const deadline = Date.now() + 5_000;
      while (!stderr.includes("self-check failed") && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(stderr).toContain("self-check failed");
      expect(stderr).toContain("UPSTREAM_UNAVAILABLE");
    } finally {
      await client.close();
    }
  });
});
