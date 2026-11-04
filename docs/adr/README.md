# Architecture decisions

Architecture decision records (ADRs) capture significant technical decisions, their context and trade-offs. Add a record when a decision is proposed or made so future contributors can understand why the project took that direction. References should point to repository files, commits and issues rather than private conversations.

## Writing and maintaining records

Each ADR records one decision using Status, Context, Decision, Consequences and References. Assign the next sequential number and a descriptive filename.

- Use **Proposed** while a decision is under consideration and **Accepted** once it is adopted. Acceptance does not by itself establish that implementation is complete; note pending work when relevant.
- When a decision replaces an accepted ADR, retain the old record and mark it **Superseded** with a link to its replacement.
- When documenting an earlier decision, label that record **retrospective** and distinguish recorded evidence from reconstructed rationale.

ADRs 0001–0007 were reconstructed from project history and the implementation. Their retrospective labels apply to those records, not to future ADRs or this collection as a whole.

## Records

- [0001: Separate presentation from interaction](0001-interaction-contracts.md)
- [0002: Return cancellation without aborting the caller](0002-cancellation-results.md)
- [0003: Share host-provided runtime dependencies](0003-host-dependencies.md)
- [0004: Let the normal Pi model loop choose UI](0004-model-driven-ui.md)
- [0005: Declare a minimum Pi version separately from tested versions](0005-pi-compatibility.md)
- [0006: Use native schema formats at each integration boundary](0006-schema-boundaries.md)
- [0007: Keep conversion integration optional](0007-optional-conversion-adapter.md)

- [0008: Keep editable table drafts separate from committed answers](0008-editable-table-drafts.md). Superseded by 0009.
- [0009: Apply editable table cells immediately](0009-editable-table-immediate-edits.md)

## Related policies

- [Versioning](../versioning.md): the convention applies after `0.7.0`, without implying historical consistency.
- [License](../../LICENSE): MIT, with copyright attributed to `FireTheDevil`.
- [Project status](../../README.md#project-status) and [validation history](../validation-history.md): disclose AI-assisted implementation and distinguish automated verification from local testing.

An issue or proposal alone does not establish an accepted or implemented decision.
