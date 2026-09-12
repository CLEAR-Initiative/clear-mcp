/**
 * The schema snapshot is the contract: the fixture responder validates every
 * outgoing document against it, and codegen builds from it. These tests pin
 * that behaviour so a drifted selection set can never pass the unit suite.
 */
import { describe, expect, it } from "vitest";
import { assertValidDocument, createFixtureFetch, SNAPSHOT_SCHEMA } from "./helpers/seam.js";

describe("schema snapshot", () => {
  it("contains the root fields the tracer tools depend on", () => {
    const query = SNAPSHOT_SCHEMA.getQueryType()!.getFields();
    for (const name of ["me", "myTeams", "locations", "location"]) {
      expect(query[name], name).toBeDefined();
    }
    expect(SNAPSHOT_SCHEMA.getMutationType()).toBeDefined();
  });

  it("accepts a valid document and rejects a drifted selection set", () => {
    expect(() => assertValidDocument("query A { me { id } }", "A")).not.toThrow();
    expect(() => assertValidDocument("query B { me { id nope } }", "B")).toThrow(
      /Cannot query field "nope" on type "User"/,
    );
    expect(() => assertValidDocument("query C { me { id ", "C")).toThrow(/does not parse/);
  });

  it("the fixture responder refuses to answer an invalid document", async () => {
    const { fetch, requests } = createFixtureFetch({ Bad: { data: {} } });
    await expect(
      fetch("https://api.clear.test/graphql", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "query Bad { me { emailz } }", operationName: "Bad" }),
      }),
    ).rejects.toThrow(/invalid against schema.graphql/);
    // The request was still recorded so the failure can be inspected.
    expect(requests).toHaveLength(1);
  });
});
