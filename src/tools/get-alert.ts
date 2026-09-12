import { z } from "zod";
import { fail, ok } from "../errors.js";
import { graphql } from "../gql/index.js";
import { ALERT_STATUS } from "./list-alerts.js";
import { content, contentSchema, getOutput, locationRef, toLocationRef } from "./shared.js";
import { defineTool } from "./types.js";

export const GET_ALERT_DOCUMENT = graphql(/* GraphQL */ `
  query ClearGetAlert($id: String!) {
    alert(id: $id) {
      id
      status
      createdAt
      updatedAt
      event {
        id
        severity
        types
        title
        description
        firstSignalCreatedAt
        lastSignalCreatedAt
        startedAt
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
      }
    }
  }
`);

export const alertItem = z.object({
  id: z.string(),
  status: z.enum(ALERT_STATUS),
  createdAt: z.string(),
  updatedAt: z.string(),
  eventId: z.string().describe("Pass to clear_get_event for the signal list."),
  severity: z.number().int().nullable(),
  types: z.array(z.string()),
  firstSignalCreatedAt: z.string(),
  lastSignalCreatedAt: z.string(),
  startedAt: z.string().nullable(),
  locations: z.object({
    origin: locationRef.nullable(),
    destination: locationRef.nullable(),
    general: locationRef.nullable(),
  }),
  content: contentSchema,
});

export const getAlertTool = defineTool({
  name: "clear_get_alert",
  description:
    "Fetch one CLEAR alert by id with its status timeline and the underlying event's " +
    "untruncated title/description (under `content`), severity, GLIDE types and locations. " +
    "Use the `eventId` with clear_get_event to reach the signals. Returns `item: null` when no " +
    "alert has that id.",
  input: z.object({ id: z.string().min(1).describe("Alert id (from clear_list_alerts).") }),
  output: getOutput(alertItem),
  async run(input, ctx) {
    const res = await ctx.upstream.request({
      document: GET_ALERT_DOCUMENT,
      variables: { id: input.id },
      toolName: ctx.toolName,
    });
    if (!res.ok) return fail(res.error);

    const a = res.data.alert;
    if (!a) return ok({ item: null });
    const e = a.event;
    return ok({
      item: {
        id: a.id,
        status: a.status,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        eventId: e.id,
        severity: e.severity ?? null,
        types: e.types,
        firstSignalCreatedAt: e.firstSignalCreatedAt,
        lastSignalCreatedAt: e.lastSignalCreatedAt,
        startedAt: e.startedAt ?? null,
        locations: {
          origin: toLocationRef(e.originLocation),
          destination: toLocationRef(e.destinationLocation),
          general: toLocationRef(e.generalLocation),
        },
        content: content(e.title, e.description, "get"),
      },
    });
  },
});
