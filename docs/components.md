# Terminal component catalog

Run `/openui-demo --catalog` to explore all 29 components, or add `--stream` to watch the document arrive. The demo has Forms, Layout, Display and Advanced pages. Complete the required Owner and confirmation fields before submitting. Reset restores the document's defaults.

The same component catalog supports three contracts: static inline display, `interaction: "local"` for persistent exploration without an answer, and default/`interaction: "collect"` for a form that waits for input. Local mode is not limited to form fields: Tabs, Tree, local disclosure buttons and reactive text/table combinations work too. Removing a Submit button does not change the default waiting contract. See [local interaction](local-interaction.md) for focus and lifecycle.

Every component is specified through `@openuidev/lang-core` and rendered using Pi's native TUI. Use `root = Stack([...])`. Arguments are positional in the order below; `?` marks an optional argument. The original 25 component signatures remain compatible.

Local widgets already display `summary.title` in their header (or “Local explorer” by default). Begin the body with useful context or controls, without repeating that title as the first Text or Markdown heading. Keep Section/Card titles and other headings for distinct internal groups. Static displays and collecting forms retain their existing heading behavior.

## Fields and controls

| Component | Signature | Stored value |
| --- | --- | --- |
| Input | `Input(name, label, value, placeholder?, settings?)` | string |
| Select | `Select(name, label, options, value, settings?)` | selected option's string value |
| Checkbox | `Checkbox(name, label, value, settings?)` | boolean |
| MultiSelect | `MultiSelect(name, label, options, value, settings?)` | array of selected string values |
| TextArea | `TextArea(name, label, value, placeholder?, settings?)` | multiline string |
| NumberInput | `NumberInput(name, label, value, settings?)` | finite number |
| Toggle | `Toggle(name, label, value, settings?)` | boolean |
| Slider | `Slider(name, label, value, min, max, step?, settings?)` | finite number |
| DatePicker | `DatePicker(name, label, value, settings?)` | `YYYY-MM-DD` string |
| Tree | `Tree(name, label, nodes, value, settings?)` | selected node's string value |
| EditableTable | `EditableTable(name, label, columns, value, settings?)` | array of typed plain records |
| Button | `Button(label, action, settings?)` | runs an action; not a field |

Names are data keys, not display labels. They match `^[A-Za-z_][A-Za-z0-9_-]{0,63}$` and contain at most 64 characters, for example `deployment_region`. Legacy action identifiers use the same name schema. Names must be unique across the entire document, including inactive pages. Bind each field to a declared `$variable` of the appropriate type. Literal initial values also work. Submitted `values` preserve booleans, numbers, string arrays and table records; they are not converted to strings. `state` contains the declared `$variables` and unbound field state.

Common field settings are `{description?, required?, disabled?, error?}`. Descriptions provide help below the label. Required values and explicit error messages block submission while keeping the form editable. Required booleans must be true; required multiple selections must contain at least one value. Disabled fields skip keyboard focus and ignore edits; their values are still returned, and their validation errors do not block submission.

Additional settings:

- TextArea: `rows` is an integer from 5 through 12 that sets its maximum visible editor height.
- NumberInput: `min`, `max`, and positive `step` constrain and increment the number.
- DatePicker: `minDate` and `maxDate` use valid `YYYY-MM-DD` dates. When both bounds exist, `minDate <= maxDate`. Optional dates may be empty. There is no time or timezone field.
- Button: `variant` is `primary`, `secondary` or `danger`; `disabled` and `description` are supported. The variant changes appearance, not action behavior.

For Input or TextArea, use `null` when omitting the placeholder but supplying settings: `Input("owner", "Owner", $owner, null, {required: true})`.

Select and MultiSelect accept strings or rich options:

```text
[{value: "quick", label: "Quick pass", description: "Focused changes"},
 {value: "deep", label: "Deep review"},
 {value: "unavailable", label: "Unavailable", disabled: true}]
```

Select and MultiSelect each require 1 through 200 options. Option values must be unique. A single selection must identify an existing option, even when optional. Use `[]` for an empty MultiSelect selection, not an empty options list. Labels and descriptions are display text; the stored value is `value`. Disabled options cannot be chosen by the user. A MultiSelect value is a unique subset of the options.

Tree nodes use `{value, label, children?, description?, disabled?}` recursively. Values are unique throughout the tree. A disabled parent also disables its descendants. Trees require 1 through 200 root nodes and support at most 200 total nodes and 16 levels. Child arrays may be empty. Expansion is local presentation state; selection is the bound field value.

## Editable tables

`columns` contains 1 through 20 plain records shaped `{key, label, type}`. Each unique `key` follows the field-name syntax. `type` is `string`, `number` or `boolean`. `value` contains at most 200 plain records with exactly those keys and matching cell types. Numbers must be finite. Null cells, extra keys, row insertion, row deletion and helper components are unsupported. String cells have the usual 4,000-character limit. Common field settings apply; `required` rejects an empty table.

```openui
$tasks = [{task: "Review", hours: 2, ready: false}];
root = Stack([
  EditableTable("tasks", "Review tasks", [
    {key: "task", label: "Task", type: "string"},
    {key: "hours", label: "Hours", type: "number"},
    {key: "ready", label: "Ready", type: "boolean"}
  ], $tasks),
  Button("Send tasks", @ToAssistant("Use these tasks"))
]);
```

Arrows select a cell. Enter or Space starts an edit or toggles a boolean. The native editor stays inside the selected cell, or inside its value region in narrow labeled records. Each valid keystroke applies locally immediately, and booleans toggle immediately. Dependent content uses those typed values before Enter. The editor is single-line; editing multiline string cells replaces line breaks with spaces. Enter exits a valid edit without delaying any update. A cell click starts editing and supports cursor placement. Up and Down select another row without losing invalid text. Left and Right move the caret during editing and select columns otherwise.

Invalid numeric intermediates remain visible in their cells, including inactive cells marked with `!`. They preserve the last valid typed model value and block collection through the view's cached-control validation, even on hidden pages. Other fields, pages, local actions and tables remain usable. Failed collection reveals and scrolls to the first invalid cell in row and column order. Correcting it makes the next invalid cell the target. Direct model access sees only committed typed values, as with NumberInput.

There are no Save or Discard controls or table-specific shortcuts. Edits do not submit or persist data externally. Reset clears cell buffers even when committed values are unchanged. External row, column or binding changes clear index-addressed editors and clamp selection. Rejected model transactions restore the authoritative cell value. Disabled tables clear buffers, and removed tables lose their controls. Escape retains the host contract, cancelling a collect form or returning a local widget to chat.

Tables have vertical column borders and horizontal top, header, row and bottom separators. Narrow terminals show bordered labeled records with row separators instead of squeezing columns. The original `Table` stays read-only and retains its existing rendering.

## Layout and navigation

| Component | Signature | Behavior |
| --- | --- | --- |
| Stack | `Stack(children)` | Vertical layout and document root |
| Row | `Row(children, settings?)` | Horizontal children; stacks them when the terminal is narrow |
| Section | `Section(title, children, settings?)` | Titled content group |
| Card | `Card(title, children, settings?)` | Bordered content group |
| Divider | `Divider(label?)` | Horizontal separator, optionally labeled |
| Tabs | `Tabs(name, items, value, settings?)` | Selectable pages with string state |
| Steps | `Steps(name, items, value, settings?)` | Ordered workflow pages with string state |
| Accordion | `Accordion(name, label, children, value, settings?)` | Boolean disclosure with component children |

Row settings accept `gap`, an integer from 0 through 8. Section and Card settings accept `description` and `tone`. Tabs and Steps use common field settings. Each requires 1 through 200 items with the shape `{value, label, children}`; values must be unique and the bound value must identify an item.

Only the selected page renders and receives focus. All pages still participate in validation and submitted values. A hidden required field can therefore block submission; the view opens its page and focuses the field so the user can correct it. A disabled Tabs or Steps group also disables all its descendants: they cannot receive focus, edits or button activations, and their validation does not block submission. Their values are still returned. Local actions outside the group can update or reset its state. Navigation also works through local actions such as `@Set($page, "advanced")` or `@Reset($step)`.

Accordion uses common field settings and a boolean value. Chevrons show disclosure state. Expanded children use tree rails and branch connectors. Enter or Space toggles it. Left closes it and Right opens it. Clicking its heading toggles it. Collapsed children retain values and drafts, participate in validation and submission, and leave the focus cycle. Failed submission opens every enclosing disclosure and page before focusing the invalid field. Disabled Accordion groups also disable their descendants. Disclosure values appear in structured results but are omitted from automatic receipts.

## Display

| Component | Signature | Behavior |
| --- | --- | --- |
| Text | `Text(text, settings?)` | Plain text with optional tone, bold and italic |
| Markdown | `Markdown(text)` | Native terminal Markdown rendering |
| CodeBlock | `CodeBlock(code, language?)` | Source code with an optional language label |
| List | `List(items, ordered?)` | String items with bullets or numbering |
| Badge | `Badge(text, tone?)` | Compact status label; accent tone by default |
| Progress | `Progress(value, max?, label?)` | Progress from zero through max; max defaults to 100 |
| BarChart | `BarChart(data, settings?)` | Display-only horizontal or vertical bars for ordered `{label, value}` records |
| Table | `Table(columns, rows)` | Read-only table; scalar cells and equal column counts |
| Callout | `Callout(title, text, settings?)` | Semantic notice with optional local dismissal |

Text-bearing strings contain at most 4,000 characters, including labels, text, code, placeholders, descriptions, errors, option/page/tree values, string field values, list items and table string cells. Names have their separate restriction. Tables require 1 through 20 columns and allow at most 200 rows. Lists allow at most 200 items. Progress `max` must be strictly positive when supplied and defaults to 100.

BarChart accepts zero through 200 records with string labels and finite signed values. Duplicate and empty labels are valid; empty labels display as `(unnamed)`. Labels are sanitized and newlines become spaces. Input order is preserved. Empty data displays `(no data)`. Bars share an explicit zero axis. Negatives extend left or down and positives right or up. Omitted bounds use `min(0, values)` and `max(0, values)`. Negative-only automatic data ends at zero. An explicit `min` must be finite, nonpositive and at most every data value. `min: 0` prohibits negative edits. An explicit `max` must be finite, strictly positive and at least every data value. Invalid bounds and values outside explicit bounds produce diagnostics and reject local edits through the normal transaction rollback. The chart never clamps values or expands an explicit bound. A muted, wrapped `Scale: minimum..maximum` caption shows the actual range on plotted charts and record fallback. All-zero automatic data shows `Scale: 0..0`. Empty automatic data shows only `(no data)`; empty fixed-scale data also shows its range. All-zero data has no filled bars. Tiny signed values can round to zero cells; exact JavaScript `String(value)` numbers remain visible. Nonfinite values produce diagnostics, not clamped bars. `max: 500` remains an upper bound, not a magnitude limit. `{min: -500, max: 500}` fixes a bidirectional range.

`settings` accepts `{orientation?: "horizontal" | "vertical", min?: number, max?: number}`. The numeric domain controls scaling, not terminal-cell width. Omitted settings or orientation preserves horizontal bars. Charts stay left-aligned and size automatically from their allocated child width and category count, including inside Row. A balanced fraction of that width grows with category count, with additional room for labels and exact numbers. Charts do not blindly fill the terminal. Numeric range is independent of physical size, so charts with different allocated widths can have different geometry with the same domain. In horizontal mode, bars stay one row high and use the target width remaining after numeric and label lanes. Long labels wrap separately above their bars, to at most two rows. If labels need more rows or fewer than four bar cells remain, the chart wraps complete `label: value` records instead.

Vertical mode uses equal category slots, proportional gaps and a two-cell axis area. Plot height is `max(1, round(plotWidth / 5))`, independent of the root viewport height. Columns occupy about 70% of a slot, capped by plot height to keep a single category reasonable. Bars, labels and exact numbers are centered within each slot. Labels wrap to at most two rows below the entire plot, followed by an exact-value row. Signed coordinates share one scale across zero, with no independently stretched halves. With extent `P`, `M = max(abs(min), abs(max))`, `a = -min/M`, and `b = max/M`, coordinates are `round(P * ((value/M + a)/(a+b)))`. Bars fill between the zero and value coordinates. This avoids subtracting extreme endpoints, which can overflow. The zero domain has no ink. Positive-only geometry retains `round(P * (value / max))`. There is no artificial minimum ink for tiny values. Slots reserve at least three cells, every exact number and, when supplied, both explicit endpoint text widths. If that reservation or complete labels cannot fit, the chart uses wrapped records without truncating category identities. Larger charts can overflow a collapsed document or local widget. Expand the document or expand and scroll the widget to inspect all content.

Titles and units belong in surrounding Text. There are no chart controls, actions or submitted chart values. Separate charts scale independently unless given the same explicit bounds. Matching numeric ranges do not guarantee equal terminal geometry. For direct visual comparison, prefer one chart or matching orientations and allocations. Use fixed bounds matching control bounds for reactive comparisons. Automatic scaling remains useful for static comparisons. Reactive data updates locally; replay restores source defaults, not edits.

At unchanged width, labels, orientation and numeric-text budget, geometry stays stable. Explicit endpoints reserve both `String(min)` and `String(max)` widths for numeric text. Integer edits from -200 through 200 with `{min: -200, max: 200}` keep geometry stable as values cross zero. Longer exact fractions can increase the numeric budget or trigger complete-record fallback. Huge range captions can wrap without changing plot geometry. Bars use integer-cell quantization, not fractional blocks. Exact numbers are never truncated.

```openui
root = Stack([
	Text("Illustrative requests by service"),
	BarChart([{label: "API", value: 120}, {label: "Worker", value: -75}, {label: "Scheduler", value: 0}], {orientation: "vertical", min: -200, max: 200})
])
```

Tones are `default`, `muted`, `accent`, `success`, `warning` and `error`. Text settings are `{tone?, bold?, italic?}`. Colors come from Pi's active theme. Markdown and code stay in the terminal; no browser, React or webview is involved.

Callout settings accept `tone` and `dismissible`. A padded box surrounds the heading, body and optional dismissal control. The border uses the theme tone, and the heading names the tone as well as using its color. Without `dismissible: true`, a Callout is display-only. With it, **Dismiss notice** is a keyboard and mouse control. Dismissal is local presentation state. It does not set a variable, validate a field, submit an answer or dismiss another notice. A new view starts with its notices visible.

Display properties may depend on state. For example, `Text("Retries: " + $retries)`, `Progress($done, 5, "Checks")`, `BarChart([{label: "Done", value: $done}], {max: 5})` and `Table(["Enabled"], [[$enabled]])` update immediately when their dependencies change.

## Keyboard and mouse

Tab and Shift+Tab move between enabled controls on the visible page. In collect mode, F2 expands/collapses the form and Escape/Ctrl+C returns `status: "cancelled"` to its waiting caller. In local mode, F6 transfers focus between chat and the widget; Shift+F6 cycles widgets; Escape/Ctrl+C returns focus to chat without dismissal or submission. F2 or the widget's Expand/Collapse header control changes its height within the transcript while preserving edits and local navigation; it does not enter fullscreen or collect an answer. Expand appears only when content overflows and a taller viewport can reveal more. F2 follows the same rule and otherwise does nothing in compact mode. Collapse remains available while expanded, even after content fits. Widgets start compact and show a scrollbar when content overflows, with a compact footer range where no useful rail fits. See the [local height and overflow policy](local-interaction.md#height-and-overflow). Hide reduces a local widget to a one-line Restore placeholder without discarding its values or navigation state. `/openui-hide [id]` and `/openui-restore [id]` provide keyboard access; restore defaults to the most recently hidden widget. Hidden widgets leave the status hint and focus cycle. Close permanently dismisses either a visible or hidden widget. See [hide and restore](local-interaction.md#hide-and-restore). Ctrl+Page Up/Down always scrolls a local widget's viewport. Pi 1.5 fullscreen also forwards plain Page Up/Down to the widget; Pi 1.4 fullscreen reserves them for transcript scrolling. Where the host forwards them, plain paging scrolls the view unless the focused control consumes it, such as DatePicker changing months or TextArea paging its editor. Pi's fullscreen host supports pointer input; regular terminal mode retains keyboard interaction.

| Control | Keys |
| --- | --- |
| Input | Native editing; Enter advances |
| Select | Up/Down selects; Enter advances |
| Checkbox / Toggle | Space or Enter changes the boolean |
| MultiSelect | Up/Down moves; Space toggles the current option; Enter advances |
| TextArea | Native multiline editing; Enter inserts a newline; Ctrl+Enter advances |
| NumberInput | Edit the numeric draft; Up/Down steps; Enter advances once finite |
| Slider | Left/Down decreases, Right/Up increases; Home/End chooses a bound; Enter advances |
| DatePicker | Left/Right changes a day, Up/Down changes a week; Page Up/Down changes a month; Enter advances |
| Tree | Up/Down moves; Right expands or enters a child; Left collapses or moves to a parent; Space/Enter selects |
| Tabs / Steps | Left/Right changes the selected page; Home/End chooses the first/last page; Enter, Down or Tab advances focus |
| Button | Enter or Space activates |
| Accordion | Enter or Space toggles; Left closes; Right opens |
| Callout | Enter or Space activates its explicit dismissal control |
| EditableTable | Arrows select; Enter edits or exits a valid edit; Space edits or toggles; valid edits apply immediately |

Click controls to focus them; click a list option to select it, a checkbox to toggle it, or a button to activate it. Input and TextArea clicks place the text cursor. Tree disclosure markers expand or collapse branches; labels select nodes. Wheel input over a choice list moves its active option; Select also selects that option, while MultiSelect requires Space or a click to toggle it. Elsewhere the wheel scrolls the panel. Hit targets follow resizing, nested layouts and viewport scrolling.

## Actions and validation

`@Set`, `@Reset` and ordered `Action([...])` plans update local state without closing. In collect mode, `@ToAssistant(message, context?)` or a legacy action identifier submits current typed values to Pi. Local mode rejects submission and external action paths before mounting, including hidden/conditional buttons; its Action plans may contain only Set/Reset. A plan validates before committing; failed structural updates roll back. See the README for the action contract and native code-mode examples.

Required fields, explicit `settings.error`, invalid numeric drafts and invalid dates show errors that can be corrected. Invalid document structure, duplicate names, unknown components and malformed source produce diagnostics instead of executing actions. Collect-mode streaming previews remain read-only until complete, with cancellation available. Local widgets mount only from complete, valid documents; Escape returns focus to chat and `/openui-close [id]` dismisses one.

The catalog demo, model tests, native-control tests and actual Pi CLI runs cover layout navigation, typed fields, validation, local actions, submission, resizing and cancellation. See the [catalog gallery](catalog-demo.md) for actual terminal captures.
