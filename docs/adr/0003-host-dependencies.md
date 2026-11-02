# ADR 0003: Share host-provided runtime dependencies

## Status

Accepted — retrospective.

## Context

Pi warned that a separately installed TypeBox copy could bypass its extension loader and create duplicate runtime modules. Treating host-owned libraries as ordinary production dependencies risked using different module instances inside one extension host.

## Decision

Declare Pi and TypeBox as peer dependencies and use the host-provided modules at runtime. Retain development dependencies for local checks. Keep lang-core and Zod as production dependencies owned by this package.

## Consequences

- The extension relies on Pi's module-sharing behavior instead of owning a separate host runtime.
- Development dependencies support local checks but do not define which Pi runtime users must install.
- TypeBox uses a `*` peer range. Pi version compatibility is a separate policy recorded in [ADR 0005](0005-pi-compatibility.md).

## References

- [Host-provided TypeBox change: b0d776a](https://github.com/FireTheDevil/pi-openui/commit/b0d776a)
- [Package dependency declarations](../../package.json)
