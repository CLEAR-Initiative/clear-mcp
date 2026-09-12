import { defineConfig } from "vitest/config";

// Tests live under `tests/` (kept out of `src/` so `tsc -p tsconfig.build.json`
// doesn't emit them to `dist/`). Everything goes through one seam: an MCP
// Client over InMemoryTransport talking to the real server with `fetch`
// injected — see tests/helpers/seam.ts.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 20_000,
  },
});
