import assert from "node:assert/strict";
import test from "node:test";
import chalk from "chalk";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, stripTerminalSequences, visibleWidth, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { DocumentModel } from "../src/model.js";
import { OpenUIView, type UIResult, type ViewOptions } from "../src/view.js";

// Use Pi's shipped themes without mutating its process-wide active theme.
const { getThemeByName } = await import(new URL("./modes/interactive/theme/theme.js", import.meta.resolve("@earendil-works/pi-coding-agent")).href);
const themes = ["dark", "light"].map(name => {
  const theme = getThemeByName(name) as Theme | undefined;
  assert.ok(theme, `Pi must supply the ${name} theme`);
  return theme;
});
const SOURCE = `$choice = "Review";
$note = "ab界cd";
root = Stack([Text("A refined native form"), Select("choice", "Next step", ["Review", "Implement", "Test"], $choice), Input("note", "Instructions", $note, "Optional note"), Table(["Field", "Value"], [["Choice", $choice], ["Note", $note]]), Button("Send", @ToAssistant("Use these values"))]);`;

function fixture(theme: Theme, source = SOURCE, initialWidth = 120, initialHeight = 40) {
  const model = new DocumentModel(source);
  assert.equal(model.valid, true, model.diagnostics.join("; "));
  const results: UIResult[] = [];
  let width = initialWidth;
  let height = initialHeight;
  const options: ViewOptions = { theme, title: "OpenUI theme test", fillHeight: true, getHeight: () => height, requestRender() {}, onDone: result => results.push(result) };
  const view = new OpenUIView(model, options);
  const render = () => view.render(width);
  const plain = () => render().map(stripTerminalSequences);
  function at(text: string): [number, number] {
    const lines = plain();
    const y = lines.findIndex(line => line.includes(text));
    assert.ok(y >= 0, `Missing ${text}:\n${lines.join("\n")}`);
    return [lines[y].indexOf(text), y];
  }
  function mouse(type: TuiMouseEvent["type"], x: number, y: number) {
    return view.handleMouse({ type, button: "left", x, y, screenX: x, screenY: y, width, height, shift: false, alt: false, ctrl: false });
  }
  function click(x: number, y: number) {
    mouse("press", x, y); render(); mouse("release", x, y); return mouse("click", x, y);
  }
  return { model, view, options, results, render, plain, at, click, resize(w: number, h: number) { width = w; height = h; return render(); } };
}

test("Pi dark and light themes style titles, selected controls, table headers and hints", () => {
  const previousLevel = chalk.level;
  chalk.level = 3; // Exercise Pi's Chalk-backed emphasis as in a color-capable TTY.
  try { for (const theme of themes) {
    const f = fixture(theme);
    const frame = f.render();
    const title = frame.find(line => stripTerminalSequences(line).includes("OpenUI theme test"))!;
    const selected = frame.find(line => stripTerminalSequences(line).includes("→ Review"))!;
    const header = frame.find(line => stripTerminalSequences(line).includes("Field") && stripTerminalSequences(line).includes("Value"))!;
    assert.ok(title.includes(theme.getFgAnsi("accent")), "title uses the host accent");
    assert.ok(title.includes("\x1b[1m"), "title has semantic emphasis");
    assert.ok(selected.includes(theme.getBgAnsi("selectedBg")), "active option has a focus background");
    assert.ok(header.includes("\x1b[1m"), "table header has semantic emphasis");
    assert.ok(frame.at(-1)!.includes(theme.getFgAnsi("muted")) || frame.at(-1)!.includes(theme.getFgAnsi("dim")), "footer uses quiet theme text");
    const inactiveInput = frame.find(line => stripTerminalSequences(line).includes("ab界cd"))!;
    assert.equal(inactiveInput.includes("\x1b[7m"), false, "unfocused input does not draw a fake inverse cursor");
    assert.equal(inactiveInput.includes(CURSOR_MARKER), false);
    f.view.handleInput("\t");
    assert.ok(f.render().some(line => line.includes(CURSOR_MARKER)), "focused input exposes native cursor");
    f.view.handleInput("\t");
    const focusedButton = f.render().find(line => stripTerminalSequences(line).includes("[ Send ]"))!;
    assert.ok(focusedButton.includes(theme.getBgAnsi("selectedBg")), "focused button uses host selection background");
  } } finally { chalk.level = previousLevel; }
});

test("theme changes restyle the existing view while preserving native input state", () => {
  const f = fixture(themes[0]);
  f.view.handleInput("\t");
  f.view.handleInput("typed ");
  const before = f.render().join("\n");
  f.options.theme = themes[1];
  f.view.invalidate();
  const after = f.render().join("\n");
  assert.notEqual(before, after);
  assert.deepEqual(after.split("\n").map(stripTerminalSequences), before.split("\n").map(stripTerminalSequences));
  assert.equal(f.model.formValues.note, "typed ab界cd");
});

test("centered themed content translates mouse coordinates for selection, Unicode input and buttons", () => {
  const f = fixture(themes[0]);
  const [optionX, optionY] = f.at("Test");
  assert.ok(optionX > 2, "wide-terminal content has a reading margin");
  f.click(optionX, optionY);
  assert.equal(f.model.formValues.choice, "Test");
  const [inputX, inputY] = f.at("ab界cd");
  f.click(inputX + 2, inputY);
  f.view.handleInput("X");
  assert.equal(f.model.formValues.note, "abX界cd");
  const [buttonX, buttonY] = f.at("[ Send ]");
  f.click(0, buttonY);
  assert.equal(f.results.length, 0, "left margin is not a button target");
  f.click(buttonX, buttonY);
  assert.equal(f.results.length, 1);
  assert.equal(f.results[0].status, "submitted");
});

test("themed Unicode controls remain bounded at narrow widths and short heights", () => {
  for (const theme of themes) {
    const f = fixture(theme);
    f.view.handleInput("\t");
    for (const width of [120, 80, 40, 39, 16, 8, 3, 2, 1, 0]) {
      for (const height of [40, 8, 3, 2, 1]) {
        const frame = f.resize(width, height);
        assert.ok(frame.length <= height);
        assert.ok(frame.every(line => visibleWidth(line) <= width), `${theme.name} ${width}x${height} must fit`);
      }
    }
  }
});

test("action failures use the host error color while keeping the panel interactive", () => {
  const source = '$choice = "One";\nroot = Stack([Select("choice", "Choice", ["One", "Two"], $choice), Button("Apply", @Set($choice, "Missing"))]);';
  for (const theme of themes) {
    const f = fixture(theme, source);
    const [x, y] = f.at("[ Apply ]");
    f.click(x, y);
    const error = f.render().find(line => stripTerminalSequences(line).includes("Action error:"));
    assert.ok(error?.includes(theme.getFgAnsi("error")), "action errors use the host error token");
    assert.equal(f.model.formValues.choice, "One");
    assert.equal(f.results.length, 0);
    f.view.handleInput("\x1b");
    assert.deepEqual(f.results, [{ status: "cancelled" }]);
  }
});

test("host styling survives while model-provided terminal escapes are stripped", () => {
  const hostile = "Unsafe\x1b[2J\x1b]52;c;ZXZpbA==\x07\x1b_pi:c\x07\x1b[31m payload";
  for (const theme of themes) {
    const f = fixture(theme, `root = Stack([Text(${JSON.stringify(hostile)}), Table(["Column"], [[${JSON.stringify(hostile)}]]), Button(${JSON.stringify(hostile)}, "send")]);`);
    const frame = f.render().join("\n");
    assert.ok(frame.includes(theme.getFgAnsi("accent")));
    assert.equal(frame.includes("\x1b[2J"), false);
    assert.equal(frame.includes("\x1b]52"), false);
    assert.equal(frame.includes(CURSOR_MARKER), false);
    assert.equal(frame.includes("\x1b[31m"), false);
    assert.match(stripTerminalSequences(frame), /Unsafe payload/);
  }
});

test("control-only Select options have safe visible labels without falling back to raw terminal escapes", () => {
  for (const theme of themes) {
    for (const value of ["\x1b[2J", "\x1b]52;c;ZXZpbA==\x07", CURSOR_MARKER]) {
      const f = fixture(theme, `$choice = ${JSON.stringify(value)};\nroot = Stack([Select("choice", "Choose", [${JSON.stringify(value)}, "Safe"], $choice), Button("Send", "send")]);`);
      const output = f.render().join("\n");
      assert.match(stripTerminalSequences(output), /→ \(empty\)/);
      assert.equal(output.includes("\x1b[2J"), false);
      assert.equal(output.includes("\x1b]52"), false);
      assert.equal(output.includes(CURSOR_MARKER), false);
      assert.equal(f.model.formValues.choice, value, "display sanitization must not corrupt the selected value");
      f.view.handleInput("\x1b[B");
      assert.equal(f.model.formValues.choice, "Safe");
      f.view.handleInput("\x1b[A");
      assert.equal(f.model.formValues.choice, value);
    }
  }
});
