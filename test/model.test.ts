import assert from "node:assert/strict";
import { test } from "node:test";
import type { ElementNode } from "@openuidev/lang-core";
import { DocumentModel, limits, systemPrompt } from "../src/model.js";

const document = `$choice = "One"
$note = "initial"
root = Stack([heading, choice, note, summary, table, submit])
heading = Text("Native OpenUI")
choice = Select("choice", "Choice", ["One", "Two"], $choice)
note = Input("note", "Note", $note, "Type here")
summary = Text("Selected: " + $choice + ", " + $note)
table = Table(["Name", "Value"], [["one", 1], ["enabled", true], ["empty", null]])
submit = Button("Submit", "submit")`;

function children(model: DocumentModel): ElementNode[] { return model.root!.props.children as ElementNode[]; }

test("uses lang-core's generated prompt for all six components and bindings", () => {
  for (const name of ["Text", "Stack", "Select", "Input", "Button", "Table"]) assert.match(systemPrompt, new RegExp(`${name}\\(`));
  assert.match(systemPrompt, /\$binding/);
  assert.match(systemPrompt, /show_ui/);
});

test("parses completed documents and reevaluates dependent text through lang-core state", () => {
  const model = new DocumentModel(document);
  assert.equal(model.valid, true, model.diagnostics.join("\n"));
  assert.deepEqual(children(model).map((node) => node.typeName), ["Text", "Select", "Input", "Text", "Table", "Button"]);
  model.setField(children(model)[1], "Two");
  model.setField(children(model)[2], "updated");
  assert.equal(model.state.$choice, "Two");
  assert.equal(model.state.$note, "updated");
  assert.equal(children(model)[3].props.text, "Selected: Two, updated");
  assert.deepEqual(model.formValues, { choice: "Two", note: "updated" });
  model.dispose();
});

test("supports literal form values and lang-core assignment bindings", () => {
  const model = new DocumentModel('$note = ""\nroot = Stack([Input("plain", "Plain", "initial"), Input("bound", "Bound", $note = "prefix:" + $value), Text($note)])');
  assert.equal(model.valid, true, model.diagnostics.join("\n"));
  assert.deepEqual(model.formValues, { plain: "initial", bound: "" });
  model.setField(children(model)[0], "literal");
  model.setField(children(model)[1], "input");
  assert.equal(model.formValues.plain, "literal");
  assert.equal(model.formValues.bound, "prefix:input");
  assert.equal(children(model)[2].props.text, "prefix:input");
});

test("streams partial strings and forward references and finalizes without throwing", () => {
  const model = new DocumentModel();
  // Exercise boundaries inside declarations, escapes, quotes, function names and lists.
  for (let end = 1; end <= document.length; end++) {
    assert.doesNotThrow(() => model.update(document.slice(0, end), true));
    assert.equal(model.valid, false);
  }
  model.update(document, false);
  assert.equal(model.valid, true, model.diagnostics.join("\n"));
  assert.equal(children(model)[0].props.text, "Native OpenUI");
});

test("streamed defaults replace pristine values, while user edits survive later updates", () => {
  const model = new DocumentModel();
  model.update('$note = "par', true);
  model.update('$note = "partial"\nroot = Stack([Input("note", "Note", $note)])', false);
  assert.equal(model.formValues.note, "partial");
  model.setField(children(model)[0], "user");
  model.update('$note = "changed default"\nroot = Stack([Input("note", "Note", $note)])');
  assert.equal(model.formValues.note, "user");
});

test("streaming previews cannot mutate fields or become submittable", () => {
  const model = new DocumentModel();
  model.update(document, true);
  const before = model.state;
  model.setField(children(model)[1], "Two");
  assert.deepEqual(model.state, before);
  assert.equal(model.valid, false);
});

test("rejects malformed, truncated, unresolved, cyclic and unsupported documents", () => {
  const invalid = [
    "", "hello", 'root = Stack([Text("hi")]', 'root = Stack([Text("hi")]))',
    'root = Stack([Text("hi")]) trailing', 'root = Stack([])\nrubbish',
    'root = Stack([])\nbad = ???', 'root = Stack([Unknown("x")])',
    'root = Stack([Text(42)])', 'root = Stack([missing])', 'root = Stack([root])',
    'root = Stack([child])\nchild = Stack([root])', 'notroot = Stack([])',
    'root = Text("must use Stack")', 'root = Stack(["not a component"])',
    'root = Stack([])\ndata = Query("tool", {})',
    'root = Stack([])\ndata = Mutation("tool", {})',
  ];
  for (const source of invalid) {
    const model = new DocumentModel(source);
    assert.equal(model.valid, false, source);
    assert.ok(model.diagnostics.length > 0, source);
  }
});

test("validates evaluated values, unique fields/options and table shape", () => {
  for (const source of [
    '$value = 12\nroot = Stack([Input("bad", "Bad", $value)])',
    'root = Stack([Input("same", "One", ""), Input("same", "Two", "")])',
    'root = Stack([Select("s", "Select", ["one", "one"], "one")])',
    'root = Stack([Select("s", "Select", ["one"], "other")])',
    'root = Stack([Table(["A", "B"], [[1]])])',
    'root = Stack([Table(["A"], [[{}]])])',
    'root = Stack([Button("Submit", "bad action")])',
  ]) {
    const model = new DocumentModel(source);
    assert.equal(model.valid, false, source);
    assert.ok(model.diagnostics.length > 0);
  }
});

test("bounds source size, text, component count and depth", () => {
  for (const source of [
    "x".repeat(limits.source + 1),
    `root = Stack([Text(${JSON.stringify("x".repeat(limits.text + 1))})])`,
    `root = Stack([${Array.from({ length: limits.nodes }, () => 'Text("x")').join(",")}])`,
    `root = ${"Stack([".repeat(limits.depth + 1)}Text("x")${"])".repeat(limits.depth + 1)}`,
  ]) {
    const model = new DocumentModel(source);
    assert.equal(model.valid, false);
    assert.ok(model.diagnostics.length > 0);
  }
});

test("recovers from invalid documents and ignores updates after disposal", () => {
  const model = new DocumentModel("garbage");
  assert.equal(model.valid, false);
  model.update(document);
  assert.equal(model.valid, true);
  model.dispose();
  model.update(document);
  assert.equal(model.root, null);
  assert.deepEqual(model.state, {});
});
