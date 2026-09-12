/**
 * The four error mappings (plus the edge cases around them), each asserted
 * through a tool call: clear-api GraphQL errors keep code/subCode/message;
 * anything that stops us reaching clear-api is UPSTREAM_UNAVAILABLE with the
 * configured URL.
 */
import { afterEach, describe, expect, it } from "vitest";
import { connect, NEVER, textJson, type Seam } from "./helpers/seam.js";

const ENDPOINT = "https://api.clear.test/graphql";

describe("error mapping through tool calls", () => {
  let seam: Seam;
  afterEach(async () => {
    await seam?.close();
  });

  it("UNAUTHENTICATED: revoked/unknown key", async () => {
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
    expect(result.structuredContent).toBeUndefined();
    expect(textJson(result)).toEqual({ code: "UNAUTHENTICATED", message: "You must be logged in" });
  });

  it("FORBIDDEN + PENDING_APPROVAL: subCode and message preserved verbatim", async () => {
    const message =
      "Your account is awaiting approval. An administrator must approve it before you can read content.";
    seam = await connect({
      fixtures: {
        ClearWhoami: {
          data: null,
          errors: [{ message, extensions: { code: "FORBIDDEN", subCode: "PENDING_APPROVAL" } }],
        },
      },
    });
    const result = await seam.callTool("clear_whoami");
    expect(result.isError).toBe(true);
    expect(textJson(result)).toEqual({ code: "FORBIDDEN", subCode: "PENDING_APPROVAL", message });
  });

  it("UPSTREAM_UNAVAILABLE: fetch rejects (DNS / connection refused)", async () => {
    seam = await connect({ fixtures: { ClearWhoami: { reject: new TypeError("fetch failed") } } });
    const result = await seam.callTool("clear_whoami");
    expect(result.isError).toBe(true);
    expect(textJson(result)).toEqual({
      code: "UPSTREAM_UNAVAILABLE",
      message: `clear-api at ${ENDPOINT} is unreachable: fetch failed`,
      upstreamUrl: ENDPOINT,
    });
  });

  it("UPSTREAM_UNAVAILABLE: request exceeds the timeout", async () => {
    seam = await connect({ upstreamTimeoutMs: 25, fixtures: { ClearWhoami: NEVER } });
    const result = await seam.callTool("clear_whoami");
    expect(result.isError).toBe(true);
    expect(textJson(result)).toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
      message: expect.stringContaining("timed out after 25 ms"),
      upstreamUrl: ENDPOINT,
    });
  });

  it("UPSTREAM_UNAVAILABLE: non-2xx from a proxy or a down API", async () => {
    seam = await connect({
      fixtures: { ClearWhoami: { status: 502, body: "<html>Bad Gateway</html>" } },
    });
    const result = await seam.callTool("clear_whoami");
    expect(result.isError).toBe(true);
    expect(textJson(result)).toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
      message: expect.stringMatching(/responded 502/),
      upstreamUrl: ENDPOINT,
    });
  });

  it("UPSTREAM_UNAVAILABLE: 200 with a non-JSON body", async () => {
    seam = await connect({
      fixtures: { ClearWhoami: { status: 200, body: "<!doctype html>", contentType: "text/html" } },
    });
    const result = await seam.callTool("clear_whoami");
    expect(result.isError).toBe(true);
    expect(textJson(result)).toMatchObject({ code: "UPSTREAM_UNAVAILABLE", upstreamUrl: ENDPOINT });
  });

  it("generic: a GraphQL error without extensions.code becomes UPSTREAM_ERROR", async () => {
    seam = await connect({
      fixtures: { ClearWhoami: { errors: [{ message: "Something went wrong" }] } },
    });
    const result = await seam.callTool("clear_whoami");
    expect(result.isError).toBe(true);
    expect(textJson(result)).toEqual({ code: "UPSTREAM_ERROR", message: "Something went wrong" });
  });

  it("generic: partial data alongside errors is treated as an error", async () => {
    seam = await connect({
      fixtures: {
        ClearWhoami: {
          data: { me: { id: "u", name: "U", role: null, language: "en", isActive: null, defaultTeam: null }, myTeams: null },
          errors: [{ message: "Cannot return null for non-nullable field", extensions: { code: "INTERNAL_SERVER_ERROR" } }],
        },
      },
    });
    const result = await seam.callTool("clear_whoami");
    expect(result.isError).toBe(true);
    expect(textJson(result)).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("generic: no data and no errors is UPSTREAM_ERROR", async () => {
    seam = await connect({ fixtures: { ClearWhoami: {} } });
    const result = await seam.callTool("clear_whoami");
    expect(result.isError).toBe(true);
    expect(textJson(result)).toMatchObject({ code: "UPSTREAM_ERROR" });
  });

  it("logs upstream failures to the logger only, never to stdout", async () => {
    seam = await connect({ fixtures: { ClearWhoami: { reject: new Error("boom") } } });
    await seam.callTool("clear_whoami");
    const line = seam.logs.find((l) => l.msg === "upstream unreachable");
    expect(line).toMatchObject({ tool: "clear_whoami", op: "ClearWhoami", err: "boom" });
  });
});
