/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
export type ClearLocationIndexQueryVariables = Exact<{ [key: string]: never; }>;


export type ClearLocationIndexQuery = { countries: Array<{ id: string, name: string, level: number, pCode: string | null, ancestorIds: Array<string> }>, states: Array<{ id: string, name: string, level: number, pCode: string | null, ancestorIds: Array<string> }>, districts: Array<{ id: string, name: string, level: number, pCode: string | null, ancestorIds: Array<string> }> };

export type IndexedLocationFragment = { id: string, name: string, level: number, pCode: string | null, ancestorIds: Array<string> };

export type ClearSelfCheckQueryVariables = Exact<{ [key: string]: never; }>;


export type ClearSelfCheckQuery = { me: { id: string, role: string | null, isActive: boolean | null } | null };

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