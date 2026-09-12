import pino, { type Logger } from "pino";
import type { LogLevel } from "./config.js";

export type { Logger };

/**
 * All logging goes to file descriptor 2. On stdio, stdout is the MCP
 * protocol channel and a single stray line there corrupts the session, so
 * nothing in this package may write to stdout except the transport.
 */
export function createLogger(level: LogLevel): Logger {
  return pino({ level, base: { name: "clear-mcp" } }, pino.destination({ fd: 2, sync: true }));
}

/** Logger used by tests and by callers that don't want output. */
export function silentLogger(): Logger {
  return pino({ level: "silent" });
}
