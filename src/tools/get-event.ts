import { z } from "zod";
import { fail, ok } from "../errors.js";
import { graphql } from "../gql/index.js";
import { content, contentSchema, getOutput, locationRef, toLocationRef } from "./shared.js";
import { defineTool } from "./types.js";

/** Signal references on an event are capped so a large cluster stays readable. */
export const EVENT_SIGNALS_CAP = 50;

export const GET_EVENT_DOCUMENT = graphql(/* GraphQL */ `
  query ClearGetEvent($id: String!) {
    event(id: $id) {
      id
      severity
      types
      title
      description
      firstSignalCreatedAt
      lastSignalCreatedAt
      startedAt
      casualties
      populationAffected
      populationDisplaced
      rank
      isDummy
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
      alerts {
        id
        status
      }
      signals {
        id
        publishedAt
        source {
          name
        }
      }
    }
  }
`);

export const eventItem = z.object({
  id: z.string(),
  severity: z.number().int().nullable(),
  types: z.array(z.string()).describe("GLIDE codes."),
  firstSignalCreatedAt: z.string(),
  lastSignalCreatedAt: z.string(),
  startedAt: z.string().nullable(),
  casualties: z.number().int().nullable(),
  populationAffected: z.string().nullable(),
  populationDisplaced: z.string().nullable(),
  rank: z.number(),
  isDummy: z.boolean(),
  locations: z.object({
    origin: locationRef.nullable(),
    destination: locationRef.nullable(),
    general: locationRef.nullable(),
  }),
  alerts: z.array(z.object({ id: z.string(), status: z.string() })),
  signalCount: z.number().int().describe("All signals in the cluster; `signals` lists at most 50."),
  signals: z.array(
    z.object({
      id: z.string().describe("Pass to clear_get_signal for the text."),
      sourceName: z.string(),
      publishedAt: z.string(),
    }),
  ),
  content: contentSchema,
});

export const getEventTool = defineTool({
  name: "clear_get_event",
  description:
    "Fetch one CLEAR event by id with untruncated title/description (under `content`), its " +
    "origin/destination/general locations, linked alert ids, and references to its signals " +
    "(id, source, publishedAt — at most 50; `signalCount` has the true size). Signal text is " +
    "not included: call clear_get_signal for it. Returns `item: null` when no event has that id.",
  input: z.object({ id: z.string().min(1).describe("Event id (from clear_list_events or an alert's eventId).") }),
  output: getOutput(eventItem),
  async run(input, ctx) {
    const res = await ctx.upstream.request({
      document: GET_EVENT_DOCUMENT,
      variables: { id: input.id },
      toolName: ctx.toolName,
    });
    if (!res.ok) return fail(res.error);

    const e = res.data.event;
    if (!e) return ok({ item: null });
    return ok({
      item: {
        id: e.id,
        severity: e.severity ?? null,
        types: e.types,
        firstSignalCreatedAt: e.firstSignalCreatedAt,
        lastSignalCreatedAt: e.lastSignalCreatedAt,
        startedAt: e.startedAt ?? null,
        casualties: e.casualties ?? null,
        populationAffected: e.populationAffected ?? null,
        populationDisplaced: e.populationDisplaced ?? null,
        rank: e.rank,
        isDummy: e.isDummy,
        locations: {
          origin: toLocationRef(e.originLocation),
          destination: toLocationRef(e.destinationLocation),
          general: toLocationRef(e.generalLocation),
        },
        alerts: e.alerts.map((a) => ({ id: a.id, status: a.status })),
        signalCount: e.signals.length,
        signals: e.signals.slice(0, EVENT_SIGNALS_CAP).map((s) => ({
          id: s.id,
          sourceName: s.source.name,
          publishedAt: s.publishedAt,
        })),
        content: content(e.title, e.description, "get"),
      },
    });
  },
});
