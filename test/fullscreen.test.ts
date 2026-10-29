import assert from "node:assert/strict";
import test from "node:test";
import { TuiAltScreen, stripTerminalSequences, type Terminal } from "@earendil-works/pi-tui";
import { DEMO_SOURCE } from "../src/demo.js";
import { DocumentModel } from "../src/model.js";
import { OpenUIView, type UIResult } from "../src/view.js";

/** Drive Pi's real fullscreen renderer, including SGR decoding and overlay routing. */
class TestTerminal implements Terminal {
  columns = 100;
  rows = 36;
  kittyProtocolActive = false;
  output = "";
  input: (data: string) => void = () => {};
  resize: () => void = () => {};
  start(input: (data: string) => void, resize: () => void) { this.input = input; this.resize = resize; }
  stop() {}
  async drainInput() {}
  write(data: string) { this.output += data; }
  moveBy() {}
  hideCursor() {}
  showCursor() {}
  clearLine() {}
  clearFromCursor() {}
  clearScreen() {}
  setTitle() {}
  setProgress() {}
  setProgramStatus() {}
}
class Renderer extends TuiAltScreen { flush() { this.doRender(); } }

test("fullscreen overlay routes SGR clicks to native controls after resize and scrolling", () => {
  const terminal = new TestTerminal();
  const tui = new Renderer(terminal);
  let editorText = "";
  const editor = { render: () => ["Host editor"], invalidate() {}, handleInput: (data: string) => { editorText += data; } };
  tui.addChild(editor);
  tui.setFocus(editor);
  const model = new DocumentModel(DEMO_SOURCE);
  let result: UIResult | undefined;
  let overlay: ReturnType<Renderer["showOverlay"]> | undefined;
  const view = new OpenUIView(model, {
    getHeight: () => terminal.rows,
    requestRender: () => tui.requestRender(),
    onDone: value => { result = value; overlay?.hide(); },
    fillHeight: true,
  });
  tui.start();
  overlay = tui.showOverlay(view, { width: "100%", maxHeight: "100%", anchor: "top-left", margin: 0 });
  const lines = () => { tui.flush(); return tui.getScreenLines().map(stripTerminalSequences); };
  const at = (text: string): [number, number] => {
    const frame = lines();
    const row = frame.findIndex(line => line.includes(text));
    assert.ok(row >= 0, `Missing ${text}:\n${frame.join("\n")}`);
    return [frame[row].indexOf(text), row];
  };
  const mouse = (x: number, y: number, button = 0, release = false) => {
    terminal.input(`\x1b[<${button};${x + 1};${y + 1}${release ? "m" : "M"}`);
    tui.flush();
  };
  const click = (x: number, y: number) => { mouse(x, y); mouse(x, y, 0, true); };
  try {
    assert.match(terminal.output, /\x1b\[\?1006h/);
    const [x, y] = at("Test");
    click(x + 1, y);
    assert.equal(model.formValues.choice, "Test");
    assert.ok(lines().some(line => line.includes("Selected: Test")));
    const [, labelY] = at("Instructions");
    click(2, labelY + 1);
    terminal.input("mouse input");
    tui.flush();
    click(2, labelY + 1);
    terminal.input("clicked: ");
    assert.equal(model.formValues.note, "clicked: mouse input");

    terminal.columns = 45;
    terminal.rows = 14;
    terminal.resize();
    tui.flush();
    for (let n = 0; n < 12; n++) mouse(40, 0, 65);
    at("[ Send to Pi ]");
    terminal.columns = 100;
    terminal.rows = 36;
    terminal.resize();
    tui.flush();
    const [buttonX, buttonY] = at("[ Send to Pi ]");
    click(buttonX + 3, buttonY);
    assert.equal(result?.status, "submitted");
    if (result?.status === "submitted") {
      assert.equal(result.action, "next_step");
      assert.deepEqual(result.values, { choice: "Test", note: "clicked: mouse input" });
    }
    assert.equal(tui.getFocusedComponent(), editor, "submitting must not refocus the closed overlay");
    terminal.input("typing restored");
    assert.equal(editorText, "typing restored");
  } finally {
    overlay?.hide();
    view.dispose();
    model.dispose();
    tui.stop({ preserveScreen: true });
  }
});
