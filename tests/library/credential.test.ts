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

  it("forwards only cookie and authorization from a whole request's headers", async () => {
    const seam = createLibrarySeam({
      config: {
        credential: {
          kind: "headers",
          headers: {
            Cookie: COOKIE,
            "Content-Length": "1234",
            Host: "clear-mvp.example.org",
            Origin: "https://clear-mvp.example.org",
            "X-Forwarded-For": "10.0.0.1",
            "X-Force-Locale": "fr",
            "Content-Type": "text/plain",
            "User-Agent": "spoof",
          },
        },
      },
      fixtures: { ClearWhoami: { data: { me: ME, myTeams: [] } } },
    });
    expect(await seam.runTool("clear_whoami")).toMatchObject({ ok: true });
    const { headers } = seam.requests[0]!;
    expect(Object.keys(headers).sort()).toEqual(["accept", "content-type", "cookie", "user-agent", "x-force-locale"]);
    expect(headers).toMatchObject({
      cookie: COOKIE,
      "x-force-locale": "en",
      "content-type": "application/json",
      "user-agent": expect.stringMatching(/^clear-mcp\//),
    });
  });

  it("prefers the exact lower-case name when a header is given in several casings", async () => {
    const seam = createLibrarySeam({
      config: { credential: { kind: "headers", headers: { Cookie: "a=1", cookie: "b=2", AUTHORIZATION: "Bearer x", Authorization: "Bearer y" } } },
      fixtures: { ClearWhoami: { data: { me: ME, myTeams: [] } } },
    });
    await seam.runTool("clear_whoami");
    // Exact lower-case wins; otherwise the first casing in insertion order.
    expect(seam.requests[0]!.headers).toMatchObject({ cookie: "b=2", authorization: "Bearer x" });
  });

  it("reports fetch's cause when clear-api is unreachable, never echoing the credential", async () => {
    const cause = new TypeError(`Headers.append: "${COOKIE}\r\n" is an invalid header value.`);
    const seam = createLibrarySeam({
      config: { credential: { kind: "headers", headers: { cookie: COOKIE } } },
      fixtures: { ClearWhoami: { reject: new TypeError("fetch failed", { cause }) } },
    });
    const outcome = await seam.runTool("clear_whoami");
    expect(outcome).toMatchObject({ ok: false, error: { code: "UPSTREAM_UNAVAILABLE" } });
    const { message } = (outcome as { error: { message: string } }).error;
    expect(message).toBe(
      'clear-api at https://api.clear.test/graphql is unreachable: fetch failed: Headers.append: "[redacted] " is an invalid header value.',
    );
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

  it("one shared location index serves every Caller and locale without retaining a credential", async () => {
    const fixtures = createFixtureFetch({
      ClearLocationIndex: (_vars, req) => ({
        data: { countries: [req.headers["x-force-locale"] === "ar" ? { ...SUDAN, name: "السودان" } : SUDAN], states: [], districts: [] },
      }),
    });
    const log = silentLogger();
    // Module-level, as the CLEAR Agent keeps it: the index takes no upstream at all.
    const tools = curatedTools({ locationIndex: createLocationIndex({ log }) });
    const tool = tools.find((t) => t.name === "clear_find_location")!;

    // One upstream per request, as the CLEAR Agent builds it, with that user's cookie and locale.
    const findAs = (cookie: string, locale: "en" | "ar", query: string) => {
      const config = { ...TEST_CONFIG, locale, credential: { kind: "headers" as const, headers: { cookie } } };
      const upstream = createUpstream({ config, fetch: fixtures.fetch, log });
      return tool.run(tool.input.parse({ query }), { config, upstream, log, toolName: tool.name });
    };

    expect(await findAs("user=a", "en", "Sudan")).toMatchObject({ ok: true, value: { items: [{ name: "Sudan" }] } });
    // A second Caller in the same locale is answered from the cache: no request, so nothing of
    // theirs is sent, and nothing of the first Caller's was kept to send.
    expect(await findAs("user=b", "en", "Sudan")).toMatchObject({ ok: true, value: { totalCount: 1 } });
    // A new locale loads its own tiers through *that* call's upstream.
    expect(await findAs("user=b", "ar", "السودان")).toMatchObject({ ok: true, value: { items: [{ name: "السودان" }] } });

    expect(fixtures.requests.map((r) => [r.headers.cookie, r.headers["x-force-locale"]])).toEqual([
      ["user=a", "en"],
      ["user=b", "ar"],
    ]);
  });
});
