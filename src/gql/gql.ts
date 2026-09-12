/* eslint-disable */
import * as types from './graphql.js';



/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  query ClearLocationIndex {\n    countries: locations(level: 0) {\n      ...IndexedLocation\n    }\n    states: locations(level: 1) {\n      ...IndexedLocation\n    }\n    districts: locations(level: 2) {\n      ...IndexedLocation\n    }\n  }\n  fragment IndexedLocation on Location {\n    id\n    name\n    level\n    pCode\n    ancestorIds\n  }\n": typeof types.ClearLocationIndexDocument,
    "\n  query ClearSelfCheck {\n    me {\n      id\n      role\n      isActive\n    }\n  }\n": typeof types.ClearSelfCheckDocument,
    "\n  query ClearListEvents($input: EventsPageInput) {\n    eventsPage(input: $input) {\n      totalCount\n      hasMore\n      items {\n        id\n        severity\n        types\n        title\n        description\n        firstSignalCreatedAt\n        lastSignalCreatedAt\n        startedAt\n        originLocation {\n          id\n          name\n          level\n        }\n        destinationLocation {\n          id\n          name\n          level\n        }\n        generalLocation {\n          id\n          name\n          level\n        }\n        signals {\n          id\n        }\n      }\n    }\n  }\n": typeof types.ClearListEventsDocument,
    "\n  query ClearWhoami {\n    me {\n      id\n      name\n      role\n      language\n      isActive\n      defaultTeam {\n        id\n        name\n      }\n    }\n    myTeams {\n      id\n      name\n      slug\n      locations {\n        id\n        name\n        level\n      }\n    }\n  }\n": typeof types.ClearWhoamiDocument,
};
const documents: Documents = {
    "\n  query ClearLocationIndex {\n    countries: locations(level: 0) {\n      ...IndexedLocation\n    }\n    states: locations(level: 1) {\n      ...IndexedLocation\n    }\n    districts: locations(level: 2) {\n      ...IndexedLocation\n    }\n  }\n  fragment IndexedLocation on Location {\n    id\n    name\n    level\n    pCode\n    ancestorIds\n  }\n": types.ClearLocationIndexDocument,
    "\n  query ClearSelfCheck {\n    me {\n      id\n      role\n      isActive\n    }\n  }\n": types.ClearSelfCheckDocument,
    "\n  query ClearListEvents($input: EventsPageInput) {\n    eventsPage(input: $input) {\n      totalCount\n      hasMore\n      items {\n        id\n        severity\n        types\n        title\n        description\n        firstSignalCreatedAt\n        lastSignalCreatedAt\n        startedAt\n        originLocation {\n          id\n          name\n          level\n        }\n        destinationLocation {\n          id\n          name\n          level\n        }\n        generalLocation {\n          id\n          name\n          level\n        }\n        signals {\n          id\n        }\n      }\n    }\n  }\n": types.ClearListEventsDocument,
    "\n  query ClearWhoami {\n    me {\n      id\n      name\n      role\n      language\n      isActive\n      defaultTeam {\n        id\n        name\n      }\n    }\n    myTeams {\n      id\n      name\n      slug\n      locations {\n        id\n        name\n        level\n      }\n    }\n  }\n": types.ClearWhoamiDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ClearLocationIndex {\n    countries: locations(level: 0) {\n      ...IndexedLocation\n    }\n    states: locations(level: 1) {\n      ...IndexedLocation\n    }\n    districts: locations(level: 2) {\n      ...IndexedLocation\n    }\n  }\n  fragment IndexedLocation on Location {\n    id\n    name\n    level\n    pCode\n    ancestorIds\n  }\n"): typeof import('./graphql.js').ClearLocationIndexDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ClearSelfCheck {\n    me {\n      id\n      role\n      isActive\n    }\n  }\n"): typeof import('./graphql.js').ClearSelfCheckDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ClearListEvents($input: EventsPageInput) {\n    eventsPage(input: $input) {\n      totalCount\n      hasMore\n      items {\n        id\n        severity\n        types\n        title\n        description\n        firstSignalCreatedAt\n        lastSignalCreatedAt\n        startedAt\n        originLocation {\n          id\n          name\n          level\n        }\n        destinationLocation {\n          id\n          name\n          level\n        }\n        generalLocation {\n          id\n          name\n          level\n        }\n        signals {\n          id\n        }\n      }\n    }\n  }\n"): typeof import('./graphql.js').ClearListEventsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ClearWhoami {\n    me {\n      id\n      name\n      role\n      language\n      isActive\n      defaultTeam {\n        id\n        name\n      }\n    }\n    myTeams {\n      id\n      name\n      slug\n      locations {\n        id\n        name\n        level\n      }\n    }\n  }\n"): typeof import('./graphql.js').ClearWhoamiDocument;


export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}
