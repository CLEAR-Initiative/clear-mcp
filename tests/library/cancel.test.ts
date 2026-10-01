/**
 * A Tool library Consumer can cancel a tool call (`ToolContext.signal`) —
 * e.g. the user stops an Agent turn — and its upstream request is aborted
 * at once, alongside the upstream's own timeout.
 */
import { describe, expect, it } from "vitest";
import { createLibrarySeam } from "../helpers/library-seam.js";
import { NEVER } from "../helpers/seam.js";

describe("cancellation", () => {
  it("aborts an in-flight upstream request and returns CANCELLED", async () => {
    const seam = createLibrarySeam({ fixtures: { ClearGetEvent: NEVER } });
    const controller = new AbortController();
    const pending = seam.runTool("clear_get_event", { id: "evt-1" }, { signal: controller.signal });
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();
    expect(await pending).toEqual({
      ok: false,
      error: {
        code: "CANCELLED",
        message: "The request to clear-api at https://api.clear.test/graphql was cancelled.",
        upstreamUrl: "https://api.clear.test/graphql",
      },
    });
    expect(seam.requests).toHaveLength(1);
  });

  it("returns CANCELLED for a signal that is already aborted", async () => {
    const seam = createLibrarySeam({ fixtures: { ClearWhoami: { data: { me: null, myTeams: [] } } } });
    const outcome = await seam.runTool("clear_whoami", {}, { signal: AbortSignal.abort() });
    expect(outcome).toMatchObject({ ok: false, error: { code: "CANCELLED" } });
  });

  it("still times out on its own when a signal is given but never fires", async () => {
    const seam = createLibrarySeam({ fixtures: { ClearGetEvent: NEVER }, upstreamTimeoutMs: 30 });
    const outcome = await seam.runTool("clear_get_event", { id: "evt-1" }, { signal: new AbortController().signal });
    expect(outcome).toMatchObject({
      ok: false,
      error: { code: "UPSTREAM_UNAVAILABLE", message: expect.stringContaining("timed out after 30 ms") },
    });
  });
});
