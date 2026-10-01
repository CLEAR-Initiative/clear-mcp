/**
 * Every Curated tool behaves identically over MCP and through the Tool
 * library (CONTEXT.md, ADR-0009). Each case runs once through the MCP seam
 * and once through the library seam on the same fixtures: the library's
 * ToolOutcome must deep-equal the MCP `structuredContent` (or, on failure,
 * the `isError` JSON), and the upstream must have seen the same requests.
 */
import { describe, expect, it } from "vitest";
import { createLibrarySeam } from "../helpers/library-seam.js";
import { connect, textJson, type FixtureResponse, type Responder } from "../helpers/seam.js";

interface ParityCase {
  name: string;
  tool: string;
  args?: Record<string, unknown>;
  fixtures: Record<string, Responder | FixtureResponse>;
}

const ME = {
  id: "user-1",
  name: "Dev One",
  role: "analyst",
  language: "en",
  isActive: true,
  defaultTeam: { id: "team-sudan", name: "Sudan" },
};
const TEAMS = [{ id: "team-sudan", name: "Sudan", slug: "sudan", locations: [{ id: "loc-sdn", name: "Sudan", level: 0 }] }];

const CASES: ParityCase[] = [
  { name: "identity and scope", tool: "clear_whoami", fixtures: { ClearWhoami: { data: { me: ME, myTeams: TEAMS } } } },
  {
    name: "an UNAUTHENTICATED error",
    tool: "clear_whoami",
    fixtures: {
      ClearWhoami: {
        data: { me: null, myTeams: null },
        errors: [{ message: "You must be logged in", extensions: { code: "UNAUTHENTICATED" } }],
      },
    },
  },
  { name: "me is null", tool: "clear_whoami", fixtures: { ClearWhoami: { data: { me: null, myTeams: [] } } } },
];

describe("Tool library parity with MCP", () => {
  it.each(CASES.map((c) => [`${c.tool}: ${c.name}`, c] as const))("%s", async (_label, c) => {
    const mcp = await connect({ fixtures: c.fixtures });
    try {
      const result = await mcp.callTool(c.tool, c.args);
      const library = createLibrarySeam({ fixtures: c.fixtures });
      const outcome = await library.runTool(c.tool, c.args);

      expect(outcome).toEqual(
        result.isError ? { ok: false, error: textJson(result) } : { ok: true, value: result.structuredContent },
      );
      expect(library.requests).toEqual(mcp.requests);
    } finally {
      await mcp.close();
    }
  });
});
