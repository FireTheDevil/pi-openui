import assert from "node:assert/strict";
import { test } from "node:test";
import type { ElementNode } from "@openuidev/lang-core";
import { childNodes, componentSpecs, isField, limits, optionItems, systemPrompt } from "../src/catalog.js";
import { DocumentModel } from "../src/model.js";

const allComponents = `$check = false
$toggle = true
$tags = ["one"]
$amount = 2
$slider = 25
$date = "2024-02-29"
$tree = "child"
$tab = "first"
$step = "plan"
$notes = "Line one\\nLine two"
root = Stack([Text("Styled", {tone: "accent", bold: true, italic: true}), Select("choice", "Choice", [{value: "one", label: "First", description: "Available"}, {value: "two", label: "Second", disabled: true}], "one"), Input("title", "Title", "", null, {description: "Optional title"}), Button("Submit", @ToAssistant("Use values"), {variant: "primary"}), Table(["A", "B"], [[1, true]]), Checkbox("check", "Check", $check), MultiSelect("tags", "Tags", ["one", "two"], $tags), TextArea("notes", "Notes", $notes, null, {rows: 5}), Row([Badge("Label", "success"), Divider()]), Section("Section", [Markdown("**Markdown**")]), Card("Card", [CodeBlock("const n = 1", "ts")]), Tabs("tab", [{value: "first", label: "First", children: [List(["A", "B"], true)]}, {value: "second", label: "Second", children: [Text("Hidden")]}], $tab), Steps("step", [{value: "plan", label: "Plan", children: [Progress(25, 100, "Done")]}], $step), NumberInput("amount", "Amount", $amount, {min: 0, max: 10, step: 1}), Toggle("toggle", "Toggle", $toggle), Slider("slider", "Slider", $slider, 0, 100, null, {description: "Percent"}), DatePicker("date", "Date", $date, {minDate: "2024-01-01", maxDate: "2024-12-31"}), Tree("tree", "Tree", [{value: "parent", label: "Parent", children: [{value: "child", label: "Child"}]}], $tree)])`;

function all(model: DocumentModel): ElementNode[] {
  const result: ElementNode[] = [];
  const visit = (node: ElementNode) => { result.push(node); childNodes(node).forEach(visit); };
  if (model.root) visit(model.root);
  return result;
}
const field = (model: DocumentModel, name: string) => all(model).find(node => isField(node) && node.props.name === name)!;
const button = (model: DocumentModel, label = "Submit") => all(model).find(node => node.typeName === "Button" && node.props.label === label)!;
const checked = (source: string) => {
  const model = new DocumentModel(source);
  assert.equal(model.valid, true, model.diagnostics.join("\n"));
  return model;
};

test("all 25 catalog components parse, generate signatures and traverse every layout", () => {
  assert.equal(Object.keys(componentSpecs).length, 25);
  const model = checked(allComponents);
  const found = new Set(all(model).map(node => node.typeName));
  for (const name of Object.keys(componentSpecs)) {
    assert.ok(found.has(name), name);
    assert.match(systemPrompt, new RegExp(`${name}\\(`));
  }
  assert.deepEqual(model.fieldErrors, {});
  assert.equal(model.formValues.check, false);
  assert.deepEqual(model.formValues.tags, ["one"]);
  assert.equal(model.formValues.amount, 2);
  assert.equal(model.formValues.toggle, true);
  assert.equal(model.formValues.date, "2024-02-29");
});

test("typed native bindings preserve booleans, numbers and arrays through edits and submission", () => {
  const model = checked(allComponents);
  model.setField(field(model, "check"), true);
  model.setField(field(model, "toggle"), false);
  model.setField(field(model, "amount"), 3.5);
  model.setField(field(model, "slider"), 30);
  model.setField(field(model, "tags"), ["one", "two"]);
  model.setField(field(model, "notes"), "A\nB");
  model.setField(field(model, "tab"), "second");
  assert.equal(model.state.$check, true);
  assert.equal(model.state.$toggle, false);
  assert.equal(model.state.$amount, 3.5);
  assert.deepEqual(model.state.$tags, ["one", "two"]);
  assert.equal(model.state.$notes, "A\nB");
  const result = model.activate(button(model));
  assert.equal(result.status, "submitted");
  if (result.status === "submitted") {
    assert.equal(result.values.check, true);
    assert.equal(result.values.amount, 3.5);
    assert.deepEqual(result.values.tags, ["one", "two"]);
    assert.equal(result.values.tab, "second");
  }
});

test("required and explicit errors include hidden pages and block both submission styles", () => {
  const model = checked('$page = "shown"\n$name = ""\n$accepted = false\n$error = "Fix this"\nroot = Stack([Tabs("page", [{value: "shown", label: "Shown", children: [Input("name", "Name", $name, null, {required: true})]}, {value: "hidden", label: "Hidden", children: [Checkbox("accepted", "Accept", $accepted, {required: true}), Input("manual", "Manual", "okay", null, {error: $error})]}], $page), Button("Submit", "submit"), Button("Assistant", @ToAssistant("Done")), Button("Fix", Action([@Set($name, "Ada"), @Set($accepted, true), @Set($error, "")]))])');
  assert.deepEqual(model.fieldErrors, { name: "Required.", accepted: "Must be checked.", manual: "Fix this" });
  for (const label of ["Submit", "Assistant"]) {
    const result = model.activate(button(model, label));
    assert.equal(result.status, "error");
    if (result.status === "error") assert.match(result.error, /name:.*accepted:.*manual:/);
  }
  assert.deepEqual(model.activate(button(model, "Fix")), { status: "updated" });
  assert.equal(model.valid, true);
  assert.deepEqual(model.fieldErrors, {});
  assert.equal(model.activate(button(model)).status, "submitted");
});

test("a compound action can correct required values before submitting, or roll back if still invalid", () => {
  const model = checked('$ok = false\n$count = 0\nroot = Stack([Checkbox("ok", "Accept", $ok, {required: true}), Button("Bad", Action([@Set($count, 2), @ToAssistant("Done")])), Button("Submit", Action([@Set($ok, true), @ToAssistant("Done", {ok: $ok})]))])');
  assert.equal(model.activate(button(model, "Bad")).status, "error");
  assert.equal(model.state.$count, 0);
  assert.equal(model.valid, true);
  const result = model.activate(button(model));
  assert.equal(result.status, "submitted");
  if (result.status === "submitted") assert.deepEqual(result.context, { ok: true });
});

test("disabled Tabs and Steps disable descendant controls and validation while retaining values", () => {
  for (const layout of ["Tabs", "Steps"]) {
    const model = checked(`$disabled = true\n$page = "shown"\n$hidden = ""\n$count = 0\nroot = Stack([${layout}("page", [{value: "shown", label: "Shown", children: [Input("shown", "Shown", "initial")]}, {value: "hidden", label: "Hidden", children: [Card("Hidden card", [Input("hidden", "Required", $hidden, null, {required: true}), Button("Inside", @Set($count, $count + 1))])]}], $page, {disabled: $disabled}), Button("Submit", "submit"), Button("Update", @Set($hidden, "programmatic")), Button("Enable", @Set($disabled, false))])`);
    assert.equal(model.isDisabled(field(model, "shown")), true);
    assert.equal(model.isDisabled(field(model, "hidden")), true);
    assert.equal(model.isDisabled(button(model, "Inside")), true);
    assert.equal(model.isDisabled(button(model)), false);
    model.setField(field(model, "page"), "hidden");
    model.setField(field(model, "shown"), "blocked");
    model.setField(field(model, "hidden"), "blocked");
    assert.equal(model.activate(button(model, "Inside")).status, "error");
    assert.deepEqual(model.fieldErrors, {});
    assert.equal(model.formValues.page, "shown");
    assert.equal(model.formValues.shown, "initial");
    const submission = model.activate(button(model));
    assert.equal(submission.status, "submitted");
    if (submission.status === "submitted") assert.equal(submission.values.hidden, "");
    assert.deepEqual(model.activate(button(model, "Update")), { status: "updated" });
    assert.equal(model.formValues.hidden, "programmatic");
    assert.deepEqual(model.activate(button(model, "Enable")), { status: "updated" });
    assert.equal(model.isDisabled(field(model, "hidden")), false);
    model.setField(field(model, "hidden"), "");
    assert.equal(model.fieldErrors.hidden, "Required.");
    assert.equal(model.activate(button(model)).status, "error");
    assert.deepEqual(model.activate(button(model, "Inside")), { status: "updated" });
    assert.equal(model.state.$count, 1);
  }
});

test("disabled fields and options cannot be changed, and disabled fields do not block submission", () => {
  const model = checked('root = Stack([Input("locked", "Locked", "", null, {required: true, disabled: true, error: "Ignored"}), Select("single", "Single", [{value: "a", label: "A"}, {value: "b", label: "B", disabled: true}], "a"), MultiSelect("multi", "Multi", [{value: "a", label: "A"}, {value: "b", label: "B", disabled: true}], ["b"]), Button("Disabled", "submit", {disabled: true}), Button("Submit", "submit")])');
  model.setField(field(model, "locked"), "changed");
  model.setField(field(model, "single"), "b");
  model.setField(field(model, "multi"), []);
  assert.equal(model.formValues.locked, "");
  assert.equal(model.formValues.single, "a");
  assert.deepEqual(model.formValues.multi, ["b"]);
  model.setField(field(model, "multi"), ["b", "a"]);
  assert.deepEqual(model.formValues.multi, ["b", "a"]);
  assert.deepEqual(model.fieldErrors, {});
  assert.equal(model.activate(button(model, "Disabled")).status, "error");
  assert.equal(model.activate(button(model)).status, "submitted");
  const disabledDefault = checked('root = Stack([Select("s", "S", [{value: "old", label: "Old", disabled: true}, {value: "new", label: "New"}], "old")])');
  disabledDefault.setField(field(disabledDefault, "s"), "new");
  assert.equal(disabledDefault.formValues.s, "new");
});

test("date and numeric field errors remain editable while malformed configuration stays invalid", () => {
  const model = checked('root = Stack([NumberInput("n", "Number", -1, {min: 0, max: 10}), Slider("s", "Slider", 99, 0, 10), DatePicker("d", "Date", "2023-02-29", {minDate: "2024-01-01", maxDate: "2024-12-31"}), Button("Submit", "submit")])');
  assert.equal(model.valid, true);
  assert.deepEqual(Object.keys(model.fieldErrors), ["n", "s", "d"]);
  model.setField(field(model, "n"), 3);
  model.setField(field(model, "s"), 5);
  model.setField(field(model, "d"), "2024-");
  assert.equal(model.valid, true);
  assert.match(model.fieldErrors.d, /valid YYYY-MM-DD/);
  model.setField(field(model, "d"), "2024-02-29");
  assert.deepEqual(model.fieldErrors, {});
  model.setField(field(model, "d"), "2025-01-01");
  assert.match(model.fieldErrors.d, /on or before/);
  for (const source of ['NumberInput("n", "N", 1, {min: 2, max: 1})', 'Slider("s", "S", 1, 2, 1)', 'Slider("s", "S", 1, 0, 2, 0)', 'DatePicker("d", "D", "", {minDate: "2023-02-29"})', 'DatePicker("d", "D", "", {minDate: "2025-01-01", maxDate: "2024-01-01"})', 'Progress(101)']) {
    const invalid = new DocumentModel(`root = Stack([${source}])`);
    assert.equal(invalid.valid, false, source);
  }
});

test("nested layout buttons and inactive field names share the complete document model", () => {
  const model = checked('$n = 0\nroot = Stack([Section("S", [Card("C", [Row([Tabs("tab", [{value: "a", label: "A", children: [Steps("step", [{value: "one", label: "One", children: [Button("Increment", @Set($n, $n + 1))]}], "one")]}, {value: "b", label: "B", children: [Input("hidden", "Hidden", "kept")]}], "a")])])]), Button("Submit", "submit")])');
  assert.deepEqual(model.activate(button(model, "Increment")), { status: "updated" });
  assert.equal(model.state.$n, 1);
  assert.equal(model.formValues.hidden, "kept");
  const duplicate = new DocumentModel('root = Stack([Tabs("tabs", [{value: "a", label: "A", children: [Input("same", "A", "")]}, {value: "b", label: "B", children: [Checkbox("same", "B", false)]}], "a")])');
  assert.equal(duplicate.valid, false);
  assert.match(duplicate.diagnostics.join(" "), /Duplicate field name/);
});

test("malformed option values, selections and child layouts are structural errors", () => {
  for (const source of [
    'Select("s", "S", [{value: "a", label: "A"}, {value: "a", label: "B"}], "a")',
    'MultiSelect("m", "M", ["a"], ["a", "a"])',
    'MultiSelect("m", "M", ["a"], ["missing"])',
    'Checkbox("b", "B", "true")', 'NumberInput("n", "N", "1")',
    'Tabs("t", [{value: "a", label: "A", children: []}], "missing")',
    'Steps("s", [{value: "a", label: "A", children: ["text"]}], "a")',
    'Row([42])', 'Section("S", ["text"])', 'Card("C", [false])',
  ]) {
    const model = new DocumentModel(`root = Stack([${source}])`);
    assert.equal(model.valid, false, source);
    assert.ok(model.diagnostics.length, source);
  }
});

test("Tree normalizes hierarchy and disabled descendants and bounds total nodes/depth", () => {
  const model = checked('root = Stack([Tree("t", "Tree", [{value: "a", label: "A", disabled: true, children: [{value: "child", label: "Child"}]}, {value: "b", label: "B"}], "b")])');
  assert.deepEqual(optionItems(field(model, "t")), [
    { value: "a", label: "A", depth: 0, disabled: true },
    { value: "child", label: "Child", depth: 1, disabled: true },
    { value: "b", label: "B", depth: 0 },
  ]);
  model.setField(field(model, "t"), "child");
  assert.equal(model.formValues.t, "b");
  const tooMany = Array.from({ length: limits.treeNodes + 1 }, (_, i) => ({ value: `n${i}`, label: `N${i}` }));
  const depth = (n: number): unknown => ({ value: `n${n}`, label: `N${n}`, ...(n ? { children: [depth(n - 1)] } : {}) });
  for (const tree of [tooMany, [depth(limits.treeDepth)], [{ value: "same", label: "A", children: [{ value: "same", label: "B" }] }]]) {
    const invalid = new DocumentModel(`root = Stack([Tree("t", "Tree", ${JSON.stringify(tree)}, "same")])`);
    assert.equal(invalid.valid, false);
    assert.ok(invalid.diagnostics.length);
  }
});

test("field edits with wrong types, invalid choices or malformed binding outcomes are harmless", () => {
  const model = checked('$n = 1\n$choice = "a"\nroot = Stack([Checkbox("b", "B", false), NumberInput("n", "N", $n), Select("s", "S", ["a", "b"], $choice), Input("bound", "Bound", $choice = "missing")])');
  model.setField(field(model, "b"), "true");
  model.setField(field(model, "n"), "2");
  model.setField(field(model, "s"), "missing");
  model.setField(field(model, "bound"), "x");
  assert.equal(model.valid, true);
  assert.equal(model.formValues.b, false);
  assert.equal(model.formValues.n, 1);
  assert.equal(model.formValues.s, "a");
  assert.equal(model.formValues.bound, "a");
});

test("all-component streaming remains read-only and completes with typed values", () => {
  const model = new DocumentModel();
  for (let end = 1; end < allComponents.length; end += 29) {
    assert.doesNotThrow(() => model.update(allComponents.slice(0, end), true));
    assert.equal(model.valid, false);
  }
  model.update(allComponents, true);
  model.setField(field(model, "check"), true);
  model.setValue("$check", true);
  assert.equal(model.state.$check, false);
  model.update(allComponents);
  assert.equal(model.valid, true, model.diagnostics.join("\n"));
  assert.deepEqual(model.formValues.tags, ["one"]);
});
