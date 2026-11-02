import assert from "node:assert/strict";
import test from "node:test";
import { createCodemodeExtension, type ExtensionAPI, type ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, stripTerminalSequences, visibleWidth, type Component } from "@earendil-works/pi-tui";
import openuiExtension from "../src/index.js";
import { LOCAL_EXPLANATION_SOURCE } from "../src/local-demo.js";
import { MAX_LOCAL_WIDGETS } from "../src/local-widgets.js";
import { childNodes, DocumentModel } from "../src/model.js";
import { OpenUIView } from "../src/view.js";

const SOURCE = '$count = 0;\nroot = Stack([Text("Count: " + $count), Button("Add one", @Set($count, $count + 1)), Button("Reset", @Reset($count))]);';
const F6 = "\x1b[17~";
const SHIFT_F6 = "\x1b[17;2~";
const theme = { fg: (_color: string, value: string) => value, bg: (_color: string, value: string) => value, bold: (value: string) => value };

/** Exercise the entire extension and actual views at Pi's UI/session boundary. */
function host(nativeMode?: "on" | "only") {
  const tools = new Map<string, any>();
  const events = new Map<string, Function[]>();
  const commands = new Map<string, any>();
  const shortcuts = new Map<string, any>();
  const renderers = new Map<string, Function>();
  const terminalListeners = new Set<Function>();
  const entries: any[] = [];
  let visibleEntries: any[] | undefined;
  const notices: string[] = [];
  const sent: unknown[] = [];
  const nestedResults: any[] = [];
  const widgets = new Map<string, Component & { dispose?(): void }>();
  let opens = 0, aborts = 0, replacements = 0, renders = 0, serial = 0;
  let customView: any;
  let chat = "";
  const chatMessages: string[] = [];
  const editor = {
    focused: true,
    getText: () => chat,
    setText(value: string) { chat = value; },
    render: () => ["CHAT COMPOSER " + chat], invalidate() {},
    handleInput(data: string) {
      if (data === "\r") { chatMessages.push(chat); chat = ""; }
      else chat += data;
    },
  };
  let focus: any = editor;
  const tui = {
    terminal: { rows: 40, columns: 100 },
    requestRender() { renders++; },
    hasOverlay: () => false,
    getFocusedComponent: () => focus,
    setFocus(component: any) { if (focus) focus.focused = false; focus = component; if (focus) focus.focused = true; },
    addInputListener(listener: Function) { terminalListeners.add(listener); return () => terminalListeners.delete(listener); },
  };
  let ctx: ExtensionToolContext;
  const api = {
    registerToolRenderer() {}, registerMessageRenderer() {},
    registerEntryRenderer: (type: string, renderer: Function) => renderers.set(type, renderer),
    appendEntry(type: string, data: unknown) { entries.push({ type: "custom", customType: type, id: `entry-${entries.length}`, data: structuredClone(data) }); },
    registerTool: (tool: any) => tools.set(tool.name, tool),
    registerCommand: (name: string, command: any) => commands.set(name, command),
    registerShortcut: (key: string, shortcut: any) => shortcuts.set(key, shortcut),
    on(name: string, handler: Function) { const list = events.get(name) ?? []; list.push(handler); events.set(name, list); },
    getActiveTools: () => [...tools.keys()],
    getAllTools: () => [...tools.values()].map(tool => ({ ...tool, exposure: tool.exposure ?? "direct" })),
    getSettings: () => ({ codemode: { mode: nativeMode ?? "on" } }),
    sendMessage(...args: unknown[]) { sent.push(args); }, sendUserMessage(...args: unknown[]) { sent.push(args); },
  } as unknown as ExtensionAPI;
  const emit = async (name: string, event: unknown = {}) => {
    for (const handler of events.get(name) ?? []) await handler(event, ctx);
  };
  ctx = {
    mode: "tui", hasUI: true, signal: new AbortController().signal,
    get tools() { return [...tools.values()]; },
    abort() { aborts++; },
    sessionManager: { getBranch: () => entries, buildContextEntries: () => visibleEntries ?? entries, getSessionId: () => "local-test-session" },
    ui: {
      theme,
      notify: (message: string) => notices.push(message), setStatus() {},
      getEditorText: () => chat, setEditorText: (value: string) => { chat = value; },
      setEditorComponent() { replacements++; }, getEditorComponent() { return undefined; },
      onTerminalInput(listener: Function) { terminalListeners.add(listener); return () => terminalListeners.delete(listener); },
      setWidget(key: string, content: any) {
        widgets.get(key)?.dispose?.(); widgets.delete(key);
        if (typeof content === "function") widgets.set(key, content(tui, theme));
        else if (Array.isArray(content)) widgets.set(key, { render: () => content, invalidate() {} });
      },
      custom(factory: Function) {
        opens++;
        return new Promise(resolve => {
          customView = factory(tui, theme, {}, (result: unknown) => { customView?.dispose(); tui.setFocus(editor); resolve(result); });
          tui.setFocus(customView);
        });
      },
    },
    executeTool: async (name: string, args: unknown, options: { signal?: AbortSignal } = {}) => {
      const id = `native-parent/${++serial}`;
      const result = await tools.get(name).execute(id, args, options.signal, undefined, ctx);
      nestedResults.push({ name, result });
      await emit("tool_execution_end", { type: "tool_execution_end", toolName: name, toolCallId: id, parentToolCallId: "native-parent", result, isError: !!result.isError });
      return { toolCall: { type: "toolCall", id, name, arguments: args }, result, isError: !!result.isError };
    },
  } as unknown as ExtensionToolContext;
  openuiExtension(api);
  if (nativeMode) createCodemodeExtension({ mode: nativeMode, models: false, inlineBudget: 20_000 })(api);
  const rows = () => (visibleEntries ?? entries).flatMap(entry => {
    const component = renderers.get(entry.customType)?.(entry, { expanded: true }, theme);
    return component ? [{ entry, component }] : [];
  });
  const lines = (index = 0, width = tui.terminal.columns) => rows()[index]?.component.render(width).map(stripTerminalSequences).join("\n") ?? "";
  return {
    api, tools, ctx, emit, entries, notices, sent, nestedResults, tui, editor, widgets, commands, rows, lines, chatMessages,
    get opens() { return opens; }, get aborts() { return aborts; }, get replacements() { return replacements; },
    get focus() { return focus; }, get listeners() { return terminalListeners.size; }, get renders() { return renders; },
    setVisibleEntries(value: any[] | undefined) { visibleEntries = value; },
    execute(args: Record<string, unknown> = { source: SOURCE, interaction: "local" }, id = `local-${++serial}`) {
      return tools.get("show_ui").execute(id, args, ctx.signal, undefined, ctx);
    },
    stream(args: Record<string, unknown>, id = "streaming-local") {
      return emit("message_update", { assistantMessageEvent: { type: "toolcall_delta", contentIndex: 0, partial: {
        content: [{ type: "toolCall", id, name: "show_ui", arguments: args }],
      } } });
    },
    async key(data: string) {
      rows().forEach(row => row.component.render(tui.terminal.columns));
      for (const listener of terminalListeners) { const result = listener(data); if (result?.consume) return; if (result?.data !== undefined) data = result.data; }
      for (const [key, shortcut] of shortcuts) if (matchesKey(data, key as any)) { await shortcut.handler(ctx); return; }
      focus?.handleInput?.(data);
    },
    click(index: number, text: string) {
      const component = rows()[index].component;
      const frame = component.render(tui.terminal.columns).map(stripTerminalSequences);
      const y = frame.findIndex((line: string) => line.includes(text));
      assert.ok(y >= 0, `Missing mouse target ${text}:\n${frame.join("\n")}`);
      const x = frame[y].indexOf(text) + 1;
      for (const type of ["press", "release", "click"] as const) {
        const result = component.handleMouse?.({ type, button: "left", x, y, screenX: x, screenY: y,
          width: tui.terminal.columns, height: frame.length, shift: false, alt: false, ctrl: false });
        if (result?.focus) tui.setFocus(component);
        component.render(tui.terminal.columns);
      }
    },
    async shutdown() { await emit("session_shutdown"); },
  };
}

test("local show_ui mounts immediately in the transcript and leaves the composer untouched", async () => {
  const h = host();
  try {
    const result = await h.execute();
    assert.equal(result.structuredContent.status, "mounted");
    assert.equal(typeof result.structuredContent.widgetId, "string");
    assert.deepEqual(Object.keys(result.structuredContent).sort(), ["status", "widgetId"]);
    assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
    assert.equal(result.isError, undefined);
    assert.match(h.lines(), /Count: 0/);
    assert.equal(h.focus, h.editor);
    assert.equal(h.opens, 0);
    assert.equal(h.replacements, 0);
    assert.equal(h.aborts, 0);
  } finally { await h.shutdown(); }
});

test("local widget edits, reset and focus changes emit no tool or model answers after the turn finishes", async () => {
  const h = host();
  try {
    const result = await h.execute();
    const mounted = JSON.stringify(result);
    const initialEntries = JSON.stringify(h.entries);
    await h.emit("tool_execution_end", { toolName: "show_ui", toolCallId: "local-1", result });
    await h.emit("agent_end");
    await h.key(F6); await h.key("\r");
    assert.match(h.lines(), /Count: 1/);
    await h.key("\x1b");
    assert.equal(h.focus, h.editor);
    await h.key("A normal chat message"); await h.key("\r");
    assert.deepEqual(h.chatMessages, ["A normal chat message"]);
    await h.emit("before_agent_start", { systemPromptOptions: { sections: {} } });
    await h.emit("agent_end");
    await h.key(F6); await h.key("\r");
    assert.match(h.lines(), /Count: 2/, "a later chat turn must not freeze the widget");
    await h.key("\t"); await h.key("\r");
    assert.match(h.lines(), /Count: 0/);
    await h.key(F6);
    assert.equal(h.focus, h.editor);
    assert.equal(JSON.stringify(result), mounted, "the mounted return never acquires edited answers");
    assert.equal(JSON.stringify(h.entries), initialEntries, "edited values are not written into session entries");
    assert.equal(h.sent.length, 0);
    assert.equal(h.nestedResults.length, 0);
    assert.equal(h.aborts, 0);
    assert.equal(h.opens, 0);
  } finally { await h.shutdown(); }
});

test("multiple local widgets retain independent state and remain usable after resize", async () => {
  const h = host();
  try {
    const first = await h.execute({ source: SOURCE, interaction: "local", summary: { title: "First" } });
    const second = await h.execute({ source: SOURCE, interaction: "local", summary: { title: "Second" } });
    assert.notEqual(first.structuredContent.widgetId, second.structuredContent.widgetId);
    await h.key(F6); await h.key("\r");
    const states = [h.lines(0), h.lines(1)];
    assert.equal(states.filter(value => /Count: 1/.test(value)).length, 1);
    assert.equal(states.filter(value => /Count: 0/.test(value)).length, 1);
    await h.key(SHIFT_F6); await h.key("\r"); await h.key("\r");
    const changed = [h.lines(0), h.lines(1)];
    assert.equal(changed.filter(value => /Count: 2/.test(value)).length, 1);
    assert.equal(changed.filter(value => /Count: 1/.test(value)).length, 1);
    h.tui.terminal.columns = 32; h.tui.terminal.rows = 12;
    for (const row of h.rows()) assert.ok(row.component.render(32).every((line: string) => visibleWidth(line) <= 32));
    await h.key("\x1b");
    await h.key("still typing"); await h.key("\r");
    assert.deepEqual(h.chatMessages, ["still typing"]);
  } finally { await h.shutdown(); }
});

test("local streaming arguments cannot open a focused preview before interaction arrives", async () => {
  const h = host();
  try {
    await h.stream({ source: SOURCE });
    assert.equal(h.opens, 0);
    await h.stream({ source: SOURCE, interaction: "local" });
    assert.equal(h.opens, 0);
    const result = await h.execute({ source: SOURCE, interaction: "local" }, "streaming-local");
    assert.equal(result.structuredContent.status, "mounted");
    assert.equal(h.focus, h.editor);
    assert.equal(h.opens, 0);
  } finally { await h.shutdown(); }
});

test("mouse edits share local state and focus returns to chat without dismissal", async () => {
  const h = host();
  try {
    await h.execute();
    h.click(0, "Add one");
    assert.match(h.lines(), /Count: 1/);
    assert.notEqual(h.focus, h.editor);
    await h.key("\x1b");
    assert.equal(h.focus, h.editor);
    await h.key("hello"); await h.key("\r");
    h.click(0, "Reset");
    assert.match(h.lines(), /Count: 0/);
    assert.deepEqual(h.chatMessages, ["hello"]);
    assert.equal(h.sent.length, 0);
  } finally { await h.shutdown(); }
});

test("explicit close disposes a widget without exposing its edited state", async () => {
  const h = host();
  try {
    const result = await h.execute();
    await h.key(F6); await h.key("\r");
    assert.match(h.lines(), /Count: 1/);
    assert.ok(h.commands.has("openui-close"));
    await h.commands.get("openui-close").handler(result.structuredContent.widgetId, h.ctx);
    assert.equal(h.focus, h.editor);
    assert.doesNotMatch(h.lines(), /Count: 1/);
    const tombstone = h.entries[h.entries.length - 1];
    assert.match(tombstone.customType, /close/);
    assert.equal(tombstone.data.values, undefined);
    assert.equal(tombstone.data.state, undefined);
    assert.equal(h.sent.length, 0);
    assert.deepEqual(Object.keys(result.structuredContent).sort(), ["status", "widgetId"]);
    await h.emit("session_tree");
    assert.doesNotMatch(h.lines(), /Count: 1|Add one/, "replay must respect the local close tombstone");
  } finally { await h.shutdown(); }
});

test("navigation removes abandoned widget handlers and replay restores source defaults", async () => {
  const h = host();
  try {
    await h.execute();
    const saved = structuredClone(h.entries);
    await h.key(F6); await h.key("\r");
    assert.match(h.lines(), /Count: 1/);
    h.entries.splice(0);
    await h.emit("session_tree");
    assert.equal(h.focus, h.editor);
    assert.equal(h.rows().length, 0);
    assert.equal(h.listeners, 0);
    await h.key("chat after navigation"); await h.key("\r");
    h.entries.push(...saved);
    await h.emit("session_tree");
    assert.match(h.lines(), /Count: 0/, "only original source is persisted; edited local state is not replayed");
    await h.key(F6); await h.key("\r");
    assert.match(h.lines(), /Count: 1/);
    assert.deepEqual(h.chatMessages, ["chat after navigation"]);
    await h.shutdown();
    assert.equal(h.listeners, 0);
    assert.equal(h.focus, h.editor);
  } finally { await h.shutdown(); }
});

test("compaction disposes hidden widgets while preserving remaining local state", async () => {
  const h = host();
  try {
    await h.execute({ source: SOURCE, interaction: "local", summary: { title: "Old widget" } });
    await h.execute({ source: SOURCE, interaction: "local", summary: { title: "Retained widget" } });
    await h.key(F6); await h.key("\r");
    assert.match(h.lines(1), /Count: 1/);
    await h.key(SHIFT_F6); await h.key("\r"); await h.key("\r");
    assert.match(h.lines(0), /Count: 2/);
    h.setVisibleEntries([h.entries[1]]);
    await h.emit("session_compact");
    assert.equal(h.focus, h.editor, "the compacted-away focused widget must release keyboard focus");
    assert.equal(h.rows().length, 1);
    assert.match(h.lines(), /Count: 1/, "compaction must not reset a retained widget's local state");
    await h.key(F6); await h.key("\r");
    assert.match(h.lines(), /Count: 2/);
    h.setVisibleEntries([]);
    await h.emit("session_compact");
    assert.equal(h.focus, h.editor);
    assert.equal(h.listeners, 0);
    assert.equal(h.widgets.size, 0);
    assert.equal(h.sent.length, 0);
  } finally { await h.shutdown(); }
});

test("focus shortcuts do not steal focus or keystrokes from another host dialog", async () => {
  const h = host();
  try {
    await h.execute();
    const received: string[] = [];
    const dialog = { focused: false, handleInput(data: string) { received.push(data); } };
    h.tui.setFocus(dialog);
    await h.key(F6); await h.key("dialog input");
    assert.equal(h.focus, dialog);
    assert.deepEqual(received, [F6, "dialog input"]);
    assert.match(h.lines(), /Count: 0/);
  } finally { await h.shutdown(); }
});

test("non-form tabs and explanations remain reactive without asking for an answer", async () => {
  const h = host();
  try {
    const result = await h.execute({ source: LOCAL_EXPLANATION_SOURCE, interaction: "local" });
    assert.equal(result.structuredContent.status, "mounted");
    const snapshot = JSON.stringify(h.entries);
    await h.key(F6); await h.key("\x1b[C");
    assert.match(h.lines(), /total = base/);
    await h.key("\x1b[D"); await h.key("\t"); await h.key("\r");
    assert.match(h.lines(), /Unused included workers/);
    await h.key("\x1b");
    assert.equal(h.focus, h.editor);
    assert.equal(h.sent.length, 0);
    assert.equal(JSON.stringify(h.entries), snapshot);
  } finally { await h.shutdown(); }
});

test("widget capacity is bounded, duplicate mount is idempotent and close releases capacity", async () => {
  const h = host();
  try {
    const mounted: any[] = [];
    for (let index = 0; index < MAX_LOCAL_WIDGETS; index++) {
      const result = await h.execute({ source: SOURCE, interaction: "local" }, `bounded-${index}`);
      assert.equal(result.structuredContent.status, "mounted");
      mounted.push(result.structuredContent);
    }
    const again = await h.execute({ source: SOURCE, interaction: "local" }, "bounded-0");
    assert.deepEqual(again.structuredContent, mounted[0]);
    assert.equal(h.entries.length, MAX_LOCAL_WIDGETS);
    const conflict = await h.execute({ source: 'root = Stack([Text("Different document")]);', interaction: "local" }, "bounded-0");
    assert.equal(conflict.structuredContent.status, "error");
    assert.match(conflict.structuredContent.error, /different|new call/i);
    assert.equal(h.entries.length, MAX_LOCAL_WIDGETS);
    const overflow = await h.execute({ source: SOURCE, interaction: "local" }, "overflow");
    assert.equal(overflow.structuredContent.status, "error");
    assert.match(overflow.structuredContent.error, /openui-close/);
    await h.commands.get("openui-close").handler(mounted[0].widgetId, h.ctx);
    const replacement = await h.execute({ source: SOURCE, interaction: "local" }, "replacement");
    assert.equal(replacement.structuredContent.status, "mounted");
    assert.equal(h.sent.length, 0);
  } finally { await h.shutdown(); }
});

for (const operation of ["setWidget", "appendEntry"] as const) test(`a failed host ${operation} leaves no mounted widget or input handlers`, async () => {
  const h = host();
  const owner: any = operation === "setWidget" ? h.ctx.ui : h.api;
  const original = owner[operation];
  try {
    owner[operation] = () => { throw new Error(`Test ${operation} failure`); };
    const result = await h.execute({ source: SOURCE, interaction: "local" }, "failed-mount");
    assert.equal(result.structuredContent.status, "error");
    assert.match(result.structuredContent.error, new RegExp(operation));
    assert.equal(h.entries.length, 0);
    assert.equal(h.listeners, 0);
    assert.equal(h.focus, h.editor);
    owner[operation] = original;
    const next = await h.execute({ source: SOURCE, interaction: "local" }, "failed-mount");
    assert.equal(next.structuredContent.status, "mounted", "a failed mount must not leave a stale id/model");
    assert.match(h.lines(), /Count: 0/);
    assert.equal(h.sent.length, 0);
  } finally { owner[operation] = original; await h.shutdown(); }
});

test("a local view defensively refuses a runtime-injected submission action", () => {
  const model = new DocumentModel(SOURCE);
  const results: unknown[] = [];
  const view = new OpenUIView(model, { interaction: "local", theme, getHeight: () => 20,
    requestRender() {}, onDone(result) { results.push(result); }, onBlur() {} });
  try {
    const button = childNodes(model.root!).find(node => node.typeName === "Button")!;
    button.props.action = { steps: [{ type: "continue_conversation", message: "leaked" }] };
    view.refresh(); view.render(100); view.handleInput("\r");
    assert.equal(results.length, 0);
    assert.equal(model.state.$count, 0);
    assert.match(view.render(100).map(stripTerminalSequences).join("\n"), /local|submi|not allowed/i);
  } finally { view.dispose(); model.dispose(); }
});

for (const source of [
  'root = Stack([Button("Submit", "submit")]);',
  'root = Stack([Button("Send", @ToAssistant("answer"))]);',
  '$hidden = false;\nroot = Stack([$hidden ? Button("Hidden send", @ToAssistant("answer")) : Text("Safe-looking branch")]);',
]) test("local mode rejects submission paths without mounting or opening a form: " + source.slice(0, 45), async () => {
  const h = host();
  try {
    const result = await h.execute({ source, interaction: "local" });
    assert.equal(result.structuredContent.status, "error");
    assert.equal(result.isError, true);
    assert.match(result.structuredContent.error, /local|ToAssistant|submi|action/i);
    assert.equal(h.entries.length, 0);
    assert.equal(h.opens, 0);
    assert.equal(h.sent.length, 0);
  } finally { await h.shutdown(); }
});

test("local mode rejects fullscreen and malformed source with actionable diagnostics", async () => {
  const h = host();
  try {
    for (const args of [
      { source: SOURCE, interaction: "local", presentation: "fullscreen" },
      { source: 'root = Unknown("bad");', interaction: "local" },
    ]) {
      const result = await h.execute(args);
      assert.equal(result.structuredContent.status, "error");
      assert.match(result.structuredContent.error, /inline|fullscreen|Unknown|unknown/i);
    }
    assert.equal(h.entries.length, 0);
    assert.equal(h.opens, 0);
  } finally { await h.shutdown(); }
});

test("existing static displays and answer-collecting forms retain their separate outcomes", async () => {
  const h = host();
  try {
    const displayed = await h.execute({ source: 'root = Stack([Text("Static report")]);' });
    assert.deepEqual(displayed.structuredContent, { status: "displayed" });
    assert.equal(h.opens, 0);
    const form = h.execute({ source: 'root = Stack([Button("Submit", "accepted")]);' });
    assert.equal(h.opens, 1);
    await h.key("\r");
    const submitted = await form;
    assert.equal(submitted.structuredContent.status, "submitted");
    assert.equal(submitted.structuredContent.action, "accepted");
    assert.equal(h.sent.length, 0);
  } finally { await h.shutdown(); }
});

for (const mode of ["on", "only"] as const) test(`native QuickJS ${mode} completes while its local widget remains interactive`, { timeout: 15_000 }, async () => {
  const h = host(mode);
  try {
    const code = `const result = await tools.show_ui({source:${JSON.stringify(SOURCE)},interaction:"local"}); text(result); text("CALLER_CONTINUED");`;
    const result = await h.tools.get("codemode").execute("native-parent", { code }, h.ctx.signal, undefined, h.ctx);
    assert.equal(result.isError, undefined);
    const output = result.content.map((item: any) => item.text ?? "").join("\n");
    assert.match(output, /"status":"mounted"/);
    assert.match(output, /CALLER_CONTINUED/);
    assert.equal(h.opens, 0);
    await h.emit("agent_end");
    await h.key(F6); await h.key("\r");
    assert.match(h.lines(), /Count: 1/);
    assert.equal(h.nestedResults.length, 1, "local edits do not invoke a second tool");
    assert.deepEqual(Object.keys(h.nestedResults[0].result.structuredContent).sort(), ["status", "widgetId"]);
    assert.equal(h.sent.length, 0);
    assert.equal(h.aborts, 0);
  } finally { await h.shutdown(); }
});
