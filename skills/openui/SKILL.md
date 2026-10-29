---
name: openui
description: Choose and build useful interactive terminal interfaces with show_ui and OpenUI Lang. Use for structured decisions, comparing alternatives, exploring how inputs change outcomes, collecting related answers, or guiding a workflow, even when the user has not explicitly requested a UI. Covers component selection, grounded data, reactive state, actions, native code mode and themed receipts.
---

# OpenUI in Pi

Use an interactive UI when it helps the user make a decision, compare alternatives, or understand how changing an input affects an outcome. Choose it proactively when useful; the user does not need to request a UI explicitly. Follow the user's preferred medium, and choose the smallest interface that improves the task.

The active `openui` prompt section supplies the component schemas and language rules. Read the [component reference](../../docs/components.md) when you need an exact signature or setting. This skill guides design; use only the supplied terminal catalog. No React, HTML, browser or webview is involved.

## Decide whether interaction helps

Start with the user's goal and available context. Identify what the user should be able to choose, adjust, compare or inspect. If there is no useful interaction, answer directly. Simple facts, short explanations, ordinary progress updates and already-authorized one-step edits usually need prose or the normal tools. A small static comparison can be a table in the conversation. Respect a request for plain text.

`show_ui` opens a modal panel and waits until the user submits or cancels. That interruption should have a purpose. Avoid panels that only decorate a response or demand an acknowledgement before routine work can continue. When the user needs an exported chart, document or other shareable artifact, create the requested artifact using the appropriate tools; a terminal panel is not an export format.

Choose an interaction pattern before selecting components:

| Task | Useful composition |
| --- | --- |
| Collect several related decisions | Brief purpose, Section with typed fields, one final action |
| Compare alternatives and choose | Table with meaningful comparison columns, Select with readable option labels, final choice button |
| Explore a scenario or relationship | NumberInput/Slider/Toggle, derived Text or Table that updates immediately, Reset and a final use-this-choice button |
| Move through a short workflow | Steps with clearly labeled local Next/Back buttons and a final submit action; enforce any necessary validation explicitly |
| Inspect a hierarchy and select an item | Tree with useful labels, relevant supporting details, final selection button |

## Ground and compose the interface

- Use available tools to gather relevant facts missing from context before opening the panel. Use supplied or verified data, preserve units and time ranges, and label assumptions or illustrative numbers. Do not invent availability, prices, measured progress or completed actions.
- Reuse known preferences and prior answers. Ask only for missing decisions, choose reasonable defaults, and leave genuinely optional fields optional. Do not add agreement checkboxes or extra steps to ordinary forms without a task-specific reason.
- Give the screen a clear hierarchy: purpose, essential controls, visible consequences or comparison, then the final action. Use short labels and plain-language descriptions. Group related fields; introduce Tabs, Steps or Cards only when they reduce complexity.
- Make controls meaningful. In an exploration, changing a bound value should update relevant Text, Table or Progress expressions immediately. Keep these local calculations inside the open form rather than requiring another model call for each change. Offer Reset when experimentation is useful.
- Local actions cannot fetch fresh data, run tools or execute scripts. If a choice requires new evidence or external work, submit the choice back to the agent, use the appropriate tools, and continue from the result. Do not label a local state update as a completed deployment, live refresh or actual measured progress.
- Treat Pi's keyboard navigation, resizing and theme as part of the design. Avoid meaning conveyed only by color, excessive nesting, decorative borders, long option labels or layouts that depend on a wide terminal. Use semantic styling sparingly.

Before calling the tool, check that the document is complete, every control serves the task, dependent values are bound correctly, and the final button accurately describes what submitting does.

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
| Update the form or submit a decision | `Button`; label the action clearly, such as “Reset fields” or “Send choices”. |

## Build a usable document

1. Put the question or purpose first. Ask only for information needed for the current task, and use existing context for sensible defaults.
2. Declare `$variables` with the correct types: strings for text, dates and single selections; booleans for Checkbox/Toggle; numbers for NumberInput/Slider; string arrays for MultiSelect.
3. Give every field a unique name, including Tabs/Steps. Names are data keys; labels are what the user reads. Keep option, page and tree values unique.
4. Use common `{description, required, disabled, error}` settings only when needed. Required boolean fields must be true. A disabled field retains its value in the submitted result. Disabled Tabs/Steps also disable their descendants.
5. Keep the main action obvious. With several pages, put the final submit button outside the page group. Hidden fields retain their values and still validate; failed submission reveals an invalid enabled field.
6. Design for keyboard use: Tab moves focus, arrows navigate, Space toggles choices, and Enter activates buttons. TextArea uses Enter for newlines and Ctrl+Enter to advance. Fullscreen Pi also supports mouse input. Regular TUI mode remains usable by keyboard.

Submit a complete OpenUI Lang document in `source`, without Markdown fences. Streaming previews are read-only until the final document is valid; do not rely on users editing an unfinished document. Open only one panel at a time. Escape and Ctrl+C cancel.

## Local actions and submission

- `@Set($variable, expression)` and `@Reset($variable, ...)` update the current panel without closing it.
- `Action([...])` runs supported steps in order, up to 32 steps. Each step sees preceding state changes. A failed structural update rolls the plan back.
- `@ToAssistant(message, context?)` submits the current typed values and closes the panel. If used in a plan, it must be the final step. A legacy string action identifier also submits.
- All update targets must be declared variables. Query, Mutation, `@Run`, `@OpenUrl` and external tool execution are unsupported button actions.

Check the result's `status`. On `submitted`, use the actual `values` for field answers and `context` for any supplied action payload; do not reconstruct answers from defaults or the receipt. On `cancelled`, stop that input flow and respect the cancellation. On `error`, use the diagnostics to correct the specific problem instead of resending the same document. If a valid UI cannot be produced, explain the issue and use an appropriate conversational fallback. Do not turn cancellation into an automatic retry.

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

For a comparison, summarize the chosen alternative and key parameters. For an exploration, summarize the inputs the user settled on and include derived outputs in the action context when useful. For a workflow, summarize the final decisions rather than the tab or step visited. Request only actual field names in `summary.fields`; display-only computed values are not fields.

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

## Example: explore a scenario locally

For an illustrative work estimate, use `summary: {title: "Work estimate", fields: ["people", "hours", "rate"]}`. These defaults are examples, not verified prices. Changing a control recomputes the table immediately; the final context carries the derived total.

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

## Native code mode

When `show_ui` is callable through native `codemode`, await it. The promise stays pending while the user edits fields and runs local actions, then resolves on submission or cancellation. Avoid short script deadlines and concurrent panels.

```js
const result = await tools.show_ui({
  source: 'root = Stack([Select("depth", "Review depth", ["Focused", "Thorough"], "Focused"), Button("Send choice", @ToAssistant("Use this review depth"))]);',
  summary: { title: "Review depth", fields: ["depth"] }
});
text(result);
```

Only script output reaches the model after native code mode finishes. Output the result or the fields needed for the next step; retaining a value in a JavaScript variable alone does not return it to the model. The receipt changes terminal presentation while preserving the script's output data. Keep `show_ui` active alongside `codemode`; keep `read` or `bash` available for Pi's skill discovery and loading. This extension targets native Pi code mode; third-party notebook adapters use separate APIs.
