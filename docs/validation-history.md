# Validation history

Recorded release checks and their scope. These results do not guarantee behavior with every model or environment.

## Public constraint guidance (2026-11-03)

The constraint-guidance change on `integration/local-widgets-pr9-pr10-pr12`, based on `b94aa2d`, passed `npm run typecheck` and all 236 existing core tests on Node 24.22.1 with the Pi 1.4.0 development baseline and lang-core 1.0.2. No unit tests were added. `git diff --check` passed.

An external ad hoc script compared all 25 native Zod component JSON schemas with the baseline and found exact equality. The library's exported schema differs only in component description annotations. The generated prompt exposes the audited name pattern and 64-character maximum, 4,000-character string limit, collection bounds, integer Row and TextArea settings, Table and List sizes, positive Progress maximum, and ordered date bounds. The existing action section, Button signature, action rules, and required action property are unchanged.

The same script passed 68 valid/invalid `DocumentModel` cases. These cover name syntax and length, legacy identifier length, string length, empty and oversized options/pages/root nodes, fractional and out-of-range Row/TextArea settings, table/list sizes, Progress positivity/default, valid and reversed date bounds, and Tree total-node/depth limits. Reproduce with `node --import tsx /tmp/openui-guidance-fix/check.mts` while the local artifacts remain available.

An actual Pi 1.5.0 fullscreen TUI session loaded the checkout extension through an external deterministic-provider fixture, with only `show_ui` active and native code mode disabled. Both provider calls contained the complete exported `modelPrompt` verbatim. A literal display document returned `status: "displayed"`, and the provider continued. The run used an isolated agent directory and made no external provider calls or user-settings changes. The owned tmux session exited after the capture.

Local evidence is retained in `/tmp/openui-guidance-fix/`. It includes before/after schemas and prompts, `check.mts`, `check-results.json`, `typecheck.log`, `test.log`, `fixture.mjs`, `injected-prompt-1.txt`, `injected-prompt-2.txt`, `tui-events.jsonl`, and `tui-capture.txt`. These artifacts are not shipped. This run checks constraint exposure and integration, not real-model generation quality, package discovery, or the optional compatibility matrix.

The upstream-generated action guidance still advertises unsupported `@OpenUrl` and actionless buttons. [Issue #15](https://github.com/FireTheDevil/pi-openui/issues/15) tracks that deferred contradiction. This change does not claim a fully consistent generated prompt.

## README showcase — six interactive responses (2026-11-03)

Six model-authored OpenUI documents passed parsing, rendering and keyboard checks against the combined development preview of PRs #9, #10 and #12. Five local documents passed local-action validation; state changes produced the expected code explanations, filtered failure results, comparison recommendation, heating estimate and request-path details without submitting. The planner returned its exact typed date, name, activities and backup preference.

Six isolated actual Pi 1.4.0 fullscreen CLI sessions on Linux and Node 24.19.0 passed the corresponding keyboard/mouse interactions in the dark theme. Each scene made one `show_ui` call. Local interaction made no further tool/provider calls. Hide/Restore retained the heating example’s edited $54 estimate. The planner stayed pending while editing and its follow-up used the actual submitted values. All source files were stable during capture; normal user configuration was unchanged.

The 82.75-second H.264 video and 15-second GIF montage passed decode and visual checks. An npm pack dry-run retained the 59 intended package files and excluded all media.

The recording uses explicitly labelled deterministic provider replay, without external LLM calls. Its illustrative data and fixed examples verify runtime interaction, not live-model generation quality. Production code was unchanged; the unit suite, code/notebook compatibility matrix and clean installation were not repeated for this media revision. See the [recording notes and example sources](https://github.com/FireTheDevil/pi-openui/tree/6041f69177f5f8c68dbb43616d8dc27c05fa09e9/media).

## Issue #11 — hide and restore local widgets (2026-11-03)

The `feat/local-widget-hide` branch passed type checking and all 236 existing core tests on Linux with Node 24.19.0 and the Pi 1.4.0 development baseline. An ad hoc component check covered 44 visible/hidden width cases from 1–120 columns, one-line placeholders, command completion and restore order, visible-only focus cycling/status, permanent Close, replay defaults and reacquisition of a replacement composer while all widgets were hidden. No new unit tests were added.

Actual fullscreen CLI checks passed on Pi 1.4.0 in dark and light themes and Pi 1.5.0 in the dark theme. Mouse and command Hide/Restore preserved edited values, text drafts/cursors, tabs/steps, expanded height and internal scroll position. Checks covered older widgets, independent placeholders, restore without an ID, hidden-widget focus hints, normal chat with every widget hidden, narrow 36-column layouts, cancelled mouse drags, permanent dismissal of hidden widgets, replay to visible/compact defaults and a subsequent static UI call. Hide/Restore emitted no additional tool/provider calls or edited values.

Live testing found that restoring an older expanded widget could focus it while Pi's stale transcript extent kept it offscreen. Restore now refreshes the host's public layout before revealing the widget; command and mouse restoration both passed afterward. The replacement-editor case also passed after all status rows had been removed.

These checks used fresh model-authored OpenUI documents dispatched through a deterministic provider and actual PTY keyboard/mouse input. No external LLM calls were made. They verify runtime behavior rather than external-model UI-generation quality. The native-code/conversion notebook CLI matrix and clean tarball installation were not repeated; earlier results retain their original scope. Hide retains live state only: session reload/replay still restores original values, visible and compact, as described in the [hide and restore guide](local-interaction.md#hide-and-restore).

## Issue #6 — inline local-widget expansion (2026-11-03)

The `feat/local-widget-expansion` branch passed type checking and all 236 existing core tests on Linux with Node 24.19.0 and the Pi 1.4.0 development baseline. An ad hoc component check covered 70 viewport-size combinations from 1–100 columns and 5–80 terminal rows, header mouse targets, drag cancellation, overflow feedback, paging and collapse after scrolling. No new unit tests were added.

Actual fullscreen CLI checks passed on Pi 1.4.0 in dark and light themes and Pi 1.5.0 in the dark theme. They verified F2 and mouse expand/collapse, height changes on terminal resize, wrapped content, overflow at the top/middle/bottom, dedicated Ctrl+Page Up/Down and mouse-wheel scrolling, and preservation of numeric edits, text drafts, active tabs/steps and useful focus/scroll position. A 20-column layout retained working compact mouse controls. A short widget showed no misleading overflow cue. Multiple widgets kept independent expansion state; chat remained available and the same widget stayed editable after a normal chat turn. Local interactions emitted no additional tool/provider calls or edited values. Session replay restored original defaults in compact mode.

Pi's fullscreen host consumes plain Page Up/Down before extension listeners. These checks caught that behavior; the implementation uses Ctrl+Page Up/Down for explicit widget paging without modifying host bindings or private APIs. The [height and overflow guide](local-interaction.md#height-and-overflow) documents the bounded policies and replay behavior.

These runs used fresh model-authored OpenUI documents dispatched through a deterministic provider and actual PTY keyboard/mouse input. They establish runtime integration, not external-model UI-generation quality. No external LLM calls were made. The native-code/conversion notebook CLI matrix and clean tarball installation were not repeated for this change; earlier release results retain their original scope.

## v0.7.0 — clean tarball installation (2026-11-02 UTC)

The merged release revision [`edd022e9d086dbc55b415cacea7a5af3398f2a27`](https://github.com/FireTheDevil/pi-openui/commit/edd022e9d086dbc55b415cacea7a5af3398f2a27) passed the clean-install checks in [issue #4](https://github.com/FireTheDevil/pi-openui/issues/4). No package fixes were needed. This records the tested revision, before this documentation entry was added.

Actual `npm pack` produced `firethedevil-pi-openui-0.7.0.tgz` for `@firethedevil/pi-openui@0.7.0` (3,296,326 bytes). SHA-256:

```text
9dcd396bc195df3b3b6967e4d8cd0caaec1eb69be10f6616dda1420a3c4c823b
```

Archive inspection verified all 59 packaged files and all 91 relative documentation/image links. Extension sources, the bundled OpenUI skill, README, LICENSE and referenced documentation were present. Tests, artifacts, credential/config files, symlinks and `node_modules` were absent.

Both Pi 1.4.0 and Pi 1.5.0 passed independently on Linux with Node 24.19.0 and npm 11.9.0. Each host was installed from npm into a fresh temporary prefix; Pi's package installer then installed the same tarball into a separate temporary agent directory. Neither run loaded the source checkout or reused development `node_modules`. All 59 installed package files matched the archive. Pi's host supplied its peer dependencies; the extension's managed npm tree contained only the extension, lang-core 1.0.2, Zod 4.6.7 and ci-info 4.4.0, with no separate Pi or TypeBox copies.

The actual fullscreen Pi CLI, dark theme and direct `show_ui` tool path passed these checks on both versions:

| Check | Observed result |
| --- | --- |
| Automatic discovery | Installed extension loaded, `show_ui` registered, and installed OpenUI skill appeared in the model system prompt. No missing-module, peer-dependency or extension-load errors. |
| Static display | Rendered inline and returned `status: "displayed"` before any input. |
| Local widget | Returned `status: "mounted"` immediately and completed the model turn. F6 focused the widget; edits at 4, 10 and 11 workers recalculated prices and the cheapest plan. Escape restored chat; the same widget remained editable after a normal chat turn. Reset and close worked. Local edits, focus changes, reset and close triggered no model/tool calls. |
| Answer collection | Remained pending before input. Submission returned typed values `{scope: "deep", workers: 3, approved: true, note: "packaged"}`. Escape returned `status: "cancelled"` normally; a subsequent static call succeeded. |
| Exit and cleanup | Both CLIs exited successfully. Temporary hosts, package installations, settings, sessions and caches were removed; normal user configuration was unchanged. |

### Repeat the package installation

With Node 24 and npm 11, use a fresh checkout of the exact revision to pack without installing its development dependencies:

```sh
release_root=$(mktemp -d)
git clone https://github.com/FireTheDevil/pi-openui.git "$release_root/source"
git -C "$release_root/source" checkout --detach edd022e9d086dbc55b415cacea7a5af3398f2a27
mkdir -p "$release_root/tarballs"
touch "$release_root/empty.npmrc"
(
  cd "$release_root/source"
  npm pack --json --pack-destination "$release_root/tarballs" \
    --cache "$release_root/npm-cache" --userconfig "$release_root/empty.npmrc"
)
tarball_path="$release_root/tarballs/firethedevil-pi-openui-0.7.0.tgz"
sha256sum "$tarball_path"
tar -tzf "$tarball_path"
```

Run the following separately with `pi_version=1.4.0` and `pi_version=1.5.0`. Keep the temporary directory until runtime checks finish, then remove it.

```sh
pi_version=1.4.0
smoke_root=$(mktemp -d)
mkdir -p "$smoke_root/project"
touch "$smoke_root/empty.npmrc"
export PI_CODING_AGENT_DIR="$smoke_root/agent"
export npm_config_cache="$smoke_root/npm-cache"
export npm_config_userconfig="$smoke_root/empty.npmrc"
npm install --prefix "$smoke_root/host" --no-audit --no-fund \
  "@earendil-works/pi-coding-agent@$pi_version"
pi_cli="$smoke_root/host/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js"
node "$pi_cli" --version
node "$pi_cli" install "npm:@firethedevil/pi-openui@file:$tarball_path"
```

Use the named `npm:@firethedevil/pi-openui@file:...` spec: it lets Pi identify the installed scoped package correctly. Start Pi from the temporary project without `-e`, `--skill`, `--no-extensions` or `--no-skills`, so package discovery is exercised.

The recorded runtime checks used an isolated deterministic provider and PTY keyboard driver. The driver set `codemode.mode` to `"off"` in the isolated agent's `settings.json`, preserving its installed package declaration, to exercise direct tool calls. The provider supplied literal OpenUI programs and observed actual tool results; it did not import checkout code. Its CLI invocation was:

```sh
cd "$smoke_root/project"
node "$pi_cli" --offline --session-dir "$smoke_root/sessions" \
  --no-prompt-templates --no-context-files --no-mcp --tools show_ui,read \
  --provider openui-local-fixture --model fixture --tui-mode fullscreen --use-theme dark
```

`openui-local-fixture` is test tooling, not a shipped provider. That invocation requires the fixture in the isolated agent's extensions directory; otherwise use a configured provider or the shipped demo commands for manual inspection. Local session artifacts retain the fixture, driver, install logs, structured outcomes and terminal captures; these are not shipped in the repository or package. After testing, remove the dedicated `smoke_root` and `release_root` directories and unset the three exported variables.

This check did not call an external LLM, rerun the unit suite, or repeat the native code/conversion notebook matrix. Those earlier results remain separately scoped below. The package was not published. Any new release artifact has its own checksum; rerun the clean-install check when the intended release revision changes.

## v0.7.0 — local widgets

For v0.7.0, all 236 core tests and type checking passed. Local-widget tests cover immediate mounting, reactive calculations, keyboard/mouse focus, independent state, disposal and replay. All 32 optional runtime compatibility tests passed across conversion Code/Deno/JavaScript/TypeScript. Seven actual CLI configurations passed the local-widget scenario, including regular/fullscreen hosts, a light-theme session-resume check and Shift+F6 cycling. See the [local-widget validation matrix and actual notebook captures](local-interaction.md#verification). These checks use a deterministic provider, not external model generation.

## v0.6.1 — inline displays and answer collection

The v0.6.1 baseline passed all 199 core tests and type checking. Six actual Pi 1.4.0 CLI configurations on Node 24 also passed: direct tools in regular/fullscreen host modes, native code `on`/`only`, and conversion 4.0.7 Code/Deno Notebook Mode. Escape from inline forms and Ctrl+C from fullscreen forms returned normal cancellation results, allowed caller/model continuation and left later UI calls usable without a restart. Rendering checks covered inline context, resizing, F2 expansion/collapse, submission, static displays and malformed input. The [inline presentation guide](inline-ui.md#verified-cli-paths) gives the exact matrix and [cancellation screenshot](inline-ui.md#actual-pi-captures).

A separate session-reopen check verified persistent inline content. The current cancellation contract returns a normal result to the caller; it does not terminate the enclosing code or notebook execution.

The v0.6.1 baseline of 28 optional compatibility tests passed against the actual conversion Code, Deno, JavaScript and TypeScript runtimes with a simulated terminal/session boundary. Cancellation checks verified ordinary returned results and exactly-once caller continuation, including after a yield budget expires and during `wait` on a previously yielded cell. Deno, JavaScript and TypeScript notebook variables and closures remained usable in later cells without a restart. Run `npm run test:compat` with the external package and isolated agent-directory variables described in the [adapter test instructions](inline-ui.md#repeat-the-adapter-checks).

## Earlier catalog and receipt releases

Earlier catalog and receipt releases were also tested with all 25 components, keyboard/mouse editing, local actions, reset, streaming, typed results and cancellation in dark and light themes. All CLI runs used a local deterministic provider; external model providers have not been tested. The [catalog gallery](catalog-demo.md) captures actual PTY output; recording and screenshot tooling are excluded from the repository and package.

## Issue #7 — single local-widget header (2026-11-03)

The `fix/local-widget-title` branch passed type checking and all 236 existing core tests on Linux with Node 24.19.0 and the Pi 1.4.0 development baseline. An additional ad hoc check verified single useful headers for missing, empty, whitespace-only and terminal-control-only titles, and trimming of a supplied title. No new unit tests were added.

Actual fullscreen CLI runs passed on Pi 1.4.0 in both dark and light themes and Pi 1.5.0 in the dark theme, all with Node 24.19.0. Fresh model-authored compact and scrolling documents exercised the normal `show_ui` path through a deterministic test provider, rather than using only shipped demos. Checks covered one wrapper title, a single fallback header, preservation of an intentional matching authored heading, first-control and Close mouse targets, keyboard edits and Reset, wrapping at 42 columns, focus/editing at 18 columns, and explicit-ID focus between widgets with identical titles. Tab focus-follow and mouse-wheel scrolling reached controls below the viewport and returned to the top after resizing. Static displays kept their titles; collecting forms kept their titles and returned typed submitted values. Chat remained usable alongside the widgets.

This verifies widget chrome and interaction, not the quality of an external model's component choices. The documents were newly authored by the coding model and dispatched through a deterministic provider; no external LLM provider calls were made. Tool-call and receipt titles retain their existing presentation. Ordinary Page Up/Down keys are intercepted by the fullscreen Pi host on this baseline; these runs verified scrolling through focus-follow and mouse wheel, while [issue #6](https://github.com/FireTheDevil/pi-openui/issues/6) addresses keyboard paging separately. The native-code/conversion notebook CLI matrix and clean tarball installation were not repeated for this change. Earlier release checks retain their original scope.
