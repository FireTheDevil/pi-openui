# ADR 0007: Keep conversion integration optional

## Status

Accepted — retrospective.

## Context

Answer-collecting UI can outlive a code/notebook execution yield. The conversion bridge needs to keep the pending result attached to that execution, but direct Pi tools and native code mode must work without installing the conversion package.

## Decision

Register one normal Pi tool and integrate with pi-codex-conversion through its public extension-tool event protocol. Use a small structural adapter instead of making the conversion package a production dependency. Route nested calls through Pi's execution pipeline and preserve structured outcomes.

## Consequences

- Direct tools and native code mode do not require the optional conversion package.
- The adapter must track the public protocol and be verified against supported conversion runtimes.
- Blocking-call metadata preserves pending answer collection across yields; local widgets still return immediately after mounting.
- Ordinary form cancellation remains a result, not an execution exception, as specified in [ADR 0002](0002-cancellation-results.md).

## References

- [Adapter implementation and rationale](../../src/conversion.ts)
- [Execution-mode compatibility](../inline-ui.md#execution-modes)
- [Initial integration: 7db022e](https://github.com/FireTheDevil/pi-openui/commit/7db022e)
- [Cancellation correction: 8252888](https://github.com/FireTheDevil/pi-openui/commit/8252888)
