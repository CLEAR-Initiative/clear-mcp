import { z } from "zod";
import { fail, ok } from "../errors.js";
import { graphql } from "../gql/index.js";
import {
  clampLimit,
  clampOffset,
  compact,
  content,
  contentSchema,
  eventTypesFilter,
  listOutput,
  monitorFilters,
  pagingInputs,
  primaryLocation,
} from "./shared.js";
import { defineTool } from "./types.js";

export const LIST_EVENTS_DOCUMENT = graphql(/* GraphQL */ `
  query ClearListEvents($input: EventsPageInput) {
    eventsPage(input: $input) {
      totalCount
      hasMore
      items {
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
        signals {
          id
        }
      }
    }
  }
`);

export const EVENT_ORDER_BY = [
  "CREATED_DESC",
  "CREATED_ASC",
  "LAST_SIGNAL_DESC",
  "LAST_SIGNAL_ASC",
  "SEVERITY_DESC",
  "SEVERITY_ASC",
] as const;

export const eventListItem = z.object({
  id: z.string(),
  severity: z.number().int().nullable(),
  types: z.array(z.string()).describe("GLIDE codes."),
  firstSignalCreatedAt: z.string(),
  lastSignalCreatedAt: z.string(),
  startedAt: z.string().nullable().describe("Real-world onset, when known."),
  signalCount: z.number().int(),
  locationId: z.string().nullable(),
  locationName: z.string().nullable(),
  content: contentSchema,
});

export const listEventsTool = defineTool({
  name: "clear_list_events",
  description:
    "List CLEAR events (signals clustered by disaster type), newest first by default. Filter by " +
    "`locationId` (from clear_find_location), `teamId` (from clear_whoami; omit for the global " +
    "feed), GLIDE `eventTypes` (discover with clear_count(groupBy: \"type\")), severity range and " +
    "a `from`/`to` window on the first signal's time. Descriptions are truncated to 500 chars — " +
    "use clear_get_event for the full text and signal list. Pages are capped at 25; for totals " +
    "or breakdowns across everything, use clear_count.",
  input: z.object({
    ...monitorFilters,
    eventTypes: eventTypesFilter,
    orderBy: z.enum(EVENT_ORDER_BY).optional().describe("Default CREATED_DESC."),
    ...pagingInputs,
  }),
  output: listOutput(eventListItem),
  async run(input, ctx) {
    const limit = clampLimit(input.limit);
    const offset = clampOffset(input.offset);
    const res = await ctx.upstream.request({
      document: LIST_EVENTS_DOCUMENT,
      variables: {
        input: compact({
          teamId: input.teamId,
          locationId: input.locationId,
          eventTypes: input.eventTypes,
          severityMin: input.severityMin,
          severityMax: input.severityMax,
          from: input.from,
          to: input.to,
          orderBy: input.orderBy,
          limit,
          offset,
        }),
      },
      toolName: ctx.toolName,
    });
    if (!res.ok) return fail(res.error);

    const page = res.data.eventsPage;
    const location = (e: (typeof page.items)[number]) =>
      primaryLocation(e.originLocation, e.destinationLocation, e.generalLocation);
    return ok({
      items: page.items.map((e) => ({
        id: e.id,
        severity: e.severity ?? null,
        types: e.types,
        firstSignalCreatedAt: e.firstSignalCreatedAt,
        lastSignalCreatedAt: e.lastSignalCreatedAt,
        startedAt: e.startedAt ?? null,
        signalCount: e.signals.length,
        locationId: location(e)?.id ?? null,
        locationName: location(e)?.name ?? null,
        content: content(e.title, e.description, "list"),
      })),
      totalCount: page.totalCount,
      hasMore: page.hasMore,
      limit,
      offset,
    });
  },
});
