# Collect answers for subsequent work

Use collect mode only when the agent needs an answer. For optional exploration, use [local exploration](local-exploration.md). These examples use illustrative review choices and work estimates, not observed project requirements or verified prices.

For each example, pass the complete OpenUI document below as `source` together with the listed JSON arguments to `show_ui`. Source is a string, without the Markdown fences.

## Collect one decision

Use when the review depth is missing from the user's request. A conversational question may suffice for a single choice.

```json
{
	"interaction": "collect",
	"presentation": "inline",
	"summary": {"title": "Review depth", "fields": ["depth"]}
}
```

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

The form waits. Submission returns `status: "submitted"` and `values.depth` as the chosen stable string. Cancellation returns `cancelled` without answers. Never infer the focused default as a choice.

## Collect related typed settings

Use when the task needs an owner, check selection, retry limit, and explicit review confirmation. This illustrative task specifically requires owner and confirmation. Omit the checkbox for ordinary configuration that needs no agreement.

```json
{
	"interaction": "collect",
	"presentation": "inline",
	"summary": {"title": "Review configuration", "fields": ["owner", "checks", "retries", "confirmed"]}
}
```

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

The initial owner and confirmation are invalid. The form remains editable and cannot submit until both requirements are satisfied. Reset restores all defaults, including those errors. Submission preserves the string, string array, number, and boolean types. It does not run checks or assign an owner externally.

## Explore and submit an estimate

Use when the agent needs chosen inputs after the user explores their consequences. Unlike a local calculator, this form waits for an explicit answer. The illustrative rate is USD per person-hour and excludes taxes and other costs.

```json
{
	"interaction": "collect",
	"presentation": "inline",
	"summary": {"title": "Work estimate", "fields": ["people", "hours", "rate"]}
}
```

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

Changing controls recomputes the table immediately. Reset restores 2 people, 3 hours, and a rate of 50. Submission returns those actual inputs in `values` and the derived total in `context`. The computed total is not a field, so it is not listed in `summary.fields`.

## Handle the result

Only `submitted` supplies answers. Read actual `values` and optional `context`, not defaults or receipt text. A receipt acknowledges input, not completed external work or blanket approval. Preserve all task-specific external-action approval requirements.

Cancellation supplies no values. Skip answer-dependent work without substituting defaults or reopening the form. Independently authorized work may continue. Awaiting code and notebook state remain intact. Emit needed result fields from enclosing code so the model receives them.

See [tool execution](../../../docs/tool-api.md#native-code-mode), [cancellation and execution modes](../../../docs/inline-ui.md#cancellation), and [receipt selection](../../../docs/submission-summaries.md).
