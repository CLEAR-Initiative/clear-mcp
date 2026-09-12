import { afterEach, describe, expect, it } from "vitest";
import { connect, textJson, type Seam } from "./helpers/seam.js";

describe("clear_schema_type", () => {
  let seam: Seam;
  afterEach(async () => {
    await seam?.close();
  });

  it("is absent unless the escape hatch is enabled", async () => {
    seam = await connect();
    expect((await seam.client.listTools()).tools.map((t) => t.name)).not.toContain("clear_schema_type");
  });

  it("prints a named type's SDL from the snapshot without any network call", async () => {
    seam = await connect({ env: { CLEAR_MCP_RAW_GRAPHQL: "1" } });
    const result = await seam.callTool("clear_schema_type", { name: "EventsPageInput" });
    expect(result.isError).toBeFalsy();
    const out = result.structuredContent as { name: string; sdl: string; queryFields: null };
    expect(out.name).toBe("EventsPageInput");
    expect(out.queryFields).toBeNull();
    expect(out.sdl).toMatch(/^input EventsPageInput \{/);
    expect(out.sdl).toContain("teamId: String");
    expect(textJson(result)).toEqual(out);
    expect(seam.requests).toHaveLength(0);

    const enumType = (await seam.callTool("clear_schema_type", { name: "AlertStatus" })).structuredContent as { sdl: string };
    expect(enumType.sdl).toMatch(/enum AlertStatus \{[\s\S]*published/);
  });

  it("lists root Query field names when called without a name", async () => {
    seam = await connect({ env: { CLEAR_MCP_RAW_GRAPHQL: "1" } });
    const out = (await seam.callTool("clear_schema_type", {})).structuredContent as {
      name: null;
      sdl: null;
      queryFields: string[];
    };
    expect(out.name).toBeNull();
    expect(out.sdl).toBeNull();
    expect(out.queryFields).toEqual([...out.queryFields].sort());
    for (const f of ["me", "myTeams", "locations", "eventsPage", "searchKnowledgebase", "situationAnalysis"]) {
      expect(out.queryFields).toContain(f);
    }
    expect(seam.requests).toHaveLength(0);
  });

  it("returns BAD_USER_INPUT for an unknown type", async () => {
    seam = await connect({ env: { CLEAR_MCP_RAW_GRAPHQL: "1" } });
    const result = await seam.callTool("clear_schema_type", { name: "Nope" });
    expect(result.isError).toBe(true);
    expect(textJson(result)).toMatchObject({ code: "BAD_USER_INPUT", message: expect.stringContaining("Nope") });
  });
});
