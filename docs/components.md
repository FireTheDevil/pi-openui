# Terminal component catalog

Run `/openui-demo --catalog` to explore all 25 components, or add `--stream` to watch the document arrive. The demo has Forms, Layout, Display and Advanced pages. Complete the required Owner and confirmation fields before submitting. Reset restores the document's defaults.

Every component is specified through `@openuidev/lang-core` and rendered using Pi's native TUI. Use `root = Stack([...])`. Arguments are positional in the order below; `?` marks an optional argument. The existing six component signatures remain compatible.

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
| Button | `Button(label, action, settings?)` | runs an action; not a field |

Names must be unique across the entire document, including inactive pages. Bind each field to a declared `$variable` of the appropriate type. Literal initial values also work. Submitted `values` preserve booleans, numbers and string arrays; they are not converted to strings. `state` contains the declared `$variables` and unbound field state.

Common field settings are `{description?, required?, disabled?, error?}`. Descriptions provide help below the label. Required values and explicit error messages block submission while keeping the form editable. Required booleans must be true; required multiple selections must contain at least one value. Disabled fields skip keyboard focus and ignore edits; their values are still returned, and their validation errors do not block submission.

Additional settings:

- TextArea: `rows` sets its visible editor height from 5 through 12.
- NumberInput: `min`, `max`, and positive `step` constrain and increment the number.
- DatePicker: `minDate` and `maxDate` use valid `YYYY-MM-DD` dates. Optional dates may be empty. There is no time or timezone field.
- Button: `variant` is `primary`, `secondary` or `danger`; `disabled` and `description` are supported. The variant changes appearance, not action behavior.

For Input or TextArea, use `null` when omitting the placeholder but supplying settings: `Input("owner", "Owner", $owner, null, {required: true})`.

Select and MultiSelect accept strings or rich options:

```text
[{value: "quick", label: "Quick pass", description: "Focused changes"},
 {value: "deep", label: "Deep review"},
 {value: "unavailable", label: "Unavailable", disabled: true}]
```

Option values must be unique. Labels and descriptions are display text; the stored value is `value`. Disabled options cannot be chosen by the user. A MultiSelect value is a unique subset of the options.

Tree nodes use `{value, label, children?, description?, disabled?}` recursively. Values are unique throughout the tree. A disabled parent also disables its descendants. Trees support at most 200 nodes and 16 levels. Expansion is local presentation state; selection is the bound field value.

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

Row settings accept `gap`, an integer from 0 through 8. Section and Card settings accept `description` and `tone`. Tabs and Steps use common field settings. Their items have the shape `{value, label, children}`; values must be unique and the bound value must identify an item.

Only the selected page renders and receives focus. All pages still participate in validation and submitted values. A hidden required field can therefore block submission; the view opens its page and focuses the field so the user can correct it. A disabled Tabs or Steps group also disables all its descendants: they cannot receive focus, edits or button activations, and their validation does not block submission. Their values are still returned. Local actions outside the group can update or reset its state. Navigation also works through local actions such as `@Set($page, "advanced")` or `@Reset($step)`.

## Display

| Component | Signature | Behavior |
| --- | --- | --- |
| Text | `Text(text, settings?)` | Plain text with optional tone, bold and italic |
| Markdown | `Markdown(text)` | Native terminal Markdown rendering |
| CodeBlock | `CodeBlock(code, language?)` | Source code with an optional language label |
| List | `List(items, ordered?)` | String items with bullets or numbering |
| Badge | `Badge(text, tone?)` | Compact status label; accent tone by default |
| Progress | `Progress(value, max?, label?)` | Progress from zero through max; max defaults to 100 |
| Table | `Table(columns, rows)` | Read-only table; scalar cells and equal column counts |

Tones are `default`, `muted`, `accent`, `success`, `warning` and `error`. Text settings are `{tone?, bold?, italic?}`. Colors come from Pi's active theme. Markdown and code stay in the terminal; no browser, React or webview is involved.

Display properties may depend on state. For example, `Text("Retries: " + $retries)`, `Progress($done, 5, "Checks")` and `Table(["Enabled"], [[$enabled]])` update immediately when their dependencies change.

## Keyboard and mouse

Tab and Shift+Tab move between enabled controls on the visible page. Escape or Ctrl+C cancels the panel. Page Up and Page Down scroll the panel; when a calendar is focused they change months. Fullscreen mode also supports pointer input; regular terminal mode retains keyboard interaction.

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

Click controls to focus them; click a list option to select it, a checkbox to toggle it, or a button to activate it. Input and TextArea clicks place the text cursor. Tree disclosure markers expand or collapse branches; labels select nodes. Wheel input over a choice list moves its active option; Select also selects that option, while MultiSelect requires Space or a click to toggle it. Elsewhere the wheel scrolls the panel. Hit targets follow resizing, nested layouts and viewport scrolling.

## Actions and validation

`@Set`, `@Reset` and ordered `Action([...])` plans update local state without closing. `@ToAssistant(message, context?)` or a legacy action identifier submits current typed values to Pi. A plan validates before committing; failed structural updates roll back. See the README for the action contract and native code-mode examples.

Required fields, explicit `settings.error`, invalid numeric drafts and invalid dates show errors that can be corrected. Invalid document structure, duplicate names, unknown components and malformed source produce diagnostics instead of executing actions. Streaming previews remain read-only until complete; cancellation is always available.

The catalog demo, model tests, native-control tests and actual Pi CLI runs cover layout navigation, typed fields, validation, local actions, submission, resizing and cancellation. See the [catalog gallery](catalog-demo.md) for actual terminal captures.
