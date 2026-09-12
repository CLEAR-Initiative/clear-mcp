/**
 * Live suite — the three things only a real clear-api can prove, plus the
 * team-scope subset check. Follows clear-api's tests/smoke/http-smoke.test.ts
 * pattern: probe, then `describe.skipIf`. Runs when CLEAR_API_URL and the
 * three test keys are set AND the target answers /health; CLEAR_MCP_LIVE=1
 * (nightly) turns a skip into a failure so a misconfigured job cannot pass
 * silently.
 *
 *   CLEAR_API_URL=https://api-staging.example \
 *   CLEAR_MCP_TEST_KEY_VIEWER=sk_live_… CLEAR_MCP_TEST_KEY_PENDING=sk_live_… \
 *   CLEAR_MCP_TEST_KEY_REVOKED=sk_live_… CLEAR_MCP_LIVE=1 bun run test:live
 *
 * Mint the keys with clear-api's scripts/create-pipeline-user.ts or /portal:
 * an approved `viewer`, a `pending` user, and a key that has been revoked.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { parseConfig } from "../../src/config.js";
import { silentLogger } from "../../src/logger.js";
import { createServer } from "../../src/server.js";

const REQUIRE_LIVE = process.env.CLEAR_MCP_LIVE === "1";
const API_URL = process.env.CLEAR_API_URL;
const KEYS = {
  viewer: process.env.CLEAR_MCP_TEST_KEY_VIEWER,
  pending: process.env.CLEAR_MCP_TEST_KEY_PENDING,
  revoked: process.env.CLEAR_MCP_TEST_KEY_REVOKED,
};
const REQUIRED = ["CLEAR_API_URL", "CLEAR_MCP_TEST_KEY_VIEWER", "CLEAR_MCP_TEST_KEY_PENDING", "CLEAR_MCP_TEST_KEY_REVOKED"];
const missing = REQUIRED.filter((n) => !process.env[n]);

async function probe(): Promise<boolean> {
  if (!API_URL) return false;
  try {
    const res = await fetch(`${API_URL.replace(/\/graphql$/, "").replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(8_000),
    });
    return res.status === 200 && (await res.text()).includes('"ok"');
  } catch {
    return false;
  }
}

const live = missing.length === 0 && (await probe());

/** A real server over InMemoryTransport with the real fetch and one test key. */
async function connectLive(apiKey: string) {
  const config = parseConfig({ CLEAR_API_URL: API_URL, CLEAR_API_KEY: apiKey, CLEAR_MCP_LOG_LEVEL: "silent" });
  const { server } = createServer({ config, log: silentLogger() });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "live-test", version: "0.0.0" });
  await server.connect(st);
  await client.connect(ct);
  const call = (name: string, args: Record<string, unknown> = {}) =>
    client.callTool({ name, arguments: args }) as Promise<CallToolResult>;
  const close = async () => {
    await client.close();
    await server.close();
  };
  return { call, close };
}

function errorOf(result: CallToolResult): { code: string; subCode?: string; message: string } {
  const block = result.content.find((c) => c.type === "text");
  return JSON.parse(block && block.type === "text" ? block.text : "{}");
}

describe.skipIf(!live && !REQUIRE_LIVE)(`live clear-api (${API_URL ?? "unset"})`, () => {
  it("requires a reachable clear-api and all test keys when CLEAR_MCP_LIVE=1", () => {
    if (REQUIRE_LIVE) {
      expect(missing, `missing env: ${missing.join(", ")}`).toEqual([]);
      expect(live, `${API_URL}/health did not answer ok`).toBe(true);
    }
  });

  it("pending key → FORBIDDEN / PENDING_APPROVAL on a content read; whoami reports role pending", async () => {
    const { call, close } = await connectLive(KEYS.pending!);
    try {
      const listed = await call("clear_list_events", { limit: 1 });
      expect(listed.isError).toBe(true);
      expect(errorOf(listed)).toMatchObject({ code: "FORBIDDEN", subCode: "PENDING_APPROVAL" });

      const who = await call("clear_whoami");
      expect(who.isError).toBeFalsy();
      expect((who.structuredContent as { caller: { role: string } }).caller.role).toBe("pending");
    } finally {
      await close();
    }
  }, 30_000);

  it("revoked key → UNAUTHENTICATED", async () => {
    const { call, close } = await connectLive(KEYS.revoked!);
    try {
      const who = await call("clear_whoami");
      expect(who.isError).toBe(true);
      expect(errorOf(who).code).toBe("UNAUTHENTICATED");
    } finally {
      await close();
    }
  }, 30_000);

  it("viewer key → clear_whoami succeeds with role viewer; a teamId narrows the global feed", async () => {
    const { call, close } = await connectLive(KEYS.viewer!);
    try {
      const who = await call("clear_whoami");
      expect(who.isError).toBeFalsy();
      const caller = who.structuredContent as { caller: { role: string }; teams: Array<{ id: string; locations: unknown[] }> };
      expect(caller.caller.role).toBe("viewer");

      const global = await call("clear_list_events", { limit: 25 });
      expect(global.isError).toBeFalsy();
      const globalOut = global.structuredContent as { totalCount: number };

      const scoped = caller.teams.find((t) => t.locations.length > 0);
      if (scoped) {
        const team = await call("clear_list_events", { limit: 25, teamId: scoped.id });
        expect(team.isError).toBeFalsy();
        expect((team.structuredContent as { totalCount: number }).totalCount).toBeLessThanOrEqual(globalOut.totalCount);
      }
    } finally {
      await close();
    }
  }, 30_000);
});
