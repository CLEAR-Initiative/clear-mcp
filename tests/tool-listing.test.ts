/**
 * The curated tool set is the product: pin the exact names so a tool cannot
 * appear, vanish or lose its clear_ prefix unnoticed. Note the PRD requirement
 * row says "13"; the PRD's own contract table names these 15.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createLibrarySeam } from "./helpers/library-seam.js";
import { connect, type Seam } from "./helpers/seam.js";

export const CURATED_TOOLS = [
  "clear_whoami",
  "clear_find_location",
  "clear_search_knowledge_base",
  "clear_list_alerts",
  "clear_list_events",
  "clear_list_signals",
  "clear_count",
  "clear_get_alert",
  "clear_get_event",
  "clear_get_signal",
  "clear_list_crises",
  "clear_get_crisis",
  "clear_get_situation_analysis",
  "clear_get_datapoints",
  "clear_list_figures",
];

describe("tools/list", () => {
  let seam: Seam;
  afterEach(async () => {
    await seam?.close();
  });

  it("lists exactly the curated tools, in order, each read-only with an output schema", async () => {
    seam = await connect();
    const { tools } = await seam.client.listTools();
    expect(tools.map((t) => t.name)).toEqual(CURATED_TOOLS);
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint, t.name).toBe(true);
      expect(t.outputSchema, t.name).toBeDefined();
      expect(t.description, t.name).toBeTruthy();
    }
  });

  it("adds exactly the two escape-hatch tools when flagged", async () => {
    seam = await connect({ env: { CLEAR_MCP_RAW_GRAPHQL: "1" } });
    const names = (await seam.client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual([...CURATED_TOOLS, "clear_graphql", "clear_schema_type"]);
  });

  it("offers the same tools and descriptions through the Tool library, never the escape hatch", async () => {
    seam = await connect();
    const listed = (await seam.client.listTools()).tools.map((t) => ({ name: t.name, description: t.description }));
    // Even with the flag on, the library's curated set is the curated set (ADR-0004, ADR-0009).
    const { tools } = createLibrarySeam({ config: { rawGraphql: true } });
    expect(tools.map((t) => ({ name: t.name, description: t.description }))).toEqual(listed);
    expect(tools.map((t) => t.name)).toEqual(CURATED_TOOLS);
  });
});
