/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
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

export type ClearLocationIndexQueryVariables = Exact<{ [key: string]: never; }>;


export type ClearLocationIndexQuery = { countries: Array<{ id: string, name: string, level: number, pCode: string | null, ancestorIds: Array<string> }>, states: Array<{ id: string, name: string, level: number, pCode: string | null, ancestorIds: Array<string> }>, districts: Array<{ id: string, name: string, level: number, pCode: string | null, ancestorIds: Array<string> }> };

export type IndexedLocationFragment = { id: string, name: string, level: number, pCode: string | null, ancestorIds: Array<string> };

export type ClearSelfCheckQueryVariables = Exact<{ [key: string]: never; }>;


export type ClearSelfCheckQuery = { me: { id: string, role: string | null, isActive: boolean | null } | null };

export type ClearListEventsQueryVariables = Exact<{
  input?: EventsPageInput | null | undefined;
}>;


export type ClearListEventsQuery = { eventsPage: { totalCount: number, hasMore: boolean, items: Array<{ id: string, severity: number | null, types: Array<string>, title: string | null, description: string | null, firstSignalCreatedAt: string, lastSignalCreatedAt: string, startedAt: string | null, originLocation: { id: string, name: string, level: number } | null, destinationLocation: { id: string, name: string, level: number } | null, generalLocation: { id: string, name: string, level: number } | null, signals: Array<{ id: string }> }> } };

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