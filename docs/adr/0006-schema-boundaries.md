# ADR 0006: Use native schema formats at each integration boundary

## Status

Accepted — retrospective.

## Context

The Pi tool interface and OpenUI component catalog use different schema APIs. Standardizing on one library would require adapting one integration boundary rather than simply removing a redundant validator.

## Decision

Use TypeBox for the Pi tool arguments and output schema, and Zod for the component specifications consumed by lang-core. Keep each boundary in its native format rather than maintaining a schema-conversion layer.

## Consequences

- The project retains two schema libraries and developers must understand their distinct roles.
- Tool-call validation and component-property validation remain separate responsibilities.
- Changes to either upstream schema API must be handled at its integration boundary. TypeBox runtime ownership follows [ADR 0003](0003-host-dependencies.md).

## References

- [Pi tool registration and schemas](../../src/index.ts)
- [OpenUI component schemas](../../src/catalog.ts)
- [Dependency declarations](../../package.json)
