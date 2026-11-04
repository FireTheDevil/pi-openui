# Tool API and execution

Reference for `show_ui` in interactive Pi. For component signatures, use the [component reference](components.md).

## Tool arguments and results

`show_ui({ source: "…", presentation: "auto" })` renders native terminal components. Choose its interaction contract:

| Need | Arguments | Outcome |
| --- | --- | --- |
| Static information | Display-only source; default interaction | Immediate `{"status":"displayed"}` with persistent transcript content |
| Local exploration without an answer | `interaction: "local"` and default/inline presentation | Immediate `{"status":"mounted","widgetId":"..."}`; an interactive transcript widget with chat still available |
| A choice for the agent | Default interaction or `interaction: "collect"` | A focused form waits for submission or cancellation |

`presentation` accepts `auto`, `inline` or `fullscreen`; local mode rejects fullscreen. Removing Submit from a default form does not make it nonblocking. The extension adds lang-core's generated component prompt to Pi's system prompt while the tool is active in TUI mode.

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

Use a `Stack` root and declared state variables of the appropriate type for form bindings. Values remain strings, booleans, numbers, string arrays or arrays of typed plain records through editing and submission. The [component reference](components.md) lists every positional signature and setting; the original 25 signatures remain compatible. Editing fields uses lang-core's store and re-evaluates dependent expressions. A submitting collect-mode button returns a tool result such as:

```json
{"status":"submitted","action":"next_step","state":{"$choice":"Test","$note":"Check resizing"},"values":{"choice":"Test","note":"Check resizing"}}
```

Submission continues the current agent turn without injecting a duplicate user message. Escape or Ctrl+C closes the form and returns `{"status":"cancelled"}` as a normal tool result. The caller resumes and decides what to do next; the extension does not abort the run, terminate a cell or restart the notebook. Invalid documents return an error with diagnostics. RPC, JSON and print modes return an explicit unsupported-mode error.

Use inline displays for tables, explanations and code excerpts that need no acknowledgement. Use `presentation: "fullscreen"` for an explicitly requested expanded view or dense inspection. In a fullscreen display-only document, Enter closes the view and leaves the content inline; Escape returns a cancelled result. This does not add chart or Mermaid components to the catalog. See [inline presentation and cancellation](inline-ui.md).

For local widget focus, expansion, Hide/Restore, independent state and replay limits, see [local interaction](local-interaction.md). For `summary.title`, `summary.fields`, and complete outcome metadata, see [submission receipts](submission-summaries.md).

## Button actions

Buttons accept lang-core action expressions. Local actions re-evaluate dependent Text, Table and field values without closing. In collect mode, existing string action identifiers still submit and close. Local widgets reject string submissions and ToAssistant, including hidden/conditional paths; their Action sequences may contain only Set/Reset.

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

`@ToAssistant` returns `status: "submitted"` and `action: "continue_conversation"`, with `message`, optional `context`, `state` and `values`. For `show_ui`, this completes the waiting tool call so Pi can continue. The demo delivers the same structured result through one themed session message.

Plans are limited to 32 steps and may only target declared variables. Steps see preceding state changes; the plan commits only if the resulting UI is valid, otherwise all its changes roll back. Unsupported actions, such as `@Run`, `@OpenUrl` or custom host actions, produce explicit errors. Query and Mutation are not implemented. Action failures appear in the panel so the user can correct fields or cancel. All action execution remains disabled while streaming.

For buttons generated by `@Each`, a plan that changes its own list or button identity before submitting can be rejected and rolled back. Use separate local-update and submit buttons for that case.

See the [action demo screenshots](action-demo.md) for native rendering, local updates, reset and submission in the actual Pi CLI.

## Native code mode

Pi's native `codemode` can call the same tool while the session is in interactive TUI mode. Enable it alongside `show_ui`, for example:

```sh
pi --tui-mode fullscreen --tools +codemode -e ./src/index.ts --skill ./skills/openui/SKILL.md
```

A model's `codemode` script can then await a structured result:

```js
const result = await tools.show_ui({
	source: 'root = Stack([Button("Continue", @ToAssistant("Continue with the plan"))]);',
	summary: { title: "Plan confirmation" }
});
text(result);
```

In collect mode, the promise stays pending while the user edits fields or runs local actions and returns typed data on submission. Local mode returns `status: "mounted"` immediately after installing the transcript widget; the cell can finish while the widget stays interactive. Display-only inline documents return `status: "displayed"` immediately. Cancelling the form resolves the promise with `status: "cancelled"`, so code following the await can handle the result normally. Check the status before using submitted values; form cancellation does not stop the cell or discard notebook state. Results also distinguish `cancelled` and `error`, and only `submitted` contains user choices. Native code mode receives the tool's structured output; normal tool calls retain their JSON text result. Avoid short script deadlines and concurrent answer-collecting forms; multiple local widgets have independent state. A nested result reaches the model only when the script outputs it.

This works with native `codemode.mode` set to `on` or `only`. Keep `show_ui` active: `--tools codemode` alone removes it; use `--tools +codemode` or `--tools codemode,show_ui`. A UI invoked inside JavaScript opens when `tools.show_ui()` executes; partial JavaScript source does not produce a UI preview. Direct `show_ui` calls still support incremental argument previews.

The third-party Code/Notebook Mode in `@howaboua/pi-codex-conversion` 4.0.7 exposes the same `await tools.show_ui(...)` call through its tool bridge and returns this tool's structured result. OpenUI keeps a collect-mode call attached to the enclosing execution while waiting for input, including after a yield budget expires. Local-mode calls finish after mounting and do not wait for user interaction. The enclosing execution tool and persistent notebook lifecycle differ from native `codemode`. Cancelling a form returns normally in Code, Deno Notebook, JavaScript Notebook and TypeScript Notebook modes; it requires no notebook restart. See [mode compatibility and cancellation](inline-ui.md#execution-modes) for configuration, tested execution paths and result handling. Native code mode and `/openui-demo` need no such package.

OpenUI Lang accepts host-defined component libraries. These are terminal-specific schemas, not drop-in replacements for the differently shaped components in OpenUI's web libraries.

The catalog is defined with Zod schemas supplied to lang-core. It covers terminal forms, layouts, navigation and structured output; it does not implement every component in OpenUI's separate web libraries. Charts, media, rich document editing and browser-specific interactions remain outside this catalog.

## Model guidance

The extension automatically supplies lang-core's component schemas, binding/action rules, core interaction policy and examples whenever `show_ui` is active in TUI mode. The bundled [openui skill](../skills/openui/SKILL.md) teaches when to use prose, a static display, nonblocking local exploration, an answer-collecting form or expanded inspection; how to compose comparisons, decisions and scenario explorers; and how to choose among the 28 components. It covers grounded data, meaningful reactive state, layout, cancellation, validation, code/notebook execution and useful submission receipts. Complete examples distinguish local recalculation/reset from explicit answer collection and submission.

Package installation makes the skill discoverable. Pi loads its detailed instructions on demand; `/skill:openui` explicitly loads it. When running only the extension file with `-e`, add `--skill ./skills/openui/SKILL.md` as in the [source setup command](development.md#run-from-source). Keep `read` or `bash` available if you use a restricted tool list: Pi omits skill discovery from the model prompt when neither tool is callable. The generated component prompt remains available independently of skill loading. It includes the public bounds documented in the [component reference](components.md). Upstream-generated action guidance still advertises `@OpenUrl` and actionless buttons, contrary to the current runtime. That separate limitation is tracked in [issue #15](https://github.com/FireTheDevil/pi-openui/issues/15).

The extension works through Pi's normal model/tool loop; the deterministic provider is external test tooling. See the [real-model evaluation guide](model-evaluation.md) for the architectural contract, realistic acceptance prompts and the boundary between verified integration and model-generation quality.

## Validation and streaming

Fields support descriptions, required values, disabled states and explicit errors. Validation keeps the form editable while blocking submission, including errors on inactive Tabs/Steps pages; submission reveals and focuses the invalid field. Hidden pages retain their values and participate in reset and submission. Disabled fields are skipped during focus and validation but their values are still returned; disabling Tabs or Steps also disables its descendants. A numeric draft stays visible while invalid and cannot silently submit an older number. Accordion disclosures reveal invalid hidden children before focusing them. Callout notices can offer explicit local dismissal. EditableTable edits typed plain records immediately, with vertical borders and horizontal row separators. Invalid numeric cell text stays visible and blocks collection only, without locking other controls or pages. There are no Save or Discard controls. See the [component reference](components.md#editable-tables) for the record schema and editing contract.

Completed documents are parsed and validated before interaction. For explicit collect-mode calls from providers exposing incremental tool arguments, `message_update` feeds accumulated `source` text to lang-core's streaming parser and updates the same `ctx.ui.custom()` view. Local mode waits for complete validation before mounting; an unknown interaction mode must not seize the composer while arguments arrive. Inputs and submission remain disabled until tool execution validates the final document. `/openui-demo --stream` exercises this path deterministically with timed chunks. Providers without partial arguments show the completed document normally.

While a collect-mode form has focus, Escape and Ctrl+C close it and return an ordinary cancelled result. The caller can branch on that result without losing notebook variables or restarting a kernel. In a local widget, those keys return focus to chat without dismissal or another tool result. A separate tool/session abort, timeout, interrupted generation or shutdown still cleans up the view through the host's normal lifecycle. Cancelling a preview prevents that tool call from reopening it. Only one interactive view owns keyboard focus at a time; multiple local widgets may remain mounted alongside chat.

Malformed source, unresolved references, invalid props, duplicate field names and unsupported components produce diagnostics. Documents are limited to 65,536 characters, 256 components, 32 levels, 200 table rows/options and 20 columns. Model text is stripped of terminal control sequences. Buttons can update local state or return structured data to Pi; they do not execute external tools or scripts.

## Appearance

All components use Pi's current theme: accent titles and selections, bold field labels and table headers, highlighted focused buttons, input boundaries, muted hints and error colors. Text supports semantic tones, bold and italic; buttons support primary, secondary and danger variants. Theme changes are reflected by the open view. Inline forms use a bounded-height, left-aligned area so the conversation remains visible. Interactive views use the available terminal width with small margins and no fixed content-width cap. Rows stack vertically on narrow terminals, tables adapt to available space, and the footer shortens its hints. Mouse targets follow nested layouts, content insets and resizing. Only the focused editor shows a cursor.

Use Pi's normal theme selection, for example `pi --use-theme dark --tui-mode fullscreen -e ./src/index.ts` or `--use-theme light`. See the [theme gallery](themes.md) for actual terminal captures.
