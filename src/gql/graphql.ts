/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
export type AlertOrderBy =
  /** Oldest first by event.firstSignalCreatedAt. */
  | 'CREATED_ASC'
  /** Newest first by event.firstSignalCreatedAt. */
  | 'CREATED_DESC'
  /** Lowest event severity first. */
  | 'SEVERITY_ASC'
  /** Highest event severity first. */
  | 'SEVERITY_DESC';

/** Publication status of an alert. */
export type AlertStatus =
  | 'archived'
  | 'draft'
  | 'published';

export type AlertsPageInput = {
  /**
   * Glide codes — alert event must contain at least one of these in its
   * `types` array. Case-sensitive.
   */
  eventTypes?: Array<string> | null | undefined;
  /** Filter on event.firstSignalCreatedAt — inclusive. */
  from?: string | null | undefined;
  /** Hide isDummy events when false (default). */
  includeDummy?: boolean | null | undefined;
  /** Page size — clamped to [1, 100]. Default 25. */
  limit?: number | null | undefined;
  /**
   * Restrict to alerts whose event sits under this location (or any of
   * its descendants).
   */
  locationId?: string | null | undefined;
  /** Zero-based row offset. Default 0. */
  offset?: number | null | undefined;
  orderBy?: AlertOrderBy | null | undefined;
  /** Inclusive upper bound on event severity (1-5). */
  severityMax?: number | null | undefined;
  /** Inclusive lower bound on event severity (1-5). */
  severityMin?: number | null | undefined;
  status?: AlertStatus | null | undefined;
  /** Apply a team's location-scope filter to the underlying events. */
  teamId?: string | null | undefined;
  /** Filter on event.firstSignalCreatedAt — inclusive. */
  to?: string | null | undefined;
};

/**
 * Half-open date window (from inclusive, to exclusive) used to
 * filter `searchKnowledgebase` by the chunk's extracted event
 * window. Chunks whose time_range overlaps the window match.
 */
export type DateRangeInput = {
  from?: string | null | undefined;
  to?: string | null | undefined;
};

export type EntityKind =
  | 'alert'
  | 'event'
  | 'signal';

export type EntityStatsInput = {
  entity: EntityKind;
  eventTypes?: Array<string> | null | undefined;
  from?: string | null | undefined;
  groupBy?: StatsGroupBy | null | undefined;
  includeDummy?: boolean | null | undefined;
  locationId?: string | null | undefined;
  severityMax?: number | null | undefined;
  severityMin?: number | null | undefined;
  teamId?: string | null | undefined;
  to?: string | null | undefined;
};

export type EventOrderBy =
  /** Oldest first by firstSignalCreatedAt. */
  | 'CREATED_ASC'
  /** Newest first by firstSignalCreatedAt. */
  | 'CREATED_DESC'
  /** Oldest signal first (lastSignalCreatedAt). */
  | 'LAST_SIGNAL_ASC'
  /** Newest signal first (lastSignalCreatedAt). */
  | 'LAST_SIGNAL_DESC'
  | 'SEVERITY_ASC'
  | 'SEVERITY_DESC';

export type EventsPageInput = {
  eventTypes?: Array<string> | null | undefined;
  /** Filter on event.firstSignalCreatedAt — inclusive. */
  from?: string | null | undefined;
  includeDummy?: boolean | null | undefined;
  limit?: number | null | undefined;
  locationId?: string | null | undefined;
  offset?: number | null | undefined;
  orderBy?: EventOrderBy | null | undefined;
  severityMax?: number | null | undefined;
  severityMin?: number | null | undefined;
  teamId?: string | null | undefined;
  to?: string | null | undefined;
};

/**
 * Optional filters applied BEFORE the retrieval step — array
 * filters use overlap semantics (any-of), the time range uses
 * inclusive intersection. Leave a field null to skip that filter.
 */
export type KnowledgebaseFilters = {
  /**
   * Scope to one country: keep only chunks tagged with a location in this
   * A0's subtree (itself or any descendant admin unit). Chunk locations are
   * resolved to leaf admin ids, so a bare `locationIds=[A0]` would miss them —
   * this expands the A0 to its subtree server-side via the locations tree. The
   * situation-analysis RAG uses this so a country's analysis never cites reports
   * about another country.
   */
  countryLocationId?: string | null | undefined;
  /**
   * Restrict to rows written by the currently-configured
   * embedding provider + model. Default true — mixing embedding
   * spaces yields meaningless distances. Set false only when
   * inspecting historical rows via BM25-only search (no vector
   * step will be run for filtered-out rows).
   */
  currentEmbeddingModelOnly?: boolean | null | undefined;
  /** Match rows tagged with ANY of these event-type tags. */
  eventTypes?: Array<string> | null | undefined;
  /** Match rows tagged with ANY of these `locations.id` values. */
  locationIds?: Array<string> | null | undefined;
  /** Match rows tagged with ANY of these SAF sectors. */
  needSectors?: Array<string> | null | undefined;
  /** Match rows whose extracted event window overlaps this range. */
  timeRange?: DateRangeInput | null | undefined;
};

export type SignalOrderBy =
  /** Oldest first by publishedAt. */
  | 'PUBLISHED_ASC'
  /** Newest first by publishedAt. */
  | 'PUBLISHED_DESC'
  | 'SEVERITY_ASC'
  | 'SEVERITY_DESC';

/**
 * Durable processing status for the Dagster event-driven drain.
 * NEW = ingested, awaiting downstream processing; PROCESSED = classify→group→
 * alert done; FAILED = terminal failure.
 */
export type SignalStatus =
  | 'FAILED'
  | 'NEW'
  | 'PROCESSED';

export type SignalsPageInput = {
  /** Filter on signal.publishedAt — inclusive. */
  from?: string | null | undefined;
  includeDummy?: boolean | null | undefined;
  limit?: number | null | undefined;
  locationId?: string | null | undefined;
  offset?: number | null | undefined;
  orderBy?: SignalOrderBy | null | undefined;
  severityMax?: number | null | undefined;
  severityMin?: number | null | undefined;
  /** Restrict to signals whose source name is in this list (e.g. ["acled","dataminr"]). */
  sourceNames?: Array<string> | null | undefined;
  teamId?: string | null | undefined;
  to?: string | null | undefined;
};

export type StatsGroupBy =
  /**
   * Group by day / week / month of the entity's primary timestamp.
   * Buckets are returned with ISO-8601 keys (`YYYY-MM-DD`, `YYYY-Www`,
   * `YYYY-MM`).
   */
  | 'day'
  | 'month'
  /** Single bucket — just `total`. Use this for "how many X" queries. */
  | 'none'
  /** Group by integer severity (1-5). */
  | 'severity'
  /**
   * Group by event/signal type (event.types[] is unnested; signals use
   * their source name as the type proxy).
   */
  | 'type'
  | 'week';

export type ClearLocationIndexQueryVariables = Exact<{ [key: string]: never; }>;


export type ClearLocationIndexQuery = { countries: Array<{ id: string, name: string, level: number, pCode: string | null, ancestorIds: Array<string> }>, states: Array<{ id: string, name: string, level: number, pCode: string | null, ancestorIds: Array<string> }>, districts: Array<{ id: string, name: string, level: number, pCode: string | null, ancestorIds: Array<string> }> };

export type IndexedLocationFragment = { id: string, name: string, level: number, pCode: string | null, ancestorIds: Array<string> };

export type ClearSelfCheckQueryVariables = Exact<{ [key: string]: never; }>;


export type ClearSelfCheckQuery = { me: { id: string, role: string | null, isActive: boolean | null } | null };

export type ClearCountQueryVariables = Exact<{
  input: EntityStatsInput;
}>;


export type ClearCountQuery = { entityStats: { total: number, buckets: Array<{ key: string, count: number }> } };

export type ClearGetAlertQueryVariables = Exact<{
  id: string;
}>;


export type ClearGetAlertQuery = { alert: { id: string, status: AlertStatus, createdAt: string, updatedAt: string, event: { id: string, severity: number | null, types: Array<string>, title: string | null, description: string | null, firstSignalCreatedAt: string, lastSignalCreatedAt: string, startedAt: string | null, originLocation: { id: string, name: string, level: number } | null, destinationLocation: { id: string, name: string, level: number } | null, generalLocation: { id: string, name: string, level: number } | null } } | null };

export type ClearGetEventQueryVariables = Exact<{
  id: string;
}>;


export type ClearGetEventQuery = { event: { id: string, severity: number | null, types: Array<string>, title: string | null, description: string | null, firstSignalCreatedAt: string, lastSignalCreatedAt: string, startedAt: string | null, casualties: number | null, populationAffected: string | null, populationDisplaced: string | null, rank: number, isDummy: boolean, originLocation: { id: string, name: string, level: number } | null, destinationLocation: { id: string, name: string, level: number } | null, generalLocation: { id: string, name: string, level: number } | null, alerts: Array<{ id: string, status: AlertStatus }>, signals: Array<{ id: string, publishedAt: string, source: { name: string } }> } | null };

export type ClearGetSignalQueryVariables = Exact<{
  id: string;
}>;


export type ClearGetSignalQuery = { signal: { id: string, status: SignalStatus, publishedAt: string, collectedAt: string, processedAt: string | null, severity: number | null, casualties: number | null, url: string | null, externalId: string | null, isDummy: boolean, title: string | null, description: string | null, source: { name: string, type: string, reliability: number | null }, originLocation: { id: string, name: string, level: number } | null, destinationLocation: { id: string, name: string, level: number } | null, generalLocation: { id: string, name: string, level: number } | null, events: Array<{ id: string }> } | null };

export type ClearListAlertsQueryVariables = Exact<{
  input?: AlertsPageInput | null | undefined;
}>;


export type ClearListAlertsQuery = { alertsPage: { totalCount: number, hasMore: boolean, items: Array<{ id: string, status: AlertStatus, createdAt: string, event: { id: string, severity: number | null, types: Array<string>, title: string | null, description: string | null, firstSignalCreatedAt: string, originLocation: { id: string, name: string, level: number } | null, destinationLocation: { id: string, name: string, level: number } | null, generalLocation: { id: string, name: string, level: number } | null } }> } };

export type ClearListEventsQueryVariables = Exact<{
  input?: EventsPageInput | null | undefined;
}>;


export type ClearListEventsQuery = { eventsPage: { totalCount: number, hasMore: boolean, items: Array<{ id: string, severity: number | null, types: Array<string>, title: string | null, description: string | null, firstSignalCreatedAt: string, lastSignalCreatedAt: string, startedAt: string | null, originLocation: { id: string, name: string, level: number } | null, destinationLocation: { id: string, name: string, level: number } | null, generalLocation: { id: string, name: string, level: number } | null, signals: Array<{ id: string }> }> } };

export type ClearListSignalsQueryVariables = Exact<{
  input?: SignalsPageInput | null | undefined;
}>;


export type ClearListSignalsQuery = { signalsPage: { totalCount: number, hasMore: boolean, items: Array<{ id: string, publishedAt: string, severity: number | null, url: string | null, title: string | null, description: string | null, source: { name: string }, originLocation: { id: string, name: string, level: number } | null, destinationLocation: { id: string, name: string, level: number } | null, generalLocation: { id: string, name: string, level: number } | null }> } };

export type ClearSearchKnowledgeBaseQueryVariables = Exact<{
  query: string;
  filters?: KnowledgebaseFilters | null | undefined;
  limit?: number | null | undefined;
}>;


export type ClearSearchKnowledgeBaseQuery = { searchKnowledgebase: Array<{ id: string, reportId: string, reportTitle: string, sourceUrl: string, publishedAt: string | null, pageStart: number, pageEnd: number, score: number, locationIds: Array<string>, eventTypes: Array<string>, needSectors: Array<string>, figureKind: string | null, chunkText: string }> };

export type ClearWhoamiQueryVariables = Exact<{ [key: string]: never; }>;


export type ClearWhoamiQuery = { me: { id: string, name: string, role: string | null, language: string, isActive: boolean | null, defaultTeam: { id: string, name: string } | null } | null, myTeams: Array<{ id: string, name: string, slug: string, locations: Array<{ id: string, name: string, level: number }> }> };

export class TypedDocumentString<TResult, TVariables>
  extends String
  implements DocumentTypeDecoration<TResult, TVariables>
{
  __apiType?: NonNullable<DocumentTypeDecoration<TResult, TVariables>['__apiType']>;
  private value: string;
  public __meta__?: Record<string, any> | undefined;

  constructor(value: string, __meta__?: Record<string, any> | undefined) {
    super(value);
    this.value = value;
    this.__meta__ = __meta__;
  }

  override toString(): string & DocumentTypeDecoration<TResult, TVariables> {
    return this.value;
  }
}
export const IndexedLocationFragmentDoc = new TypedDocumentString(`
    fragment IndexedLocation on Location {
  id
  name
  level
  pCode
  ancestorIds
}
    `, {"fragmentName":"IndexedLocation"}) as unknown as TypedDocumentString<IndexedLocationFragment, unknown>;
export const ClearLocationIndexDocument = new TypedDocumentString(`
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
}`) as unknown as TypedDocumentString<ClearLocationIndexQuery, ClearLocationIndexQueryVariables>;
export const ClearSelfCheckDocument = new TypedDocumentString(`
    query ClearSelfCheck {
  me {
    id
    role
    isActive
  }
}
    `) as unknown as TypedDocumentString<ClearSelfCheckQuery, ClearSelfCheckQueryVariables>;
export const ClearCountDocument = new TypedDocumentString(`
    query ClearCount($input: EntityStatsInput!) {
  entityStats(input: $input) {
    total
    buckets {
      key
      count
    }
  }
}
    `) as unknown as TypedDocumentString<ClearCountQuery, ClearCountQueryVariables>;
export const ClearGetAlertDocument = new TypedDocumentString(`
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
    `) as unknown as TypedDocumentString<ClearGetAlertQuery, ClearGetAlertQueryVariables>;
export const ClearGetEventDocument = new TypedDocumentString(`
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
    `) as unknown as TypedDocumentString<ClearGetEventQuery, ClearGetEventQueryVariables>;
export const ClearGetSignalDocument = new TypedDocumentString(`
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
    `) as unknown as TypedDocumentString<ClearGetSignalQuery, ClearGetSignalQueryVariables>;
export const ClearListAlertsDocument = new TypedDocumentString(`
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
    `) as unknown as TypedDocumentString<ClearListAlertsQuery, ClearListAlertsQueryVariables>;
export const ClearListEventsDocument = new TypedDocumentString(`
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
    `) as unknown as TypedDocumentString<ClearListEventsQuery, ClearListEventsQueryVariables>;
export const ClearListSignalsDocument = new TypedDocumentString(`
    query ClearListSignals($input: SignalsPageInput) {
  signalsPage(input: $input) {
    totalCount
    hasMore
    items {
      id
      publishedAt
      severity
      url
      title
      description
      source {
        name
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
    }
  }
}
    `) as unknown as TypedDocumentString<ClearListSignalsQuery, ClearListSignalsQueryVariables>;
export const ClearSearchKnowledgeBaseDocument = new TypedDocumentString(`
    query ClearSearchKnowledgeBase($query: String!, $filters: KnowledgebaseFilters, $limit: Int) {
  searchKnowledgebase(query: $query, filters: $filters, limit: $limit) {
    id
    reportId
    reportTitle
    sourceUrl
    publishedAt
    pageStart
    pageEnd
    score
    locationIds
    eventTypes
    needSectors
    figureKind
    chunkText
  }
}
    `) as unknown as TypedDocumentString<ClearSearchKnowledgeBaseQuery, ClearSearchKnowledgeBaseQueryVariables>;
export const ClearWhoamiDocument = new TypedDocumentString(`
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
    `) as unknown as TypedDocumentString<ClearWhoamiQuery, ClearWhoamiQueryVariables>;