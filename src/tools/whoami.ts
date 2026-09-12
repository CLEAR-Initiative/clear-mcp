import { z } from "zod";
import { ERROR_CODES, fail, ok } from "../errors.js";
import { graphql } from "../gql/index.js";
import { defineTool } from "./types.js";

/**
 * `me` has no guard and returns null for an unknown/revoked key; `myTeams`
 * is `requireAuth`, so an unauthenticated Caller surfaces as UNAUTHENTICATED
 * from the same round trip. One request covers identity + team scope.
 */
export const WHOAMI_DOCUMENT = graphql(/* GraphQL */ `
  query ClearWhoami {
    me {
      id
      name
      role
      language
      isActive
      defaultTeam {
        id
        name
      }
    }
    myTeams {
      id
      name
      slug
      locations {
        id
        name
        level
      }
    }
  }
`);

const scopeLocation = z.object({
  id: z.string(),
  name: z.string(),
  level: z.number().int(),
});

export const whoamiTool = defineTool({
  name: "clear_whoami",
  description:
    "Who am I in CLEAR? Returns the identity the configured API key resolves to (id, role, " +
    "language), the teams the caller belongs to with their scope locations (a `teamId` " +
    "narrows Monitor tools to that scope; empty `locations` means global), the locale " +
    "requests are pinned to, whether the raw GraphQL escape hatch is enabled, and the " +
    "clear-api URL in use. Call this first to learn your scope and to diagnose auth problems.",
  input: z.object({}),
  output: z.object({
    caller: z.object({
      id: z.string(),
      name: z.string(),
      role: z.string().nullable(),
      language: z.string(),
      isActive: z.boolean().nullable(),
      defaultTeam: z.object({ id: z.string(), name: z.string() }).nullable(),
    }),
    teams: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        slug: z.string(),
        locations: z.array(scopeLocation),
      }),
    ),
    locale: z.string(),
    escapeHatchEnabled: z.boolean(),
    apiUrl: z.string(),
  }),
  async run(_input, ctx) {
    const res = await ctx.upstream.request({ document: WHOAMI_DOCUMENT, toolName: ctx.toolName });
    if (!res.ok) return fail(res.error);

    const { me, myTeams } = res.data;
    if (!me) {
      return fail({
        code: ERROR_CODES.UNAUTHENTICATED,
        message: "clear-api did not recognise the configured CLEAR_API_KEY (me is null).",
      });
    }

    return ok({
      caller: {
        id: me.id,
        name: me.name,
        role: me.role ?? null,
        language: me.language,
        isActive: me.isActive ?? null,
        defaultTeam: me.defaultTeam ?? null,
      },
      teams: (myTeams ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        locations: t.locations.map((l) => ({ id: l.id, name: l.name, level: l.level })),
      })),
      locale: ctx.config.locale,
      escapeHatchEnabled: ctx.config.rawGraphql,
      apiUrl: ctx.config.apiUrl,
    });
  },
});
