import type { z } from "zod";
import type { Config } from "../config.js";
import { ERROR_CODES, fail, type ToolOutcome } from "../errors.js";
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

/**
 * The one way to call a tool, shared by the MCP server and Tool library
 * Consumers: parse `args` with the tool's input schema — invalid input is a
 * BAD_USER_INPUT value naming each bad field, never a throw — then `run` it
 * with `toolName` set to the tool's own name.
 */
export async function runTool<I extends z.ZodObject, O extends z.ZodObject>(
  tool: ToolDefinition<I, O>,
  args: unknown,
  ctx: Omit<ToolContext, "toolName">,
): Promise<ToolOutcome<z.output<O>>> {
  const parsed = tool.input.safeParse(args ?? {});
  if (!parsed.success) {
    return fail({
      code: ERROR_CODES.BAD_USER_INPUT,
      message: parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "),
    });
  }
  return tool.run(parsed.data, { ...ctx, toolName: tool.name });
}
