/** All six components, bindings, and a derived value evaluated by lang-core. */
export const DEMO_SOURCE = `$choice = "Review";
$note = "";
root = Stack([
  Text("OpenUI in Pi — use Tab to move, arrows to select, and Enter to submit."),
  Text("Selected: " + $choice),
  Select("choice", "Next step", ["Review", "Implement", "Test"], $choice),
  Input("note", "Instructions", $note, "Add an optional note"),
  Table(["Component", "Purpose"], [["Text / Stack", "Content and layout"], ["Select / Input", "Keyboard editing"], ["Button / Table", "Submit and inspect"]]),
  Button("Send to Pi", "next_step")
]);`;

/** Local action plans keep the UI open; only ToAssistant submits to Pi. */
export const ACTIONS_DEMO_SOURCE = `$count = 0;
$choice = "Review";
$note = "";
$status = "Draft";
root = Stack([
  Text("Edit a plan locally. Send it to Pi when you are ready."),
  Text("Count: " + $count + " | Selected: " + $choice + " | Status: " + $status),
  Select("choice", "Next step", ["Review", "Implement", "Test"], $choice),
  Input("note", "Instructions", $note, "Add an optional note"),
  Table(["Field", "Current value"], [["Count", $count], ["Choice", $choice], ["Note", $note], ["Status", $status]]),
  Button("Increment count", @Set($count, $count + 1)),
  Button("Mark ready", Action([@Set($choice, "Implement"), @Set($status, "Ready to send")])),
  Button("Reset all", @Reset($count, $choice, $note, $status)),
  Button("Send to Pi", @ToAssistant("Use this plan", {count: $count, choice: $choice, note: $note, status: $status}))
]);`;
