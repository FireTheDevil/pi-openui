import assert from "node:assert/strict";
import test from "node:test";
import { Container, CURSOR_MARKER, Text, TuiAltScreen, stripTerminalSequences, visibleWidth, type Terminal, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { createChatViewport } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/chat-viewport.js";
import { DocumentModel } from "../src/model.js";
import { OpenUIView, type UIResult } from "../src/view.js";

const F2 = "\x1bOQ";

const plain = (view: OpenUIView, width = 100) => view.render(width).map(stripTerminalSequences);

test("inline view stays compact and switching surfaces preserves invalid drafts and focus", () => {
  const model = new DocumentModel('$quantity = 2;\nroot = Stack([NumberInput("quantity","Quantity",$quantity),Button("Use quantity","submit")]);');
  const results: UIResult[] = [];
  let surface: "inline" | "fullscreen" = "inline";

  const view = new OpenUIView(model, {
    surface, getHeight: () => surface === "inline" ? 12 : 40,
    requestRender() {}, onDone: result => results.push(result),
    onToggleExpanded() { surface = surface === "inline" ? "fullscreen" : "inline"; view.setSurface(surface); },
  });

  try {
    assert.ok(plain(view, 160).length < 12, "small forms should not fill their height budget");
    assert.ok(plain(view, 160)[0].startsWith("  OpenUI"), "inline forms align with the transcript instead of centering in a wide terminal");
    view.handleInput("\x05"); view.handleInput("\x15"); view.handleInput("-");
    assert.match(plain(view).join("\n"), /number/);
    view.handleInput(F2);
    assert.equal(plain(view).length, 40);
    assert.match(plain(view).join("\n"), /Collapse F2/);
    assert.match(plain(view).join("\n"), /number/);
    assert.equal(model.formValues.quantity, 2, "expanding cannot commit an invalid numeric draft");
    view.handleInput(F2);
    assert.match(plain(view).join("\n"), /Expand F2/);
    view.handleInput("\x15"); view.handleInput("5");
    assert.equal(model.formValues.quantity, 5, "focus stays in the edited control after two surface switches");
    view.handleInput("\t"); view.handleInput("\r");
    assert.equal(results.length, 1);
    assert.equal(results[0].status, "submitted");
  } finally { view.dispose(); model.dispose(); }
});

test("static documents use full content without cursor, viewport, or dialog chrome", () => {
  const model = new DocumentModel(`root=Stack([${Array.from({ length: 30 }, (_, i) => `Text("Report row ${i}")`).join(",")}]);`);
  const view = new OpenUIView(model, { surface: "inline", getHeight: () => 8, requestRender() {}, onDone() {} });

  try {
    assert.doesNotMatch(plain(view).join("\n"), /Report row 29/);
    const full = view.renderStatic(28);
    assert.match(full.join("\n"), /Report row 29/);
    assert.doesNotMatch(full.join("\n"), /Esc|cancel|OpenUI/);
    assert.equal(full.join("\n").includes(CURSOR_MARKER), false);
    assert.ok(full.every(line => visibleWidth(line) <= 28));
    assert.equal(view.renderStatic(28, 5).length, 5);
    assert.deepEqual(view.renderStatic(0), []);
  } finally { view.dispose(); model.dispose(); }

  const fields = new DocumentModel('$note = "draft";\nroot = Stack([Input("note","Note",$note)]);');
  const form = new OpenUIView(fields, { getHeight: () => 10, requestRender() {}, onDone() {} });

  try {
    assert.equal(form.renderStatic(40).join("\n").includes(CURSOR_MARKER), false);
    assert.ok(form.render(40).some(line => line.includes(CURSOR_MARKER)), "static rendering restores interactive focus");
  } finally { form.dispose(); fields.dispose(); }
});

test("surface header mouse gesture toggles once and rejects drags or intervening resize", () => {
  const model = new DocumentModel('root = Stack([Text("Read this comparison")]);');
  let toggles = 0;
  const view = new OpenUIView(model, { surface: "inline", getHeight: () => 10, requestRender() {}, onDone() {}, onToggleExpanded() { toggles++; } });
  const mouse = (type: TuiMouseEvent["type"], x: number) => view.handleMouse({ type, button: "left", x, y: 0, screenX: x, screenY: 7, width: 100, height: 10, shift: false, alt: false, ctrl: false });

  try {
    let x = plain(view)[0].indexOf("Expand") + 1;
    mouse("press", x); plain(view); mouse("release", x); mouse("click", x);
    assert.equal(toggles, 1);
    mouse("press", x); mouse("drag", x + 1); mouse("release", x); mouse("click", x);
    assert.equal(toggles, 1);
    mouse("press", x); plain(view, 90); plain(view); mouse("release", x); mouse("click", x);
    assert.equal(toggles, 1);
    x = plain(view)[0].indexOf("Expand") + 1;
    mouse("press", x); mouse("release", x); mouse("click", x);
    assert.equal(toggles, 2);
  } finally { view.dispose(); model.dispose(); }
});

class TestTerminal implements Terminal {
  columns = 100; rows = 36; kittyProtocolActive = false;
  input: (data: string) => void = () => {};
  resize: () => void = () => {};
  start(input: (data: string) => void, resize: () => void) { this.input = input; this.resize = resize; }
  stop() {} async drainInput() {} write() {} moveBy() {} hideCursor() {} showCursor() {}
  clearLine() {} clearFromCursor() {} clearScreen() {} setTitle() {} setProgress() {} setProgramStatus() {}
}

class Renderer extends TuiAltScreen { flush() { this.doRender(); } }

test("Pi's actual editor dock routes inline mouse locally and retains transcript through resize and expansion", () => {
  const terminal = new TestTerminal();
  const tui = new Renderer(terminal);
  const editor = new Container();
  const document = new Container(); document.addChild(new Text("Conversation context stays visible", 0, 0));
  const footer = new Container(); footer.addChild(new Text("Host footer", 0, 0));
  const { root } = createChatViewport({ document, editor, footer, pendingMessages: new Container(), status: new Container() });
  tui.setLayoutRoot(root);
  const model = new DocumentModel('$choice = "A";\n$note = "ab界cd";\nroot = Stack([Select("choice","Options",["A","B","C"],$choice),Input("note","Note",$note),Button("Submit","submit")]);');
  let surface: "inline" | "fullscreen" = "inline";
  let overlay: ReturnType<Renderer["showOverlay"]> | undefined;
  let result: UIResult | undefined;

  const view = new OpenUIView(model, {
    surface, getHeight: () => surface === "inline" ? Math.max(3, Math.min(18, Math.floor(terminal.rows / 2))) : terminal.rows,
    requestRender: () => tui.requestRender(), onDone: value => { result = value; editor.clear(); overlay?.hide(); },
    onToggleExpanded() {
      surface = surface === "inline" ? "fullscreen" : "inline";
      view.setSurface(surface);

      if (surface === "fullscreen") {
        editor.clear();
        overlay = tui.showOverlay(view, { width: "100%", maxHeight: "100%", anchor: "top-left", margin: 0 });
      } else {
        overlay?.hide(); overlay = undefined; editor.addChild(view); tui.setFocus(view);
      }
    },
  });

  editor.addChild(view); tui.setFocus(view); tui.start();

  const lines = () => { tui.flush();

 return tui.getScreenLines().map(stripTerminalSequences); };

  const at = (text: string): [number, number] => {
    const frame = lines(); const y = frame.findIndex(line => line.includes(text));
    assert.ok(y >= 0, `Missing ${text}:\n${frame.join("\n")}`);

    return [frame[y].indexOf(text), y];
  };

  const click = (x: number, y: number) => { terminal.input(`\x1b[<0;${x + 1};${y + 1}M`); tui.flush(); terminal.input(`\x1b[<0;${x + 1};${y + 1}m`); tui.flush(); };

  try {
    at("Conversation context stays visible");
    const [bx, by] = at("  B"); click(bx + 2, by);
    assert.equal(model.formValues.choice, "B");
    const [ix, iy] = at("ab界cd"); click(ix + 2, iy); terminal.input("X");
    assert.equal(model.formValues.note, "abX界cd");
    const [ex, ey] = at("Expand F2"); click(ex, ey);
    at("Collapse F2"); terminal.input("Y");
    assert.equal(model.formValues.note, "abXY界cd", "expanding retains the native field cursor");
    terminal.input(F2); at("Conversation context stays visible");
    terminal.rows = 14; terminal.columns = 45; terminal.resize(); tui.flush();
    terminal.input("\t");
    const [sx, sy] = at("[ Submit ]"); click(sx + 2, sy);
    assert.equal(result?.status, "submitted");

    if (result?.status === "submitted") assert.deepEqual(result.values, { choice: "B", note: "abXY界cd" });
    at("Conversation context stays visible");
  } finally { overlay?.hide(); view.dispose(); model.dispose(); tui.stop({ preserveScreen: true }); }
});
