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

export const LIST_ALERTS_DOCUMENT = graphql(/* GraphQL */ `
  query ClearListAlerts($input: AlertsPageInput) {
    alertsPage(input: $input) {
      totalCount
      hasMore
      items {
        id
        status
        createdAt
        event {
          id
          severity
          types
          title
          description
          firstSignalCreatedAt
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
  }
`);

export const ALERT_STATUS = ["draft", "published", "archived"] as const;
export const ALERT_ORDER_BY = ["CREATED_DESC", "CREATED_ASC", "SEVERITY_DESC", "SEVERITY_ASC"] as const;

export const alertListItem = z.object({
  id: z.string(),
  status: z.enum(ALERT_STATUS),
  createdAt: z.string(),
  eventId: z.string(),
  severity: z.number().int().nullable().describe("The underlying event's severity."),
  types: z.array(z.string()).describe("The underlying event's GLIDE codes."),
  firstSignalCreatedAt: z.string(),
  locationId: z.string().nullable(),
  locationName: z.string().nullable(),
  content: contentSchema,
});

export const listAlertsTool = defineTool({
  name: "clear_list_alerts",
  description:
    "List CLEAR alerts (published advisories raised from events), newest first by default. " +
    "Filter by `status` (draft/published/archived), `locationId` (from clear_find_location), " +
    "`teamId` (from clear_whoami; omit for the global feed), GLIDE `eventTypes` (discover with " +
    "clear_count(groupBy: \"type\")), severity range and a `from`/`to` window on the event's " +
    "first signal. Title/description come from the alert's event and are truncated to 500 " +
    "chars — use clear_get_alert for full text. Pages are capped at 25; totals beyond a page " +
    "come from clear_count.",
  input: z.object({
    status: z.enum(ALERT_STATUS).optional(),
    ...monitorFilters,
    eventTypes: eventTypesFilter,
    orderBy: z.enum(ALERT_ORDER_BY).optional().describe("Default CREATED_DESC."),
    ...pagingInputs,
  }),
  output: listOutput(alertListItem),
  async run(input, ctx) {
    const limit = clampLimit(input.limit);
    const offset = clampOffset(input.offset);
    const res = await ctx.upstream.request({
      document: LIST_ALERTS_DOCUMENT,
      variables: {
        input: compact({
          status: input.status,
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

    const page = res.data.alertsPage;
    return ok({
      items: page.items.map((a) => {
        const e = a.event;
        const loc = primaryLocation(e.originLocation, e.destinationLocation, e.generalLocation);
        return {
          id: a.id,
          status: a.status,
          createdAt: a.createdAt,
          eventId: e.id,
          severity: e.severity ?? null,
          types: e.types,
          firstSignalCreatedAt: e.firstSignalCreatedAt,
          locationId: loc?.id ?? null,
          locationName: loc?.name ?? null,
          content: content(e.title, e.description, "list"),
        };
      }),
      totalCount: page.totalCount,
      hasMore: page.hasMore,
      limit,
      offset,
    });
  },
});
