import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, visibleWidth, type Component, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { createLocalWidgets, OPENUI_LOCAL_CLOSE_ENTRY, OPENUI_LOCAL_ENTRY } from "../src/local-widgets.js";

const F2 = "\x1bOQ";

const PAGE_DOWN = "\x1b[6;5~";

const PAGE_UP = "\x1b[5;5~";

const source = `$count = 0;
root = Stack([Text("Count: " + $count), Button("Increment", @Set($count, $count + 1)),
${Array.from({ length: 70 }, (_, i) => `Text("Row ${String(i).padStart(2, "0")}")`).join(",")}]);`;

const theme = { fg: (_color: string, text: string) => text, bg: (_color: string, text: string) => text, bold: (text: string) => text };

/** Real manager and views at the public transcript-component boundary. */
function fixture() {
  const entries: any[] = [];
  const renderers = new Map<string, Function>();
  const commands = new Map<string, any>();
  const listeners = new Set<Function>();
  const editor = { focused: true, render: () => ["Composer"], invalidate() {}, handleInput() {}, getText: () => "", setText() {} };
  let focus: Component & { focused?: boolean } = editor;

  const host = {
    terminal: { columns: 80, rows: 40 },
    requestRender() {}, hasOverlay: () => false,
    getFocusedComponent: () => focus,
    setFocus(component: typeof focus) { focus.focused = false; focus = component; focus.focused = true; },
  };

  const api = {
    registerEntryRenderer: (name: string, renderer: Function) => renderers.set(name, renderer),
    registerCommand: (name: string, command: any) => commands.set(name, command),
    appendEntry: (customType: string, data: Parameters<ExtensionAPI["appendEntry"]>[1]) => entries.push({ type: "custom", customType, data }),
  };

  const ctx = {
    mode: "tui" as const, sessionManager: { getBranch: () => entries, buildContextEntries: () => entries },
    ui: {
      setWidget(_key: string, factory?: Function) { factory?.(host, theme); },
      onTerminalInput(handler: Function) { listeners.add(handler);

 return () => listeners.delete(handler); },
      notify(message: string) { assert.fail(message); },
    },
  };

  const manager = createLocalWidgets(api);
  const mounted = manager.mount("scrollbar-regression", source, "Widget title", ctx);
  assert.equal(mounted.status, "mounted", JSON.stringify(mounted));
  // SAFETY: Successful mount persisted this entry and the registered local renderer returns its native Component.
  const component = renderers.get(OPENUI_LOCAL_ENTRY)!(entries[0], { expanded: false }, theme) as Component;
  const frame = () => component.render(host.terminal.columns).map(stripTerminalSequences);

  const locate = (text: string) => {
    const lines = frame(); const y = lines.findIndex(line => line.includes(text));
    assert.ok(y >= 0, `Missing ${text}:\n${lines.join("\n")}`);

    return { x: lines[y].indexOf(text) + Math.floor(text.length / 2), y };
  };

  const mouse = (type: TuiMouseEvent["type"], x: number, y: number) => {
    const result = component.handleMouse?.({ type, button: "left", x, y, screenX: x, screenY: y,
      width: host.terminal.columns, height: frame().length, shift: false, alt: false, ctrl: false });

    frame();

 return result;
  };

  const click = (text: string) => {
    const { x, y } = locate(text);

    for (const type of ["press", "release", "click"] as const) mouse(type, x, y);
  };

  const key = (data: string) => {
    frame();

    for (const listener of listeners) if (listener(data)?.consume) return;
    focus.handleInput?.(data); frame();
  };

  const thumb = () => {
    const lines = frame(); const y = lines.findIndex(line => line.endsWith("┃"));
    assert.ok(y > 0, `Expected a body scrollbar:\n${lines.join("\n")}`);

    return { x: visibleWidth(lines[y]) - 1, y };
  };

  return { frame, click, key, mouse, thumb, locate, host, entries, manager,
    command(name: string) { return commands.get(name).handler("", ctx); },
  };
}

test("a completed scrollbar drag permits fresh Expand, Hide, Restore and Close clicks", () => {
  const f = fixture();

  try {
    f.click("Increment");
    assert.match(f.frame().join("\n"), /Count: 1/);
    const { x, y } = f.thumb();
    f.mouse("press", x, y); f.mouse("drag", x, y + 3);
    f.mouse("release", x, y + 3); f.mouse("click", x, y + 3);
    const compactRows = f.frame().length;
    f.click("[Expand F2]");
    assert.match(f.frame()[0], /Collapse F2/);
    assert.ok(f.frame().length > compactRows);
    const expandedRows = f.frame().length;
    f.click("[Hide]");
    assert.equal(f.frame().length, 1);
    f.click("[Restore]");
    assert.match(f.frame()[0], /Collapse F2/);
    assert.equal(f.frame().length, expandedRows);

    for (let n = 0; n < 10; n++) f.key(PAGE_UP);
    assert.match(f.frame().join("\n"), /Count: 1/, "restoring preserves edited model state");
    assert.equal(f.entries.length, 1, "presentation changes must not persist edited values");
    f.click("[Close]");
    assert.deepEqual(f.frame(), []);
    assert.equal(f.entries.at(-1).customType, OPENUI_LOCAL_CLOSE_ENTRY);
  } finally { f.manager.clear(); }
});

test("captured scrollbar tails cannot activate a header button, and a fresh click still works", async () => {
  const f = fixture();

  try {
    const { x, y } = f.thumb();
    const hide = f.locate("[Hide]");
    f.mouse("press", x, y); f.mouse("drag", hide.x, hide.y);
    f.mouse("release", hide.x, hide.y); f.mouse("click", hide.x, hide.y);
    assert.ok(f.frame().length > 1, "dragging across Hide must not hide the widget");
    f.click("[Hide]");
    assert.equal(f.frame().length, 1);
    f.click("[Restore]");
    const next = f.thumb();
    f.mouse("press", next.x, next.y);
    await f.command("openui-hide");
    const restore = f.locate("[Restore]");
    f.mouse("release", restore.x, restore.y); f.mouse("click", restore.x, restore.y);
    assert.equal(f.frame().length, 1, "a captured release cannot restore a hidden widget");
    f.click("[Restore]");
    assert.ok(f.frame().length > 1);
  } finally { f.manager.clear(); }
});

for (const [name, key] of [["Ctrl+PageDown", PAGE_DOWN], ["F2", F2]] as const) {
  test(`${name} cancels a held scrollbar drag before its trailing release`, () => {
    const f = fixture();

    try {
      const { x, y } = f.thumb();
      f.mouse("press", x, y); f.mouse("drag", x, y + 2);
      const before = f.frame();
      f.key(key);
      const afterKey = f.frame();
      assert.notDeepEqual(afterKey, before, "the intercepted key must change the viewport");
      f.mouse("release", x, y + 9); f.mouse("click", x, y + 9);
      assert.deepEqual(f.frame(), afterKey, "an old drag must not overwrite keyboard navigation");
      f.click("[Hide]"); f.click("[Restore]");
      assert.ok(f.frame().length > 1);
    } finally { f.manager.clear(); }
  });
}

test("single-heading local widgets retain visible overflow cues across narrow boundary widths", () => {
  const f = fixture();

  try {
    assert.equal(f.frame().filter(line => line.includes("Widget title")).length, 1);

    for (const width of [19, 20, 21, 22, 23, 39, 40, 41, 42, 49, 50, 51, 52, 53, 80, 256]) {
      f.host.terminal.columns = width;
      const lines = f.frame();
      assert.ok(lines.every(line => visibleWidth(line) <= width - 1), `parent rail must remain separate at ${width} columns`);
      assert.match(lines.join("\n"), /[┃↓↑↕]/, `overflow must stay discoverable at ${width} columns`);
      assert.ok(lines.some(line => line.includes("Row")), `body content must remain visible at ${width} columns`);
    }
  } finally { f.manager.clear(); }
});
