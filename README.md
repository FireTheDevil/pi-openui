# Pi OpenUI TUI

An OpenUI Lang extension for **Pi 1.4+**, using `@openuidev/lang-core` 1.0.2 and Pi's host-provided `@earendil-works/pi-tui`. No React, browser, webview, or separate terminal loop.

## Run

Requires Node.js 22.19+ and Pi with the `@earendil-works` package namespace (tested on Node 24).

```sh
npm ci --ignore-scripts
pi --tui-mode fullscreen -e ./src/index.ts
```

In Pi, run `/openui-demo` or `/openui-demo --stream`. Choose a next step, enter instructions, then activate **Send to Pi**. Submission sends a user message to the active session (queued as a follow-up if Pi is busy). Escape or Ctrl+C cancels without sending a message.

Run `/openui-demo --actions` to try buttons that update state without closing the panel: increment a counter, apply an ordered plan, reset the fields, and send the result to Pi. Add `--stream` to preview this demo incrementally; it remains read-only until complete.

To persist installation, run `pi install /absolute/path/to/pi-openui-tui`. The package's `pi.extensions` manifest identifies the entry point. Pi supplies its own TUI at runtime; development dependencies are only for local checks.

From GitHub, install with `pi install git:github.com/FireTheDevil/pi-openui`.

The panel occupies the terminal through Pi's native overlay API. Fullscreen mode routes mouse events to the panel; `--tui-mode regular` retains keyboard interaction and leaves the mouse to the terminal.

## Agent tool

`show_ui({ source: "…" })` opens a native custom component and waits for an action. The extension adds lang-core's generated component prompt to Pi's system prompt while the tool is active in TUI mode.

```text
$choice = "Review";
$note = "";
root = Stack([
  Text("Selected: " + $choice),
  Select("choice", "Next step", ["Review", "Implement", "Test"], $choice),
  Input("note", "Instructions", $note, "Optional note"),
  Table(["Task", "Status"], [["Design", "Ready"], ["Tests", "Pending"]]),
  Button("Send to Pi", "next_step")
]);
```

| Component | Positional arguments |
| --- | --- |
| `Text` | text |
| `Stack` | children (vertical layout) |
| `Select` | unique name, label, string options, value or `$binding` |
| `Input` | unique name, label, value or `$binding`, optional placeholder |
| `Button` | label, action expression or legacy action identifier |
| `Table` | column labels, rows of scalar cells |

Use a `Stack` root and string state variables for form bindings. Editing fields uses lang-core's store and re-evaluates dependent expressions. A button returns a tool result such as:

```json
{"status":"submitted","action":"next_step","state":{"$choice":"Test","$note":"Check resizing"},"values":{"choice":"Test","note":"Check resizing"}}
```

The tool result continues the current agent turn; it does not also inject a duplicate user message. Cancellation returns `{"status":"cancelled"}`. Invalid documents return an error with diagnostics. RPC, JSON and print modes return an explicit unsupported-mode error.

## Native code mode

Pi's native `codemode` can call the same tool while the session is in interactive TUI mode. Enable it alongside `show_ui`, for example:

```sh
pi --tui-mode fullscreen --tools +codemode -e ./src/index.ts
```

A model's `codemode` script can then await a structured result:

```js
const result = await tools.show_ui({
  source: 'root = Stack([Button("Continue", @ToAssistant("Continue with the plan"))]);'
});
text(result);
```

The promise stays pending while the user edits fields or runs local actions, and resolves on submission or cancellation. Check `result.status` for `submitted`, `cancelled` or `error`. Native code mode receives the tool's structured output; normal tool calls retain their JSON text result. Avoid short script deadlines and concurrent panels. A nested result reaches the model only when the script outputs it.

This works with native `codemode.mode` set to `on` or `only`. Keep `show_ui` active: `--tools codemode` alone removes it; use `--tools +codemode` or `--tools codemode,show_ui`. A UI invoked inside JavaScript opens when `tools.show_ui()` executes; partial JavaScript source does not produce a UI preview. Direct `show_ui` calls still support incremental argument previews.

The third-party Code/Notebook Mode in `@howaboua/pi-codex-conversion` uses a separate registration API. This extension does not currently register with that adapter. Native code mode and `/openui-demo` need no such package.

OpenUI Lang accepts host-defined component libraries. These are terminal-specific schemas, not drop-in replacements for the differently shaped components in OpenUI's web libraries.

The six components above are the initial catalog requested for this adapter, not a limit imposed by lang-core. OpenUI's separate web libraries include richer forms, layouts, charts and media components. Supporting those here requires terminal specifications, rendering and interaction for each one. Useful additions include Tabs/Sections, Checkbox/MultiSelect/TextArea, and CodeBlock/Markdown/Progress; these are not implemented yet.

## Appearance

All components use Pi's current theme: accent titles and selections, bold field labels and table headers, highlighted focused buttons, input boundaries, muted hints and error colors. Theme changes are reflected by the open view. The fullscreen panel centers content up to 96 columns wide; tables size columns to their contents, and the footer shortens its hints on narrow terminals. Mouse targets follow the content insets and resizing. Only the focused input shows a cursor.

Use Pi's normal theme selection, for example `pi --use-theme dark --tui-mode fullscreen -e ./src/index.ts` or `--use-theme light`. See the [theme gallery](docs/themes.md) for actual terminal captures.

## Button actions

Buttons accept lang-core action expressions. Local actions re-evaluate dependent Text, Table and form values while keeping the panel open. Existing string action identifiers still submit and close as before.

```text
$count = 0;
$note = "";
root = Stack([
  Text("Count: " + $count),
  Input("note", "Note", $note),
  Button("Increment", @Set($count, $count + 1)),
  Button("Reset", @Reset($count, $note)),
  Button("Increment and send", Action([
    @Set($count, $count + 1),
    @ToAssistant("Review this", {count: $count, note: $note})
  ]))
]);
```

| Action | Behavior |
| --- | --- |
| `@Set($variable, expression)` | Evaluate against current state and update a declared variable |
| `@Reset($variable, ...)` | Restore the named variables to their document defaults |
| `@ToAssistant(message, context)` | Submit current values and state, plus the message and optional context, then close |
| `Action([...])` | Execute supported steps in order; submission must be the final step |

`@ToAssistant` returns `status: "submitted"` and `action: "continue_conversation"`, with `message`, optional `context`, `state` and `values`. For `show_ui`, this completes the waiting tool call so Pi can continue. The demo delivers the same structured result as a user message.

Plans are limited to 32 steps and may only target declared variables. Steps see preceding state changes; the plan commits only if the resulting UI is valid, otherwise all its changes roll back. Unsupported actions, such as `@Run`, `@OpenUrl` or custom host actions, produce explicit errors. Query and Mutation are not implemented. Action failures appear in the panel so the user can correct fields or cancel. All action execution remains disabled while streaming.

For buttons generated by `@Each`, a plan that changes its own list or button identity before submitting can be rejected and rolled back. Use separate local-update and submit buttons for that case.

See the [action demo screenshots](docs/action-demo.md) for native rendering, local updates, reset and submission in the actual Pi CLI.

## Interaction and streaming

Tab / Shift+Tab moves focus; arrows change the selected option. Enter confirms a select or advances from an input; Enter / Space activates a focused button. PgUp / PgDn scrolls long content. Text wraps at the current width, tables switch to labeled records on narrow terminals, and focus follows the selected control on resize.

In fullscreen mode, click a select option, click an input to position its cursor, or click a button to run its action. Labels focus their controls. The wheel changes selection over a select list and scrolls the panel elsewhere. Mouse targets track wrapping, scrolling and resizing; streaming previews cannot edit or submit by mouse or keyboard.

Completed documents are parsed and validated before interaction. For providers exposing incremental tool arguments, `message_update` feeds accumulated `source` text to lang-core's streaming parser and updates the same `ctx.ui.custom()` view. Inputs and submission remain disabled until tool execution validates the final document. `/openui-demo --stream` exercises this path deterministically with timed chunks. Providers without partial arguments show the completed document normally.

Escape, tool/session aborts, interrupted generation and shutdown clean up the panel. Cancelling a preview prevents that tool call from reopening it. Only one panel owns focus at a time.

Malformed source, unresolved references, invalid props, duplicate field names and unsupported components produce diagnostics. Documents are limited to 65,536 characters, 256 components, 32 levels, 200 table rows/options and 20 columns. Model text is stripped of terminal control sequences. Buttons can update local state or return structured data to Pi; they do not execute external tools or scripts.

## Development

```sh
npm run typecheck
npm test
```

`src/model.ts` owns the library, generated prompt, parsers, evaluation and action dispatch. `src/view.ts` adapts evaluated nodes to native Pi input/select/text components and terminal layouts. `src/index.ts` owns Pi registration and panel lifecycle. Automated tests exercise real lang-core and Pi widgets, ordered actions, Pi's actual extension loader, its fullscreen mouse decoder, and native codemode's QuickJS worker, using simulated host/terminal boundaries.

The extension was also tested in the actual Pi 1.4.0 CLI on Node 24 with a local deterministic provider: keyboard/mouse editing, local actions, reset, resizing, streaming, submission through the session/tool loop and cancellation passed. Native code-only mode was checked end to end, including nested tool IDs, structured results, prompt availability and cancellation. External model providers have not been tested. The gallery captures actual PTY output; recording and screenshot tooling are excluded from the repository and package.
