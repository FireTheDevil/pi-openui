# Contribute to Pi OpenUI

Issues and pull requests are welcome. This is an experimental, best-effort personal project. There is no guarantee of a response, acceptance, or a timeline.

## Discuss the problem first

Search [existing issues](https://github.com/FireTheDevil/pi-openui/issues) and pull requests before opening a new one. Add a focused reproduction or new evidence to an existing report when it describes the same problem.

For substantive code changes, API changes, or features, open an issue before writing a PR. Explain the user problem and your proposed scope. Ask for approval before adding dependencies or introducing breaking API changes. An issue or proposal is not approval or an accepted architecture decision.

Small typo and documentation fixes can go directly to a PR. Keep unrelated fixes in separate changes.

## Report a bug

Use the bug report template. Include the following information:

- What you expected and what actually happened.
- Exact steps and the smallest complete OpenUI source that reproduces the problem. Include `show_ui` arguments and demo flags when relevant.
- OpenUI version or commit, Pi version, Node.js version, operating system, and terminal.
- Host TUI mode, interaction mode, presentation, and execution path. Distinguish direct tools, native `codemode`, and optional conversion Code or Notebook Mode. Include adapter version and backend if used.
- Sanitized diagnostics or screenshots, checks already tried, and anything you could not verify.

A malformed document, a model choosing the wrong components, and a renderer failing on valid source are different problems. Include the source and returned diagnostics so the report can distinguish them. See the [component reference](docs/components.md), [tool contract](docs/tool-api.md), and [model evaluation guide](docs/model-evaluation.md).

## Propose a feature

Use the feature request template. Describe the user task, the current limitation, and the smallest useful change. Give an example and explain why existing components or plain text do not meet the need. Identify API or compatibility implications. Do not assume that OpenUI's web component catalog is available in this terminal extension.

## Protect private information

Before posting an issue, PR, log, transcript, source document, or screenshot, remove secrets, API keys, tokens, usernames, home-directory paths, and private conversation or project data. Use synthetic values in reproductions. Check terminal titles and screenshot backgrounds as well as the visible panel.

For a vulnerability, use GitHub's private vulnerability reporting only if it is enabled for this repository. Do not post secrets or sensitive exploit details publicly. If private reporting is unavailable, do not put those details in a public issue or PR.

## Set up a source checkout

Use Node.js 22.19+ and Pi with the `@earendil-works` package namespace. Recorded development checks use Node 24. From your checkout, install dependencies without lifecycle scripts:

```sh
npm ci --ignore-scripts
```

Run the core checks before sending code changes:

```sh
npm run lint
npm run typecheck
npm test
```

Do not weaken lint rules, disable checks, or fix unrelated findings to make a change pass. Report failures and checks you cannot run. Use the existing suites and focused runtime or CLI checks to demonstrate the affected behavior.

The [development guide](docs/development.md) covers source loading, module ownership, and integration checks. UI changes need relevant actual Pi checks. Conversion-adapter checks require a separately installed adapter and isolated agent directory, as described in the [compatibility instructions](docs/inline-ui.md#repeat-the-adapter-checks). Do not claim compatibility from an unconfigured environment or infer model-generation quality from deterministic replay. Documentation-only changes need link and anchor checks and relevant existing checks, not a new native UI run.

## Prepare a focused pull request

Use the PR template and include the following information:

- Link the related issue, or explain why a direct PR is appropriate.
- Explain the user-visible result, the scope, and important limitations.
- Describe the implementation or documentation changes without unrelated cleanup.
- Report the checks you actually ran, their results, environment, and any gaps.
- For public behavior changes, update affected guides and [model-facing guidance](skills/openui/SKILL.md). Preserve cancellation, typed values, local-only state, and validation contracts unless an approved change replaces them.
- Read the [ADR index](docs/adr/README.md) and relevant records. Significant architectural changes need a proposed or superseding record, not a silent rewrite of accepted history.
- Follow the [versioning policy](docs/versioning.md) when preparing a release. Identify intentional breaking changes and migration steps in [release notes](docs/release-notes.md). Keep package and lockfile versions consistent when a version change is in scope.
- Record release checks or new compatibility evidence in [validation history](docs/validation-history.md), with versions, scope, and limitations.

For documentation changes, keep examples consistent with the supported catalog and check relative links and section anchors. Preserve historical verification claims with their original version and method.

## Contribution rights

Contributions are under the project's [MIT license](LICENSE). Submit only material that you have the right to contribute, and preserve required attribution for reused material.
