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

/** The complete terminal catalog, split into navigable pages to fit a real terminal. */
export const CATALOG_DEMO_SOURCE = `$page = "forms";
$step = "plan";
$owner = "";
$priority = "quick";
$accepted = false;
$checks = ["Tests"];
$notes = "";
$count = 2;
$enabled = true;
$ratio = 25;
$date = "2026-11-15";
$tree = "src";
$progress = 2;
$details = false;
$tasks = [{task: "Review types", hours: 2, ready: true}, {task: "Inspect wrapped terminal content", hours: 3, ready: false}];
root = Stack([
  Text("Terminal component catalog", {bold: true}),
  Text("Explore four pages. Local edits stay here until you submit.", {tone: "muted"}),
  Tabs("page", [
    {value: "forms", label: "Forms", children: [
      Section("Review details", [
        Input("owner", "Owner", $owner, "Your name", {required: true}),
        Select("priority", "Review style", [{value: "quick", label: "Quick pass", description: "Focused changes"}, {value: "deep", label: "Deep review", description: "Full inspection"}, {value: "blocked", label: "Unavailable", disabled: true}], $priority),
        Checkbox("accepted", "I reviewed the changes", $accepted, {required: true}),
        MultiSelect("checks", "Checks to run", ["Tests", "Types", "Docs"], $checks),
        TextArea("notes", "Review notes", $notes, "Write a short review", {rows: 5})
      ])
    ]},
    {value: "layout", label: "Layout", children: [
      Section("Responsive layout", [
        Row([
          Card("Current plan", [Text("Cards group related content."), Badge("Ready", "success")]),
          Card("Terminal layout", [Text("Rows wrap vertically when space is limited."), Badge("Native TUI", "accent")])
        ], {gap: 2}),
        Accordion("details", "How disclosure works", [Text("Hidden children keep their values and validation. Enter or Space toggles this explanation.")], $details),
        Divider("Review workflow"),
        Steps("step", [
          {value: "plan", label: "Plan", children: [Text("Choose the scope before reviewing."), Button("Continue to review", @Set($step, "review"))]},
          {value: "review", label: "Review", children: [Text("Inspect changes and run the selected checks."), Button("Mark workflow complete", @Set($step, "done"))]},
          {value: "done", label: "Done", children: [Badge("Workflow complete", "success"), Button("Restart workflow", @Reset($step))]}
        ], $step)
      ])
    ]},
    {value: "display", label: "Display", children: [
      Callout("Illustrative catalog data", "Values in this demo are examples, not measured results.", {tone: "warning", dismissible: true}),
      Markdown("## Readable terminal output\\n**Markdown** preserves emphasis and lists without opening a browser."),
      CodeBlock("const result = await tools.show_ui({ source });\\ntext(result);", "javascript"),
      List(["Local state updates are immediate", "Typed values reach the active Pi session", "Escape cancels without submitting"], true),
      Badge("Framework-free renderer", "accent"),
      Progress($progress, 5, "Checklist complete"),
      Text("Illustrative checklist comparison, items"),
      BarChart([{label: "Complete", value: $progress}, {label: "Remaining", value: 5 - $progress}], {max: 5}),
      Text("Illustrative signed changes, items"),
      BarChart([{label: "Change", value: $progress - 2}, {label: "Offset", value: 2 - $progress}], {orientation: "vertical", min: -5, max: 5}),
      Button("Advance progress", @Set($progress, $progress < 5 ? $progress + 1 : 0)),
      Table(["Field", "Current value", "Type"], [["Owner", $owner, "string"], ["Retries", $count, "number"], ["Enabled", $enabled, "boolean"], ["Selected checks", $checks.length, "array length"], ["Date", $date, "ISO date"]])
    ]},
    {value: "advanced", label: "Advanced", children: [
      Section("Typed controls", [
        NumberInput("count", "Retries", $count, {min: 0, max: 10, step: 1}),
        Toggle("enabled", "Enable checks", $enabled),
        Slider("ratio", "Review coverage", $ratio, 0, 100, 5),
        DatePicker("date", "Target date", $date, {minDate: "2026-01-01", maxDate: "2027-12-31"}),
        Tree("tree", "Project files", [{value: "src", label: "src", children: [{value: "model", label: "model.ts"}, {value: "view", label: "view.ts"}]}, {value: "tests", label: "test", children: [{value: "integration", label: "integration.test.ts"}]}, {value: "locked", label: "archived", disabled: true}], $tree)
      ]),
      EditableTable("tasks", "Illustrative review tasks", [{key: "task", label: "Task", type: "string"}, {key: "hours", label: "Hours", type: "number"}, {key: "ready", label: "Ready", type: "boolean"}], $tasks, {description: "Arrows choose a cell. Enter edits. Valid edits apply locally immediately. Invalid numbers block collection only."})
    ]}
  ], $page),
  Divider(),
  Button("Reset catalog", @Reset($page, $step, $owner, $priority, $accepted, $checks, $notes, $count, $enabled, $ratio, $date, $tree, $progress, $details, $tasks)),
  Button("Submit catalog", @ToAssistant("Use this review configuration", {owner: $owner, priority: $priority, accepted: $accepted, checks: $checks, notes: $notes, retries: $count, enabled: $enabled, coverage: $ratio, date: $date, file: $tree}), {variant: "primary"})
]);`;
