# Local interactive widgets

Use `show_ui({source, interaction: "local"})` when the user should explore an explanation, comparison or calculator without supplying an answer to the agent. The complete document mounts as a persistent conversation entry. The normal chat composer stays in place, and the call returns immediately:

```json
{"status":"mounted","widgetId":"..."}
```

This result means a widget was installed. It is not approval, a submitted answer or a final chosen value. It has no `values`, `state` or action context. The enclosing code/notebook cell can finish, the model can continue, and later chat messages do not freeze or dismiss the widget.

## Choose the contract

| Need | Arguments | Result and focus |
| --- | --- | --- |
| Static information | Display-only source; default interaction | `displayed`; rendered in the transcript without taking focus |
| Local exploration | `interaction: "local"`; `presentation: "auto"` or `"inline"` | `mounted` with `widgetId`; interactive transcript entry, composer remains available |
| An answer for the agent | Default interaction or `interaction: "collect"` | Focused form waits for `submitted` or `cancelled` |

Removing a Submit button from a default form does not make it nonblocking. Select local mode explicitly. Local mode works with the existing catalog, including fields, Tabs, Steps, Tree, disclosure buttons and dependent Text/Table content; it adds no chart or browser renderer.

Try `/openui-demo --local` for the hosting explorer and `/openui-demo --local-tabs` for the tabbed explanation. Both mount immediately without sending a user-answer message. These local demo flags cannot be combined with `--stream` or `--fullscreen`.

Local mode currently rejects `presentation: "fullscreen"`. There is no F2 expansion for these widgets. The existing collect-mode form can still expand/collapse, and static fullscreen inspection retains its existing close behavior.

## Focus and interaction

Mounting never steals keyboard focus. Widgets use the available terminal width, with small side margins and no fixed content-width cap. The widget header and status hint identify its local interaction mode. Use:

| Action | Shortcut or command |
| --- | --- |
| Move between chat and the last selected widget | F6 |
| Select the next local widget | Shift+F6 |
| Select a widget explicitly | `/openui-focus [id]` |
| Return from a focused widget to chat | F6, Escape or Ctrl+C |
| Dismiss a widget without sending its values | `/openui-close [id]`, or its Close header button with mouse input |

Within a focused widget, the existing component keys apply: Tab/Shift+Tab changes controls, arrows navigate, Enter/Space activates buttons, and Page Up/Down scrolls its content. Escape/Ctrl+C returns focus to chat; it does not cancel a running notebook or submit/dismiss the widget. Once chat has focus, normal typing and sending belong to Pi.

The local widget header, content, and footer share one right edge. At host widths of 22 columns or more, the whole widget reserves two host columns, one blank separator and Pi's conversation rail. Below 22 columns it reserves only the parent rail. At one column or less it renders no rows. The right boundary appears at usable widget widths of at least 20 columns, with a top cap beside **Close**. At view heights of at least four rows, a cap-only row follows the footer hints within the existing height budget. The body viewport has one fewer row. The heading above the track and the hints below it leave one intervening row between each track end and its boundary cap. Shorter views keep the compact layout. Fitting content shows a passive boundary with no scrollbar hit target. **Close** has one blank column before the boundary. That padding is outside its hit target. **Close** appears and responds only when its complete label fits. Use `/openui-close` when the label cannot fit. Escape still returns focus to chat.

Overflowing local content shows a compact right-hand scrollbar in that same edge cell: the accented thumb marks the visible portion and its position on the muted track. At usable widget widths below 20 columns, the title line instead shows the visible line range and total (or a direction and percentage when space is tighter). These overflow cues appear only when content overflows and update with scrolling, focus, resizing, page changes and reactive content. They describe the widget's internal viewport, not conversation scrollback; the widget does not expand. In Pi's fullscreen host, drag the thumb to scroll while preserving the grabbed row. Click the track above or below the thumb to page once after a stationary release. Only the visible glyph column responds; the adjacent spacing column is inert. A track drag does not page. Thumb movement continues outside the widget and clamps at either end, including when you move horizontally away from the rail. When space permits, the footer also includes PgUp/PgDn alongside focus and return-to-chat hints. DatePicker uses those keys for months, and TextArea can consume them internally; Tab to another control or use the mouse wheel outside controls to scroll the widget.

Pi's fullscreen host supports mouse interaction in transcript widgets. Regular host mode uses keyboard interaction and leaves mouse handling to the terminal. In the regular host, scroll the terminal manually to see an older widget before editing it; focus transfer cannot move the terminal's scrollback. The fullscreen host can reveal its transcript row when focus changes. A widget's own viewport and wrapping adapt on resize. Keyboard or wheel input delivered to the widget, widget focus loss, reactive updates, page changes, resize, and removal cancel scrollbar gestures. Their trailing events cannot activate a control or the Close header button. A thumb with no available travel remains inert; keyboard and wheel scrolling still work. Return focus to chat before using unrelated dialogs or normal chat input.

Retained drag delivery was checked on Pi 1.5 fullscreen. It does not capture outside the terminal. Pi does not notify the widget when terminal focus-out clears host capture, so immediate cancellation on terminal focus-out is not observable. Pi also retains press-time coordinates; transcript relocation without a view-local layout change is not observable through this interface. Start a fresh press after those transitions. No host patch or raw-input interception is used.

## Actions and data ownership

Field edits, navigation, `@Set` and `@Reset` evaluate locally through lang-core. `Action([...])` may compose only Set/Reset steps. None of these invokes the model, starts a tool, emits a user-answer message or reopens the original call. Blurring, closing and subsequent chat also send no edited values.

Local documents are checked before mounting. `@ToAssistant`, legacy string submission actions, unsupported external actions and unprovable dynamic action sources are rejected with diagnostics, including paths on hidden pages or inactive conditional branches. Use a separate answer-collecting form if the agent needs a decision. Do not treat initial defaults as the user's selection.

The adapter also bounds static reference expansion to 16,384 syntax nodes before handing the document to lang-core. A small source can otherwise expand excessively through repeated aliases. If the limit is reached, simplify those references or split the content into smaller widgets.

`summary.title` supplies a neutral widget title. `summary.fields` does not export local state or create a submission summary.

## Lifecycle

- Each mounted widget owns its model, draft values, focus and local navigation state. Multiple widgets keep independent state.
- Ordinary agent turns, tool completion and later chat leave the widgets active. A finished tool call's AbortSignal no longer owns the widget.
- Explicit dismissal disposes the widget and its model. Session navigation/replacement and shutdown release live state and input handlers.
- The session records original source/title and explicit dismissal markers for presentation, outside the model's message context. Edited values, cursor position and local navigation state are not saved.
- Reopening a session or replaying a branch reconstructs still-open widgets from their original defaults; explicitly dismissed widgets stay closed. Do not rely on an exploratory edit as a durable saved answer.
- Widgets follow the visible current session branch; unrelated branches do not share live state. When Pi compacts away an older widget's transcript row, its live widget is disposed. Widgets whose rows remain visible retain their current state. Dismissal, navigation and compaction are presentation lifecycle events, not submission events.

At most 16 local widgets may be active. A new mount beyond that limit returns diagnostics; close an unused widget before mounting another. Replay restores at most the 16 most recent still-open widgets. Older/unavailable entries show a historical placeholder rather than implying live interaction.

## Hosting-cost explorer

The shipped [`HOSTING_EXPLORER_SOURCE`](../src/local-demo.ts) uses these supplied example prices:

| Plan | Monthly base | Included workers |
| --- | --- | --- |
| Basic | $10 | 2 |
| Standard | $20 | 5 |
| Pro | $40 | 12 |

Each extra worker costs $4/month. Every displayed total uses `base + 4 × max(0, requested − included)`; changing the worker control recomputes the table and tie-aware cheapest-plan text locally.

```js
const mounted = await tools.show_ui({
  source, // complete HOSTING_EXPLORER_SOURCE document
  interaction: "local",
  presentation: "inline",
  summary: { title: "Hosting explorer" }
});
text(mounted); // mounting metadata, never the user's edited worker count
// This cell can finish; the widget remains available in the conversation.
```

| Requested workers | Basic | Standard | Pro | Cheapest |
| --- | --- | --- | --- | --- |
| 4 | $18 | $20 | $40 | Basic |
| 10 | $42 | $40 | $40 | Standard and Pro |
| 11 | $46 | $44 | $40 | Pro |

[`LOCAL_EXPLANATION_SOURCE`](../src/local-demo.ts) is a second example: Tabs switch between an overview and a formula, while a Set button expands/hides an explanation. It has no final choice to submit.

## Actual Pi captures

These captures show Pi 1.4.0 with conversion 4.0.7 Deno Notebook Mode and the dark theme. The green tool result already returned `mounted`, and the originating cell and model turn finished. The widget then changed to 11 requested workers: Basic $46, Standard $44, Pro $40. The normal composer remains below it.

![Hosting explorer after its notebook call and turn completed](screenshots/local-notebook-explorer.png)

After returning focus to chat, the user sent an ordinary message and received a normal reply. The same widget retains its 11-worker state and can receive focus again. That chat did not submit the widget values.

![Ordinary chat while the hosting explorer remains mounted](screenshots/local-notebook-chat.png)

The second widget uses Tabs and a local disclosure button. Its explanation is expanded after the call returned; no choice or answer is being collected. The first widget remains independently mounted above it.

![Tabbed explanation with local disclosure in Notebook Mode](screenshots/local-notebook-explanation.png)

The images replay unmodified PTY output. Source documents, example prices and provider replies are deterministic test fixtures; they are not external-model-generated data. Browser tooling belongs only to the external screenshot harness and is not an extension dependency.

## Verification

The v0.7.0 tests exercise actual lang-core parsing/state evaluation, native controls, action-policy diagnostics, independent widget state, focus, resizing, disposal, branch replay and compaction. The examples verify 4/10/11-worker prices, ties, Reset, keyboard tab navigation and disclosure without a submission. Skill examples are parsed with the shipped library and tested through local recalculation or explicit answer collection, according to their mode.

All 236 core tests and type checking passed. All 32 optional compatibility tests passed against the actual conversion Code, Deno, JavaScript and TypeScript runtimes. The four local-widget cases verify immediate `mounted` return, interaction after cell completion, chat input and a later cell, retained notebook closures, no rewritten tool result or edited-state session entry, Reset and dismissal cleanup. These checks use a simulated terminal/session boundary around the real runtimes.

Seven actual Pi 1.4.0 CLI configurations passed the local-widget scenario:

| Execution path | Host | Theme | Result |
| --- | --- | --- | --- |
| Direct `show_ui` | Fullscreen | Dark | Passed |
| Direct `show_ui` | Fullscreen | Light | Passed; also session reopen and Shift+F6 |
| Direct `show_ui` | Regular | Dark | Passed with keyboard interaction |
| Native code mode `on` | Fullscreen | Dark | Passed |
| Native code mode `only` | Fullscreen | Dark | Passed |
| Conversion Code Mode | Fullscreen | Dark | Passed |
| Conversion Deno Notebook Mode | Fullscreen | Dark | Passed |

Each run checked immediate tool/cell and turn completion, all three required price sets, F6/Escape focus transfer, normal chat followed by editing the same widget, Reset, resizing to 68×28, multiple widgets, Tabs/disclosure, rejected ToAssistant, unchanged static displays and blocking answer collection. Fullscreen-host runs used mouse interaction; the regular-host run used keyboard input. Provider/tool traces verified that local edits did not send values or create calls. JavaScript and TypeScript notebooks were covered by the runtime tests, not this CLI matrix. The regular-host run did not test programmatic reveal or cycling to widgets in old terminal scrollback; scroll those rows into view manually.

The direct-tool light-theme run also checked an actual session close/reopen with original defaults and restored interactivity, plus Shift+F6 cycling with independent 4/5-worker state. All CLI runs used a deterministic local provider and no external model calls; they validate runtime integration, not model generation quality.

For real-model evaluation, request local exploration explicitly, continue an ordinary chat message after mounting, then return to the widget. Inspect tool/provider traces to confirm that edits, focus, reset and dismissal do not send values or create calls. The [model evaluation guide](model-evaluation.md) includes acceptance prompts.
