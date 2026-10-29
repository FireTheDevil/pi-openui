import assert from "node:assert/strict";
import test from "node:test";
import { stripTerminalSequences, visibleWidth, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { DocumentModel } from "../src/model.js";
import { OpenUIView, type UIResult } from "../src/view.js";

function fixture(source: string, initialWidth = 110, initialHeight = 45) {
  const model = new DocumentModel(source);
  assert.equal(model.valid, true, model.diagnostics.join("; "));
  const results: UIResult[] = [];
  let width = initialWidth;
  let height = initialHeight;
  const view = new OpenUIView(model, { requestRender() {}, getHeight: () => height, onDone: result => results.push(result) });
  const lines = () => view.render(width).map(stripTerminalSequences);
  const text = () => lines().join("\n");
  function at(needle: string): [number, number] {
    const frame = lines();
    const y = frame.findIndex(line => line.includes(needle));
    assert.ok(y >= 0, `Missing ${needle}:\n${frame.join("\n")}`);
    return [frame[y].indexOf(needle), y];
  }
  function mouse(type: TuiMouseEvent["type"], x: number, y: number) {
    return view.handleMouse({ type, button: "left", x, y, screenX: x, screenY: y, width, height, shift: false, alt: false, ctrl: false });
  }
  function clickAt(x: number, y: number) { mouse("press", x, y); lines(); mouse("release", x, y); return mouse("click", x, y); }
  return { model, view, results, lines, text, at, clickAt,
    key(value: string) { lines(); view.handleInput(value); },
    click(needle: string) { return clickAt(...at(needle)); },
    resize(w: number, h: number) { width = w; height = h; return lines(); },
  };
}

function pages(kind: "Tabs" | "Steps") {
  return `$page = "first";
$first = "A";
$second = "B";
root = Stack([
  ${kind}("page", [
    {value: "first", label: "First", children: [Input("first", "First note", $first)]},
    {value: "second", label: "Second", children: [Input("second", "Second note", $second)]}
  ], $page),
  Button("Reset notes", @Reset($first, $second)),
  Button("Send", @ToAssistant("Use both pages"))
]);`;
}

test("navigation displays explicit validation errors and suppresses them while disabled", () => {
  for (const kind of ["Tabs", "Steps"]) {
    const source = `root = Stack([${kind}("page", [{value: "one", label: "One", children: [Text("Page body")]}], "one", {error: "Choose a reviewed page", disabled: DISABLED}), Button("Send", "send")]);`;
    const enabled = fixture(source.replace("DISABLED", "false"));
    assert.match(enabled.text(), /Choose a reviewed page/);
    enabled.click("[ Send ]");
    assert.equal(enabled.results.length, 0);
    const disabled = fixture(source.replace("DISABLED", "true"));
    assert.doesNotMatch(disabled.text(), /Choose a reviewed page/);
    disabled.click("[ Send ]");
    assert.equal(disabled.results[0]?.status, "submitted");
  }
});

for (const kind of ["Tabs", "Steps"] as const) {
  test(`${kind} keyboard navigation exposes only the active page's controls`, () => {
    const f = fixture(pages(kind));
    assert.match(f.text(), /First note/);
    assert.doesNotMatch(f.text(), /Second note/);
    f.key("\x1b[C");
    assert.equal(f.model.state.$page, "second");
    assert.doesNotMatch(f.text(), /First note/);
    assert.match(f.text(), /Second note/);
    f.key("\r"); // Header advances to this page's first field.
    f.key("edited ");
    assert.equal(f.model.formValues.second, "edited B");
    assert.equal(f.model.formValues.first, "A", "hidden fields must not receive input");
    f.key("\t"); // Reset notes
    f.key("\t"); // Send; no hidden page controls intervene.
    f.key("\r");
    assert.equal(f.results[0]?.status, "submitted");
    if (f.results[0]?.status === "submitted") assert.equal(f.results[0].values.second, "edited B");
  });

  test(`${kind} mouse navigation preserves hidden edits and local Reset updates every page`, () => {
    const f = fixture(pages(kind));
    f.key("\r");
    f.key("first ");
    f.click("Second");
    f.key("\r");
    f.key("second ");
    assert.equal(f.model.formValues.first, "first A");
    assert.equal(f.model.formValues.second, "second B");
    f.click("First");
    assert.match(f.text(), /first A/);
    assert.doesNotMatch(f.text(), /second B/);
    f.click("[ Reset notes ]");
    assert.equal(f.results.length, 0);
    assert.equal(f.model.formValues.first, "A");
    assert.equal(f.model.formValues.second, "B");
    f.click("Second");
    assert.match(f.text(), /Second note/);
    assert.doesNotMatch(f.text(), /second B/);
  });
}

test("Row translates side-by-side input mouse coordinates and stacks children after a narrow resize", () => {
  const f = fixture('$left = "left";\n$right = "right";\nroot = Stack([Row([Input("left", "Left note", $left), Input("right", "Right note", $right)], {gap: 3}), Button("Send", "send")]);');
  assert.equal(f.at("Left note")[1], f.at("Right note")[1], "wide Row children share the same visual row");
  const [rightX, rightY] = f.at("right");
  f.clickAt(rightX + 2, rightY);
  f.key("X");
  assert.equal(f.model.formValues.right, "riXght");
  assert.equal(f.model.formValues.left, "left");
  const narrow = f.resize(28, 35);
  assert.ok(f.at("Right note")[1] > f.at("Left note")[1], "narrow Row children stack vertically");
  assert.ok(narrow.every(line => visibleWidth(line) <= 28));
  const [leftX, leftY] = f.at("left");
  f.clickAt(leftX + 2, leftY);
  f.key("Y");
  assert.equal(f.model.formValues.left, "leYft");
  f.click("[ Send ]");
  assert.equal(f.results[0]?.status, "submitted");
});

test("nested Section and Card retain action hit coordinates and reactive state after reflow", () => {
  const f = fixture('$count = 0;\nroot = Stack([Section("Release", [Card("Checks", [Text("Count: " + $count), Button("Increment", @Set($count, $count + 1))], {description: "Run another check"}), Divider("Next"), Button("Send", @ToAssistant("Checked", {count: $count}))], {description: "Confirm the release"})]);');
  assert.match(f.text(), /Release/);
  assert.match(f.text(), /Run another check/);
  f.click("[ Increment ]");
  assert.equal(f.model.state.$count, 1);
  assert.match(f.text(), /Count: 1/);
  f.resize(30, 35);
  f.click("[ Increment ]");
  assert.equal(f.model.state.$count, 2);
  f.click("[ Send ]");
  assert.equal(f.results[0]?.status, "submitted");
  if (f.results[0]?.status === "submitted") assert.deepEqual(f.results[0].context, { count: 2 });
});

test("required fields on inactive pages block submission until corrected without invalidating the UI", () => {
  const f = fixture('$page = "overview";\n$name = "";\nroot = Stack([Tabs("page", [{value: "overview", label: "Overview", children: [Text("Review the plan")]}, {value: "details", label: "Details", children: [Input("name", "Full name", $name, "Your name", {required: true})]}], $page), Button("Send", @ToAssistant("Use this name"))]);');
  assert.equal(f.model.valid, true);
  assert.doesNotMatch(f.text(), /Your name/);
  f.click("[ Send ]");
  assert.equal(f.results.length, 0);
  assert.equal(f.model.valid, true, "validation must leave the form editable");
  assert.match(f.text(), /required|Full name/i);
  assert.equal(f.model.state.$page, "details", "submission reveals the first invalid page");
  assert.match(f.text(), /Your name/);
  f.click("Details");
  f.key("\r");
  f.key("Ada");
  f.click("[ Send ]");
  assert.equal(f.results[0]?.status, "submitted");
  if (f.results[0]?.status === "submitted") assert.equal(f.results[0].values.name, "Ada");
});

test("hidden numeric drafts block submission, reveal their page and can be cleared by a local reset", () => {
  const f = fixture('$page = "edit";\n$quantity = 2;\nroot = Stack([Tabs("page", [{value: "edit", label: "Edit", children: [NumberInput("quantity", "Quantity", $quantity, {min: 1, max: 10})]}, {value: "review", label: "Review", children: [Text("Review the quantity")]}], $page), Button("Reset quantity", @Reset($quantity)), Button("Send", @ToAssistant("Use the quantity"))]);');
  f.key("\r");
  f.key("\x05");
  f.key("\x15");
  f.key("bad");
  assert.equal(f.model.formValues.quantity, 2, "invalid native input drafts must not overwrite typed state");
  f.click("Review");
  assert.doesNotMatch(f.text(), /bad/);
  f.click("[ Send ]");
  assert.equal(f.results.length, 0);
  assert.equal(f.model.state.$page, "edit");
  assert.match(f.text(), /bad/);
  assert.match(f.text(), /finite number/i);
  f.click("Review");
  f.click("[ Reset quantity ]");
  assert.equal(f.results.length, 0, "reset stays local even while the field is hidden");
  f.click("[ Send ]");
  assert.equal(f.results[0]?.status, "submitted");
  if (f.results[0]?.status === "submitted") assert.equal(f.results[0].values.quantity, 2);
});

for (const kind of ["Tabs", "Steps"] as const) {
  test(`disabled ${kind} descendants stay inert, retain values and do not block enabled siblings`, () => {
    const f = fixture(`$page = "one";
$inner = "inner-one";
$locked = "";
$accepted = false;
$count = 0;
$enabled = "";
root = Stack([
  ${kind}("locked_page", [
    {value: "one", label: "Blocked", children: [Card("Read only", [
      Input("locked", "Locked note", $locked, "Required but disabled", {required: true}),
      Checkbox("accepted", "Locked approval", $accepted, {required: true, disabled: false}),
      Button("Locked action", @Set($count, 100)),
      Steps("inner", [
        {value: "inner-one", label: "Inner one", children: [Button("Nested action", @Set($count, 200))]},
        {value: "inner-two", label: "Inner two", children: [Input("hidden", "Hidden required", "", "", {required: true})]}
      ], $inner)
    ])]},
    {value: "two", label: "Unavailable", children: [Text("Another disabled page")]}
  ], $page, {disabled: true}),
  Input("enabled", "Enabled note", $enabled),
  Button("Send", @ToAssistant("Use enabled values"))
]);`);
    f.key("kept");
    assert.equal(f.model.formValues.enabled, "kept", "keyboard focus skips the entire disabled subtree");
    assert.equal(f.model.formValues.locked, "");
    f.click("Unavailable");
    assert.equal(f.model.state.$page, "one", "disabled navigation cannot change its active page");
    f.click("Inner two");
    assert.equal(f.model.state.$inner, "inner-one", "nested navigation inherits disabled state");
    f.click("Locked note");
    f.click("Required but disabled");
    f.click("Unchecked");
    f.click("[ Locked action ]");
    f.click("[ Nested action ]");
    assert.equal(f.model.state.$count, 0, "descendant buttons must not execute local actions");
    assert.equal(f.model.formValues.accepted, false, "own disabled:false cannot override an ancestor");
    f.key(" value");
    assert.equal(f.model.formValues.enabled, "kept value", "disabled clicks do not steal focus");
    f.key("\t");
    f.key("\r");
    assert.equal(f.results[0]?.status, "submitted", "disabled required fields must not block submission");
    if (f.results[0]?.status === "submitted") {
      assert.equal(f.results[0].values.enabled, "kept value");
      assert.equal(f.results[0].values.locked, "");
      assert.equal(f.results[0].values.accepted, false);
      assert.equal(f.results[0].values.hidden, "");
      assert.equal(f.results[0].values.inner, "inner-one");
    }
  });
}
