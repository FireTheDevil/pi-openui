# Release notes

## 0.8.0

This minor release adds components and includes intentional compatibility changes under the [versioning policy](versioning.md).

### Additions and fixes

- Accordion adds expandable content with tree rails.
- Callout adds boxed notices with optional dismissal. Only the visible dismissal button responds to dismissal clicks.
- EditableTable adds typed, in-cell editing. Valid edits update local state immediately. Invalid numeric text stays visible and blocks collection without blocking navigation or other controls.
- Source and existing fixtures pass every configured lint rule without exceptions. The 28 component schemas and positional APIs are unchanged by the lint cleanup.

### Breaking changes and migration

Rendered elements now require a string `typeName`, object `props`, and correctly typed optional parser metadata. Missing `partial` remains supported. Primitive or array props and malformed raw element headers are rejected. Use catalog component calls rather than hand-built malformed element objects. Valid component-call streaming remains supported.

Component helpers validate settings, pages, lists, trees, and table data instead of assuming their types. Direct callers must supply values accepted by the corresponding component schema. Optional positional `null` settings still mean omission.

`fieldOptions` returns a validated snapshot of applicable declared field settings. Do not depend on its result having the original settings object's identity or unrelated extra keys. Original source settings remain on the node.

TypeScript consumers of `DocumentModel.root`, `childNodes`, element guards, and node-taking helpers should use `RenderedNode`, exported from `src/catalog.ts` and `src/model.ts`. Its `partial` field is optional. Code requiring the upstream `ElementNode` type must handle or supply that metadata explicitly. Existing upstream `ElementNode` arguments remain assignable.

Persisted receipts require literal string statuses. Objects that convert to a valid status string are no longer accepted. Store the status string itself.

Complete action expressions must satisfy the installed lang-core `ASTNode` contract. Unknown variants, missing required fields, and wrongly typed fields are rejected. Generate actions through the supported action syntax rather than malformed AST objects. Partial streaming metadata is not treated as a complete action AST.

### Verification

Lint, typecheck, and all 241 existing tests pass. Independent native checks cover interaction, streaming, immediate table edits, invalid-input collection safeguards, rollback, and replay. All 314 rendered captures match the earlier baseline. See [validation history](validation-history.md) for versions, evidence, and limitations. Optional PCC compatibility was not rerun because its environment was not configured.
