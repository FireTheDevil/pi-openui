# Edit typed records

Use EditableTable for bounded edits to plain records. Use read-only Table for comparisons. These task records are illustrative, not observed work or completed checks.

Pass the complete document as `source` with these `show_ui` arguments:

```json
{
	"interaction": "collect",
	"presentation": "inline",
	"summary": {"title": "Review tasks", "fields": ["tasks"]}
}
```

```openui
$tasks = [{task: "Inspect callers", hours: 2, ready: false}, {task: "Review findings", hours: 1, ready: true}];
root = Stack([
	Text("Illustrative review tasks. Valid cell edits update locally; Send tasks supplies an answer, not an external write."),
	EditableTable("tasks", "Review tasks", [
		{key: "task", label: "Task", type: "string"},
		{key: "hours", label: "Hours", type: "number"},
		{key: "ready", label: "Ready", type: "boolean"}
	], $tasks),
	Button("Reset tasks", @Reset($tasks), {variant: "secondary"}),
	Button("Send tasks", @ToAssistant("Use these review tasks"), {variant: "primary"})
]);
```

The form waits for submission or cancellation. Valid string and numeric keystrokes apply locally immediately; booleans toggle immediately. Enter exits a valid edit, rather than committing later. Send tasks returns `status: "submitted"` with `values.tasks` as plain records preserving string, number, and boolean cell types. Cancellation supplies no records.

Edits alone are not an answer or external persistence. Submission is input, not proof that a file was updated or permission for unrelated actions. There are no Save/Discard controls.

Invalid numeric text stays visible while preserving the last valid typed value. It blocks collection only, including when hidden, without locking navigation, other fields, or local actions. Failed collection reveals the first invalid cell. Reset restores the original rows and clears cell buffers even if typed values have not changed.

Columns have unique `key`, `label`, and `type` properties, where type is string, number, or boolean. Each row must match the keys and types exactly. No null cells, extra keys, helper components, or row insertion/deletion are supported. See the [editable-table schema and controls](../../../docs/components.md#editable-tables) for limits and editing behavior.

For exploration with no answer, remove Send tasks and set `interaction: "local"`. Expect `mounted` with no values and no later answer. Never leave a hidden submission path in local mode. See [local exploration](local-exploration.md), [answer handling](answer-collection.md#handle-the-result), and [tool actions](../../../docs/tool-api.md#button-actions).
