import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { Type } from "typebox";
import { z } from "zod";
import type { ExtensionAPI, ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, type Component } from "@earendil-works/pi-tui";
import openuiExtension from "../../src/index.js";
import { HOSTING_EXPLORER_SOURCE } from "../../src/local-demo.js";
import { OPENUI_LOCAL_ENTRY, OPENUI_LOCAL_CLOSE_ENTRY } from "../../src/local-widgets.js";

// Opt-in integration suite: use the installed upstream package and its real
// Code, Deno Notebook, JS Notebook and TS runtimes. PCC is deliberately not a
// runtime dependency of OpenUI. OPENUI_PCC_MODES can restrict the tested modes.
// OPENUI_PCC_PACKAGE=/path/to/package PI_CODING_AGENT_DIR=/isolated/agent \
//   node --import tsx --test test/compat/pcc.test.ts
const packagePath = process.env.OPENUI_PCC_PACKAGE;

assert.ok(packagePath, "Set OPENUI_PCC_PACKAGE to an installed @howaboua/pi-codex-conversion package directory");

assert.ok(process.env.PI_CODING_AGENT_DIR, "Set PI_CODING_AGENT_DIR to an isolated test agent directory");

const imported = (path: string) => import(pathToFileURL(resolve(packagePath, path)).href);

const { registerCodeModeTools } = await imported("dist/tools/code-mode/tools.js");

const { createPiCodeModeBridge } = await imported("dist/adapter/code-mode/pi-tools.js");

const { getCodeModeExtensionToolSnapshot } = await imported("dist/code-mode-extension-tools.js");

const SOURCE = '$count = 1;\nroot = Stack([Text("Count: " + $count), Button("Add", @Set($count, $count + 1)), Button("Send", @ToAssistant("Count confirmed", {count: $count}))]);';

const theme = { fg: (_color: string, value: string) => value, bg: (_color: string, value: string) => value, bold: (value: string) => value };

type Mode = "code" | "notebook" | "ts" | "js";

async function host(mode: Mode) {
  const cwd = mkdtempSync(join(tmpdir(), `openui-pcc-${mode}-`));
  // PCC JS notebooks are shared by project. Stop ancestor repository discovery
  // here so each test has its own checkpoint rather than another test's state.
  mkdirSync(join(cwd, ".git"));
  const callbacks = new Map<string, Function[]>();
  const tools = new Map<string, any>();
  const entries: any[] = [];
  const results: any[] = [];
  const markers: string[] = [];
  const entryRenderers = new Map<string, Function>();
  const commands = new Map<string, any>();
  const terminalListeners = new Set<Function>();
  const dockWidgets = new Map<string, Component & { dispose?(): void }>();
  const chatMessages: string[] = [];
  let chatDraft = "";

  const editor = {
    focused: true, invalidate() {}, render: () => [chatDraft],
    getText: () => chatDraft, setText(value: string) { chatDraft = value; },
    handleInput(data: string) {
      if (data === "\r") { chatMessages.push(chatDraft); chatDraft = ""; }
      else chatDraft += data;
    },
  };

  let focus: Component & { focused?: boolean } = editor;

  const tui = {
    mode: "regular", terminal: { rows: 40, columns: 100 }, requestRender() {},
    hasOverlay: () => false,
    getFocusedComponent: () => focus,
    setFocus(next: Component & { focused?: boolean }) {
      if (focus) focus.focused = false;
      focus = next;

      if (focus) focus.focused = true;
    },
  };

  const bus = new EventEmitter();
  let component: (Component & { dispose?(): void }) | undefined;
  let notifyOpened: (() => void) | undefined;
  let active = new AbortController();
  let abortCalls = 0;
  let closed = 0;
  let opens = 0;
  let serial = 0;
  let call = 0;
  let parentId = "";
  let lastCellId: string | undefined;
  const onUpdate = (result: any) => { if (z.string().safeParse(result.details?.cellId).success) lastCellId = result.details.cellId; };

  const events = {
    on(name: string, handler: (...args: any[]) => void) {
      bus.on(name, handler);

      return () => bus.off(name, handler);
    },
    emit(name: string, value: Parameters<ExtensionAPI["events"]["emit"]>[1]) { bus.emit(name, value); },
  };

  const emit = async (name: string, value: Parameters<ExtensionAPI["events"]["emit"]>[1]) => {
    for (const callback of callbacks.get(name) ?? []) await callback(value, ctx);
  };

  const api: Pick<ExtensionAPI, "events" | "on" | "registerTool" | "registerCommand" | "registerToolRenderer" | "registerMessageRenderer" | "registerEntryRenderer" | "getActiveTools" | "getAllTools" | "appendEntry" | "sendMessage" | "sendUserMessage"> = {
    events,
    on(name, handler) {
      callbacks.set(name, [...(callbacks.get(name) ?? []), handler]);

      return () => {
        const remaining = (callbacks.get(name) ?? []).filter(callback => callback !== handler);
        callbacks.set(name, remaining);
      };
    },
    registerTool(tool: any) { tools.set(tool.name, tool); },
    registerCommand(name: string, command: any) { commands.set(name, command); },
    registerToolRenderer() {}, registerMessageRenderer() {},
    registerEntryRenderer(name: string, renderer: Function) { entryRenderers.set(name, renderer); },
    getActiveTools: () => [...tools.keys()],
    getAllTools: () => [...tools.values()],
    appendEntry(customType: string, data: Parameters<ExtensionAPI["appendEntry"]>[1]) { entries.push({ type: "custom", customType, data: structuredClone(data) }); },
    sendMessage() { throw new Error("Tool execution must not enqueue another agent turn"); },
    sendUserMessage() { throw new Error("Local UI changes must not enqueue user-answer messages"); },
  };

  const ctx = {
    cwd, mode: "tui", hasUI: true,
    get signal() { return active.signal; },
    abort() { abortCalls++; active.abort(); },
    isProjectTrusted: () => true,
    sessionManager: { getBranch: () => entries, getSessionId: () => `openui-pcc-${mode}`, getSessionFile: () => undefined },
    get tools() { return [...tools.values()]; },
    ui: {
      theme, notify() {},
      onTerminalInput(handler: Function) { terminalListeners.add(handler);

 return () => terminalListeners.delete(handler); },
      setWidget(key: string, content: any) {
        dockWidgets.get(key)?.dispose?.(); dockWidgets.delete(key);

        if (z.function().safeParse(content).success) dockWidgets.set(key, content(tui, theme));
      },
      custom: <T>(factory: Function) => new Promise<T>(resolve => {
        opens++;
        let finished = false;
        component = factory({ terminal: { rows: 30 }, requestRender() {} }, {}, {}, (result: T) => {
          if (finished) return;
          finished = true; closed++; component?.dispose?.(); resolve(result);
        });
        notifyOpened?.();
      }),
    },
    async executeTool(name: string, args: Parameters<ExtensionToolContext["executeTool"]>[1], options: Parameters<ExtensionToolContext["executeTool"]>[2] = {}) {
      options.signal?.throwIfAborted();
      const id = `${parentId}/${++serial}`;
      const result = await tools.get(name).execute(id, args, options.signal, undefined, ctx);
      results.push({ name, result });
      await emit("tool_execution_end", { type: "tool_execution_end", toolName: name, toolCallId: id,
        parentToolCallId: parentId, result, isError: !!result.isError });

      return { toolCall: { type: "toolCall", id, name, arguments: args }, result, isError: !!result.isError };
    },
  };

  // SAFETY: This typed host supplies OpenUI registration, event bus, persistence and message members; context and native PCC execution remain the actual fixture paths below.
  openuiExtension(api as ExtensionAPI);
  tools.set("marker", {
    name: "marker", description: "Record test execution after the UI returns", parameters: Type.Object({ text: Type.String() }),
    execute: async (_id: string, params: { text: string }) => {
      markers.push(params.text);

      return { content: [{ type: "text", text: params.text }], details: {} };
    },
  });
  const bridge = createPiCodeModeBridge(api);

  const registration = await registerCodeModeTools(api, {
    getTools: () => {
      const extensions = getCodeModeExtensionToolSnapshot(api, ctx, { eligibleTopLevelNames: [...tools.keys()] });

      return [...extensions.tools, ...bridge.getTools(extensions.allToolNames)];
    },
    prepareLoadout: bridge.prepareLoadout,
    executionKind: () => mode,
    notebookOptions: () => ({ maxHeapMiB: 256, agentDir: process.env.PI_CODING_AGENT_DIR }),
  });

  tools.get("exec").prepareLoadout({
    declared: [...tools.values()], callable: [tools.get("show_ui"), tools.get("marker")],
    registered: [...tools.values()], getNamespace: () => undefined,
  });

  const localComponent = (index = 0): Component => {
    const entry = entries.filter(entry => entry.customType === OPENUI_LOCAL_ENTRY)[index];
    assert.ok(entry, "local widgets must have their own persistent conversation entry");
    const rendered = entryRenderers.get(OPENUI_LOCAL_ENTRY)?.(entry, { expanded: true }, theme);
    assert.ok(rendered);

    return rendered;
  };

  return {
    results, markers, entries, chatMessages, editor, emit,
    get closed() { return closed; }, get opens() { return opens; }, get abortCalls() { return abortCalls; },
    get lastCellId() { return lastCellId; },
    get focus() { return focus; }, get listeners() { return terminalListeners.size; },
    localRender(index = 0) { return localComponent(index).render(100).map(stripTerminalSequences).join("\n"); },
    localKey(data: string) {
      for (const entry of entries.filter(entry => entry.customType === OPENUI_LOCAL_ENTRY)) {
        entryRenderers.get(OPENUI_LOCAL_ENTRY)?.(entry, { expanded: true }, theme)?.render(100);
      }

      for (const listener of terminalListeners) {
        const result = listener(data);

        if (result?.consume) return;

        if (result?.data !== undefined) data = result.data;
      }

      focus?.handleInput?.(data);
    },
    async closeLocal(id: string) { await commands.get("openui-close").handler(id, ctx); },
    start(code: string) {
      active = new AbortController();
      parentId = `pcc-parent-${++call}`;
      const opened = new Promise<void>(resolve => { notifyOpened = resolve; });

      // Capture external abort failures immediately; form cancellation should
      // instead resolve through the ordinary result contract.
      const completed: Promise<{ value?: any; error?: unknown }> = tools.get("exec").execute(parentId, { code }, active.signal, onUpdate, ctx)
        .then((value: any) => ({ value }), (cause: unknown) => ({ error: cause }));

      return { opened, completed, parentId };
    },
    resume(cellId: string) {
      active = new AbortController();
      parentId = `pcc-wait-${++call}`;
      const opened = new Promise<void>(resolve => { notifyOpened = resolve; });

      const completed: Promise<{ value?: any; error?: unknown }> = tools.get("wait")
        .execute(parentId, { cell_id: cellId, yield_time_ms: 1000 }, active.signal, onUpdate, ctx)
        .then((value: any) => ({ value }), (cause: unknown) => ({ error: cause }));

      return { opened, completed, parentId };
    },
    key(data: string) {
      assert.ok(component?.handleInput); component.render(100); component.handleInput(data);
    },
    render() { assert.ok(component);

 return component.render(100).join("\n"); },
    async wait(cellId: string) {
      active = new AbortController();
      parentId = `pcc-wait-${++call}`;

      return tools.get("wait").execute(parentId, { cell_id: cellId, yield_time_ms: 1000 }, active.signal, onUpdate, ctx);
    },
    async shutdown() {
      await emit("session_shutdown", {});
      await registration.shutdown();
      rmSync(cwd, { recursive: true, force: true });
    },
  };
}

/** Collect ordinary yielded output without imposing cancellation on the caller. */
async function complete(h: Awaited<ReturnType<typeof host>>, done: { value?: any; error?: unknown }): Promise<any> {
  assert.equal(done.error, undefined, `the enclosing cell must return normally: ${String(done.error)}`);
  let result = done.value;
  const content = [...result.content];

  for (let attempt = 0; result.details?.status === "yielded"; attempt++) {
    assert.ok(attempt < 4, "small test cells must finish within four observations");
    result = await h.wait(result.details.cellId);
    content.push(...result.content);
  }

  assert.notEqual(result.isError, true);
  assert.equal(result.details?.status, "result");
  assert.equal(result.details?.scriptError, undefined);

  return { ...result, content };
}

function assertCancellation(h: Awaited<ReturnType<typeof host>>): void {
  assert.equal(h.abortCalls, 0, "dismissing a form must not abort Pi or its notebook kernel");
  assert.equal(h.closed, 1);
  const result = h.results.find(item => item.name === "show_ui").result;
  assert.notEqual(result.isError, true);
  assert.deepEqual(result.structuredContent, { status: "cancelled" });
  assert.deepEqual(JSON.parse(result.content[0].text), { status: "cancelled" });
  assert.equal(result.details.openuiReceipt.status, "cancelled");
  assert.deepEqual(result.details.openuiReceipt.fields, [], "cancellation must not fabricate submitted choices");
}

async function seedNotebook(h: Awaited<ReturnType<typeof host>>, mode: Mode): Promise<void> {
  if (mode === "code") return;
  await complete(h, await h.start('let preservedValue = 41; const preservedReader = () => preservedValue; text(preservedReader());').completed);
}

async function assertNotebookRetained(h: Awaited<ReturnType<typeof host>>, mode: Mode): Promise<void> {
  const code = mode === "code" ? 'text("FRESH_CELL");' :
    'text({value:preservedValue,closure:preservedReader()}); preservedValue += 1; text({after:preservedReader()});';

  const result = await complete(h, await h.start(code).completed);
  const text = result.content.filter((item: any) => item.type === "text").map((item: any) => item.text).join("\n");

  if (mode === "code") assert.match(text, /FRESH_CELL/);
  else {
    assert.match(text, /"value"\s*:\s*42/);
    assert.match(text, /"closure"\s*:\s*42/);
    assert.match(text, /"after"\s*:\s*43/);
  }

  assert.equal(h.abortCalls, 0, "the same live notebook continues without any restart request");
}

const modes = process.env.OPENUI_PCC_MODES?.split(",") ?? ["code", "notebook", "js", "ts"];

assert.ok(modes.length && modes.every(mode => ["code", "notebook", "ts", "js"].includes(mode)), "OPENUI_PCC_MODES must contain code, notebook, ts or js");

// SAFETY: The existing assertion above verifies every configured entry is one of the four Mode literals.
for (const mode of modes as Mode[]) {
  test(`PCC ${mode}: cancelling after the yield timeout returns normally and preserves notebook state`, { timeout: 45_000 }, async () => {
    const h = await host(mode);

    try {
      await seedNotebook(h, mode);
      const before = mode === "code" ? "" : "preservedValue = 42;";
      const pending = h.start(`// @exec: {"yield_time_ms":1000}\n${before} const cancelled = await tools.show_ui({source:${JSON.stringify(SOURCE)},presentation:"inline"}); text(cancelled); if (cancelled.status === "submitted") await tools.marker({text:"CHOICE_DEPENDENT_WORK"}); await tools.marker({text:"AFTER_YIELD_CANCEL"});`);
      await Promise.race([pending.opened, pending.completed.then(done => { throw new Error(`Cell finished before UI opened: ${JSON.stringify(done)}`); })]);
      await delay(1200);
      const cellId = h.lastCellId;
      assert.ok(cellId);
      h.key("\x1b");
      const result = await complete(h, await pending.completed);
      assert.match(JSON.stringify(result.content), /cancelled/);
      assert.deepEqual(h.markers, ["AFTER_YIELD_CANCEL"], "the caller handles cancellation and may continue unrelated work");
      assertCancellation(h);
      await h.wait(cellId).catch(() => undefined);
      assert.deepEqual(h.markers, ["AFTER_YIELD_CANCEL"], "re-observing the completed cell cannot duplicate continuation");
      await assertNotebookRetained(h, mode);
    } finally { await h.shutdown(); }
  });
  test(`PCC ${mode}: cancellation inside wait returns normally from a previously yielded cell`, { timeout: 45_000 }, async () => {
    const h = await host(mode);

    try {
      await seedNotebook(h, mode);
      const before = mode === "code" ? "" : "preservedValue = 42;";
      const pause = mode === "js" ? "await yield_control();" : "await new Promise(resolve => setTimeout(resolve,200));";
      const initial = h.start(`// @exec: {"yield_time_ms":10}\n${before} ${pause} const cancelled = await tools.show_ui({source:${JSON.stringify(SOURCE)}}); text(cancelled); if (cancelled.status === "submitted") await tools.marker({text:"CHOICE_DEPENDENT_WORK"}); await tools.marker({text:"AFTER_WAIT_CANCEL"});`);
      const yielded = await initial.completed;
      assert.equal(yielded.error, undefined);
      assert.equal(yielded.value.details.status, "yielded");
      assert.equal(h.opens, 0, "a call arriving after the parent yields waits for the next Pi scope");
      const cellId = yielded.value.details.cellId;
      const pending = h.resume(cellId);
      await Promise.race([pending.opened, pending.completed.then(done => { throw new Error(`Wait finished before UI opened: ${JSON.stringify(done)}`); })]);
      await delay(1200);
      h.key("\x1b");
      const result = await complete(h, await pending.completed);
      assert.match(JSON.stringify(result.content), /cancelled/);
      assert.deepEqual(h.markers, ["AFTER_WAIT_CANCEL"]);
      assertCancellation(h);
      await h.wait(cellId).catch(() => undefined);
      assert.deepEqual(h.markers, ["AFTER_WAIT_CANCEL"]);
      await assertNotebookRetained(h, mode);
    } finally { await h.shutdown(); }
  });
  test(`PCC ${mode}: passive documents return immediately and persist inline`, { timeout: 45_000 }, async () => {
    const h = await host(mode);

    try {
      const source = 'root = Stack([Text("Review overview"), Table(["Check","Result"],[["Types","Pass"],["Tests","Pass"]])]);';
      const pending = h.start(`const display = await tools.show_ui({source:${JSON.stringify(source)}}); text(display); await tools.marker({text:"AFTER_DISPLAY"});`);
      const done = await pending.completed;
      assert.equal(done.error, undefined);
      assert.equal(h.opens, 0, "passive documents must not acquire focus or open custom UI");
      const result = h.results.find(item => item.name === "show_ui").result;
      assert.deepEqual(result.structuredContent, { status: "displayed" });
      assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
      assert.deepEqual(h.markers, ["AFTER_DISPLAY"]);
      const receipt = h.entries.find(entry => entry.customType === "openui-code-receipt");
      assert.ok(receipt);
      assert.equal(receipt.data.parentToolCallId, pending.parentId);
      assert.equal(receipt.data.document.source, source);
      assert.equal(receipt.data.outcome.status, "displayed");
    } finally { await h.shutdown(); }
  });

  test(`PCC ${mode}: local widgets outlive their cell and remain interactive without returning edits`, { timeout: 45_000 }, async () => {
    const h = await host(mode);

    try {
      await seedNotebook(h, mode);
      const before = mode === "code" ? "" : "preservedValue = 42;";
      const pending = h.start(`${before} const mounted = await tools.show_ui({source:${JSON.stringify(HOSTING_EXPLORER_SOURCE)},interaction:"local"}); text(mounted); await tools.marker({text:"AFTER_LOCAL_MOUNT"}); text("MOUNT_CELL_FINISHED");`);
      const output = await complete(h, await pending.completed);
      assert.match(JSON.stringify(output.content), /MOUNT_CELL_FINISHED/);
      assert.equal(h.opens, 0, "local mounting cannot open a blocking custom view");
      assert.equal(h.focus, h.editor, "the composer remains available throughout mounting");
      assert.deepEqual(h.markers, ["AFTER_LOCAL_MOUNT"]);
      const result = h.results.find(item => item.name === "show_ui").result;
      const mounted = result.structuredContent;
      assert.deepEqual(Object.keys(mounted).sort(), ["status", "widgetId"]);
      assert.equal(mounted.status, "mounted");
      assert.equal(z.string().safeParse(mounted.widgetId).success, true);
      assert.deepEqual(JSON.parse(result.content[0].text), mounted);
      const entry = h.entries.find(entry => entry.customType === OPENUI_LOCAL_ENTRY);
      assert.equal(entry.data.widgetId, mounted.widgetId);
      assert.equal(entry.data.source, HOSTING_EXPLORER_SOURCE);
      assert.match(h.localRender(), /Cheapest: Basic \(\$18\/month\)/);

      await h.emit("turn_end", {});
      await h.emit("agent_end", {});
      const recordedResults = JSON.stringify(h.results);
      const recordedEntries = JSON.stringify(h.entries);
      h.localKey("\x1b[17~");
      assert.notEqual(h.focus, h.editor);

      for (let n = 0; n < 6; n++) h.localKey("\x1b[A");
      assert.match(h.localRender(), /Cheapest: Standard and Pro \(\$40\/month\)/);
      assert.match(h.localRender(), /Basic[^\n]*\$42/);
      h.localKey("\x1b");
      assert.equal(h.focus, h.editor);
      h.localKey("Keep explaining while the explorer stays open."); h.localKey("\r");
      assert.deepEqual(h.chatMessages, ["Keep explaining while the explorer stays open."]);
      await h.emit("turn_start", {});
      await h.emit("agent_start", {});
      await assertNotebookRetained(h, mode);
      await h.emit("turn_end", {});
      await h.emit("agent_end", {});

      h.localKey("\x1b[17~"); h.localKey("\x1b[A");
      assert.match(h.localRender(), /Cheapest: Pro \(\$40\/month\)/);
      assert.match(h.localRender(), /Basic[^\n]*\$46/);
      assert.match(h.localRender(), /Standard[^\n]*\$44/);
      h.localKey("\t"); h.localKey("\r");
      assert.match(h.localRender(), /Cheapest: Basic \(\$18\/month\)/, "Reset remains local after subsequent cells");
      assert.equal(JSON.stringify(h.results), recordedResults, "local edits and focus changes invoke no tools or result updates");
      assert.equal(JSON.stringify(h.entries), recordedEntries, "edited values are not written to session entries");
      assert.equal(h.abortCalls, 0);
      assert.equal(h.closed, 0);
      await h.closeLocal(mounted.widgetId);
      assert.equal(h.focus, h.editor);
      assert.equal(h.listeners, 0, "disposing the last widget removes its terminal listener");
      const closeEntry = h.entries.find(entry => entry.customType === OPENUI_LOCAL_CLOSE_ENTRY);
      assert.deepEqual(closeEntry.data, { version: 1, widgetId: mounted.widgetId });
      assert.equal(JSON.stringify(h.results), recordedResults, "dismissal returns no edited values to the runtime");
      assert.deepEqual(h.markers, ["AFTER_LOCAL_MOUNT"]);
    } finally { await h.shutdown(); }
  });

  for (const presentation of ["inline", "fullscreen"] as const) {
  test(`PCC ${mode}: ${presentation} awaits interaction and returns typed data`, { timeout: 45_000 }, async () => {
    const h = await host(mode);

    try {
      const pending = h.start(`const result = await tools.show_ui({source:${JSON.stringify(SOURCE)},presentation:${JSON.stringify(presentation)}}); text(result); await tools.marker({text:"AFTER_SUBMISSION"});`);
      await Promise.race([pending.opened, pending.completed.then(done => { throw new Error(`Cell finished before UI opened: ${JSON.stringify(done)}`); })]);
      h.key("\r");
      assert.equal(h.closed, 0);
      assert.match(h.render(), /Count: 2/);
      h.key("\t"); h.key("\r");
      const done = await pending.completed;
      assert.equal(done.error, undefined);
      assert.match(JSON.stringify(done.value.content), /submitted/);
      const result = h.results.find(item => item.name === "show_ui").result;
      assert.equal(result.structuredContent.context.count, 2);
      assert.equal(result.structuredContent.state.$count, 2);
      assert.deepEqual(h.markers, ["AFTER_SUBMISSION"]);
      assert.equal(h.closed, 1);
      assert.equal(h.abortCalls, 0);
      assert.equal(h.entries.filter(entry => entry.customType === "openui-code-receipt").length, 1);
      assert.equal(h.entries.find(entry => entry.customType === "openui-code-receipt").data.parentToolCallId, pending.parentId);
    } finally { await h.shutdown(); }
  });
  }

  for (const [name, key] of [["Escape", "\x1b"], ["Ctrl+C", "\x03"]] as const) {
    test(`PCC ${mode}: ${name} returns cancelled and leaves the cell and notebook usable`, { timeout: 45_000 }, async () => {
      const h = await host(mode);

      try {
        await seedNotebook(h, mode);
        const before = mode === "code" ? "" : "preservedValue = 42;";
        const pending = h.start(`${before} const cancelled = await tools.show_ui({source:${JSON.stringify(SOURCE)},presentation:"fullscreen"}); text(cancelled); if (cancelled.status === "submitted") await tools.marker({text:"CHOICE_DEPENDENT_WORK"}); await tools.marker({text:"CANCELLATION_HANDLED"}); text("CALLER_CONTINUES");`);
        await Promise.race([pending.opened, pending.completed.then(done => { throw new Error(`Cell finished before UI opened: ${JSON.stringify(done)}`); })]);
        h.key(key);
        const result = await complete(h, await pending.completed);
        assert.match(JSON.stringify(result.content), /cancelled/);
        assert.match(JSON.stringify(result.content), /CALLER_CONTINUES/);
        assertCancellation(h);
        assert.deepEqual(h.markers, ["CANCELLATION_HANDLED"], "caller logic, not UI dismissal, controls continuation");
        await assertNotebookRetained(h, mode);
        assert.deepEqual(h.markers, ["CANCELLATION_HANDLED"]);
      } finally { await h.shutdown(); }
    });
  }
}
