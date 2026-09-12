import { afterEach, describe, expect, it } from "vitest";
import { connect, type Seam } from "./helpers/seam.js";

const ME = { id: "user-1", name: "Dev One", role: "analyst", language: "en", isActive: true, defaultTeam: null };

describe("startup self-check", () => {
  let seam: Seam;
  afterEach(async () => {
    await seam?.close();
  });

  it("runs one `me` query and logs the caller on success", async () => {
    seam = await connect({
      fixtures: { ClearSelfCheck: { data: { me: { id: "user-1", role: "analyst", isActive: true } } } },
    });
    const result = await seam.selfCheck();
    expect(result).toEqual({ ok: true, caller: { id: "user-1", role: "analyst", isActive: true } });
    expect(seam.requests).toHaveLength(1);
    expect(seam.requests[0]).toMatchObject({ operationName: "ClearSelfCheck" });
    expect(seam.requests[0]!.headers["user-agent"]).toMatch(/\(self-check\)$/);
    expect(seam.logs.find((l) => l.msg === "self-check ok")).toMatchObject({ caller: { id: "user-1" } });
  });

  it("logs the normalised diagnostic on failure and does not block tool calls", async () => {
    const message = "Your account is awaiting approval.";
    seam = await connect({
      fixtures: {
        ClearSelfCheck: {
          errors: [{ message, extensions: { code: "FORBIDDEN", subCode: "PENDING_APPROVAL" } }],
        },
        ClearWhoami: { data: { me: ME, myTeams: [] } },
      },
    });
    const result = await seam.selfCheck();
    expect(result).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", subCode: "PENDING_APPROVAL", message },
    });
    const line = seam.logs.find((l) => String(l.msg).startsWith("self-check failed"));
    expect(line).toMatchObject({ level: 50, code: "FORBIDDEN", subCode: "PENDING_APPROVAL", message });

    // No cached failure state: the very next tool call issues its own request.
    const whoami = await seam.callTool("clear_whoami");
    expect(whoami.isError).toBeFalsy();
    expect(seam.requests.map((r) => r.operationName)).toEqual(["ClearSelfCheck", "ClearWhoami"]);
  });

  it("treats `me: null` (unknown key) as UNAUTHENTICATED", async () => {
    seam = await connect({ fixtures: { ClearSelfCheck: { data: { me: null } } } });
    const result = await seam.selfCheck();
    expect(result).toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED" } });
  });

  it("reports an unreachable clear-api with the configured URL", async () => {
    seam = await connect({ fixtures: { ClearSelfCheck: { reject: new Error("ECONNREFUSED") } } });
    const result = await seam.selfCheck();
    expect(result).toMatchObject({
      ok: false,
      error: { code: "UPSTREAM_UNAVAILABLE", upstreamUrl: "https://api.clear.test/graphql" },
    });
  });
});
