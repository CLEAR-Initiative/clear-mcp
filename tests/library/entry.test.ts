/**
 * The `./library` entry is for an Agent in the same process: it must load
 * without the MCP SDK or the server, and its runtime surface is pinned so an
 * export cannot appear or vanish unnoticed (it is a published API).
 */
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

/** Import `src/library.ts` in a fresh Bun process and list every module it loaded. */
function loadedModules(): Promise<string[]> {
  const script = `await import("./src/library.ts"); console.log(JSON.stringify(Object.keys(require.cache)));`;
  return new Promise((resolve, reject) => {
    const child = spawn("bun", ["-e", script], { cwd: process.cwd() });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (code) =>
      code === 0 ? resolve(JSON.parse(stdout) as string[]) : reject(new Error(`bun exited ${code}: ${stderr}`)),
    );
  });
}

describe("library entry", () => {
  it("does not load the MCP SDK or the server", async () => {
    const modules = await loadedModules();
    expect(modules.some((m) => m.endsWith("/src/library.ts"))).toBe(true);
    expect(modules.filter((m) => m.includes("@modelcontextprotocol"))).toEqual([]);
    expect(modules.filter((m) => /\/src\/(server|bin|escape-hatch)\.ts$/.test(m))).toEqual([]);
  });

  it("exports exactly the library's runtime API", async () => {
    const library = await import("../../src/library.js");
    expect(Object.keys(library).sort()).toEqual([
      "ERROR_CODES",
      "SUPPORTED_LOCALES",
      "THIRD_PARTY_CONTENT_RULE",
      "createLocationIndex",
      "createUpstream",
      "curatedTools",
      "runTool",
      "silentLogger",
    ]);
  });
});
