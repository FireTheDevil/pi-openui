# Display comparisons and optional explanations

Use prose or a Markdown table when that communicates the answer more simply. Choose a widget only when its layout or interaction adds value. State essential conclusions outside optional detail.

For each example, pass the complete document as `source` with the listed `show_ui` arguments.

## Display a static comparison

Use a read-only Table for comparable attributes without a decision to collect. These review categories are illustrative, not observed project facts.

```json
{
	"presentation": "inline",
	"summary": {"title": "Review approaches"}
}
```

```openui
root = Stack([
	Text("Illustrative review approaches", {bold: true}),
	Table(["Approach", "Scope", "Trade-off"], [
		["Focused", "Changed code and nearby tests", "Less context to inspect"],
		["Thorough", "Wider interactions", "More context to inspect"]
	])
]);
```

Expect `status: "displayed"` immediately. There are no fields, buttons, or choices to return. The display grants no approval and reports no completed work. Do not add an acknowledgement button.

## Explain with optional detail

Use local mode for Accordion disclosure and explicit Callout dismissal when no answer is needed. The main explanation remains visible. The example describes illustrative review categories.

```json
{
	"interaction": "local",
	"presentation": "inline",
	"summary": {"title": "Review scope"}
}
```

```openui
$details = false;
root = Stack([
	Text("Focused review examines changed code first. Thorough review also inspects wider interactions."),
	Callout("Example only", "These review categories are illustrative, not a report of completed checks.", {tone: "warning", dismissible: true}),
	Accordion("details", "Why inspect wider interactions?", [
		Markdown("A shared configuration change can affect callers outside the edited file. Inspect those callers when the task warrants it.")
	], $details)
]);
```

Expect immediate `status: "mounted"` plus `widgetId`, without answers. Expanding the Accordion changes its boolean disclosure state locally. Dismissing the Callout changes presentation only, not a field, answer, or approval. No submission path exists. The header supplies the title, so the body does not repeat it.

Hidden Accordion children retain field values and still validate and submit in collect mode. Do not hide essential conclusions or required agreement behind disclosure.

See [component signatures](../../../docs/components.md), [presentation](../../../docs/inline-ui.md), and [local controls and lifecycle](../../../docs/local-interaction.md).
