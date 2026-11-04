# Anti-slop provenance

Installed from the local `install-anti-slop` skill's `assets/anti-slop/` bundle
at `/home/alex/.pi/agent/skills/install-anti-slop`.
The source repository and exact anti-slop source commit are unknown: the supplied
skill has no Git metadata or top-level provenance record. Do not attribute the
bundle to the nested Stylistic revision.

`SOURCE-SHA256SUMS` identifies every copied asset with its SHA-256 digest.
All bundled files were copied unchanged to `tools/oxlint/anti-slop/`, including
the optional `effect/` plugin and nested license/provenance. The only local
additions are this record and the digest manifest.

The generic entry point is `index.ts`; `.oxlintrc.json` enables all 18 generic
rules and native `oxc/no-accumulating-spread` as errors. Effect rules are not
enabled because this project has no direct Effect dependency. Agent tooling
and the vendored plugin are excluded from lint. No source cleanup or rule
exceptions were introduced.

Oxlint and `@oxlint/plugins` are both pinned to `1.91.0` as development
dependencies. Nested Stylistic provenance and license remain in
`vendor/eslint-stylistic/UPSTREAM.md` and `vendor/eslint-stylistic/LICENSE`.
