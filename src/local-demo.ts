/** Supplied example prices; no real hosting provider or model round trip is involved. */
export const HOSTING_EXPLORER_SOURCE = `$workers = 4;
basic = 10 + 4 * ($workers > 2 ? $workers - 2 : 0);
standard = 20 + 4 * ($workers > 5 ? $workers - 5 : 0);
pro = 40 + 4 * ($workers > 12 ? $workers - 12 : 0);
minimum = basic < standard ? (basic < pro ? basic : pro) : (standard < pro ? standard : pro);
cheapest = (basic == minimum ? "Basic" : "") + (standard == minimum ? (basic == minimum ? " and Standard" : "Standard") : "") + (pro == minimum ? (basic == minimum || standard == minimum ? " and Pro" : "Pro") : "");
root = Stack([
  Text("Example prices in $/month. Additional workers cost $4 each.", {tone: "muted"}),
  NumberInput("workers", "Requested workers", $workers, {min: 0, max: 100, step: 1}),
  Table(["Plan", "Base", "Included", "Total/month"], [
    ["Basic", "$10", 2, "$" + basic],
    ["Standard", "$20", 5, "$" + standard],
    ["Pro", "$40", 12, "$" + pro]
  ]),
  Text("Cheapest: " + cheapest + " ($" + minimum + "/month)", {tone: "success", bold: true}),
  Button("Reset workers", @Reset($workers))
]);`;

/** Navigation and disclosure without answer collection: all changes stay in the widget. */
export const LOCAL_EXPLANATION_SOURCE = `$page = "overview";
$expanded = false;
root = Stack([
  Tabs("page", [
    {value: "overview", label: "Overview", children: [
      Text("Each plan includes a fixed number of workers."),
      Button($expanded ? "Hide explanation" : "Show explanation", @Set($expanded, !$expanded)),
      $expanded ? Text("Only workers above the included allowance add to the bill. Unused included workers do not produce a credit.") : Text("Expand the explanation to inspect the rule.", {tone: "muted"})
    ]},
    {value: "formula", label: "Formula", children: [
      CodeBlock("total = base + 4 * max(0, requested - included)", "text"),
      Text("For Basic with 4 workers: $10 + $4 × (4 − 2) = $18/month.")
    ]}
  ], $page),
  Button("Reset explanation", @Reset($page, $expanded))
]);`;
