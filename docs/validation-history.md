# Validation history

Recorded release checks and their scope. These results do not guarantee behavior with every model or environment.

## Symmetric widget track spacing (2026-11-02 UTC)

Bordered local views with at least four view rows now reserve a cap-only row after the footer hints within the existing height budget. The body viewport decreases by one row. Close has one blank column before the boundary, outside its hit target. Shorter and edge-free views retain their prior output.

Actual Pi **1.5.0**, conversion **4.0.7**, Node **24.22.1**, and npm **12.2.1** checks used the unchanged Scrollbar playground notebook cell, fullscreen mode, automatic conversation scrollbars, 400 history rows, isolated settings, and SGR mouse input through tmux. Each dark and light run passed 47 assertions, including an explicit check that reload completed. In both 256-column captures, zero-based rows are top cap 38, heading 39, track 40 through 54, hints 55, and bottom cap 56. Each track end has one intervening row before its cap. The total widget height remains 19 rows, with 15 body rows instead of 16. The thumb remains proportional to the viewport and offset.

Close occupies zero-based columns 245 through 251, padding is column 252, and the widget boundary is column 253. The blank host separator remains column 254 and the parent rail remains column 255. The final Close bracket responds to clicks. Clicking the padding or cap-only row neither dismisses nor scrolls the widget. Track paging, thumb dragging, controls after scrolling, parent hover, separate parent scrolling, focus reveal, fitting content without a thumb, and the 20-column host's edge-free range cue passed. Captures and renderer bounds checks showed no clipping.

The actual-Pi renderer and wrapper probe passed 224 cases across selected widths and heights 1, 2, 3, 4, and 18. It checked nonnegative compact layouts, matching rail hits, the inert cap-only row, passive fitting boundaries, and unchanged short or edge-free output against the preserved starting renderer. Default collect inline, collect fullscreen, local fullscreen, and static output also matched the earlier renderer at the tested sizes.

`npm run typecheck`, all 236 existing `npm test` cases, and `git diff --check` passed. No unit tests were added. The baseline dark notebook run reproduced the unequal gaps before the edit. Drivers, incremental patch, JSON results with row indices, text and ANSI terminal captures, and cleanup evidence are under `/tmp/widget-spacing/`. Earlier artifacts under `/tmp/widget-edge/` remain unchanged. An enhanced renderer-probe attempt could not load copied baseline dependencies. Adding a local dependency symlink fixed the probe setup before the passing run. One inherited notebook-driver timing race attempted reload before the response finished. The final driver waits for completion and verifies a second fixture load.

These are deterministic terminal checks, not independent review, physical-mouse testing, or real-model evaluation. No new Pi 1.4 or regular-host session ran. The user session was not driven or reloaded. Existing terminal theme colors were reused without a new contrast measurement.

## Widget-owned right edge (2026-11-02 UTC)

The local wrapper now owns one width for its header, view, and pointer bounds. At host widths of at least 22 columns, it reserves a blank separator and Pi's conversation rail. Narrower hosts reserve only the parent rail. The view no longer subtracts another host column. Usable widths of at least 20 columns show aligned header and footer caps and a passive right boundary. Overflowing body rows use that same cell for the existing scrollbar. Collect, fullscreen, and static callers retain the default edge-free rendering.

Actual Pi **1.5.0**, conversion **4.0.7**, Node **24.22.1**, and npm **12.2.1** checks used the exact Scrollbar playground notebook cell, `/reload`, 400 history rows, automatic conversation scrollbars, isolated settings, and SGR mouse input through tmux. All 30 assertions passed in each theme. In the 256-column terminal, the widget edge occupies column 254, column 255 remains blank, and the parent rail occupies column 256. Header cap, heading, body rail, and footer cap align. The complete **Close** label remains visible during parent hover, and clicking its final bracket closes the widget. Clicking the separator leaves the widget unfocused. Retained thumb dragging into that separator still scrolls the widget without moving the parent. Parent-rail clicks still scroll the conversation. Focus and reveal preserve the same widget edge.

A Pi renderer and wrapper probe passed 144 cases. These include host widths 0 through 8 at selected boundaries, 19 through 23, 39 through 42, 80, and 256; view heights 1, 2, and 18; bounded output; complete-label Close visibility; inert reserved columns; and passive boundaries without scrollbar capture. Collect inline, collect fullscreen, local fullscreen, and static output matched the preserved pre-inset renderer at the tested sizes. The terminal gesture driver passed all 37 assertions in each theme, including grab position, paging, outside and header-crossing drags, final release, focus loss, resize, reactive shrink, narrow fallback, zero travel, Input, adjacent controls, and Close. Four dark/light and local/collect field sessions passed all 22 assertions, including Checkbox and Toggle clicks, Space, Input editing, and typed collect submission.

`npm run typecheck`, all 236 existing `npm test` cases, and `git diff --check` passed. No unit tests were added. Drivers, baselines, JSON results, actual terminal text and ANSI captures, cleanup evidence, and the incremental patch are under `/tmp/widget-edge/`. Earlier artifacts remain under `/tmp/scrollbar-inset/`. Driver corrections account for the heading's new boundary, ANSI styling in recorded rows, and the passive boundary after field text.

These are deterministic terminal checks, not physical-mouse testing or real-model evaluation. No new Pi 1.4 or regular-host session ran. The user session was not driven or reloaded. Terminal theme colors were reused, not redesigned. The earlier header-overlay limitation below is historical and is resolved by this change.

## Local scrollbar inset (2026-11-02 UTC)

The transcript-local view reserves Pi's final column and places its scrollbar one column inward. Drawing and pointer hits still use the same scrollbar geometry. Allocated width, viewport height, the 20-column rail threshold, the 40-column margin threshold, collecting views, and local fullscreen views retain their existing contracts.

Actual Pi **1.5.0**, conversion **4.0.7**, Node **24.22.1**, and npm **12.2.1** checks used the exact Scrollbar playground notebook cell, `/reload`, 400 history rows, automatic conversation scrollbars, isolated settings, and SGR mouse input through tmux. Both dark and light themes reproduced the pre-edit failure. Each widget emitted five thumb cells, but parent-rail hover erased all five and the parent intercepted the rail press.

After the inset, all 22 notebook integration assertions passed in each theme. Parent-column hover left all five widget thumb cells visible in column 255 of a 256-column terminal. Widget-rail presses reached the component and captured the pointer. Thumb dragging and track clicks scrolled the widget without moving the conversation. The parent column still scrolled the conversation without sending a press to the widget. The increment button, native checkbox, native input, and Close control remained usable.

A Pi 1.5 renderer probe passed 96 layout cases across widths **1, 2, 3, 19, 20, 39, 40, and 256** and heights **1, 2, and 18**. It checked content bounds, viewport height, rail positions and matching pointer capture, narrow fallbacks, and unchanged baseline output for collect inline, collect fullscreen, and local fullscreen views. At widths 1 and 2, no separate widget rail fits beside both content and the reserved parent column. The view retains at least one content cell. The copied gesture driver also passed all 37 recorded equality assertions in each theme, including drag grab positions, track paging, cancellation, focus changes, resizing, reactive shrink, zero travel, native input, adjacent controls, and Close.

`npm run typecheck`, all 236 existing `npm test` cases, and `git diff --check` passed. No unit tests were added. Baselines, drivers, JSON results, ANSI captures, cleanup evidence, and the incremental patch are under `/tmp/scrollbar-inset/`. The original investigation artifacts under `/tmp/scrollbar-notebook/` were preserved.

These are deterministic CLI checks, not physical-mouse testing or real-model evaluation. No new Pi 1.4 or regular-host session ran. The user session was not driven or reloaded. The manager's separate Close header is unchanged, so Pi's parent overlay can still replace its final bracket while active. Clicking inside Close passed. Initial verification attempts failed at a driver lookup that expected the overlaid closing bracket. Corrected runs identify the unchanged label prefix; failed artifacts remain under `driver-corrections/`.

## Scrollbar field-click regression fix (2026-11-02 UTC)

After separating ordinary control refresh from scrollbar gesture cancellation, `npm run typecheck` and all 236 existing `npm test` cases passed. No unit tests were added. `git diff --check` passed.

Actual Pi **1.5.0**, Node **24.22.1**, npm **12.2.1**, Linux fullscreen checks used isolated settings, deterministic extension fixtures, and SGR mouse input through tmux. No provider or model was called. Drivers, logs, JSON outcomes, and terminal captures are under `/tmp/scrollbar-fixed/`. The earlier artifacts under `/tmp/scrollbar-independent/` and `/tmp/scrollbar-control/` were preserved.

Before the fix, a copied dark-theme local driver reproduced Checkbox and Toggle clicks leaving their values false while keyboard Space changed them to true. After the fix, all four dark/light and local/collect field cases passed 22 assertions in total. Checkbox and Toggle clicks changed false to true; Space changed them back to false. Native Input editing worked. Both collect cases submitted the expected typed values, including those false booleans and the edited text.

The copied scrollbar driver passed all 37 equality assertions in each theme. These cover thumb grab positions, stationary rounding, track paging and drag cancellation, gutter spacing, header crossing, final-release positioning, active focus-loss and resize cancellation, keyboard-triggered reactive shrink, narrow fallback, zero travel, composer restoration, native Input editing, adjacent button clicks, and button-to-rail drag suppression. Additional fixtures passed eight assertions in each of the four theme/mode cases for MultiSelect option clicks, Slider maximum selection, DatePicker day and month clicks, Tree branch expansion and leaf selection, and Tabs navigation.

These are deterministic CLI checks, not independent review, physical-mouse testing, or real-model evaluation. No new Pi 1.4, regular-host, conversion-notebook, terminal-focus-out, outside-terminal capture, or transcript-relocation checks ran. Reactive shrink followed keyboard input and does not isolate asynchronous refresh cancellation. The first additional fixture used a Tabs root, which the document contract rejected; wrapping it in Stack corrected the fixture before the reported passing runs.

## Controllable local scrollbar (2026-11-02 UTC)

The working branch `fix/local-widget-scroll-cues` passed `npm run typecheck` and all 236 existing `npm test` cases after adding scrollbar control. No unit tests were added. `git diff --check` passed.

Actual Pi **1.5.0**, Node **24.22.1**, npm **12.2.1**, Linux fullscreen checks used a deterministic extension fixture and real SGR mouse input through tmux. No provider or model was called. The rerunnable driver and captures are local artifacts under `/tmp/scrollbar-control/`, with reproduction instructions in its `README.md`.

The driver checked top, middle, and bottom grab rows of a multirow thumb, unchanged press/release offsets, and stationary release at a rounded offset. It checked single-page track clicks above and below, track-drag cancellation, inert gutter spacing, horizontal departure, vertical clamping, header crossing without Close activation, and a final release position without a preceding motion event. It also checked focus-loss and resize cancellation, reactive shrink, short-page navigation, the 18-column informational fallback, composer restoration, and a fresh Close click after a completed rail gesture. A separate one-row native view in the same Pi fixture checked zero thumb travel and continued wheel scrolling; the normal local manager does not expose that height.

These are deterministic CLI checks, not independent review or real-model evaluation. No new Pi 1.4, regular-host, light-theme, or conversion-notebook checks ran. Terminal focus-out cancellation and transcript relocation without a view-local frame change are unobservable through the component API. Capture outside the terminal is not guaranteed. Earlier passive-scrollbar results below describe their own revisions.

## Uncapped interactive content width

After removing the shared interactive renderer's 96-column cap, `npm run typecheck` and all 236 existing `npm test` cases passed. No unit tests were added. An ad hoc renderer smoke check at terminal widths 18, 80, 160 and 240 produced maximum rendered widths of 18, 80, 160 and 238 respectively. Overflow cues remained present at 80 and 160 columns; the same content fit without overflow at 240 columns. This checks native renderer output, not a reloaded interactive Pi session. Earlier interactive evidence below predates this width change.

## Issue #5 — local viewport cues (2026-11-02 UTC)

The working branch `fix/local-widget-scroll-cues`, based on `bbbb6ba`, passed `npm run typecheck` and all 236 existing `npm test` cases. No unit tests were added. `git diff --check` passed. The UI detector reported no findings for `src/view.ts`.

Actual Pi **1.5.0**, Node **24.22.1**, npm **12.2.1**, Linux fullscreen-host checks used an isolated temporary agent directory and a deterministic command fixture wrapping the checkout's actual extension registration and `show_ui.execute`. No provider or model was available or called. This was PTY-driven interactive inspection of the real Pi CLI, not a simulated terminal boundary or a real-model evaluation.

Both **dark** (100×44 initially) and **light** (68×36 initially) sessions exercised a local Tabs document with 28 detail rows, an input and a button initially below the viewport:

- The initial viewport already showed overflow. PgDn exposed distinct middle and bottom thumb positions and reached the widget after enabling Pi 1.5's public `capturesViewportInput` component flag. Without it, the host consumed those keys for transcript scrolling.
- Tab followed focus to the initially hidden input; typing edited it. Real SGR mouse press/release events activated the below-viewport button after scrolling, changing its visible counter from 0 to 1 in both themes.
- Resizing both sessions to **39×28** reserved a gutter without overwriting controls. Mouse wheel events in the gutter scrolled the widget; clicking the relocated button changed the counter to 2.
- At **18×28**, the heading showed direction and visible line range/total rather than a gutter. PgDn reached the bottom range; Tab wrapped focus to the top range. Focus and chat hints remained visible.
- Switching Tabs to the short page removed the cues. Returning to the long page and collapsing its detail through a local Set action removed the scrollbar and scroll hint without losing input/button content. A separate Steps fixture likewise lost its overflow cue on switching to its short step.
- F6 returned to the normal composer; ordinary text could be typed there without submitting the widget.

ANSI terminal captures were inspected and replayed side by side through the **browser-use CLI** for dark/light, middle/bottom, 39-column and 18-column states. The replay retained captured foreground/background styling, with explicit dark/light canvas backgrounds; it is not a screenshot of a physical terminal. The scrollbar uses the host's accent/muted colors and different thumb/track glyph weights. Captures and the temporary fixture remain local verification artifacts, not packaged sources.

Scope limits: these changes were not rerun interactively on Pi 1.4, regular host mode, external providers, or the conversion notebook matrix. The earlier results below remain historical evidence for their own revisions. Extremely narrow surfaces necessarily shorten hints; the scrollbar is a passive position indicator, not a draggable control.

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
