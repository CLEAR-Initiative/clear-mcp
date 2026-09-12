import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSchema, type GraphQLSchema } from "graphql";

/**
 * The committed clear-api SDL, loaded once per process. Lives at the package
 * root so it resolves the same from `src/` (bun dev) and `dist/` (built).
 * Codegen and the Escape hatch validator both build from this file; the
 * nightly drift job is the only alarm that it still matches the target.
 */
export const SNAPSHOT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "schema.graphql");

let cached: GraphQLSchema | null = null;

export function loadSnapshotSchema(): GraphQLSchema {
  if (!cached) cached = buildSchema(readFileSync(SNAPSHOT_PATH, "utf8"));
  return cached;
}
