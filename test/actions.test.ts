import assert from "node:assert/strict";
import { test } from "node:test";
import type { ElementNode } from "@openuidev/lang-core";
import { DocumentModel, limits, systemPrompt } from "../src/model.js";

const nodes = (model: DocumentModel) => model.root!.props.children as ElementNode[];
const button = (model: DocumentModel, label?: string) => nodes(model).find(node => node.typeName === "Button" && (!label || node.props.label === label))!;
function modelFor(action: string, declarations = '$count = 0\n$note = ""', children = 'Text("Count: " + $count), Input("note", "Note", $note)') {
  const model = new DocumentModel(`${declarations}\nroot = Stack([${children}, Button("Run", ${action})])`);
  assert.equal(model.valid, true, model.diagnostics.join("\n"));
  return model;
}

test("native Set uses lang-core evaluation and repeated activation stays local", () => {
  const model = modelFor('@Set($count, $count + 1)');
  for (let count = 1; count <= 3; count++) {
    assert.deepEqual(model.activate(button(model)), { status: "updated" });
    assert.equal(model.state.$count, count);
    assert.equal(nodes(model)[0].props.text, `Count: ${count}`);
  }
});

test("ordered steps and submission evaluate against the preceding step's state", () => {
  const model = modelFor('Action([@Set($count, $count + 1), @Set($count, $count + 1), @Set($note, "value " + $count), @ToAssistant("Count " + $count, {count: $count, note: $note})])');
  assert.deepEqual(model.activate(button(model)), {
    status: "submitted", action: "continue_conversation", message: "Count 2",
    context: { count: 2, note: "value 2" }, state: { $count: 2, $note: "value 2" }, values: { note: "value 2" },
  });
});

test("Reset restores several declared defaults and makes them pristine again", () => {
  const model = modelFor('@Reset($count, $note)');
  model.setField(nodes(model)[1], "edited");
  assert.deepEqual(model.activate(button(model)), { status: "updated" });
  assert.deepEqual(model.state, { $count: 0, $note: "" });
  model.update('$count = 7\n$note = "new default"\nroot = Stack([Input("note", "Note", $note), Button("Reset", @Reset($count, $note))])');
  assert.deepEqual(model.state, { $count: 7, $note: "new default" });
});

test("legacy string submission keeps its original shape", () => {
  const model = modelFor('"save"');
  assert.deepEqual(model.activate(button(model)), { status: "submitted", action: "save", state: { $count: 0, $note: "" }, values: { note: "" } });
});

test("unsupported or invalid steps are preflighted before any state changes", () => {
  for (const action of [
    'Action([@Set($count, 5), @OpenUrl("https://example.com")])',
    'Action([@Set($count, 5), @Run("anything")])',
    'Action([@Set($count, 5), @Reset()])',
    'Action([@Set($count, 5), @Set("not a variable", 1)])',
    'Action([@Set($count, 5), @Set($missing, 1)])',
    'Action([@Set($count, 5), @Reset($missing)])',
    'Action([@Set($count, 5), @ToAssistant("Submit"), @Set($count, 10)])',
    'Action([@ToAssistant("First"), @ToAssistant("Second")])',
    'Action([])',
    '@ToAssistant()',
    '{steps: [{type: "set", target: "$count", valueAST: {k: "Num", v: 9}}]}',
  ]) {
    const model = modelFor(action);
    const before = model.state;
    const outcome = model.activate(button(model));
    assert.equal(outcome.status, "error", action);
    assert.deepEqual(model.state, before, action);
    assert.equal(model.valid, true, action);
  }
});

test("step count bounds include nested Action lists", () => {
  const action = `Action([@Set($count, 1), Action([${Array.from({ length: limits.actionSteps }, () => '@Set($count, $count + 1)').join(",")}])])`;
  const model = modelFor(action);
  const result = model.activate(button(model));
  assert.equal(result.status, "error");
  if (result.status === "error") assert.match(result.error, /at most 32/);
  assert.equal(model.state.$count, 0);
});

test("invalid results roll back all changes and preserve editability and pristine defaults", () => {
  const model = modelFor('Action([@Set($count, 4), @Set($note, 99)])');
  const result = model.activate(button(model));
  assert.equal(result.status, "error");
  if (result.status === "error") assert.match(result.error, /UI invalid/);
  assert.deepEqual(model.state, { $count: 0, $note: "" });
  assert.equal(model.valid, true);
  model.setField(nodes(model)[1], "editable");
  assert.equal(model.formValues.note, "editable");
  model.update('$count = 8\n$note = "new default"\nroot = Stack([Input("note", "Note", $note), Button("Submit", "submit")])');
  assert.deepEqual(model.state, { $count: 8, $note: "editable" });
});

test("nonfinite values and oversized terminal context roll back preceding mutations", () => {
  for (const action of [
    'Action([@Set($count, 7), @Set($count, 1e308 * 1e308)])',
    'Action([@Set($count, 7), @ToAssistant("Submit", {bad: 1e308 * 1e308})])',
    `Action([@Set($count, 7), @ToAssistant("Submit", ${JSON.stringify("x".repeat(limits.text + 1))})])`,
  ]) {
    const model = modelFor(action);
    assert.equal(model.activate(button(model)).status, "error");
    assert.equal(model.state.$count, 0);
    assert.equal(model.valid, true);
  }
});

test("action source is frozen even if the button disappears after its local step", () => {
  const model = new DocumentModel('$show = true\n$count = 0\nroot = Stack([$show ? send : Text("Sent")])\nsend = Button("Send", Action([@Set($show, false), @Set($count, 1), @ToAssistant("Count " + $count, {count: $count})]))');
  assert.equal(model.valid, true, model.diagnostics.join("\n"));
  const outcome = model.activate(button(model));
  assert.equal(outcome.status, "submitted");
  if (outcome.status === "submitted") assert.deepEqual(outcome.context, { count: 1 });
  assert.equal(nodes(model)[0].props.text, "Sent");
});

test("generated buttons preserve their loop scope while submission sees local changes", () => {
  const model = new DocumentModel('$count = 0\nroot = Stack(@Each([{id: "one"}, {id: "two"}], "item", Button("Send " + item.id, Action([@Set($count, $count + 1), @ToAssistant("Count " + $count, {count: $count, id: item.id})]))))');
  assert.equal(model.valid, true, model.diagnostics.join("\n"));
  const outcome = model.activate(button(model, "Send two"));
  assert.equal(outcome.status, "submitted");
  if (outcome.status === "submitted") {
    assert.equal(outcome.message, "Count 1");
    assert.deepEqual(outcome.context, { count: 1, id: "two" });
  }
});

test("completed streaming, stale controls and disposal enforce action lifecycle", () => {
  const source = '$count = 0\nroot = Stack([Button("Increment", @Set($count, $count + 1))])';
  const model = new DocumentModel();
  model.update(source, true);
  assert.equal(model.activate(button(model)).status, "error");
  assert.equal(model.state.$count, 0);
  model.update(source);
  const stale = button(model);
  assert.deepEqual(model.activate(stale), { status: "updated" });
  assert.equal(model.activate(stale).status, "error");
  model.dispose();
  assert.equal(model.activate(stale).status, "error");
});

test("prompt documents only the supported native action vocabulary", () => {
  assert.match(systemPrompt, /@Set\(\$variable, value\)/);
  assert.match(systemPrompt, /@Reset\(\$variable/);
  assert.match(systemPrompt, /@ToAssistant\(message/);
  assert.match(systemPrompt, /at most 32 steps/);
  assert.match(systemPrompt, /@Run, @OpenUrl, custom actions.*unsupported/);
});
