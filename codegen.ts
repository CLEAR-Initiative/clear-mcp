import type { CodegenConfig } from "@graphql-codegen/cli";

// Typed GraphQL documents against the committed schema snapshot. Every tool
// writes its operation with `graphql(...)` from src/gql; codegen turns it into
// a TypedDocumentString so the upstream client infers the result type and a
// renamed field fails `bun run typecheck` before it fails against a server.
// `documentMode: "string"` keeps the runtime dependency-free (no AST at
// runtime); `fragmentMasking: false` keeps result types plain objects.
const config: CodegenConfig = {
  schema: "schema.graphql",
  documents: ["src/**/*.ts", "!src/gql/**"],
  ignoreNoDocuments: true,
  // NodeNext ESM: relative imports inside src/gql must carry `.js`.
  emitLegacyCommonJSImports: false,
  generates: {
    "src/gql/": {
      preset: "client",
      presetConfig: {
        fragmentMasking: false,
      },
      config: {
        documentMode: "string",
        scalars: {
          DateTime: "string",
          JSON: "unknown",
          GeoJSON: "unknown",
          Upload: "unknown",
        },
      },
    },
  },
};

export default config;
