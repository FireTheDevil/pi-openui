# Explore without sending an answer

Use a local widget when controls help the user inspect a relationship but the agent does not need a choice. This calculator uses illustrative monthly prices, not verified offers.

Pass this complete document as `source` with these `show_ui` arguments:

```json
{
	"interaction": "local",
	"presentation": "inline",
	"summary": {"title": "Hosting explorer"}
}
```

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

The header supplies the title, so the body starts with the worker control. Each plan's base price includes a worker allowance. The formula adds $4 per worker above that allowance.

The expected result is `{status: "mounted", widgetId: "..."}`, without a selected worker count. The call, cell, and agent turn can finish. Do not poll for a later answer. At 4 workers the prices are 18, 20, and 40 USD. At 10 they are 42, 40, and 40 USD. Reset restores 4 workers and the original totals.

Edits and Reset recompute locally. They cannot fetch data, call tools, or execute external work. No submit action is allowed, including hidden or conditional paths. Use a separate [collect-mode form](answer-collection.md) if the agent needs an answer.

## Keep exploration local

F6 moves between chat and a widget; Shift+F6 cycles visible widgets. F2 or the header expands/collapses within the transcript, not fullscreen. Escape/Ctrl+C returns focus to chat without dismissal or submission. Ctrl+Page Up/Down pages the widget viewport independently of its focused control.

Use host controls rather than generated Hide/Restore buttons. Hide retains edits and navigation behind a Restore placeholder. Close permanently discards the widget. Commands include `/openui-focus [id]`, `/openui-hide [id]`, `/openui-restore [id]`, and `/openui-close [id]`. Restore without an ID selects the most recently hidden widget.

Ordinary turns and later chat leave the widget live. Replay restores original defaults, visible and compact, not edits, cursor state, navigation, or expansion/hidden state. Explicitly closed widgets stay closed. Session navigation/shutdown releases live state, and compaction disposes widgets whose rows disappear. At most 16 active widgets, including hidden ones, may coexist; hiding does not free a slot.

See [local interaction and lifecycle](../../../docs/local-interaction.md) for the full focus, host keyboard/mouse, overflow, replay, and disposal contract. Read [tool execution](../../../docs/tool-api.md#native-code-mode) before invoking through code or a notebook.
