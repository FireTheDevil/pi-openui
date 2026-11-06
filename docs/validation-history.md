# Validation history

Recorded release checks and their scope. These results do not guarantee behavior with every model or environment.

## Native horizontal BarChart (2026-11-06)

On Linux with Node 24.22.1, Pi and TUI development dependencies 1.4.0, and lang-core 1.0.2, `npm run lint`, `npm run typecheck`, and all 241 existing tests passed without skips. The existing catalog fixture and count assertion now include the 29th component. No unit tests were added.

A temporary native runtime probe passed 648 direct chart frames across widths 0 through 80. It also exercised static transcript rendering, local reactive rendering and nested Card/Row layouts at every width in that range. Cases covered empty and all-zero data, duplicate and empty labels, Unicode, terminal-control sanitization, complete long-label fallback, tiny positives, finite extremes, invalid data diagnostics, the 200-entry limit, rejected invalid transactions and original replay defaults. Ratios are calculated before multiplication; small positive values retain exact numeric text even when their bars round to zero cells.

An actual Pi 1.5.0 fullscreen-terminal CLI run used a fresh isolated agent directory, an empty installed-package list and a deterministic provider. Static `show_ui` returned `displayed`. Local `show_ui` returned `mounted` without values. Slider input changed the proposed value from 60 to 75 without another tool result. Tab moved directly to Reset, which restored 60. Reload restored the original slider default of 4. Resizing exercised 42, 18 and 100 columns. Negative and overflow-to-infinity inputs returned diagnostics. Both `/openui-demo --catalog` and `--catalog --stream` rendered the chart on the Display page; Advance progress changed its complete/remaining values from 2/3 to 3/2. The owned tmux session was stopped.

Rerunnable local tooling and evidence are retained in `/tmp/pi-openui-bar-chart/`, outside the repository and package. The final CLI capture directory is `cli-1793907470929662913`. The runtime probe is `probe.mts`; the actual-CLI driver and provider are `cli.py` and `fixture.mjs`. Earlier driver attempts had viewport and streaming-readiness assumptions corrected before the final passing run.

This is deterministic runtime and CLI evidence, not external-model evaluation. The CLI check loaded the working checkout explicitly; it did not test tarball installation, optional conversion adapters, light-theme CLI rendering, physical-terminal glyph support or performance. At widths smaller than a wide grapheme, Pi's existing wrapping and clipping cannot display that grapheme in full. Width bounds still passed. Earlier release records retain their original scope.

## 0.8.0 strict lint cleanup (2026-11-05)

On Linux with Node 24.22.1, npm 12.2.1, Pi and TUI development dependencies 1.4.0, and lang-core 1.0.2, independent review approved the completed cleanup with no blocking findings. `npm run lint` reported zero errors and warnings, `npm run typecheck` passed, and all 241 existing tests passed without skips. Every configured lint rule remained enabled. Existing test names and assertion counts were preserved; no unit tests were added.

Independent native probes exercised keyboard and mouse input, immediate typed table edits, hidden invalid editors, collection blocking, Set and Reset, rollback, scrolling, narrow layouts, local interaction, streaming, and Callout dismissal. All 314 fresh ANSI and text captures matched the implementation captures, which matched the pre-cleanup baseline. All 28 component schemas remained unchanged. A 1,710-case component and streaming comparison found only eight intentional earlier diagnostics for incomplete raw-object headers. All 102 action transaction comparisons matched. The complete AST checks covered all 17 installed variants, 64 valid cases, 95 malformed rejections, and atomic failure. Existing persistence and branch-aware replay tests passed.

Implementation and independent-review reports are retained locally and are not included in the repository. The [release notes](release-notes.md#080) identify intentional malformed-input rejection and TypeScript migration requirements. The version update changes package metadata only; the final review nit removes one explanatory comment without changing runtime code.

After the version update, lint, typecheck, and all 241 tests passed again. The final Oxlint JSON contains no diagnostics. Package and lockfile versions both equal `0.8.0`, and `git diff --check` passed. Final command logs are retained locally and are not included in the repository.

Optional PCC verification remains blocked because `OPENUI_PCC_PACKAGE` and `PI_CODING_AGENT_DIR` are unset. Native checks use installed widgets with simulated host and terminal boundaries. No fresh real-model evaluation, deterministic-provider CLI session, browser verification, physical-terminal test, or performance measurement is claimed. Earlier CLI and compatibility records below retain their original scope.

## Callout dismissal hit bounds (2026-11-04)

Native Callout dismissal now uses the visible button span on each rendered line. Focus markers, indentation, trailing padding, heading, body, and borders do not dismiss the notice. The rendered lines and public contracts are unchanged.

On Linux with Node 24.22.1 and Pi development dependencies 1.4.0, a temporary script used real DocumentModel, OpenUIView, native Text wrapping, and complete press/release/click sequences. The preserved before snapshot failed 370 of 3,936 checks. The fixed source passed all 3,936 checks, including 550 button-span cells, 3,352 outside cells, and 34 Enter/Space checks. Coverage includes focused and unfocused views, widths 1 through 24 at selected values plus 40, 80, and 100, wrapped lines, nested Card/Row/Section positioning, and a scrolled viewport. All 68 initial dark/light ANSI captures were byte-identical before and after. Wide, narrow, wrapped, nested, and scrolled previews were visually inspected.

A fresh actual Pi 1.5.0 fullscreen-terminal PTY run used an isolated deterministic provider at 80, 24, and 16 columns. SGR mouse clicks on the focus marker, right blank cells, border, heading, and body left the notice visible. Blank cells also remained inert after Tab moved focus to another input. Clicking the visible opening bracket dismissed the notice. The owned tmux sessions were stopped.

`npm run typecheck` and all 241 existing tests passed. `npm run lint` failed with repository-wide anti-slop findings. No unit tests, lint rules, packages, or unrelated source files were changed. Scripts, before/after click captures, visual previews, logs, source snapshot, and the bounded diff are retained in `/tmp/openui-callout-hit/`. Initial fixture and coordinate-oracle errors were corrected before the reported runs. This is deterministic native and CLI evidence, not real-model evaluation, physical-mouse testing, browser verification, lifecycle analysis, or a new compatibility matrix.

## Immediate editable table updates (2026-11-03)

[ADR 0009](adr/0009-editable-table-immediate-edits.md) replaces the table-wide draft behavior recorded below. Valid cell keystrokes now update typed local rows immediately. Invalid numeric buffers remain visible and block collection only. Save/Discard UI, shortcuts and model barriers are removed.

On Linux with Node 24.22.1 and Pi development dependencies 1.4.0, temporary native runtime checks exercised dependent totals before Enter, strings, numbers, immediate boolean toggles, multiple invalid cells, hidden-page errors, deterministic cell reveal and viewport scrolling, unrelated fields/pages/tables, accepted no-op spelling, rejected transactions, same-value Reset actions, external row/column/binding changes, disabled and removed controls, row shrink, empty tables, streaming previews and local interaction without submission. Caret clicks and width bounds passed across widths 1 through 120. Original-25 Zod schema equality passed. No unit tests were added or changed.

Fresh dark/light ANSI and plain captures cover wide/narrow inline editors, errors, long text, borders, Accordion tree rails and boxed Callout. The frames and PNG previews derived from them were visually inspected. Preview font support for CJK is limited, so ANSI/plain frames remain authoritative for text. The terminal-width assertions include CJK text.

A fresh actual Pi 1.5.0 fullscreen PTY run used an isolated deterministic provider at 104 and 32 columns. Keyboard and SGR mouse edits changed dependent totals before Enter. Invalid numeric input blocked collection while another input remained usable. Reset restored defaults. The submitted tool result retained numeric hours 9.25 and boolean ready false, and the provider continued. The owned tmux session was stopped. The CLI run used the dark theme. Both themes were covered by native rendering.

`npm run typecheck` and all 241 existing tests passed. `npm run lint` failed with repository-wide anti-slop findings, including findings in touched source files. This change is not lint-clean. No rules, lint configuration, packages or unrelated findings were changed. Scripts, actual CLI events, captures, logs and limitations are in `/tmp/openui-table-autosave/`. No real-model evaluation, physical-mouse test, browser check or new compatibility matrix is claimed. Earlier Save/Discard checks below are historical evidence, not verification of this behavior.

## Native component refinement (2026-11-04)

Accordion now renders tree rails and branch connectors. Callout has a padded tone-colored box. EditableTable composes its existing native Input inside the selected grid cell or narrow record value. The public signatures, Draft union, typed save/discard behavior and model barrier are unchanged.

On Linux with Node 24.22.1 and Pi development dependencies 1.4.0, native dark/light captures covered expanded nested disclosures, collapsed headings, boxed and wrapped dismissal, browse/focused/edit states, invalid numbers, long horizontally scrolled text, viewport focus, and resizing across widths 1 through 120. The actual frames were inspected for hierarchy, wrapping, cell placement and border alignment. Runtime checks verified one native cursor marker, caret clicks in wide cells and horizontally scrolled narrow values, nested child hit offsets, typed Save and Discard, and draft retention.

A fresh Pi 1.5.0 fullscreen PTY session used an isolated deterministic provider at 104 and 32 columns. Keyboard and SGR mouse input exercised disclosure, in-cell invalid numbers, correction, Save, boolean drafting, long text resizing, Discard, boxed notice dismissal and submission. The tool result and receipt retained numeric hours 7.25 and boolean ready true. Discard restored the original task text, and the provider continued. The owned tmux session was stopped.

`npm run typecheck` and all 241 existing tests passed. No unit tests were written or changed. Existing focused, extra, original-25 schema and border checks passed. The prior review-fix reproduction passed all 10 checks after replacing its obsolete detached-editor heading assertion with an assertion for native cursor metadata. The original reproduction and historical captures were preserved. New scripts, native ANSI/plain captures, CLI events and logs are in `/tmp/openui-component-refinement/`. No new compatibility matrix, real-model evaluation, browser check or package installation check is claimed.

Independent review inspected the final code and normal, narrow, nested, and invalid-input terminal captures. The native visual checks and all 10 review-fix reproductions passed again against matching source hashes. The newly required `npm run lint` failed with anti-slop findings across the repository, including `src/editable-table.ts` and `src/view.ts`. Rules were not weakened, and unrelated findings were not changed. The log is `/tmp/openui-component-refinement/parent-lint.log`. This refinement is not lint-clean.

## Standard catalog review fixes (2026-11-04)

Two review findings were reproduced on Linux with Node 24.22.1, Pi development dependencies 1.4.0, lang-core 1.0.2, Zod 4.6.7 and TypeBox 1.3.27. Temporary scripts used real DocumentModel, OpenUIView and native control input. Row shrink, column shrink and combined shrink each crashed on Enter and left model draft ownership held. A real tool submission containing typed table records with `hours: 7.25` failed the shared summary guard, declared tool output schema, custom-message renderer, tool-details renderer and JSON fallback renderer. The before run passed only 2 of 10 checks.

The same script passed all 10 checks after the fixes. It verifies editing and saving the clamped cell, empty-table input without acquiring a draft, repopulation, typed submission and all three receipt paths. Existing scalar and string-array acceptance remains unchanged. Invalid values still fail, including mixed arrays, null cells, nested values, nonfinite numbers, invalid record keys, oversized table cell text and oversized row arrays. The declared TypeBox output schema now includes typed record arrays as well.

`npm run typecheck` and all 241 existing tests passed. No unit tests were added or changed. The existing temporary `focused.mts`, `extra.mts`, `schema-check.mts` and `verify-borders.mts` checks passed again. They confirm the 28-component catalog, exact original-25 schema equality, draft barriers, native interaction, streaming previews and complete table borders. Ten regenerated dark/light native ANSI captures matched their prior versions byte for byte. The fixed receipt and clamped-selection frames were also inspected. `git diff --check` passed.

Evidence is retained in `/tmp/openui-standard-additions/review-fixes/`. It includes `repro.mts`, `before.log`, `after.log`, result JSON, check logs, source snapshots, fixed-state receipt/table captures and preserved prior captures. This run used native components and a simulated Pi host boundary. It did not repeat the earlier actual PTY CLI session, compatibility matrix, real-model evaluation, browser verification or package installation checks. The unrelated lint files and README were unchanged.

## Standard catalog additions (2026-11-03)

The working tree on `feat/standard-catalog-additions` adds Accordion, Callout and EditableTable to the original catalog, for 28 components. On Linux with Node 24.22.1, lang-core 1.0.2 and the Pi 1.4.0 development dependencies, `npm run typecheck` and all 241 existing core tests passed. No unit tests were added. With explicit approval, the existing catalog coverage fixture gained three valid calls and its count changed from 25 to 28. An external script compared the original 25 Zod schemas against HEAD and found exact equality. `git diff --check` passed.

Temporary focused checks used the real native controls and dark/light host themes at widths 1, 2, 3, 4, 8, 12, 18, 24, 40, 80 and 120. They covered disclosure mouse/keyboard input, nested hidden-page validation and focus, disabled descendants, explicit notice dismissal, typed numeric and boolean saves, invalid numeric drafts, discard, blocked reset/submission/other field updates, collection deep copies, invalid record rejection, dependent-validation rollback, single-draft ownership, local editing without a result, and read-only streaming previews. Six retained normal/narrow captures were checked for top, header, row and bottom lines, vertical sides and wide-grid column junctions.

An actual Pi 1.5.0 fullscreen CLI session ran the checkout extension with an isolated deterministic provider and agent directory. At 100×48 and 32×48, native PTY input exercised disclosure, invalid numeric editing, correction to 7.25, a boolean draft, mouse Save and explicit notice dismissal. Submission returned typed records with `hours: 7.25` and `ready: true`, and the provider continued. The owned tmux session was closed after capture. No external model calls or normal user-settings changes were made.

The implementer inspected the ANSI and plain terminal captures for spacing, alignment, heading hierarchy, wrapped content, focused cells, editing/error states and border junctions. A 24-column grid initially split labels into fragments. The final renderer instead uses inset bordered records at narrow widths. Normal grids retain vertical column borders and separate horizontal header, row and bottom lines. Callout and Accordion avoid additional enclosing boxes and use the existing semantic theme colors. Parent-owned independent visual review remains separate from this implementation check.

Evidence is retained outside the package in `/tmp/openui-standard-additions/`. It includes `focused.mts`, `extra.mts`, `schema-check.mts`, `verify-borders.mts`, result JSON, `typecheck.log`, `test.log`, dark/light native `.txt` and `.ansi` captures, actual CLI `cli-*.txt` and `.ansi` captures, `fixture.mjs`, `source.openui`, `cli-events.jsonl`, source hashes and cleanup evidence. These are deterministic runtime and CLI checks, not real-model evaluation or physical-mouse testing. No browser verification, new compatibility matrix, package installation check or broader lint cleanup is claimed. The table intentionally supports one draft at a time, single-line cell editing and no row insertion/deletion. Save is local, not external persistence. See [ADR 0008](adr/0008-editable-table-drafts.md).

## Local-widget integration — PRs #9, #10, #12 and #14 (2026-11-03)

The resolved working tree on `integration/local-widgets-pr9-pr10-pr12` combines the integration head [`1a889cf`](https://github.com/FireTheDevil/pi-openui/commit/1a889cf7e15cbd080fc66a6321a8509470aa8eb4) with PR #14 at [`eb077c3`](https://github.com/FireTheDevil/pi-openui/commit/eb077c37387479a1723ccf384cf86166f8e35e96). It retains the user's public-constraint guidance, expansion, single widget titles and Hide/Restore while integrating the widget-owned scrollbar. These checks apply to the resolved source before the integration merge commit; the earlier PR records below retain their original scope.

On Linux with Node 24.19.0 and the Pi 1.4.0 development baseline, `npm run typecheck` and all 241 core tests passed. Five new regression tests use the actual widget manager and view through a simulated host component boundary. They cover completed drags followed by fresh Expand/Hide/Restore/Close clicks, captured gesture tails crossing header controls, hiding during a drag, interrupted Ctrl-paging/F2, retained edits and narrow overflow cues. These are automated boundary tests, not actual-terminal sessions.

An ad hoc 353-case renderer/gesture sweep passed at selected widths from 1–256 columns and view heights from 1–200 rows, including heights 1–5. It checks width/height bounds, bordered and edge-free layouts, paging round trips, overflowing/fitting content, and gesture cancellation when width, height or content changes. The sweep evidence is retained in `/workspace/artifacts/openui-integration-checks/layout-sweep.json` and is not packaged.

Five actual fullscreen Pi CLI sessions passed the combined local-widget interaction scenario: Pi 1.4.0 direct tools and native code mode `only` in dark theme; Pi 1.5.0 direct tools in dark and light themes, plus conversion Deno Notebook Mode in dark theme. They used real PTY keyboard/mouse input against the resolved extension.

The runs covered thumb dragging and track clicks, fresh Hide/Restore/Close after a drag, dragging across header controls without activating them, Ctrl-paging and F2 interrupting a held drag, and field edits after scrolling. Edited numbers, text drafts, active tabs, expansion and useful scroll state survived Hide/Restore. Checks also covered a one-row hidden placeholder, 20-column footer overflow cues without duplicate titles, narrow Hide/Restore controls, duplicate-title older-widget reveal, hidden-widget focus cycling, ordinary chat with all widgets hidden, last-hidden Restore, replay to visible compact defaults, and a later static UI call. Local interactions emitted no edited values or additional model/tool calls.

The Pi 1.4 native-code run and Pi 1.5 light direct-tool and dark notebook runs additionally checked the parent scrollbar explicitly: hovering it left the widget thumb intact, the separator was inert, and a parent-rail click moved the conversation without changing the widget's internal offset. All 15 production source hashes matched across the local and cancellation matrices. Aggregate results and captures are retained under `/workspace/artifacts/openui-integration-live/`, with the run matrix in `summary.json`; temporary runtimes were removed and normal user configuration was unchanged.

Six actual Pi CLI sessions passed submission and cancellation checks through POSIX PTYs:

| Pi | Execution path | Host | Theme |
| --- | --- | --- | --- |
| 1.4.0 | Direct `show_ui` | Regular | Dark |
| 1.4.0 | Native code mode `only` | Fullscreen | Dark |
| 1.4.0 | Conversion Deno Notebook Mode | Fullscreen | Dark |
| 1.4.0 | Conversion Code Mode | Fullscreen | Light |
| 1.5.0 | Conversion Deno Notebook Mode | Fullscreen | Dark |
| 1.5.0 | Native code mode `only` | Fullscreen | Light |

The conversion cases use pi-codex-conversion 4.0.7. Each session checked typed submission, inline Escape and fullscreen Ctrl+C returning normal `cancelled` results, caller/model continuation, resizing and F2, a later request, static rendering and malformed-input diagnostics. Conversion cases also waited beyond a yield deadline and verified that a subsequent wait did not repeat the continuation. Normal user configuration was unchanged and isolated runtime directories were removed. Captures, driver results and source hashes are under `/workspace/artifacts/openui-integration-live/cancellation/`; the production source stayed stable during these runs.

The CLI checks use deterministic providers and no external LLM calls. They verify integration rather than real-model UI-generation quality or physical-mouse behavior. The npm pack dry-run retained 59 intended files and excluded tests and media. Package version remains 0.7.0; dependencies are unchanged. A clean tarball installation was not repeated. The separate upstream-generated action-guidance limitation remains tracked in [issue #15](https://github.com/FireTheDevil/pi-openui/issues/15).

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

## Issue #7 — single local-widget header (2026-11-03)

The `fix/local-widget-title` branch passed type checking and all 236 existing core tests on Linux with Node 24.19.0 and the Pi 1.4.0 development baseline. An additional ad hoc check verified single useful headers for missing, empty, whitespace-only and terminal-control-only titles, and trimming of a supplied title. No new unit tests were added.

Actual fullscreen CLI runs passed on Pi 1.4.0 in both dark and light themes and Pi 1.5.0 in the dark theme, all with Node 24.19.0. Fresh model-authored compact and scrolling documents exercised the normal `show_ui` path through a deterministic test provider, rather than using only shipped demos. Checks covered one wrapper title, a single fallback header, preservation of an intentional matching authored heading, first-control and Close mouse targets, keyboard edits and Reset, wrapping at 42 columns, focus/editing at 18 columns, and explicit-ID focus between widgets with identical titles. Tab focus-follow and mouse-wheel scrolling reached controls below the viewport and returned to the top after resizing. Static displays kept their titles; collecting forms kept their titles and returned typed submitted values. Chat remained usable alongside the widgets.

This verifies widget chrome and interaction, not the quality of an external model's component choices. The documents were newly authored by the coding model and dispatched through a deterministic provider; no external LLM provider calls were made. Tool-call and receipt titles retain their existing presentation. Ordinary Page Up/Down keys are intercepted by the fullscreen Pi host on this baseline; these runs verified scrolling through focus-follow and mouse wheel, while [issue #6](https://github.com/FireTheDevil/pi-openui/issues/6) addresses keyboard paging separately. The native-code/conversion notebook CLI matrix and clean tarball installation were not repeated for this change. Earlier release checks retain their original scope.
