# ADR 0008: Keep editable table drafts separate from committed answers

## Status

Superseded by [ADR 0009](0009-editable-table-immediate-edits.md). The decision below is retained as history.

## Context

The standard catalog needs typed table edits without changing the read-only Table contract. A cell can contain an unfinished numeric input, and a multi-cell draft can differ from the values used by reactive expressions and submission. Reset actions, page changes and conditional components can otherwise remove that draft before the user chooses what to keep.

## Decision

EditableTable uses plain record-array values and plain column records shaped `{key, label, type}`. Column types are string, finite number and boolean. Every row has exactly the unique column keys. No helper components, row insertion or row deletion are introduced.

The editor owns a complete row snapshot in one of three states. Browse uses committed model values. Draft owns pending typed rows. Editing owns pending rows and a native cell input. Enter starts editing or accepts a cell into the draft. Boolean edits enter Draft directly. Save validates the active input and commits the complete snapshot through the existing staged field update. A failed save retains the draft. Discard returns to Browse without changing committed values.

Only one table draft can be open in a document. The model blocks other field changes, state updates, generated actions and submission until Save or Discard releases the draft. Focus changes do not release it. This conservative boundary prevents conditional removal, reset or stale answer collection without introducing general draft reconciliation.

Save and Discard are local editor operations, not OpenUI actions, answer submission or external persistence. Explicit form cancellation, widget Close and session disposal retain their existing meaning.

## Consequences

- Structured results contain committed typed records, never an unfinished cell input.
- Dependent content changes only after Save.
- Users must finish a table draft before switching pages or adjusting other fields.
- Narrow terminals use bordered labeled records. Wider grids have vertical borders and horizontal header, row and bottom separators.
- The original 25 component signatures and the read-only Table behavior remain unchanged.
- Future support for concurrent drafts or row operations needs a separate decision about identity and reconciliation.

## References

- [Interaction contracts](0001-interaction-contracts.md).
- [Component reference](../components.md#editable-tables).
- [Catalog schemas](../../src/catalog.ts).
- [Draft editor](../../src/editable-table.ts).
- [Model transaction boundary](../../src/model.ts).
