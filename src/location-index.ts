import type { ToolError } from "./errors.js";
import { graphql } from "./gql/index.js";
import type { Logger } from "./logger.js";
import type { Upstream } from "./upstream.js";

/**
 * Backs `clear_find_location`. clear-api's `locations(level)` is unguarded
 * and returns whole tiers, so the index loads levels 0–2 once per process
 * (one request, three aliased fields) and answers name lookups locally.
 * Level ≥ 3 (L4 landmarks, `landmark-geocoded` points) is deliberately not
 * indexed. Never selects `geometry`, `children`, `parent` or `metadata`.
 */
export const LOCATIONS_DOCUMENT = graphql(/* GraphQL */ `
  query ClearLocationIndex {
    countries: locations(level: 0) {
      ...IndexedLocation
    }
    states: locations(level: 1) {
      ...IndexedLocation
    }
    districts: locations(level: 2) {
      ...IndexedLocation
    }
  }
  fragment IndexedLocation on Location {
    id
    name
    level
    pCode
    ancestorIds
  }
`);

export interface IndexedLocation {
  id: string;
  name: string;
  level: number;
  pCode: string | null;
  ancestorIds: string[];
}

export interface LocationAncestor {
  id: string;
  name: string;
  level: number;
}

export interface LocationMatch {
  id: string;
  name: string;
  level: number;
  pCode: string | null;
  ancestors: LocationAncestor[];
  score: number;
}

export interface FindOptions {
  query: string;
  level?: number;
  withinLocationId?: string;
}

export interface LocationIndex {
  /** Load the index if needed; resolves to a ToolError on upstream failure. */
  ensureLoaded(toolName: string): Promise<ToolError | null>;
  /** Ranked matches; call `ensureLoaded` first. */
  find(opts: FindOptions): LocationMatch[];
  /** Number of indexed rows, or 0 before loading. */
  size(): number;
}

/** Match tiers; higher wins. Ties break on level (shallower first) then name. */
export const SCORE = {
  EXACT: 100,
  PREFIX: 80,
  WORD_PREFIX: 70,
  SUBSTRING: 50,
} as const;

/** Lowercase, strip diacritics and punctuation, collapse whitespace. */
export function normaliseName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface Entry extends IndexedLocation {
  normalised: string;
  words: string[];
}

export function createLocationIndex(deps: { upstream: Upstream; log: Logger }): LocationIndex {
  let entries: Entry[] = [];
  let byId = new Map<string, Entry>();
  let loaded = false;
  let inflight: Promise<ToolError | null> | null = null;

  async function load(toolName: string): Promise<ToolError | null> {
    const started = Date.now();
    const res = await deps.upstream.request({ document: LOCATIONS_DOCUMENT, toolName });
    if (!res.ok) return res.error;

    const rows = [...res.data.countries, ...res.data.states, ...res.data.districts];
    const next: Entry[] = rows.map((r) => {
      const normalised = normaliseName(r.name);
      return {
        id: r.id,
        name: r.name,
        level: r.level,
        pCode: r.pCode ?? null,
        ancestorIds: r.ancestorIds ?? [],
        normalised,
        words: normalised.split(" ").filter(Boolean),
      };
    });
    entries = next;
    byId = new Map(next.map((e) => [e.id, e]));
    loaded = true;
    deps.log.info(
      {
        countries: res.data.countries.length,
        states: res.data.states.length,
        districts: res.data.districts.length,
        elapsedMs: Date.now() - started,
      },
      "location index loaded",
    );
    return null;
  }

  async function ensureLoaded(toolName: string): Promise<ToolError | null> {
    if (loaded) return null;
    if (!inflight) {
      inflight = load(toolName).finally(() => {
        inflight = null;
      });
    }
    return inflight;
  }

  function ancestorsOf(entry: Entry): LocationAncestor[] {
    const out: LocationAncestor[] = [];
    for (const id of entry.ancestorIds) {
      const a = byId.get(id);
      if (a) out.push({ id: a.id, name: a.name, level: a.level });
    }
    return out;
  }

  function scoreEntry(entry: Entry, q: string): number {
    if (entry.normalised === q) return SCORE.EXACT;
    if (entry.normalised.startsWith(q)) return SCORE.PREFIX;
    if (entry.words.some((w) => w.startsWith(q))) return SCORE.WORD_PREFIX;
    if (entry.normalised.includes(q)) return SCORE.SUBSTRING;
    return 0;
  }

  function find(opts: FindOptions): LocationMatch[] {
    const q = normaliseName(opts.query);
    if (!q) return [];
    const matches: Array<{ entry: Entry; score: number }> = [];
    for (const entry of entries) {
      if (opts.level !== undefined && entry.level !== opts.level) continue;
      if (
        opts.withinLocationId !== undefined &&
        !entry.ancestorIds.includes(opts.withinLocationId) &&
        entry.id !== opts.withinLocationId
      ) {
        continue;
      }
      const score = scoreEntry(entry, q);
      if (score > 0) matches.push({ entry, score });
    }
    matches.sort(
      (a, b) =>
        b.score - a.score ||
        a.entry.level - b.entry.level ||
        a.entry.name.length - b.entry.name.length ||
        a.entry.name.localeCompare(b.entry.name),
    );
    return matches.map(({ entry, score }) => ({
      id: entry.id,
      name: entry.name,
      level: entry.level,
      pCode: entry.pCode,
      ancestors: ancestorsOf(entry),
      score,
    }));
  }

  return { ensureLoaded, find, size: () => entries.length };
}
