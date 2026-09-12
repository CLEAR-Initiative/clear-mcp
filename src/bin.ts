#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ConfigError, parseConfig } from "./config.js";
import { createServer } from "./server.js";
import { VERSION } from "./version.js";

/**
 * The v1 stdio entrypoint. stdout belongs to the MCP transport from the
 * moment we connect; everything else — config failures included — goes to
 * stderr. Exit codes: 1 for a config problem, 0 when the client closes.
 */
async function main(): Promise<void> {
  let config;
  try {
    config = parseConfig(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`clear-mcp: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  const { server, log } = createServer({ config });
  log.info({ version: VERSION, apiUrl: config.apiUrl, locale: config.locale }, "starting clear-mcp");

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`clear-mcp: fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});
