import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Container, Input, Text, TuiAltScreen, stripTerminalSequences, visibleWidth, type Component, type Terminal } from "@earendil-works/pi-tui";
import { createChatViewport } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/chat-viewport.js";
import { createLocalWidgets } from "../src/local-widgets.js";

class TestTerminal implements Terminal {
  columns = 100; rows = 36; kittyProtocolActive = false;
  input: (data: string) => void = () => {};
  resize: () => void = () => {};
  start(input: (data: string) => void, resize: () => void) { this.input = input; this.resize = resize; }
  stop() {} async drainInput() {} write() {} moveBy() {} hideCursor() {} showCursor() {}
  clearLine() {} clearFromCursor() {} clearScreen() {} setTitle() {} setProgress() {} setProgramStatus() {}
}

class Renderer extends TuiAltScreen { flush() { this.doRender(); } }

class Composer extends Input {
  getText() { return this.getValue(); }
  setText(value: string) { this.setValue(value); }
}

const theme = { fg: (_color: string, text: string) => text, bg: (_color: string, text: string) => text, bold: (text: string) => text };

test("real fullscreen transcript reveals local focus, routes mouse and preserves the chat composer", () => {
  const terminal = new TestTerminal();
  const tui = new Renderer(terminal);
  const document = new Container();
  document.addChild(new Text(Array.from({ length: 40 }, (_, i) => `Earlier conversation ${i}`).join("\n"), 0, 0));
  const composer = new Composer({ prompt: "CHAT> " });
  const editor = new Container(); editor.addChild(composer);
  const hints = new Container();
  const footer = new Container(); footer.addChild(new Text("Host footer", 0, 0));
  const { root } = createChatViewport({ document, editor, footer, widgetsBelow: hints, pendingMessages: new Container(), status: new Container() });
  tui.addChild(document); tui.addChild(editor); tui.addChild(hints); tui.addChild(footer);
  tui.setLayoutRoot(root); tui.setFocus(composer); tui.start();
  const entries: any[] = [];
  const renderers = new Map<string, Function>();

  const pi = {
    registerEntryRenderer: (type: string, renderer: Function) => renderers.set(type, renderer),
    registerCommand() {},
    appendEntry(customType: string, data: Parameters<ExtensionAPI["appendEntry"]>[1]) {
      const entry = { type: "custom", customType, data, id: String(entries.length) };
      entries.push(entry);
      const component = renderers.get(customType)?.(entry, { expanded: false }, theme);

      if (component) document.addChild(component);
    },
  };

  const ctx = {
    mode: "tui" as const, sessionManager: { getBranch: () => entries, buildContextEntries: () => entries },
    ui: {
      setWidget(_key: string, factory?: (host: Renderer, theme: any) => Component) {
        hints.clear();

 if (factory) hints.addChild(factory(tui, theme));
      },
      onTerminalInput: (handler: any) => tui.addInputListener(handler),
    },
  };

  const manager = createLocalWidgets(pi);

  const frame = () => { tui.flush();

 return tui.getScreenLines().map(stripTerminalSequences); };

  const locate = (text: string): [number, number] => {
    const lines = frame(); const y = lines.findIndex(line => line.includes(text));
    assert.ok(y >= 0, `Missing ${text}:\n${lines.join("\n")}`);

    return [lines[y].indexOf(text), y];
  };

  const click = (text: string) => {
    const [x, y] = locate(text);
    terminal.input(`\x1b[<0;${x + 2};${y + 1}M`); tui.flush();
    terminal.input(`\x1b[<0;${x + 2};${y + 1}m`); tui.flush();
  };

  try {
    const dialog = new Container(); dialog.addChild(new Input({ prompt: "Temporary dialog> " }));
    editor.clear(); editor.addChild(dialog); tui.setFocus(dialog);
    const outcome = manager.mount("actual-transcript", '$count = 0;\nroot = Stack([Text("Count: " + $count), Button("Add one", @Set($count, $count + 1)), Button("Reset", @Reset($count))]);', "Local counter", ctx);
    assert.equal(outcome.status, "mounted", JSON.stringify(outcome));
    assert.equal(tui.getFocusedComponent(), dialog);
    terminal.input("\x1b[17~");
    assert.equal(tui.getFocusedComponent(), dialog, "mounting while a non-overlay dialog is open cannot capture it as the chat editor");
    editor.clear(); editor.addChild(composer); tui.setFocus(composer);
    assert.equal(tui.getFocusedComponent(), composer);
    document.addChild(new Text(Array.from({ length: 45 }, (_, i) => `Later chat ${i}`).join("\n"), 0, 0));
    frame(); tui.scrollToBottom(); frame();
    assert.equal(frame().some(line => line.includes("Local counter")), false);
    terminal.input("\x1b[17~");
    locate("Local counter"); locate("Count: 0"); locate("CHAT>");
    terminal.input("\r"); locate("Count: 1");
    click("Reset"); locate("Count: 0");
    click("CHAT>");
    assert.equal(tui.getFocusedComponent(), composer);
    terminal.input("hello while open");
    assert.equal(composer.getValue(), "hello while open");
    click("Add one"); locate("Count: 1");
    terminal.input("\x1b"); assert.equal(tui.getFocusedComponent(), composer);
    terminal.columns = 45; terminal.rows = 22; terminal.resize();
    terminal.input("\x1b[17~");
    locate("Count: 1"); locate("CHAT>");
    assert.ok(frame().every(line => visibleWidth(line) <= terminal.columns));
    terminal.input("\x1b");
    const replacement = new Composer({ prompt: "NEW CHAT> " });
    editor.clear(); editor.addChild(replacement); tui.setFocus(replacement);
    terminal.input("\x1b[17~");
    assert.notEqual(tui.getFocusedComponent(), replacement);
    terminal.input("\x1b");
    assert.equal(tui.getFocusedComponent(), replacement, "focus returns to a replacement editor supplied by another extension");
    manager.clear();
    assert.equal(tui.getFocusedComponent(), replacement);
    assert.equal(hints.children.length, 0);
    terminal.input("!"); assert.equal(replacement.getValue(), "!");
    assert.equal(composer.getValue(), "hello while open");
    assert.equal(entries.length, 1, "edits, focus changes and disposal never append values or messages");
  } finally { manager.clear(); tui.stop({ preserveScreen: true }); }
});
