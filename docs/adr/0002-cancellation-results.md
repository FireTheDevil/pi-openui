# ADR 0002: Return cancellation without aborting the caller

## Status

Accepted — retrospective. Replaces the abort-on-cancel behavior introduced in `0.6.0`.

## Context

The `0.6.0` implementation aborted the active Pi run and propagated form cancellation into code/notebook execution. This coupled declining an answer with terminating its caller and could require recovery of notebook execution state.

## Decision

Return `status: "cancelled"` normally when an answer-collecting form is closed. Preserve the surrounding caller and notebook state so the caller can inspect the outcome and continue. Keep actual host aborts, timeouts and shutdown distinct from form cancellation.

## Consequences

- Callers must check for `submitted` before work that requires an answer; cancellation is neither a default choice nor approval.
- Escape/Ctrl+C on a collecting form does not require a notebook restart.
- The conversion adapter must retain pending results across execution yields without turning ordinary cancellation into an exception.
- Local widgets have already returned: Escape/Ctrl+C transfers focus to chat rather than cancelling a pending call.

## References

- [Earlier abort behavior: 7db022e](https://github.com/FireTheDevil/pi-openui/commit/7db022e)
- [Normal cancellation results in 0.6.1: 8252888](https://github.com/FireTheDevil/pi-openui/commit/8252888)
- [Inline presentation and cancellation](../inline-ui.md)
