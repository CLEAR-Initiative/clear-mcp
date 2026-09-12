/**
 * The developer-only Escape hatch: absent unless CLEAR_MCP_RAW_GRAPHQL=1,
 * and even then nothing but validated `query` documents reach clear-api.
 */
import { afterEach, describe, expect, it } from "vitest";
import { connect, textJson, type Seam } from "./helpers/seam.js";

describe("escape hatch gating", () => {
  let seam: Seam;
  afterEach(async () => {
    await seam?.close();
  });

  it("lists exactly the curated clear_ tools while the flag is unset", async () => {
    seam = await connect();
    const names = (await seam.client.listTools()).tools.map((t) => t.name);
    expect(names).not.toContain("clear_graphql");
    expect(names).not.toContain("clear_schema_type");
    expect(names.every((n) => n.startsWith("clear_"))).toBe(true);
    const denied = await seam.callTool("clear_graphql", { query: "query { me { id } }" });
    expect(denied.isError).toBe(true);
    expect(seam.requests).toHaveLength(0);
  });

  it("is off for any value other than the literal 1", async () => {
    for (const value of ["true", "yes", "0", ""]) {
      const s = await connect({ env: { CLEAR_MCP_RAW_GRAPHQL: value } });
      const names = (await s.client.listTools()).tools.map((t) => t.name);
      expect(names, `CLEAR_MCP_RAW_GRAPHQL=${value}`).not.toContain("clear_graphql");
      await s.close();
    }
  });

  it("registers clear_graphql (read-only annotated) when CLEAR_MCP_RAW_GRAPHQL=1", async () => {
    seam = await connect({ env: { CLEAR_MCP_RAW_GRAPHQL: "1" } });
    const { tools } = await seam.client.listTools();
    const hatch = tools.find((t) => t.name === "clear_graphql");
    expect(hatch).toBeDefined();
    expect(hatch!.annotations?.readOnlyHint).toBe(true);
    expect(seam.logs.some((l) => String(l.msg).includes("escape hatch enabled"))).toBe(true);
  });
});

describe("clear_graphql", () => {
  let seam: Seam;
  afterEach(async () => {
    await seam?.close();
  });
  const enabled = (fixtures = {}) => connect({ env: { CLEAR_MCP_RAW_GRAPHQL: "1" }, fixtures });

  it("rejects a mutation without contacting clear-api", async () => {
    seam = await enabled();
    const result = await seam.callTool("clear_graphql", {
      query: 'mutation Kill { deleteEvent(id: "evt-1") { id } }',
    });
    expect(result.isError).toBe(true);
    expect(textJson(result)).toMatchObject({ code: "READ_ONLY", message: expect.stringContaining("mutation") });
    expect(seam.requests).toHaveLength(0);
  });

  it("rejects a document that mixes a query with a mutation, and a subscription", async () => {
    seam = await enabled();
    const mixed = await seam.callTool("clear_graphql", {
      query: 'query A { me { id } } mutation B { deleteEvent(id: "x") { id } }',
      operationName: "A",
    });
    expect(mixed.isError).toBe(true);
    expect(textJson(mixed)).toMatchObject({ code: "READ_ONLY" });

    const sub = await seam.callTool("clear_graphql", { query: "subscription S { alertCreated { id } }" });
    expect(sub.isError).toBe(true);
    expect(textJson(sub)).toMatchObject({ code: "READ_ONLY", message: expect.stringContaining("subscription") });
    expect(seam.requests).toHaveLength(0);
  });

  it("rejects syntax errors and snapshot-invalid documents locally", async () => {
    seam = await enabled();
    const syntax = await seam.callTool("clear_graphql", { query: "query { me { id " });
    expect(syntax.isError).toBe(true);
    expect(textJson(syntax)).toMatchObject({ code: "BAD_USER_INPUT", message: expect.stringContaining("syntax") });

    const invalid = await seam.callTool("clear_graphql", { query: "query { me { id nope } }" });
    expect(invalid.isError).toBe(true);
    expect(textJson(invalid)).toMatchObject({
      code: "BAD_USER_INPUT",
      message: expect.stringContaining('Cannot query field "nope"'),
    });

    const fragmentOnly = await seam.callTool("clear_graphql", { query: "fragment F on User { id }" });
    expect(fragmentOnly.isError).toBe(true);
    expect(seam.requests).toHaveLength(0);
  });

  it("forwards a valid query verbatim with variables and returns raw data", async () => {
    const query = "query Ev($id: String!) { event(id: $id) { id title } }";
    seam = await enabled({ Ev: { data: { event: { id: "evt-1", title: "Clashes" } } } });
    const result = await seam.callTool("clear_graphql", { query, variables: { id: "evt-1" } });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ data: { event: { id: "evt-1", title: "Clashes" } } });
    expect(textJson(result)).toEqual(result.structuredContent);
    expect(seam.requests).toHaveLength(1);
    expect(seam.requests[0]).toMatchObject({
      operationName: "Ev",
      query,
      variables: { id: "evt-1" },
    });
    expect(seam.requests[0]!.headers.authorization).toBe("Bearer sk_live_test_key_000");
    expect(seam.requests[0]!.headers["user-agent"]).toMatch(/\(clear_graphql\)$/);
  });

  it("honours an explicit operationName for multi-query documents and relays upstream errors", async () => {
    seam = await enabled({ B: { data: { myTeams: [] } } });
    const result = await seam.callTool("clear_graphql", {
      query: "query A { me { id } } query B { myTeams { id } }",
      operationName: "B",
    });
    expect(result.isError).toBeFalsy();
    expect(seam.requests[0]!.operationName).toBe("B");

    seam.fixtures.on("B", { errors: [{ message: "nope", extensions: { code: "FORBIDDEN" } }] });
    const err = await seam.callTool("clear_graphql", {
      query: "query A { me { id } } query B { myTeams { id } }",
      operationName: "B",
    });
    expect(err.isError).toBe(true);
    expect(textJson(err)).toEqual({ code: "FORBIDDEN", message: "nope" });
  });
});
