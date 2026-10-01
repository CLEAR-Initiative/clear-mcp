import type { Locale } from "./config.js";
import type { ToolError } from "./errors.js";
import { graphql } from "./gql/index.js";
import { silentLogger, type Logger } from "./logger.js";
import type { Upstream } from "./upstream.js";

/**
 * Backs `clear_find_location`. clear-api's `locations(level)` is unguarded
 * and returns whole tiers, so the index loads levels 0–2 once per process
 * and locale (one request, three aliased fields) and answers name lookups
 * locally. Level ≥ 3 (L4 landmarks, `landmark-geocoded` points) is
 * deliberately not indexed. Never selects `geometry`, `children`, `parent`
 * or `metadata`.
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
  /** Which locale's tiers to search — clear-api localises `Location.name`. */
  locale: Locale;
  query: string;
  level?: number;
  withinLocationId?: string;
}

/** One load: the calling tool's upstream and locale, used for that request only. */
export interface LoadRequest {
  toolName: string;
  upstream: Upstream;
  locale: Locale;
}

export interface LocationIndex {
  /**
   * Load `locale`'s tiers through `upstream` if they are not cached yet;
   * resolves to a ToolError on upstream failure. The upstream (and so the
   * Caller's credential) is used for that one request and never kept.
   */
  ensureLoaded(req: LoadRequest): Promise<ToolError | null>;
  /** Ranked matches in `opts.locale`'s tiers; call `ensureLoaded` first. */
  find(opts: FindOptions): LocationMatch[];
  /** Number of rows indexed for `locale`, or 0 before loading. */
  size(locale: Locale): number;
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

interface Tiers {
  entries: Entry[];
  byId: Map<string, Entry>;
}

/**
 * Data only: the index holds loaded tiers, keyed by locale, and never an
 * upstream or a credential — each load borrows the calling tool's upstream.
 * One index is shared by every Caller of a process (the MCP server, or a
 * Tool library Consumer's module-level instance). That assumes
 * `locations(level)` is not caller-scoped: clear-api returns the same tiers
 * to everyone. If it ever scopes them, the index must become per Caller.
 */
export function createLocationIndex(deps: { log?: Logger } = {}): LocationIndex {
  const log = deps.log ?? silentLogger();
  const tiers = new Map<Locale, Tiers>();
  const inflight = new Map<Locale, Promise<ToolError | null>>();

  async function load({ toolName, upstream, locale }: LoadRequest): Promise<ToolError | null> {
    const started = Date.now();
    const res = await upstream.request({ document: LOCATIONS_DOCUMENT, toolName });
    if (!res.ok) return res.error;

    const rows = [...res.data.countries, ...res.data.states, ...res.data.districts];
    const entries: Entry[] = rows.map((r) => {
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
    tiers.set(locale, { entries, byId: new Map(entries.map((e) => [e.id, e])) });
    log.info(
      {
        locale,
        countries: res.data.countries.length,
        states: res.data.states.length,
        districts: res.data.districts.length,
        elapsedMs: Date.now() - started,
      },
      "location index loaded",
    );
    return null;
  }

  async function ensureLoaded(req: LoadRequest): Promise<ToolError | null> {
    if (tiers.has(req.locale)) return null;
    let pending = inflight.get(req.locale);
    if (!pending) {
      pending = load(req).finally(() => inflight.delete(req.locale));
      inflight.set(req.locale, pending);
    }
    return pending;
  }

  function ancestorsOf(entry: Entry, byId: Map<string, Entry>): LocationAncestor[] {
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
    const loaded = tiers.get(opts.locale);
    const q = normaliseName(opts.query);
    if (!loaded || !q) return [];
    const matches: Array<{ entry: Entry; score: number }> = [];
    for (const entry of loaded.entries) {
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
      ancestors: ancestorsOf(entry, loaded.byId),
      score,
    }));
  }

  return { ensureLoaded, find, size: (locale) => tiers.get(locale)?.entries.length ?? 0 };
}
