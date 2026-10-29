import assert from "node:assert/strict";
import test from "node:test";
import chalk from "chalk";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, visibleWidth, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { DocumentModel } from "../src/model.js";
import { CATALOG_DEMO_SOURCE } from "../src/demo.js";
import { OpenUIView, type UIResult } from "../src/view.js";

const { getThemeByName } = await import(new URL("./modes/interactive/theme/theme.js", import.meta.resolve("@earendil-works/pi-coding-agent")).href);
const theme = getThemeByName("dark") as Theme;
assert.ok(theme);

function fixture(source: string, initialWidth = 110, initialHeight = 80) {
  const model = new DocumentModel(source);
  assert.equal(model.valid, true, model.diagnostics.join("; "));
  const results: UIResult[] = [];
  let width = initialWidth;
  let height = initialHeight;
  const view = new OpenUIView(model, { theme, requestRender() {}, getHeight: () => height, onDone: value => results.push(value) });
  const render = () => view.render(width);
  const lines = () => render().map(stripTerminalSequences);
  function click(needle: string) {
    const frame = lines();
    const y = frame.findIndex(line => line.includes(needle));
    assert.ok(y >= 0, `Missing ${needle}:\n${frame.join("\n")}`);
    const x = frame[y].indexOf(needle);
    const event = { button: "left", x, y, screenX: x, screenY: y, width, height, shift: false, alt: false, ctrl: false } as const;
    for (const type of ["press", "release", "click"] as TuiMouseEvent["type"][]) view.handleMouse({ ...event, type });
  }
  return { model, view, results, render, lines, click,
    key(data: string) { render(); view.handleInput(data); },
    resize(w: number, h: number) { width = w; height = h; return render(); },
  };
}

test("typed native controls submit booleans, numbers, arrays, multiline text, dates and tree values", () => {
  const f = fixture(`$agree = false;
$notify = false;
$quantity = 2;
$volume = 4;
$tags = [];
$notes = "";
$date = "2026-10-29";
$target = "root";
root = Stack([
  Checkbox("agree", "I agree", $agree),
  Toggle("notify", "Notifications", $notify),
  NumberInput("quantity", "Quantity", $quantity, {min: 1, max: 10, step: 1}),
  Slider("volume", "Volume", $volume, 0, 10, 2),
  MultiSelect("tags", "Tags", ["One", "Two"], $tags),
  TextArea("notes", "Notes", $notes, "Multiple lines", {rows: 5}),
  DatePicker("date", "Date", $date, {minDate: "2026-01-01", maxDate: "2026-12-31"}),
  Tree("target", "Target", [{value: "root", label: "Project", children: [{value: "file", label: "File"}]}], $target),
  Button("Send", @ToAssistant("Use the typed values"))
]);`);
  f.key(" ");
  f.key("\t"); f.key(" ");
  f.key("\t"); f.key("\x1b[A");
  f.key("\t"); f.key("\x1b[C");
  f.key("\t"); f.key(" "); f.key("\x1b[B"); f.key(" ");
  f.key("\t"); f.key("line one"); f.key("\r"); f.key("line two");
  f.key("\t"); f.key("\x1b[C");
  f.key("\t"); f.key("\x1b[C"); f.key("\x1b[B"); f.key(" ");
  f.click("[ Send ]");
  assert.equal(f.results[0]?.status, "submitted");
  if (f.results[0]?.status === "submitted") {
    assert.deepEqual(f.results[0].values, {
      agree: true, notify: true, quantity: 3, volume: 6,
      tags: ["One", "Two"], notes: "line one\nline two", date: "2026-10-30", target: "file",
    });
  }
});

test("disabled buttons cannot execute via keyboard or mouse and become usable when enabled", () => {
  const source = (disabled: boolean) => `$count = 0;\nroot = Stack([Text("Count: " + $count), Button("Increment", @Set($count, $count + 1), {variant: "primary", disabled: ${disabled}})]);`;
  const f = fixture(source(true));
  f.key("\r");
  f.key(" ");
  f.click("Increment");
  assert.equal(f.model.state.$count, 0);
  assert.equal(f.results.length, 0);
  f.model.update(source(false));
  f.view.refresh();
  f.click("Increment");
  assert.equal(f.model.state.$count, 1);
});

test("Text emphasis and button variants use Pi's semantic theme", () => {
  const previous = chalk.level;
  chalk.level = 3;
  try {
    const f = fixture('root = Stack([Text("Careful", {tone: "warning", bold: true, italic: true}), Button("Save", "save", {variant: "primary"}), Button("Later", "later", {variant: "secondary"}), Button("Delete", "delete", {variant: "danger"})]);');
    const lines = f.render();
    const text = lines.find(line => stripTerminalSequences(line).includes("Careful"))!;
    const danger = lines.find(line => stripTerminalSequences(line).includes("[ Delete ]"))!;
    const primary = lines.find(line => stripTerminalSequences(line).includes("[ Save ]"))!;
    assert.ok(text.includes(theme.getFgAnsi("warning")));
    assert.ok(text.includes("\x1b[1m"));
    assert.ok(text.includes("\x1b[3m"));
    assert.ok(danger.includes(theme.getFgAnsi("error")));
    assert.ok(primary.includes(theme.getFgAnsi("accent")));
    assert.ok(lines.some(line => stripTerminalSequences(line).includes("[ Later ]")));
  } finally { chalk.level = previous; }
});

test("rich display components render their content through the native view and adapt to narrow widths", () => {
  const f = fixture('root = Stack([Markdown("# Release notes\\n\\n**Ready** to ship."), CodeBlock("const answer = 42;", "typescript"), List(["Build", "Test"], true), Badge("Ready", "success"), Progress(3, 4, "Build tasks"), Divider("Details")]);');
  const text = f.lines().join("\n");
  assert.match(text, /Release notes/);
  assert.match(text, /const answer = 42;/);
  assert.match(text, /typescript/);
  assert.match(text, /1\. Build/);
  assert.match(text, /2\. Test/);
  assert.match(text, /Ready/);
  assert.match(text, /Build tasks/);
  assert.match(text, /75%/);
  assert.match(text, /Details/);
  for (const width of [110, 60, 28, 10, 3, 1, 0]) {
    for (const height of [80, 10, 3, 1]) {
      const frame = f.resize(width, height);
      assert.ok(frame.length <= height);
      assert.ok(frame.every(line => visibleWidth(line) <= width), `${width}x${height} overflow`);
    }
  }
});

test("all rich display components sanitize model-provided terminal controls", () => {
  const hostile = "unsafe\x1b[2J\x1b]52;c;ZXZpbA==\x07 payload";
  const value = JSON.stringify(hostile);
  const f = fixture(`root = Stack([Markdown(${value}), CodeBlock(${value}, ${value}), List([${value}]), Badge(${value}), Progress(1, 2, ${value}), Divider(${value})]);`);
  const output = f.render().join("\n");
  assert.equal(output.includes("\x1b[2J"), false);
  assert.equal(output.includes("\x1b]52"), false);
  assert.match(stripTerminalSequences(output), /unsafe/);
});

test("incremental catalog prefixes render safely and remain read-only across partial layouts and fields", () => {
  const model = new DocumentModel();
  const results: UIResult[] = [];
  const view = new OpenUIView(model, { theme, requestRender() {}, getHeight: () => 10, onDone: result => results.push(result) });
  try {
    for (let end = 1; end < CATALOG_DEMO_SOURCE.length; end += 97) {
      model.update(CATALOG_DEMO_SOURCE.slice(0, end), true);
      assert.doesNotThrow(() => view.refresh(), `refresh at prefix ${end}`);
      for (const width of [24, 60]) {
        let frame: string[] = [];
        assert.doesNotThrow(() => { frame = view.render(width); }, `render at prefix ${end}`);
        assert.ok(frame.length <= 10);
        assert.ok(frame.every(line => visibleWidth(line) <= width));
        const before = structuredClone(model.state);
        for (const key of ["\t", "\x1b[C", "\r", " ", "unwanted"]) view.handleInput(key);
        view.handleMouse({ type: "click", button: "left", x: 4, y: 3, screenX: 4, screenY: 3, width, height: 10, shift: false, alt: false, ctrl: false });
        assert.deepEqual(model.state, before, `streamed state changed at prefix ${end}`);
      }
      assert.equal(results.length, 0);
    }
    model.update(CATALOG_DEMO_SOURCE);
    view.refresh();
    assert.equal(model.valid, true, model.diagnostics.join("; "));
    assert.doesNotThrow(() => view.render(110));
    assert.equal(results.length, 0);
  } finally { view.dispose(); model.dispose(); }
});
