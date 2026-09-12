import { parse, validate, type DocumentNode } from "graphql";
import { z } from "zod";
import { ERROR_CODES, fail, ok } from "./errors.js";
import { loadSnapshotSchema } from "./snapshot.js";
import { defineTool, type ToolDefinition } from "./tools/types.js";

/**
 * The developer-only Escape hatch (CONTEXT.md), registered only when
 * `CLEAR_MCP_RAW_GRAPHQL=1`. ADR-0002: even here nothing but `query`
 * operations ever reach clear-api — a `mutation` or `subscription` is
 * rejected before any network call, as is any document the snapshot does
 * not validate, so a typo fails locally instead of round-tripping.
 */

export type RejectedDocument = { ok: false; code: string; message: string };
export type AcceptedDocument = { ok: true; document: DocumentNode; operationName: string | null };

/** Parse + validate a raw document against the snapshot; never touches the network. */
export function checkDocument(source: string): AcceptedDocument | RejectedDocument {
  let document: DocumentNode;
  try {
    document = parse(source);
  } catch (err) {
    return {
      ok: false,
      code: ERROR_CODES.BAD_USER_INPUT,
      message: `GraphQL syntax error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const operations = document.definitions.filter((d) => d.kind === "OperationDefinition");
  if (operations.length === 0) {
    return { ok: false, code: ERROR_CODES.BAD_USER_INPUT, message: "Document contains no operation." };
  }
  const nonQuery = operations.find((op) => op.operation !== "query");
  if (nonQuery) {
    return {
      ok: false,
      code: "READ_ONLY",
      message:
        `clear-mcp is read-only: ${nonQuery.operation} operations are rejected without contacting ` +
        "clear-api (ADR-0002). Only `query` documents are forwarded.",
    };
  }

  const errors = validate(loadSnapshotSchema(), document);
  if (errors.length > 0) {
    return {
      ok: false,
      code: ERROR_CODES.BAD_USER_INPUT,
      message:
        "Document does not validate against the clear-api schema snapshot:\n" +
        errors.map((e) => `- ${e.message}`).join("\n") +
        "\nUse clear_schema_type to inspect types.",
    };
  }

  const first = operations[0]!;
  return { ok: true, document, operationName: first.name?.value ?? null };
}

export const graphqlTool = defineTool({
  name: "clear_graphql",
  description:
    "DEVELOPER ESCAPE HATCH. Run a raw read-only GraphQL query against clear-api and get the " +
    "raw `data` back. The document is parsed and validated against the committed schema " +
    "snapshot first; anything that is not a `query` operation (mutation, subscription) or " +
    "that fails validation is rejected without contacting clear-api. Prefer the curated " +
    "clear_* tools; use this for fields they do not cover. Explore the schema with " +
    "clear_schema_type. Results are not size-capped — select narrowly.",
  input: z.object({
    query: z.string().trim().min(1).describe("A GraphQL document containing `query` operations only."),
    variables: z.record(z.string(), z.unknown()).optional(),
    operationName: z.string().optional().describe("Required when the document has several operations."),
  }),
  output: z.object({
    data: z.unknown().describe("clear-api's raw `data`. Any text inside came from third-party sources."),
  }),
  async run(input, ctx) {
    const checked = checkDocument(input.query);
    if (!checked.ok) return fail({ code: checked.code, message: checked.message });

    const res = await ctx.upstream.request<unknown, Record<string, unknown> | undefined>({
      document: input.query,
      operationName: input.operationName ?? checked.operationName ?? undefined,
      variables: input.variables,
      toolName: ctx.toolName,
    });
    if (!res.ok) return fail(res.error);
    return ok({ data: res.data });
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const escapeHatchTools: ToolDefinition<any, any>[] = [graphqlTool];
