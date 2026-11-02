# ADR 0005: Declare a minimum Pi version separately from tested versions

## Status

Accepted — retrospective. Replaces the earlier exact `1.4.0` Pi peer pin.

## Context

An exact host pin limited installation to Pi 1.4.0. Publication preparation broadened the intended support to Pi 1.4+, with automated checks on 1.4.0 and local interactive testing on 1.5.0. Allowing a version through dependency resolution is not evidence that it has been tested.

## Decision

Declare `>=1.4.0` for the Pi coding-agent and TUI peers. Document the specific tested versions and methods separately. Retain the 1.4.0 development baseline rather than treating development dependency versions as the supported-host range.

## Consequences

- Users can install on later Pi versions without an exact-pin conflict.
- The open-ended range can admit unverified or incompatible future versions; it is not a guarantee of compatibility.
- Documentation must distinguish automated results from local interactive testing and avoid claiming verification of all Pi 1.4+ versions.
- This changes host-version policy, not the module-sharing decision in [ADR 0003](0003-host-dependencies.md).

## References

- [Earlier exact pin: b0d776a](https://github.com/FireTheDevil/pi-openui/commit/b0d776a)
- [Current package declarations](../../package.json)
- [Tested-version disclosure](../../README.md#project-status)
- [Validation history](../validation-history.md)
