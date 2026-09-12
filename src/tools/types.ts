import type { z } from "zod";
import type { Config } from "../config.js";
import type { ToolOutcome } from "../errors.js";
import type { Logger } from "../logger.js";
import type { Upstream } from "../upstream.js";

/** What every tool's `run` receives besides its parsed input. */
export interface ToolContext {
  config: Config;
  upstream: Upstream;
  log: Logger;
  toolName: string;
}

/**
 * One Curated tool: a name, a description written for the agent, zod
 * input/output schemas (the SDK derives JSON Schema from them), and `run`.
 * `run` never throws for upstream conditions — it returns a ToolOutcome.
 */
export interface ToolDefinition<I extends z.ZodObject = z.ZodObject, O extends z.ZodObject = z.ZodObject> {
  name: `clear_${string}`;
  description: string;
  input: I;
  output: O;
  run(input: z.output<I>, ctx: ToolContext): Promise<ToolOutcome<z.output<O>>>;
}

/** Identity helper so tool modules get inference without annotations. */
export function defineTool<I extends z.ZodObject, O extends z.ZodObject>(
  def: ToolDefinition<I, O>,
): ToolDefinition<I, O> {
  return def;
}
