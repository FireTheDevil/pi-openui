# ADR 0010: Precompute the model prompt

## Status

Accepted.

## Context

The catalog previously called lang-core's `library.prompt` during every production import. Prompt text depends on the component schemas and guidance, not the session. Moving the whole runtime behind lazy imports or compiling the package would change a wider boundary than needed.

## Decision

Keep the authoritative component schemas, library and prompt-building guidance in `src/catalog-source.ts`. Keep `src/catalog.ts` as the existing public export surface, re-exporting prompt strings from a committed TypeScript artifact in `src/generated/prompt.ts`.

Generate that artifact with `npm run generate:prompt`. The generator imports the source directly, never the public facade or generated artifact, so it can also bootstrap a missing artifact. `npm run check:prompt` compares the complete generated file without rewriting it and runs as part of lint.

## Consequences

- Production imports still construct the catalog library but never call `library.prompt`. Source TypeScript remains the package entry; dependencies and runtime loading are unchanged.
- Schema, guidance or relevant dependency changes require regeneration. Commit the artifact with its authoritative source changes.
- Existing prompt text and catalog/model exports remain unchanged. This optimization does not establish a measurable overall startup improvement.
- Generated output is shipped with the source package and remains subject to lint and type checking.

## References

- [Generator](../../tools/generate-prompt.ts)
- [Catalog source](../../src/catalog-source.ts)
- [Development workflow](../development.md)
- [Schema boundaries](0006-schema-boundaries.md)
