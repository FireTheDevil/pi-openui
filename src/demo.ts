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
