---
name: openui
description: Choose static displays, nonblocking local exploration, or answer-collecting interfaces with show_ui and OpenUI Lang in Pi. Use for comparisons, interactive explanations, scenario exploration, related answers and workflows even without an explicit UI request. Covers mode selection, focus, components, grounded data, state, actions, code/notebook execution and receipts.
---

# OpenUI in Pi

Use an interactive UI when it helps the user make a decision, compare alternatives, or understand how changing an input affects an outcome. Choose it proactively when useful; the user does not need to request a UI explicitly. Follow the user's preferred medium, and choose the smallest interface that improves the task.

The active `openui` prompt section supplies the component schemas and language rules. Read the [component reference](../../docs/components.md) when you need an exact signature or setting. This skill guides design; use only the supplied terminal catalog. No React, HTML, browser or webview is involved.

## Decide whether interaction helps

Start with the user's goal and available context. Identify what the user should be able to choose, adjust, compare or inspect. Use a structured display when it improves reading, and controls when they make a meaningful decision or relationship easier to explore. Simple facts, short explanations, ordinary progress updates and already-authorized one-step edits usually need prose or the normal tools. A small static comparison can be a normal Markdown table; use an inline OpenUI display when its layout or formatting adds value. Respect a request for plain text.

`show_ui` defaults to inline presentation. Choose the interaction contract explicitly before composing the document:

| User need | Tool arguments and behavior |
| --- | --- |
| Read information with no controls | A display-only document with default interaction renders in the conversation and returns `status: "displayed"`. |
| Explore, calculate, navigate or expand explanations without sending an answer | Set `interaction: "local"` with `presentation: "auto"` or `"inline"`. The tool returns `status: "mounted"` plus `widgetId`; the widget remains interactive in the transcript while chat stays available. |
| Supply an answer the agent needs for subsequent work | Use default interaction or `interaction: "collect"`. Controls open a focused form and wait for submission or cancellation. |

Removing a Submit button does **not** make a default form nonblocking. Use local mode for optional exploration and collect mode only when the agent needs an answer. Avoid acknowledgement buttons before routine work can continue. For an exported chart, document or other shareable artifact, use the appropriate artifact tools; terminal output is not an export format.

## Choose inline or expanded presentation

- Use `presentation: "auto"` (the default) or `"inline"` for ordinary choices, small forms, comparisons, explanatory tables and code excerpts. Local widgets require one of these presentations and keep the normal composer visible. Do not request fullscreen for every call.
- In collect mode, use `presentation: "fullscreen"` when the user asks for an expanded view or the task needs sustained inspection of dense content. F2 expands or collapses the open form while retaining edits and focus. A fullscreen display-only document closes on Enter and remains inline; Escape returns a cancelled result. Local widgets do not currently expand: `interaction: "local"` with fullscreen is rejected.
- For a display with no decision to collect, use Text, Markdown, Table, List, CodeBlock or other display components without a Button or field. An inline display returns `status: "displayed"`; it is neither a user choice nor approval. Use normal prose when it communicates the same information more simply.
- The catalog still defines the available content. Requesting fullscreen does not add chart, Mermaid, flow-diagram or browser components. Use a supported textual representation or an appropriate artifact tool for those formats.

The [presentation guide](../../docs/inline-ui.md) covers static displays and answer collection. The [local interaction guide](../../docs/local-interaction.md) covers persistent widgets, focus, lifecycle and a hosting-cost explorer.

Choose an interaction pattern before selecting components:

| Task | Useful composition |
| --- | --- |
| Collect several related decisions | Brief purpose, Section with typed fields, one final action |
| Compare alternatives and choose | Table with meaningful comparison columns, Select with readable option labels, final choice button |
| Explore a scenario or relationship | `interaction: "local"`; NumberInput/Slider/Toggle, derived Text or Table and optional Reset; no final submit button |
| Browse explanations or inspect a hierarchy without answering | `interaction: "local"`; Tabs, Tree or local disclosure buttons with relevant Text/Markdown |
| Explore and then give the agent a chosen configuration | `interaction: "collect"`; reactive controls and a clear final use-this-choice button |
| Move through a short workflow | Steps with clearly labeled local Next/Back buttons and a final submit action; enforce any necessary validation explicitly |
| Inspect a hierarchy and select an item | Tree with useful labels, relevant supporting details, final selection button |

## Ground and compose the interface

- Use available tools to gather relevant facts missing from context before opening the panel. Use supplied or verified data, preserve units and time ranges, and label assumptions or illustrative numbers. Do not invent availability, prices, measured progress or completed actions.
- Reuse known preferences and prior answers. Ask only for missing decisions, choose reasonable defaults, and leave genuinely optional fields optional. Do not add agreement checkboxes or extra steps to ordinary forms without a task-specific reason.
- Give the screen a clear hierarchy: purpose, essential controls, visible consequences or comparison, then a final action only when collecting an answer. Use short labels and plain-language descriptions. Group related fields; introduce Tabs, Steps or Cards only when they reduce complexity.
- A local widget already displays `summary.title` in its header, or “Local explorer” when no title is supplied. Do not repeat that title as the first Text or Markdown heading in `source`. Start the body with useful instructions, context or controls; retain headings for distinct internal sections. This guidance applies to the supplied widget title, not to every heading in a static display or collecting form. Widget IDs remain available in the `mounted` result and the focused status hint for explicit focus/close commands.
- Make controls meaningful. In an exploration, changing a bound value should update relevant Text, Table or Progress expressions immediately. Keep these calculations inside the widget or form rather than requiring another model call for each change. Offer Reset when experimentation is useful.
- Local actions cannot fetch fresh data, run tools or execute scripts. If the agent needs a choice for new evidence or external work, use collect mode to submit it, then use the appropriate tools. A local widget never forwards its edited values; do not infer an answer from its mounting, focus changes or dismissal. Do not label a local state update as a completed deployment, live refresh or actual measured progress.
- Treat Pi's keyboard navigation, resizing and theme as part of the design. Avoid meaning conveyed only by color, excessive nesting, decorative borders, long option labels or layouts that depend on a wide terminal. Use semantic styling sparingly.

Before calling the tool, check the interaction mode, complete syntax, useful controls and bound dependent values. In collect mode, the final button must accurately describe submission. In local mode, omit all submission paths, including hidden or conditional ones.

## Choose components by the user's task

| Need | Components and guidance |
| --- | --- |
| Choose exactly one option | `Select`; use rich options for readable labels and brief explanations. Store stable string values. |
| Choose several independent options | `MultiSelect`; start with a reasonable subset or an empty array. |
| Acknowledge an agreement | `Checkbox`; use `required: true` only when checking it is necessary to submit. |
| Enable or disable a setting | `Toggle`; use a boolean default and an explicit label. |
| Short text / a longer explanation | `Input` / `TextArea`; placeholders supplement a visible label. |
| Exact number / bounded approximate amount | `NumberInput` / `Slider`; choose meaningful limits and a positive step. |
| A calendar date | `DatePicker`; use `YYYY-MM-DD`, with bounds only when relevant. |
| Select within a hierarchy | `Tree`; use clear branch names and stable node values. |
| Simple content order | `Stack`; every document has a `Stack` root. |
| A few compact peer items | `Row`; it stacks vertically on narrow terminals. |
| Related fields / an enclosed block | `Section` / `Card`; avoid excessive nesting and borders. |
| A visual break | `Divider`; use sparingly between meaningful groups. |
| Independent groups of settings | `Tabs`; use a few short page labels. |
| An ordered workflow | `Steps`; implement explicit local Next/Back actions when useful. Steps alone does not enforce completion order. |
| A short instruction or state-dependent value | `Text`; use semantic tones and emphasis sparingly. |
| Explanatory content / source code | `Markdown` / `CodeBlock`; give code its language where known. |
| A checklist of information / comparable records | `List` / `Table`; Table is read-only, so use selection controls to request a choice. |
| A short status / a measured amount of progress | `Badge` / `Progress`; progress must reflect actual known state. |
| Update a widget or submit a decision | `Button`; local widgets allow Set/Reset only, such as “Reset fields”. “Send choices” belongs to collect mode. |

## Build a usable document

1. Put the question or purpose first. Ask only for information needed for the current task, and use existing context for sensible defaults.
2. Declare `$variables` with the correct types: strings for text, dates and single selections; booleans for Checkbox/Toggle; numbers for NumberInput/Slider; string arrays for MultiSelect.
3. Give every field a unique name, including Tabs/Steps. Names are data keys; labels are what the user reads. Keep option, page and tree values unique.
4. Use common `{description, required, disabled, error}` settings only when needed. Required boolean fields must be true. A disabled field retains its value in the submitted result. Disabled Tabs/Steps also disable their descendants.
5. In collect mode, keep the final submit action obvious and outside a multipage group. Hidden fields retain their values and still validate; failed submission reveals an invalid enabled field. Local exploration needs no final action; Reset or disclosure buttons may help.
6. Design for keyboard use: Tab moves between controls, arrows navigate, Space toggles choices, and Enter activates buttons. TextArea uses Enter for newlines and Ctrl+Enter to advance. For local widgets, F6 transfers focus between chat and the widget; Shift+F6 cycles widgets. Escape or Ctrl+C while a local widget is focused returns to chat without dismissing it. In collect mode, F2 toggles inline/fullscreen and Escape/Ctrl+C cancels. Pi's fullscreen host supports mouse interaction; regular mode remains usable by keyboard.

Pass a complete OpenUI Lang document in `source`, without Markdown fences. Local widgets mount only after complete-document validation. Collect-mode streaming previews are read-only until the final document is valid; do not rely on editing unfinished source. Only one answer-collecting form owns focus at a time; multiple local widgets can coexist with independent state.

## Local actions and submission

- `@Set($variable, expression)` and `@Reset($variable, ...)` update the current panel without closing it.
- `Action([...])` runs supported steps in order, up to 32 steps. Each step sees preceding state changes. A failed structural update rolls the plan back.
- In collect mode, `@ToAssistant(message, context?)` submits current typed values and closes the form. If used in a plan, it must be last. A legacy string action identifier also submits. Local mode rejects both, even on hidden pages or inactive conditional paths; `Action([...])` may contain only Set/Reset steps there.
- All update targets must be declared variables. Query, Mutation, `@Run`, `@OpenUrl` and external tool execution are unsupported button actions.

Check the result's `status`. On `mounted`, the local widget was created; the call is finished and no final value, choice or approval was returned. Continue independently authorized work without waiting for a later UI result. Do not poll the widget, ask it to submit, or treat its defaults as user answers. On `submitted`, use the actual `values` for field answers and `context` for any supplied action payload; do not reconstruct answers from defaults or the receipt. On `displayed`, content was shown without collecting input; continue only work already authorized independently of that display. On `cancelled`, the form was dismissed and supplied no choices. The awaiting code resumes normally, and the notebook stays running. Handle this result explicitly: skip work that requires the missing answer, continue any independently authorized work as appropriate, and do not substitute default choices or automatically reopen the form. On `error`, use the diagnostics to correct the specific problem instead of resending the same document. If a valid UI cannot be produced, explain the issue and use an appropriate conversational fallback. Do not turn cancellation into an automatic retry.

Submission means the user supplied input. Continue the authorized task using that input, with a concise explanation of the next action when useful. The receipt already acknowledges the decision; avoid repeating its entire table or dumping JSON into the conversational reply. Do not claim that files changed, a deployment ran or another external action completed merely because the form was submitted.

## Choose the submission summary

The extension renders a themed receipt automatically for submitted, cancelled and error outcomes. It derives readable labels and selection names from the form and keeps the complete structured result for the agent. Do not generate another UI or ANSI styling just to acknowledge submission.

Optionally pass `summary` alongside `source`:

```json
{
  "title": "Review configuration",
  "fields": ["owner", "checks", "retries"]
}
```

Use a short, neutral `title` naming the decision, such as “Review configuration”. Avoid titles that imply work has already executed. `fields` is an ordered list of field names, not `$variable` names or labels. Select the important user decisions; omit tab/step navigation and incidental internal state. Omitting `summary` uses automatic defaults. Selecting fewer receipt fields changes presentation only: all submitted values remain available to the agent. Unknown field names are ignored, so use the same names as the document.

The renderer chooses status wording, colors, spacing and truncation using Pi's active theme. Expanded details remain available. Native code mode displays the receipt separately in the transcript; mixed scripts retain their other tool output. Preserve that output and any data the model needs.

Local widgets have no submitted values to summarize; `summary.title` supplies their single header title and `summary.fields` does not expose edits. Keep that title out of the body's opening heading. For an answer-collecting comparison, summarize the chosen alternative and key parameters. For exploration followed by an explicit answer, summarize the submitted inputs and include derived outputs in action context when useful. For a workflow, summarize the final decisions rather than the tab or step visited. Request only actual field names in `summary.fields`; display-only computed values are not fields.

## Example: one decision

Pass this complete document as `source`, with `summary: {title: "Review depth", fields: ["depth"]}`:

```openui
$depth = "focused";
root = Stack([
  Text("How thoroughly should I review the change?"),
  Select("depth", "Review depth", [
    {value: "focused", label: "Focused review", description: "Changed code and nearby tests"},
    {value: "thorough", label: "Thorough review", description: "Include wider interactions"}
  ], $depth),
  Button("Send choice", @ToAssistant("Use this review depth", {depth: $depth}), {variant: "primary"})
]);
```

## Example: related typed settings

Use `summary: {title: "Review configuration", fields: ["owner", "checks", "retries", "confirmed"]}`. This example assumes the user requested a named owner and an explicit review confirmation; omit the confirmation checkbox for ordinary configuration. Owner and confirmation are required here:

```openui
$owner = "";
$checks = ["tests"];
$retries = 2;
$confirmed = false;
root = Stack([
  Section("Review configuration", [
    Input("owner", "Owner", $owner, "Name", {required: true}),
    MultiSelect("checks", "Checks to run", [
      {value: "tests", label: "Tests"},
      {value: "types", label: "Type checking"}
    ], $checks),
    NumberInput("retries", "Retry limit", $retries, {min: 0, max: 5, step: 1}),
    Checkbox("confirmed", "I have reviewed these settings", $confirmed, {required: true})
  ]),
  Button("Reset fields", @Reset($owner, $checks, $retries, $confirmed), {variant: "secondary"}),
  Button("Send settings", @ToAssistant("Use these review settings"), {variant: "primary"})
]);
```

## Example: explore and submit an estimate

Use `interaction: "collect"` when the agent needs the chosen estimate. For this illustrative work estimate, use `summary: {title: "Work estimate", fields: ["people", "hours", "rate"]}`. These defaults are examples, not verified prices. Changing a control recomputes the table immediately; the final context carries the derived total.

```openui
$people = 2;
$hours = 3;
$rate = 50;
root = Stack([
  Text("Explore a work estimate", {bold: true}),
  Text("Illustrative inputs. Rate is USD per person-hour; taxes and other costs are excluded.", {tone: "muted"}),
  Row([
    NumberInput("people", "People", $people, {min: 1, max: 10, step: 1}),
    NumberInput("hours", "Hours per person", $hours, {min: 1, max: 12, step: 1})
  ]),
  Slider("rate", "Hourly rate (USD)", $rate, 20, 200, 10),
  Table(["Measure", "Value"], [
    ["Person-hours", $people * $hours],
    ["Estimated cost (USD)", $people * $hours * $rate]
  ]),
  Button("Reset estimate", @Reset($people, $hours, $rate), {variant: "secondary"}),
  Button("Use this estimate", @ToAssistant("Use these estimate inputs", {
    people: $people, hours: $hours, rate: $rate, total: $people * $hours * $rate
  }), {variant: "primary"})
]);
```

## Example: explore without sending an answer

Use `interaction: "local"`, `presentation: "inline"` and `summary: {title: "Hosting explorer"}` with this document. The header supplies the title, so the body starts with the worker control. The supplied prices are illustrative monthly amounts; all changes recompute locally and no final answer is expected:

```openui
$workers = 4;
basic = 10 + 4 * ($workers > 2 ? $workers - 2 : 0);
standard = 20 + 4 * ($workers > 5 ? $workers - 5 : 0);
pro = 40 + 4 * ($workers > 12 ? $workers - 12 : 0);
root = Stack([
  NumberInput("workers", "Requested workers", $workers, {min: 0, max: 100, step: 1}),
  Table(["Plan", "Monthly cost"], [["Basic", basic], ["Standard", standard], ["Pro", pro]]),
  Text("Example prices. Each additional worker costs $4/month.", {tone: "muted"}),
  Button("Reset workers", @Reset($workers))
]);
```

A successful return is `{status: "mounted", widgetId: "..."}`. It contains no selected worker count. F6 moves between chat and the widget; Shift+F6 selects another widget. `/openui-focus [id]` selects one explicitly, and `/openui-close [id]` dismisses it without sending values. Focus changes, Reset, dismissal and subsequent chat never submit an answer. Local mode rejects fullscreen, ToAssistant, legacy string submissions and unsupported external actions.

Live state stays with its widget across ordinary turns. Session navigation or shutdown disposes that state and input handlers; restoring a session or replaying a branch reconstructs still-open widgets from their original source/defaults. Explicitly dismissed widgets stay closed. Edited values and cursor state are not persisted. Pi compaction disposes widgets whose transcript rows are removed; widgets still in the visible branch retain live state. At most 16 widgets can remain active. If the task needs a durable final choice for the agent, use a separate collect-mode form and let the user supply it explicitly.

## Code and notebook execution

When `show_ui` is callable through native `codemode`, await it. A local call returns `status: "mounted"` once its transcript widget is installed; the cell and agent turn can finish while the widget remains usable. Display-only inline calls return `status: "displayed"` immediately. A collect-mode form stays pending during editing, then returns submission or `{status: "cancelled"}`. Code after the await handles that result without a notebook restart. Avoid short script deadlines and concurrent answer-collecting forms.

```js
const result = await tools.show_ui({
  source: 'root = Stack([Select("depth", "Review depth", ["Focused", "Thorough"], "Focused"), Button("Send choice", @ToAssistant("Use this review depth"))]);',
  summary: { title: "Review depth", fields: ["depth"] }
});
if (result.status === "submitted") {
  text({ status: result.status, depth: result.values.depth });
} else {
  text(result); // cancellation/display/diagnostics are ordinary outcomes
}
```

Only script output reaches the model after native code mode finishes. Output the result or the fields needed for the next step; retaining a value in a JavaScript variable alone does not return it to the model. The receipt changes terminal presentation while preserving the script's output data. Keep `show_ui` active alongside `codemode`; keep `read` or `bash` available for Pi's skill discovery and loading.

`@howaboua/pi-codex-conversion` 4.0.7 exposes the same `await tools.show_ui(...)` call and structured result through its Code/Notebook tool bridge. Use the adapter's advertised enclosing execution tool; do not assume it is named `codemode`. Notebook bindings persist between cells, so avoid redeclaring an existing top-level `const`. Other adapters may expose a different namespace or envelope: follow their discovered API. Await the UI, inspect its status before using answers, and emit the relevant typed result for the model. A cancelled form supplies no choices. Branch on its status before using values or calling tools that depend on a submitted answer. Inline/fullscreen presentation and component semantics are the same whichever adapter invokes the tool.

A local widget is independent of the originating code/notebook cell after `mounted` returns; later chat messages do not submit or freeze it. No background tool invocation or model turn is needed for its edits. The conversion integration keeps a pending collect-mode `show_ui` attached to its enclosing cell even if the cell's yield budget elapses. Do not interpret elapsed yield time as a user response or launch another UI to replace the waiting one. Both submission and cancellation finish the UI call and return their structured result to the waiting code.

Form dismissal leaves the running cell and notebook state intact in conversion Code, Deno Notebook, JavaScript Notebook and TypeScript Notebook modes. Do not restart a notebook because a form returned `cancelled`. A separate host stop, timeout or session shutdown follows the host's normal cancellation lifecycle.
