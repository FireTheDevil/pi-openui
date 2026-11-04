# ADR 0009: Apply editable table cells immediately

## Status

Accepted. Supersedes [ADR 0008](0008-editable-table-drafts.md).

## Context

Users need table edits to update dependent content immediately without locking other fields, pages or local actions. Unfinished numeric input still needs visible validation and must not replace typed values with text.

## Decision

Keep typed committed rows exclusively in DocumentModel. EditableTable owns native per-cell text and errors, indexed by row position and column key, following NumberInput. Each valid keystroke patches fresh current rows through the existing staged field transaction. Boolean toggles apply immediately. Compare authoritative rows with the requested rows after the transaction. Rejected changes restore authoritative text. Accepted no-ops preserve numeric spelling and cursor position.

Remove table-wide drafts, Save/Discard controls and shortcuts, and model-wide draft guards. Enter exits valid editing rather than committing later. Invalid numeric buffers remain visible when inactive and do not prevent navigation or local actions. The existing cached-widget guard blocks collection even for hidden controls. Failed collection reveals the table and targets the first invalid cell in row and column order.

Explicit Set/Reset targets clear buffers even when values are unchanged. External authoritative rows, binding or column changes clear index-addressed editors and clamp selection. Successful own writes advance the authoritative baseline before view refresh. Disabled and removed controls do not retain invalid presentation. Render, update and focus changes never write values.

The plain record-array API, exact typed column keys, public component signatures, no row insertion/deletion policy, native in-cell editing and bordered wide/narrow layouts from ADR 0008 remain unchanged.

## Consequences

- Dependent expressions see valid cell changes before Enter.
- Multiple invalid cells and tables can coexist without global ownership.
- Direct model access sees committed typed rows, not control-local invalid text. Interactive collection hosts enforce the view guard, as for NumberInput.
- Index-based editors are conservatively cleared on external replacement rather than assigned invented row identities.
- These updates remain local exploration, not submission or external persistence.

## References

- [Interaction contracts](0001-interaction-contracts.md).
- [Component reference](../components.md#editable-tables).
- [Cell editor](../../src/editable-table.ts).
- [View collection guard](../../src/view.ts).
- [Model transaction boundary](../../src/model.ts).
