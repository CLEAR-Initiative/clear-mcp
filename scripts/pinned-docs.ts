/**
 * Text files that write an exact `@clear-initiative/mcp@<version>` pin for a Consumer to copy:
 * the README's setup prompt fetches skills from unpkg at that version and runs that server, and
 * the setup skill's examples pin it. `set-version` rewrites them; `tests/packaging.test.ts`
 * holds every pin in them equal to `package.json`.
 */
export const PINNED_DOCS = [
  "README.md",
  "skills/clear-connect/SKILL.md",
  "skills/clear-connect/references/clients.md",
  "skills/clear-impact-prior/README.md",
] as const;

/** An exact pin; `<version>` placeholders and unpinned names do not match. */
export const PIN_PATTERN = /@clear-initiative\/mcp@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/g;
