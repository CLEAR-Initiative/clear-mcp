/**
 * The upstream credential is pluggable (ADR-0009): an MCP Consumer's API key
 * as `authorization: Bearer`, or headers forwarded from a signed-in user (the
 * CLEAR Agent's session cookie). Either way it is the only credential sent,
 * forwarded unchanged, and never overrides clear-mcp's own protocol headers.
 */
import { describe, expect, it } from "vitest";
import { parseConfig } from "../../src/config.js";
import { createLocationIndex, createUpstream, curatedTools, silentLogger } from "../../src/library.js";
import { createLibrarySeam, TEST_CONFIG } from "../helpers/library-seam.js";
import { createFixtureFetch, TEST_ENV } from "../helpers/seam.js";

const ME = { id: "user-1", name: "Dev One", role: "analyst", language: "en", isActive: true, defaultTeam: null };
const COOKIE = "better-auth.session_token=abc.def";
const SUDAN = { id: "sdn", name: "Sudan", level: 0, pCode: "SD", ancestorIds: [] };

describe("upstream credential", () => {
  it("the environment still yields an API key", () => {
    expect(parseConfig(TEST_ENV).credential).toEqual({ kind: "apiKey", key: TEST_ENV.CLEAR_API_KEY });
  });

  it("an API key is sent as authorization: Bearer", async () => {
    const seam = createLibrarySeam({ fixtures: { ClearWhoami: { data: { me: ME, myTeams: [] } } } });
    expect(await seam.runTool("clear_whoami")).toMatchObject({ ok: true });
    expect(seam.requests[0]!.headers.authorization).toBe(`Bearer ${TEST_ENV.CLEAR_API_KEY}`);
    expect(seam.requests[0]!.headers).not.toHaveProperty("cookie");
  });

  it("a headers credential forwards the Cookie and sends no authorization", async () => {
    const seam = createLibrarySeam({
      config: { credential: { kind: "headers", headers: { Cookie: COOKIE } }, locale: "ar" },
      fixtures: { ClearWhoami: { data: { me: ME, myTeams: [] } } },
    });
    expect(await seam.runTool("clear_whoami")).toMatchObject({ ok: true, value: { locale: "ar" } });

    expect(seam.requests).toHaveLength(1);
    const { headers } = seam.requests[0]!;
    expect(headers.cookie).toBe(COOKIE);
    expect(headers).not.toHaveProperty("authorization");
    expect(headers["x-force-locale"]).toBe("ar");
    expect(headers["user-agent"]).toMatch(/^clear-mcp\/\d+\.\d+\.\d+ \(clear_whoami\)$/);
  });

  it("forwarded headers cannot override the locale, content type or User-Agent", async () => {
    const seam = createLibrarySeam({
      config: {
        credential: {
          kind: "headers",
          headers: { cookie: COOKIE, "X-Force-Locale": "fr", "Content-Type": "text/plain", "User-Agent": "spoof" },
        },
      },
      fixtures: { ClearWhoami: { data: { me: ME, myTeams: [] } } },
    });
    await seam.runTool("clear_whoami");
    expect(seam.requests[0]!.headers).toMatchObject({
      cookie: COOKIE,
      "x-force-locale": "en",
      "content-type": "application/json",
      "user-agent": expect.stringMatching(/^clear-mcp\//),
    });
  });

  it("reports an unrecognised credential without naming an environment variable", async () => {
    const seam = createLibrarySeam({
      config: { credential: { kind: "headers", headers: { cookie: COOKIE } } },
      fixtures: { ClearWhoami: { data: { me: null, myTeams: [] } } },
    });
    expect(await seam.runTool("clear_whoami")).toEqual({
      ok: false,
      error: { code: "UNAUTHENTICATED", message: "clear-api did not recognise the configured credential (me is null)." },
    });
  });

  it("a shared location index on a credential-free upstream never carries a Caller's cookie", async () => {
    const fixtures = createFixtureFetch({
      ClearLocationIndex: { data: { countries: [SUDAN], states: [], districts: [] } },
      ClearWhoami: { data: { me: ME, myTeams: [] } },
    });
    const log = silentLogger();
    const shared = createUpstream({
      config: { ...TEST_CONFIG, credential: { kind: "headers", headers: {} } },
      fetch: fixtures.fetch,
      log,
    });
    const locationIndex = createLocationIndex({ upstream: shared, log });

    // One upstream per request, as the CLEAR Agent builds it, with the user's cookie.
    const config = { ...TEST_CONFIG, credential: { kind: "headers" as const, headers: { cookie: COOKIE } } };
    const upstream = createUpstream({ config, fetch: fixtures.fetch, log });
    const tools = curatedTools({ locationIndex });
    const run = (name: string, args: Record<string, unknown>) => {
      const tool = tools.find((t) => t.name === name)!;
      return tool.run(tool.input.parse(args), { config, upstream, log, toolName: name });
    };

    expect(await run("clear_find_location", { query: "Sudan" })).toMatchObject({ ok: true, value: { totalCount: 1 } });
    await run("clear_whoami", {});

    const [index, whoami] = fixtures.requests;
    expect(index!.operationName).toBe("ClearLocationIndex");
    expect(index!.headers).not.toHaveProperty("cookie");
    expect(index!.headers).not.toHaveProperty("authorization");
    expect(whoami!.headers.cookie).toBe(COOKIE);
  });
});
