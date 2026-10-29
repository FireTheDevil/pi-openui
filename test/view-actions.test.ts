import assert from "node:assert/strict";
import test from "node:test";
import { stripTerminalSequences, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { DocumentModel } from "../src/model.js";
import { OpenUIView, type UIResult } from "../src/view.js";

function fixture(source: string) {
  const model = new DocumentModel(source);
  assert.equal(model.valid, true, model.diagnostics.join("; "));
  const results: UIResult[] = [];
  const view = new OpenUIView(model, {
    requestRender() {}, getHeight: () => 40,
    onDone: result => results.push(result),
  });
  const lines = () => view.render(80).map(stripTerminalSequences);
  const text = () => lines().join("\n");
  const mouse = (type: TuiMouseEvent["type"], x: number, y: number) => view.handleMouse({
    type, button: "left", x, y, screenX: x, screenY: y,
    width: 80, height: 40, shift: false, alt: false, ctrl: false,
  });
  const click = (needle: string) => {
    const y = lines().findIndex(line => line.includes(needle));
    assert.ok(y >= 0, `Expected visible ${needle}`);
    const x = Math.max(2, lines()[y].indexOf(needle));
    mouse("press", x, y);
    lines();
    mouse("release", x, y);
    return mouse("click", x, y);
  };
  return { model, view, results, lines, text, click };
}

test("keyboard @Set stays open and redraws reactive Text and Table on repeated activation", () => {
  const f = fixture(`$count = 0;
root = Stack([Text("Count: " + $count), Table(["Counter"], [[$count]]), Button("Increment", @Set($count, $count + 1))]);`);
  for (let count = 1; count <= 3; count++) {
    f.view.handleInput("\r");
    assert.equal(f.model.state.$count, count);
    assert.match(f.text(), new RegExp(`Count: ${count}`));
    assert.ok(f.lines().some(line => line.trim() === String(count)), "Table must render the current counter");
    assert.equal(f.results.length, 0);
    assert.equal(f.model.valid, true);
  }
});

test("mouse local actions and keyboard local actions use the same dispatcher", () => {
  const f = fixture(`$count = 0;
root = Stack([Text("Count: " + $count), Button("Increment", @Set($count, $count + 1))]);`);
  const mouseResult = f.click("[ Increment ]");
  assert.equal(mouseResult?.focus, true, "local actions keep the panel focused");
  assert.equal(f.model.state.$count, 1);
  f.view.handleInput(" ");
  assert.equal(f.model.state.$count, 2);
  assert.match(f.text(), /Count: 2/);
  assert.equal(f.results.length, 0);
});

test("@Reset restores declared state and edited native inputs without closing the panel", () => {
  const f = fixture(`$count = 2;
$note = "initial";
root = Stack([Text("Count: " + $count), Input("note", "Note", $note), Button("Increment", @Set($count, $count + 1)), Button("Reset", @Reset($count, $note))]);`);
  f.click("[ Increment ]");
  f.click("Note");
  f.view.handleInput("\x05");
  f.view.handleInput("-edited");
  assert.equal(f.model.formValues.note, "initial-edited");
  f.click("[ Reset ]");
  assert.deepEqual(f.model.state, { $count: 2, $note: "initial" });
  assert.equal(f.model.formValues.note, "initial");
  assert.match(f.text(), /Count: 2/);
  assert.equal(f.results.length, 0);
});

test("Action local steps see earlier state changes within the same activation", () => {
  const f = fixture(`$count = 0;
$note = "";
root = Stack([Text($note), Button("Update", Action([@Set($count, $count + 1), @Set($note, "Count " + $count)]))]);`);
  f.view.handleInput("\r");
  assert.deepEqual(f.model.state, { $count: 1, $note: "Count 1" });
  assert.match(f.text(), /Count 1/);
  f.view.handleInput("\r");
  assert.deepEqual(f.model.state, { $count: 2, $note: "Count 2" });
  assert.equal(f.results.length, 0);
});

test("@ToAssistant submits message and context after prior steps using latest edited state", () => {
  const f = fixture(`$count = 0;
$note = "";
root = Stack([Input("note", "Note", $note), Button("Send", Action([@Set($count, $count + 1), @Set($count, $count + 1), @ToAssistant("Count " + $count, {count: $count, note: $note})]))]);`);
  f.view.handleInput("edited");
  f.view.handleInput("\t");
  f.view.handleInput("\r");
  assert.deepEqual(f.results, [{
    status: "submitted", action: "continue_conversation", message: "Count 2",
    context: { count: 2, note: "edited" }, state: { $count: 2, $note: "edited" }, values: { note: "edited" },
  }]);
  f.view.handleInput("\r");
  f.view.handleInput("\x1b");
  assert.equal(f.results.length, 1);
});

test("mouse @ToAssistant closes once without refocusing the removed overlay", () => {
  const f = fixture('root = Stack([Button("Send", @ToAssistant("hello", {source: "mouse"}))]);');
  const result = f.click("[ Send ]");
  assert.equal(result?.focus, undefined);
  assert.equal(f.results.length, 1);
  f.view.handleInput("\r");
  f.view.handleMouse({ type: "click", button: "left", x: 4, y: 1, screenX: 4, screenY: 1, width: 80, height: 40, shift: false, alt: false, ctrl: false });
  assert.equal(f.results.length, 1);
  assert.deepEqual(f.lines(), []);
});

test("failed local actions keep valid UI editable; correcting state and retrying clears the error", () => {
  const f = fixture(`$choice = "One";
$draft = "invalid";
root = Stack([Select("choice", "Choice", ["One", "Two"], $choice), Input("draft", "Draft", $draft), Button("Apply", @Set($choice, $draft))]);`);
  f.click("[ Apply ]");
  assert.equal(f.model.valid, true);
  assert.equal(f.model.formValues.choice, "One", "invalid update must be rolled back");
  assert.match(f.text(), /Action error:/);
  assert.equal(f.results.length, 0);
  f.click("Draft");
  f.view.handleInput("\x05");
  f.view.handleInput("\x15");
  f.view.handleInput("Two");
  assert.equal(f.model.formValues.draft, "Two");
  f.click("[ Apply ]");
  assert.equal(f.model.formValues.choice, "Two");
  assert.doesNotMatch(f.text(), /Action error:/);
  assert.equal(f.results.length, 0);
});

test("streaming still blocks local and terminal actions from both keyboard and mouse", () => {
  const source = `$count = 0;
root = Stack([Text("Count: " + $count), Button("Increment", @Set($count, $count + 1)), Button("Send", @ToAssistant("done"))]);`;
  const f = fixture(source);
  f.model.update(source, true);
  f.view.refresh();
  f.view.handleInput("\r");
  f.click("[ Increment ]");
  f.click("[ Send ]");
  assert.equal(f.model.state.$count, 0);
  assert.equal(f.results.length, 0);
  f.model.update(source, false);
  f.view.refresh();
  f.click("[ Increment ]");
  assert.equal(f.model.state.$count, 1);
  assert.equal(f.results.length, 0);
});

test("legacy string actions retain their original result shape", () => {
  const f = fixture('root = Stack([Button("Submit", "legacy")]);');
  f.view.handleInput("\r");
  assert.deepEqual(f.results, [{ status: "submitted", action: "legacy", state: {}, values: {} }]);
});

test("unsupported action steps report a recoverable error without partial state changes or submission", () => {
  const f = fixture(`$count = 0;
root = Stack([Text("Count: " + $count), Button("Unsupported", Action([@Set($count, 1), @OpenUrl("https://example.com")])), Button("Increment", @Set($count, $count + 1))]);`);
  f.view.handleInput("\r");
  assert.match(f.text(), /Action error:.*Unsupported action/);
  assert.equal(f.model.state.$count, 0);
  assert.equal(f.model.valid, true);
  assert.equal(f.results.length, 0);
  f.click("[ Increment ]");
  assert.equal(f.model.state.$count, 1);
  assert.doesNotMatch(f.text(), /Action error:/);
  f.view.handleInput("\x1b");
  assert.deepEqual(f.results, [{ status: "cancelled" }]);
});
