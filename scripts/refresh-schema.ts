#!/usr/bin/env bun
/**
 * Refresh `schema.graphql` from a running clear-api.
 *
 *   CLEAR_API_URL=https://api-dev.example CLEAR_API_KEY=sk_live_… bun run refresh-schema
 *
 * Introspection is disabled on production clear-api, so point this at dev or
 * staging. Output is the introspection result rebuilt as a client schema and
 * printed lexicographically sorted, so the file is stable across runs and
 * `git diff --exit-code schema.graphql` is the drift alarm (nightly CI).
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildClientSchema,
  getIntrospectionQuery,
  lexicographicSortSchema,
  printSchema,
  type IntrospectionQuery,
} from "graphql";
import { graphqlEndpoint, parseConfig } from "../src/config.js";
import { USER_AGENT_PREFIX } from "../src/version.js";

const config = parseConfig(process.env);
const endpoint = graphqlEndpoint(config);
const out = resolve(import.meta.dirname, "..", "schema.graphql");

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    authorization: `Bearer ${config.apiKey}`,
    "x-force-locale": config.locale,
    "content-type": "application/json",
    "user-agent": `${USER_AGENT_PREFIX} (refresh-schema)`,
  },
  body: JSON.stringify({ query: getIntrospectionQuery({ descriptions: true }) }),
  signal: AbortSignal.timeout(30_000),
});

if (!response.ok) {
  console.error(`refresh-schema: ${endpoint} responded ${response.status}`);
  process.exit(1);
}

const body = (await response.json()) as { data?: IntrospectionQuery; errors?: Array<{ message: string }> };
if (body.errors?.length || !body.data) {
  console.error(
    `refresh-schema: introspection failed (is this a production clear-api, where introspection is off?):\n` +
      (body.errors ?? []).map((e) => `  - ${e.message}`).join("\n"),
  );
  process.exit(1);
}

const sdl = printSchema(lexicographicSortSchema(buildClientSchema(body.data)));
writeFileSync(out, sdl);
console.error(`refresh-schema: wrote ${out} (${sdl.split("\n").length} lines) from ${endpoint}`);
