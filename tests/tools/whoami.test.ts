import { afterEach, describe, expect, it } from "vitest";
import { connect, textJson, type Seam } from "../helpers/seam.js";

const ME = {
  id: "user-1",
  name: "Dev One",
  role: "analyst",
  language: "en",
  isActive: true,
  defaultTeam: { id: "team-sudan", name: "Sudan" },
};
const TEAMS = [
  {
    id: "team-sudan",
    name: "Sudan",
    slug: "sudan",
    locations: [{ id: "loc-sdn", name: "Sudan", level: 0 }],
  },
];

describe("clear_whoami", () => {
  let seam: Seam;
  afterEach(async () => {
    await seam?.close();
  });

  it("is listed with the clear_ prefix and an output schema", async () => {
    seam = await connect();
    const { tools } = await seam.client.listTools();
    const whoami = tools.find((t) => t.name === "clear_whoami");
    expect(whoami).toBeDefined();
    expect(whoami!.outputSchema).toBeDefined();
    expect(whoami!.annotations?.readOnlyHint).toBe(true);
    expect(tools.every((t) => t.name.startsWith("clear_"))).toBe(true);
  });

  it("returns caller identity, teams with scope, locale, escape-hatch flag and apiUrl", async () => {
    seam = await connect({
      fixtures: { ClearWhoami: { data: { me: ME, myTeams: TEAMS } } },
    });
    const result = await seam.callTool("clear_whoami");

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      caller: ME,
      teams: TEAMS,
      locale: "en",
      escapeHatchEnabled: false,
      apiUrl: "https://api.clear.test",
    });
    // The text block carries the same JSON.
    expect(textJson(result)).toEqual(result.structuredContent);
  });

  it("sends Authorization, x-force-locale and User-Agent on the single upstream request", async () => {
    seam = await connect({
      env: { CLEAR_MCP_LOCALE: "fr", CLEAR_MCP_RAW_GRAPHQL: "1" },
      fixtures: { ClearWhoami: { data: { me: ME, myTeams: [] } } },
    });
    const result = await seam.callTool("clear_whoami");
    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as { locale: string }).locale).toBe("fr");
    expect((result.structuredContent as { escapeHatchEnabled: boolean }).escapeHatchEnabled).toBe(true);

    expect(seam.requests).toHaveLength(1);
    const req = seam.requests[0]!;
    expect(req.url).toBe("https://api.clear.test/graphql");
    expect(req.method).toBe("POST");
    expect(req.headers.authorization).toBe("Bearer sk_live_test_key_000");
    expect(req.headers["x-force-locale"]).toBe("fr");
    expect(req.headers["user-agent"]).toMatch(/^clear-mcp\/\d+\.\d+\.\d+ \(clear_whoami\)$/);
    expect(req.headers["content-type"]).toBe("application/json");
    expect(req.operationName).toBe("ClearWhoami");
    // Never select PII or geometry.
    expect(req.query).not.toMatch(/\bemail\b|\bgeometry\b/);
  });

  it("relays an UNAUTHENTICATED GraphQL error as isError with the code preserved", async () => {
    seam = await connect({
      fixtures: {
        ClearWhoami: {
          data: { me: null, myTeams: null },
          errors: [{ message: "You must be logged in", extensions: { code: "UNAUTHENTICATED" } }],
        },
      },
    });
    const result = await seam.callTool("clear_whoami");
    expect(result.isError).toBe(true);
    expect(textJson(result)).toEqual({ code: "UNAUTHENTICATED", message: "You must be logged in" });
  });
});
