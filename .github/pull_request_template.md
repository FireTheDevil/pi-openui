## Why

Describe the user problem and intended result.

## Related issue and scope

Link the issue discussed before substantive work, or explain why a direct PR is appropriate. State what is included and excluded. New dependencies and breaking API changes need prior approval.

## Changes and migration

Summarize the change. Identify affected modes, public API changes, and migration steps, or state that none apply. Link updated docs, guidance, ADRs, or release notes when relevant.

## Verification

List commands and relevant runtime or CLI checks actually run, their results, and any failures or unavailable checks. Include OpenUI revision, Pi and Node.js versions, terminal, host TUI mode, interaction mode, presentation, and adapter/backend when relevant.

For UI changes, include the smallest useful OpenUI source or reproduction steps and sanitized screenshots when helpful. Documentation-only changes can report link and anchor checks instead of a new native UI run. Do not infer real-model quality from deterministic checks.

## Limitations

Describe remaining risks, unsupported paths, or checks not run.

## Before submitting

- Keep the change focused and follow [CONTRIBUTING.md](https://github.com/FireTheDevil/pi-openui/blob/master/CONTRIBUTING.md).
- Do not weaken rules or checks.
- Remove secrets, usernames, home paths, private transcripts, and identifying screenshot content from all examples, logs, and images.
- Submit only material you have the right to contribute under the project's MIT license.
