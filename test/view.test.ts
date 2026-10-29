import assert from "node:assert/strict";
import test from "node:test";
import { CURSOR_MARKER, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { DEMO_SOURCE } from "../src/demo.js";
import { DocumentModel } from "../src/model.js";
import { OpenUIView, safeText, type UIResult } from "../src/view.js";

const keys = { tab: "\t", backTab: "\x1b[Z", enter: "\r", down: "\x1b[B", left: "\x1b[D", escape: "\x1b", pageDown: "\x1b[6~", pageUp: "\x1b[5~" };
function fixture(source = DEMO_SOURCE, initialHeight = 40) {
  const model = new DocumentModel(source);
  const results: UIResult[] = [];
  let height = initialHeight;
  let renders = 0;
  const view = new OpenUIView(model, {
    requestRender() { renders++; }, getHeight: () => height,
    onDone: result => results.push(result),
  });
  return { model, view, results, setHeight(value: number) { height = value; }, get renders() { return renders; } };
}
const plain = (view: OpenUIView, width = 80) => view.render(width).map(stripTerminalSequences).join("\n");

test("native selection and input re-evaluate state and submit exactly once", () => {
  const f = fixture();
  assert.equal(f.model.valid, true, f.model.diagnostics.join("; "));
  assert.match(plain(f.view), /Selected: Review/);
  f.view.handleInput(keys.down);
  assert.match(plain(f.view), /Selected: Implement/);
  f.view.handleInput(keys.enter); // choose and focus the input
  f.view.handleInput("abc");
  f.view.handleInput(keys.left);
  f.view.handleInput("X");
  assert.equal(f.model.formValues.note, "abXc");
  assert.ok(f.view.render(80).some(line => line.includes(CURSOR_MARKER)));
  f.view.handleInput(keys.tab);
  f.view.handleInput(keys.enter);
  f.view.handleInput(keys.enter);
  f.view.handleInput(keys.escape);
  assert.deepEqual(f.results, [{ status: "submitted", action: "next_step", state: { $choice: "Implement", $note: "abXc" }, values: { choice: "Implement", note: "abXc" } }]);
  assert.deepEqual(f.view.render(80), []);
  assert.ok(f.renders > 1);
});

test("Tab and Shift+Tab wrap focus and focus follows the button while scrolling", () => {
  const f = fixture(DEMO_SOURCE, 10);
  f.view.handleInput(keys.backTab);
  assert.match(plain(f.view), /> \[ Send to Pi \]/);
  f.view.handleInput(keys.tab);
  assert.match(plain(f.view), /→ Review/);
  f.view.handleInput(keys.backTab);
  f.view.handleInput(" ");
  assert.equal(f.results[0]?.status, "submitted");
});

test("selected options remain visible in a short viewport", () => {
  const f = fixture('$choice = "A";\nroot = Stack([Select("choice", "Choice", ["A", "B", "C", "D", "E"], $choice), Button("Submit", "submit")])', 5);
  f.view.render(30);
  f.view.handleInput(keys.down);
  f.view.handleInput(keys.down);
  f.view.handleInput(keys.down);
  assert.match(plain(f.view, 30), /→ D/);
});

test("input cursor stays visible when its label wraps beyond the viewport", () => {
  const f = fixture('$note = "cursor-here";\nroot = Stack([Input("note", "A long wrapping label that takes several lines in a narrow terminal viewport", $note), Button("Submit", "submit")])', 5);
  const lines = f.view.render(16);
  assert.equal(lines.length <= 5, true);
  assert.ok(lines.some(line => line.includes(CURSOR_MARKER)));
  assert.match(lines.map(stripTerminalSequences).join("\n"), /cursor-here/);
});

test("Escape, Ctrl+C, and disposal cancel or close without duplicate actions", () => {
  for (const key of [keys.escape, "\x03"]) {
    const f = fixture();
    f.view.handleInput(key);
    f.view.handleInput(key);
    assert.deepEqual(f.results, [{ status: "cancelled" }]);
  }
  const f = fixture();
  f.view.dispose();
  f.view.handleInput(keys.escape);
  f.view.refresh();
  assert.deepEqual(f.results, []);
  assert.deepEqual(f.view.render(80), []);
});

test("streaming prefixes render safely and cannot edit or submit until complete", () => {
  const f = fixture("");
  for (let end = 1; end < DEMO_SOURCE.length; end += 7) {
    f.model.update(DEMO_SOURCE.slice(0, end), true);
    assert.doesNotThrow(() => f.view.refresh());
    assert.doesNotThrow(() => f.view.render(24));
    f.view.handleInput(keys.backTab);
    f.view.handleInput(keys.enter);
    f.view.handleInput("unwanted");
  }
  assert.equal(f.results.length, 0);
  f.model.update(DEMO_SOURCE, false);
  f.view.refresh();
  assert.equal(f.model.valid, true, f.model.diagnostics.join("; "));
  assert.equal(f.model.formValues.note, "");
  f.view.handleInput(keys.backTab);
  f.view.handleInput(keys.enter);
  assert.equal(f.results[0]?.status, "submitted");
});

test("invalid final documents show diagnostics and cannot submit previous content", () => {
  const f = fixture();
  f.model.update('root = Stack([Button("Submit", "submit"), Unknown("bad")])');
  f.view.refresh();
  assert.equal(f.model.valid, false);
  assert.match(plain(f.view), /Document error/);
  f.view.handleInput(keys.enter);
  assert.deepEqual(f.results, []);
  f.view.handleInput(keys.escape);
  assert.deepEqual(f.results, [{ status: "cancelled" }]);
});

test("Unicode text, tables, and controls fit resized terminal width and height", () => {
  const f = fixture(`$note = "界🙂é";
root = Stack([Text("Wide 界界 and emoji 🙂 plus é"), Input("note", "界Label", $note), Table(["Name", "Value"], [["界🙂", "é content that wraps"], ["Other", 123]]), Button("Submit", "submit")]);`);
  assert.equal(f.model.valid, true, f.model.diagnostics.join("; "));
  for (const width of [80, 40, 16, 8, 3, 2, 1, 0, 80]) {
    for (const height of [40, 8, 3, 2, 1, 25]) {
      f.setHeight(height);
      const lines = f.view.render(width);
      assert.ok(lines.length <= height, `${width}x${height}: ${lines.length} lines`);
      assert.ok(lines.every(line => visibleWidth(line) <= width), `${width}x${height}: over-wide line`);
    }
  }
  f.setHeight(40);
  const narrow = plain(f.view, 15);
  assert.match(narrow, /Name:/);
  assert.match(narrow, /Value:/);
});

test("PageUp and PageDown expose long read-only content without focusable controls", () => {
  const source = `root = Stack([${Array.from({ length: 30 }, (_, i) => `Text("Row ${i}")`).join(",")}])`;
  const f = fixture(source, 8);
  assert.match(plain(f.view), /Row 0/);
  for (let n = 0; n < 20; n++) f.view.handleInput(keys.pageDown);
  assert.match(plain(f.view), /Row 29/);
  for (let n = 0; n < 20; n++) f.view.handleInput(keys.pageUp);
  assert.match(plain(f.view), /Row 0/);
});

test("untrusted text cannot emit terminal controls or inject Pi cursor markers", () => {
  const hostile = "hello\x1b[2J\x1b]52;c;ZXZpbA==\x07\x1b_pi:c\x07\x00\x9bworld";
  const cleaned = safeText(hostile);
  assert.equal(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/.test(cleaned), false);
  assert.match(cleaned, /hello/);
  assert.match(cleaned, /world/);
  const f = fixture(`root = Stack([Text(${JSON.stringify(hostile)}), Table(["Column"], [[${JSON.stringify(hostile)}]])])`);
  assert.equal(f.model.valid, true, f.model.diagnostics.join("; "));
  const output = f.view.render(80).join("\n");
  assert.equal(output.includes("\x1b[2J"), false);
  assert.equal(output.includes("\x1b]52"), false);
  assert.equal(output.includes(CURSOR_MARKER), false);
});

test("bracketed paste reaches the native input but pasted controls are removed", () => {
  const f = fixture();
  f.view.handleInput(keys.tab);
  f.view.handleInput("\x1b[200~hello\x1b[2Jworld\x1b[201~");
  assert.equal(f.model.formValues.note, "helloworld");
  assert.equal(plain(f.view).includes("helloworld"), true);
});
