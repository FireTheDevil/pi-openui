# Develop Pi OpenUI

## Run from source

Requires Node.js 22.19+ and Pi with the `@earendil-works` package namespace. Recorded development checks use Node 24.

```sh
npm ci --ignore-scripts
pi --tui-mode fullscreen -e ./src/index.ts --skill ./skills/openui/SKILL.md
```

In Pi, run `/openui-demo --local` or `/openui-demo --catalog`. The [README](../README.md#get-started) lists the demo flags and interaction modes.

To persist installation, run `pi install /absolute/path/to/pi-openui`. The manifest registers the extension and bundled skill. Pi supplies its own TUI at runtime; development dependencies support local checks.

## Run core checks

```sh
npm run lint
npm run typecheck
npm test
```

Lint uses Oxlint and the vendored anti-slop rules in `tools/oxlint/anti-slop`.
Keep `oxlint` and `@oxlint/plugins` pinned to the same version. See the
[plugin provenance](../tools/oxlint/anti-slop/UPSTREAM.md) before updating the rules.
The 0.8.0 source cleanup passes every configured lint rule without exceptions.

Lint also runs `npm run check:prompt`, a read-only freshness check for the committed
`src/generated/prompt.ts`. After editing catalog schemas, prompt guidance or relevant
dependencies, run `npm run generate:prompt` and commit the regenerated artifact with
the source changes. Do not edit the artifact by hand. The generator uses
`src/catalog-source.ts` directly and works even when the artifact is missing.
Production imports use the precomputed strings without calling `library.prompt`;
this does not defer catalog construction or compile the package. See
[ADR 0010](adr/0010-precomputed-model-prompt.md).

## Module ownership

| File | Responsibility |
| --- | --- |
| `src/catalog.ts` | Public catalog exports and precomputed prompt exports |
| `src/catalog-source.ts` | Authoritative Zod component specifications, library and prompt builder |
| `src/generated/prompt.ts` | Committed model prompt; regenerate with `npm run generate:prompt` |
| `src/model.ts` | Parsing, evaluation, typed state, validation, and action dispatch |
| `src/view.ts` | Layout composition, focus, and pointer routing |
| `src/controls.ts`, `src/displays.ts`, `src/presentation.ts` | Widgets, content, and theme handling |
| `src/editable-table.ts` | Cell text, validation, and native grid editing |
| `src/inline-document.ts` | Persistent display-only documents |
| `src/local-widgets.ts`, `src/local-policy.ts`, `src/local-demo.ts` | Local widget lifecycle, local-only action policy, and demos |
| `src/summary.ts`, `src/code-summary.ts` | Receipts and native code-mode transcript presentation |
| `src/conversion.ts` | Optional blocking-call metadata through the conversion package's public protocol |
| `src/index.ts` | Pi registration and view lifecycle |

Automated tests exercise real lang-core and Pi widgets, hidden-page validation, actions, malformed and streaming input, resizing, receipt data preservation, session branches, skill discovery, Pi's actual extension loader, its fullscreen mouse decoder, and native codemode's QuickJS worker. They use simulated host and terminal boundaries.

Validation includes core tests, runtime compatibility checks and actual Pi CLI sessions using a deterministic provider, not external model generation. See the [validation history](validation-history.md) for release results, coverage limits and links to reproduction instructions.

## Check affected integrations

For UI changes, exercise the affected behavior in actual Pi. Check keyboard input, narrow resizing, validation, cancellation, and submission or local-only behavior as relevant. Use the [component reference](components.md#keyboard-and-mouse), [local-widget guide](local-interaction.md), and [inline execution-mode guide](inline-ui.md#execution-modes) to choose the relevant paths. Native `codemode` checks need Pi, not the conversion package. Core tests include the native QuickJS worker with simulated host and terminal boundaries; they do not replace an actual CLI session.

For conversion-adapter changes, run the [optional runtime compatibility suite](inline-ui.md#repeat-the-adapter-checks). It requires a separately installed `@howaboua/pi-codex-conversion` package and an isolated Pi agent directory. `OPENUI_PCC_PACKAGE` points to that package; `PI_CODING_AGENT_DIR` points to the isolated directory. `OPENUI_PCC_MODES` optionally selects `code,notebook,js,ts`; all four run by default. These checks are separate from `npm test` and use the real runtimes around simulated host/session boundaries. Report unavailable environments rather than implying those checks passed.

Deterministic-provider CLI checks demonstrate integration, not real-model UI choices or document quality. Follow [model evaluation](model-evaluation.md) for that separate work. Do not use your normal settings or private sessions as test fixtures.

For release checks or new compatibility evidence, update [validation history](validation-history.md) with actual versions, methods, results, and limitations. Preserve historical records. Do not present an earlier check as verification of a later revision.

See [CONTRIBUTING.md](../CONTRIBUTING.md) before proposing substantive changes.
