# Development guidance

This guide is for agents developing this repository. The [OpenUI skill](skills/openui/SKILL.md) guides models using the extension.

- **Architecture:** Read the [ADR index](docs/adr/README.md) and relevant records before changing behavior or dependencies. Preserve accepted decisions. Flag conflicts before implementation; document approved architectural changes in a new or superseding ADR rather than silently rewriting history.
- **Versioning:** Follow the [versioning policy](docs/versioning.md) when preparing releases. Keep package and lockfile versions consistent. Identify intentional breaking changes and explain migration in release notes.
- **Verification:** Follow the [development instructions](README.md#development). Run `npm run typecheck` and `npm test` for code changes, plus relevant runtime or CLI checks for affected integrations. Report checks that could not run; do not claim unverified behavior.
- **Validation history:** Update [validation history](docs/validation-history.md) when recording release checks or new compatibility evidence. Record actual results, versions, scope and limitations. Distinguish automated checks, deterministic-provider CLI checks, local interactive testing and real-model evaluation. Preserve historical results; do not present them as verification of later changes.
- **Documentation:** Keep affected README sections, `docs/` guides and model-facing skill guidance consistent with implementation and ADRs. Link to authoritative policies instead of duplicating them. Preserve unrelated work and keep changes within the requested scope.
