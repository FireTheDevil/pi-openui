import assert from "node:assert/strict";
import test from "node:test";
import { stripTerminalSequences, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { DocumentModel } from "../src/model.js";
import { OpenUIView, type UIResult } from "../src/view.js";

const SOURCE = `$choice = "A";
$note = "ab界cd";
root = Stack([Text("Choice: " + $choice), Select("choice", "Options", ["A", "B", "C", "D", "E", "F", "G", "H"], $choice), Input("note", "Note", $note), Button("Submit", "submit")]);`;

function fixture(source = SOURCE, initialWidth = 60, initialHeight = 30, fillHeight = false) {
  const model = new DocumentModel(source);
  assert.equal(model.valid, true, model.diagnostics.join("; "));
  const results: UIResult[] = [];
  let width = initialWidth;
  let height = initialHeight;
  let renders = 0;
  const view = new OpenUIView(model, { requestRender() { renders++; }, getHeight: () => height, onDone: value => results.push(value), fillHeight });
  const render = () => view.render(width).map(stripTerminalSequences);
  const row = (text: string) => {
    const y = render().findIndex(line => line.includes(text));
    assert.ok(y >= 0, `Expected visible row containing ${text}`);
    return y;
  };
  function mouse(type: TuiMouseEvent["type"], x: number, y: number, extra: Partial<TuiMouseEvent> = {}) {
    return view.handleMouse({ type, button: "left", x, y, screenX: x + 10, screenY: y + 7, width, height, shift: false, alt: false, ctrl: false, ...extra });
  }
  function click(x: number, y: number) {
    mouse("press", x, y);
    render(); // Pi redraws between press and release; selected lists may recenter.
    mouse("release", x, y);
    mouse("click", x, y, { clickCount: 1 });
  }
  render();
  return { model, view, results, render, row, mouse, click,
    resize(w: number, h: number) { width = w; height = h; return render(); },
    get renders() { return renders; },
  };
}

test("native SelectList mouse selection survives recentering and re-evaluates dependent text", () => {
  const f = fixture();
  const y = f.row("  D");
  f.click(3, y);
  assert.equal(f.model.formValues.choice, "D");
  assert.ok(f.render().some(line => line.includes("Choice: D")));
  assert.ok(f.render().some(line => line.includes("> Options")));
  f.view.handleInput("\x1b[B");
  assert.equal(f.model.formValues.choice, "E");
  assert.equal(f.results.length, 0);
});

test("native Input receives local mouse coordinates and places its cursor at Unicode columns", () => {
  const f = fixture();
  const row = f.row("ab界cd");
  const textStart = f.render()[row].indexOf("ab界cd");
  const result = f.mouse("press", textStart + 2, row);
  assert.equal(result?.focus, true);
  f.view.handleInput("X");
  assert.equal(f.model.formValues.note, "abX界cd");
  assert.equal(f.model.formValues.choice, "A");
});

test("Input hit testing uses the actual wrapped label and horizontally scrolled native field", () => {
  const value = "0123456789abcdefghij";
  const f = fixture(`root = Stack([Input("note", "Long wrapping label that occupies many rows", "${value}"), Button("Submit", "submit")])`, 12, 5);
  f.view.handleInput("\x05"); // Native end-of-line navigation reveals the scrolled tail.
  const line = f.render().findIndex(text => text.startsWith("  ") && text.includes("cdef"));
  assert.ok(line >= 0);
  const visible = f.render()[line].trim();
  const first = value.indexOf(visible);
  assert.ok(first >= 0);
  f.click(2, line);
  f.view.handleInput("X");
  assert.equal(f.model.formValues.note, value.slice(0, first) + "X" + value.slice(first));
});

test("button press focuses, release does not submit, and click submits exactly once", () => {
  const f = fixture();
  const y = f.row("[ Submit ]");
  assert.equal(f.mouse("press", 4, y)?.focus, true);
  assert.equal(f.results.length, 0);
  f.render();
  f.mouse("release", 4, y);
  assert.equal(f.results.length, 0);
  assert.equal(f.mouse("click", 4, y)?.focus, undefined, "closing an overlay must not refocus its removed component");
  f.mouse("click", 4, y);
  f.view.handleInput("\r");
  assert.equal(f.results.length, 1);
  assert.equal(f.results[0].status, "submitted");
});

test("dragging off a button, padding, right clicks, and modified clicks do not submit", () => {
  const f = fixture();
  const y = f.row("[ Submit ]");
  f.mouse("press", 4, y);
  f.mouse("drag", 5, y);
  f.mouse("release", 5, y);
  f.mouse("click", 5, y);
  f.click(50, y);
  f.mouse("click", 4, y, { button: "right" });
  f.mouse("click", 4, y, { shift: true });
  f.mouse("click", -1, y);
  assert.equal(f.results.length, 0);
  f.click(4, y);
  assert.equal(f.results.length, 1);
});

test("resizing between press and release cancels the gesture even when another button moves under it", () => {
  const f = fixture(`root = Stack([Text("${"x".repeat(70)}"), Button("First", "first"), Button("Second", "second")])`, 30, 20);
  const y = f.row("[ First ]");
  const x = f.render()[y].indexOf("[ First ]") + 3;
  f.mouse("press", x, y);
  const resized = f.resize(80, 20);
  assert.ok(resized[y].includes("[ Second ]"), "a different control occupies the old click row after reflow");
  f.mouse("release", x, y);
  f.mouse("click", x, y);
  assert.equal(f.results.length, 0, "release must activate neither the old nor the new target");
  f.click(x, y);
  assert.deepEqual(f.results, [{ status: "submitted", action: "second", state: {}, values: {} }], "a fresh gesture still works after resize");
});

test("clicking a label focuses its input without selecting a different field", () => {
  const f = fixture();
  f.click(3, f.row("Note"));
  f.view.handleInput("!");
  assert.equal(f.model.formValues.note, "!ab界cd");
  assert.equal(f.model.formValues.choice, "A");
});

test("wheel over a select delegates to the native widget; elsewhere it scrolls only the panel", () => {
  const f = fixture();
  const selection = f.mouse("wheel", 3, f.row("→ A"), { button: "none", wheelDelta: 3 });
  assert.equal(selection?.handled, true);
  assert.equal(f.model.formValues.choice, "B");
  const lines = Array.from({ length: 30 }, (_, i) => `Text("Row ${i}")`).join(",");
  const readOnly = fixture(`root = Stack([${lines}, Button("Bottom", "submit")])`, 30, 8);
  readOnly.mouse("wheel", 1, 0, { button: "none", wheelDelta: -100 });
  assert.ok(readOnly.render().some(line => line.includes("Row 0")));
  const down = readOnly.mouse("wheel", 1, 1, { button: "none", wheelDelta: 100 });
  assert.equal(down?.handled, true);
  assert.ok(readOnly.render().some(line => line.includes("[ Bottom ]")));
  readOnly.click(4, readOnly.row("[ Bottom ]"));
  assert.equal(readOnly.results.length, 1);
});

test("clipped SelectList rows retain native item coordinates after resizing and scrolling", () => {
  const f = fixture(SOURCE, 30, 5);
  f.view.handleInput("\x1b[B");
  f.view.handleInput("\x1b[B");
  f.view.handleInput("\x1b[B");
  assert.equal(f.model.formValues.choice, "D");
  const y = f.row("  C");
  f.click(3, y);
  assert.equal(f.model.formValues.choice, "C");
  f.resize(20, 3);
  const option = f.render()[1].slice(2).trim();
  assert.ok(["A", "B", "C", "D", "E", "F", "G", "H"].includes(option));
  f.click(3, 1);
  assert.equal(f.model.formValues.choice, option);
});

test("streaming and invalid documents ignore mouse editing and submission", () => {
  const f = fixture();
  const inputY = f.row("ab界cd");
  const buttonY = f.row("[ Submit ]");
  f.model.update(SOURCE, true);
  f.view.refresh();
  f.render();
  f.click(3, inputY);
  f.click(4, buttonY);
  f.mouse("wheel", 3, 4, { button: "none", wheelDelta: 1 });
  assert.equal(f.model.formValues.choice, "A");
  assert.equal(f.results.length, 0);
  f.model.update('root = Stack([Button("Submit", "submit"), Unknown("bad")])');
  f.view.refresh();
  f.render();
  f.click(4, 1);
  assert.equal(f.results.length, 0);
});

test("fullscreen padding, title and footer never become button hit areas", () => {
  const f = fixture('root = Stack([Button("Submit", "submit")])', 30, 12, true);
  assert.equal(f.render().length, 12);
  f.click(4, 0);
  f.click(4, 9);
  f.click(4, 11);
  assert.equal(f.results.length, 0);
  assert.equal(f.resize(20, 2).length, 2);
  f.click(4, 1); // blank padding below the only control in the tiny viewport
  assert.equal(f.results.length, 0);
  f.click(4, 0);
  assert.equal(f.results.length, 1);
});

test("disposal and zero-width rendering discard mouse hit areas", () => {
  const f = fixture();
  const y = f.row("[ Submit ]");
  f.resize(0, 20);
  assert.equal(f.mouse("click", 4, y), undefined);
  f.resize(60, 30);
  f.view.dispose();
  assert.equal(f.mouse("click", 4, y), undefined);
  assert.equal(f.results.length, 0);
});
