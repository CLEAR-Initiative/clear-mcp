import { z } from "zod";
import { fail, ok } from "../errors.js";
import type { LocationIndex } from "../location-index.js";
import { defineTool } from "./types.js";

export const FIND_LOCATION_LIMIT = { min: 1, max: 10, default: 5 } as const;

const ancestor = z.object({ id: z.string(), name: z.string(), level: z.number().int() });

/**
 * The index is created once per server and shared across calls; the tool
 * module receives it through a factory so `tools/index.ts` stays a plain
 * list and the server owns the process-lifetime state.
 */
export function createFindLocationTool(index: LocationIndex) {
  return defineTool({
    name: "clear_find_location",
    description:
      "Resolve a place name to CLEAR locationIds. Searches countries (level 0), states/provinces " +
      "(level 1) and districts/localities (level 2) by name — exact matches rank first, then " +
      "prefix, then substring. Every other tool that takes a locationId, countryLocationId or " +
      "locationIds expects ids from here. Use `withinLocationId` to disambiguate (e.g. a " +
      "district name inside a given country) and `level` to restrict the tier. Landmarks and " +
      "point locations (level 3+) are not searchable.",
    input: z.object({
      query: z.string().trim().min(1).describe("Place name to look up, e.g. \"Darfur\" or \"El Fasher\"."),
      level: z
        .number()
        .int()
        .min(0)
        .max(2)
        .optional()
        .describe("Restrict to one hierarchy level: 0 country, 1 state/province, 2 district."),
      withinLocationId: z
        .string()
        .optional()
        .describe("Only return locations that are this location or lie beneath it."),
      limit: z
        .number()
        .int()
        .optional()
        .describe(`Max results, clamped to [${FIND_LOCATION_LIMIT.min}, ${FIND_LOCATION_LIMIT.max}]; default ${FIND_LOCATION_LIMIT.default}.`),
    }),
    output: z.object({
      items: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          level: z.number().int(),
          pCode: z.string().nullable(),
          ancestors: z.array(ancestor).describe("Parent chain, nearest first."),
          score: z.number().describe("100 exact, 80 prefix, 70 word prefix, 50 substring."),
        }),
      ),
      totalCount: z.number().int().describe("All matches before `limit` was applied."),
      hasMore: z.boolean(),
      limit: z.number().int(),
    }),
    async run(input, ctx) {
      const loadError = await index.ensureLoaded(ctx.toolName);
      if (loadError) return fail(loadError);

      const limit = Math.min(
        FIND_LOCATION_LIMIT.max,
        Math.max(FIND_LOCATION_LIMIT.min, input.limit ?? FIND_LOCATION_LIMIT.default),
      );
      const matches = index.find({
        query: input.query,
        level: input.level,
        withinLocationId: input.withinLocationId,
      });
      return ok({
        items: matches.slice(0, limit),
        totalCount: matches.length,
        hasMore: matches.length > limit,
        limit,
      });
    },
  });
}
