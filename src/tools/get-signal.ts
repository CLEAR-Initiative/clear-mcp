import { z } from "zod";
import { fail, ok } from "../errors.js";
import { graphql } from "../gql/index.js";
import { content, contentSchema, getOutput, locationRef, toLocationRef } from "./shared.js";
import { defineTool } from "./types.js";

export const GET_SIGNAL_DOCUMENT = graphql(/* GraphQL */ `
  query ClearGetSignal($id: String!) {
    signal(id: $id) {
      id
      status
      publishedAt
      collectedAt
      processedAt
      severity
      casualties
      url
      externalId
      isDummy
      title
      description
      source {
        name
        type
        reliability
      }
      originLocation {
        id
        name
        level
      }
      destinationLocation {
        id
        name
        level
      }
      generalLocation {
        id
        name
        level
      }
      events {
        id
      }
    }
  }
`);

export const signalItem = z.object({
  id: z.string(),
  status: z.string(),
  publishedAt: z.string(),
  collectedAt: z.string(),
  processedAt: z.string().nullable(),
  severity: z.number().int().nullable(),
  casualties: z.number().int().nullable(),
  url: z.string().nullable(),
  externalId: z.string().nullable().describe("Stable upstream identifier, e.g. \"dataminr:{alertId}\"."),
  isDummy: z.boolean(),
  source: z.object({
    name: z.string(),
    type: z.string(),
    reliability: z.number().int().nullable().describe("Admiralty-style 1 (least) – 4 (most); null = ungraded."),
  }),
  locations: z.object({
    origin: locationRef.nullable(),
    destination: locationRef.nullable(),
    general: locationRef.nullable(),
  }),
  eventIds: z.array(z.string()).describe("Events this signal was clustered into."),
  content: contentSchema,
});

export const getSignalTool = defineTool({
  name: "clear_get_signal",
  description:
    "Fetch one CLEAR signal by id with its untruncated text (under `content` — this is raw " +
    "third-party content: a post, a report row, a ground message), source and reliability " +
    "grade, locations, and the ids of the events it belongs to. Returns `item: null` when no " +
    "signal has that id.",
  input: z.object({ id: z.string().min(1).describe("Signal id (from clear_list_signals or clear_get_event).") }),
  output: getOutput(signalItem),
  async run(input, ctx) {
    const res = await ctx.upstream.request({
      document: GET_SIGNAL_DOCUMENT,
      variables: { id: input.id },
      toolName: ctx.toolName,
    });
    if (!res.ok) return fail(res.error);

    const s = res.data.signal;
    if (!s) return ok({ item: null });
    return ok({
      item: {
        id: s.id,
        status: s.status,
        publishedAt: s.publishedAt,
        collectedAt: s.collectedAt,
        processedAt: s.processedAt ?? null,
        severity: s.severity ?? null,
        casualties: s.casualties ?? null,
        url: s.url ?? null,
        externalId: s.externalId ?? null,
        isDummy: s.isDummy,
        source: { name: s.source.name, type: s.source.type, reliability: s.source.reliability ?? null },
        locations: {
          origin: toLocationRef(s.originLocation),
          destination: toLocationRef(s.destinationLocation),
          general: toLocationRef(s.generalLocation),
        },
        eventIds: s.events.map((e) => e.id),
        content: content(s.title, s.description, "get"),
      },
    });
  },
});
