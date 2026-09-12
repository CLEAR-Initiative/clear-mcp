import { createRequire } from "node:module";

// Read the package version at runtime so `User-Agent: clear-mcp/<version>`
// tracks the published package without a generated constant. Resolves the
// same file from `src/` (bun dev) and `dist/` (built) — both are one level
// below the package root.
const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

export const VERSION: string = pkg.version;
export const USER_AGENT_PREFIX = `clear-mcp/${VERSION}`;
