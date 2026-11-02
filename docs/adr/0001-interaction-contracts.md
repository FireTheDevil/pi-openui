# ADR 0001: Separate presentation from interaction

## Status

Accepted — retrospective.

## Context

An inline calculator still blocked the conversation when it occupied Pi's editor and waited for submission or cancellation. Local exploration needed to keep chat available without sending exploratory changes to the model; this requirement extended beyond forms.

## Decision

Distinguish static display, local exploration and answer collection. Treat inline versus fullscreen as a separate presentation choice. Require explicit `interaction: "local"` for nonblocking exploration rather than inferring it from the absence of a Submit button.

## Consequences

- Static inline content returns `displayed`; local widgets return `mounted` immediately; collecting forms wait for `submitted` or `cancelled`.
- Local widgets keep the composer available and send no edited values on changes, blur or dismissal. Submission actions are rejected, including hidden paths.
- A separate collecting form is needed when the model needs an answer. Local widgets currently have no fullscreen expansion or streaming preview.
- Widget edits are not durable answers: session replay restores original defaults rather than edited state. This limits persistence but avoids treating exploration as a saved choice.

## References

- [Issue #2: nonblocking local interaction](https://github.com/FireTheDevil/pi-openui/issues/2)
- [Implementation: 69fa4a5](https://github.com/FireTheDevil/pi-openui/commit/69fa4a5)
- [Local interaction contract](../local-interaction.md)
