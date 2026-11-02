import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { Type } from "typebox";
import type { ExtensionAPI, ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import openuiExtension from "../../src/index.js";

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
  const onUpdate = (result: any) => { if (typeof result.details?.cellId === "string") lastCellId = result.details.cellId; };
  const events = {
    on(name: string, handler: (...args: any[]) => void) {
      bus.on(name, handler);
      return () => bus.off(name, handler);
    },
    emit(name: string, value: unknown) { bus.emit(name, value); },
  };
  const emit = async (name: string, value: unknown) => {
    for (const callback of callbacks.get(name) ?? []) await callback(value, ctx);
  };
  const api = {
    events,
    on(name: string, handler: Function) {
      callbacks.set(name, [...(callbacks.get(name) ?? []), handler]);
    },
    registerTool(tool: any) { tools.set(tool.name, tool); },
    registerCommand() {}, registerToolRenderer() {}, registerMessageRenderer() {}, registerEntryRenderer() {},
    getActiveTools: () => [...tools.keys()],
    getAllTools: () => [...tools.values()],
    appendEntry(customType: string, data: unknown) { entries.push({ type: "custom", customType, data }); },
    sendMessage() { throw new Error("Tool execution must not enqueue another agent turn"); },
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd, mode: "tui", hasUI: true,
    get signal() { return active.signal; },
    abort() { abortCalls++; active.abort(); },
    isProjectTrusted: () => true,
    sessionManager: { getBranch: () => entries, getSessionId: () => `openui-pcc-${mode}`, getSessionFile: () => undefined },
    get tools() { return [...tools.values()]; },
    ui: {
      notify() {},
      custom: (factory: Function) => new Promise(resolve => {
        opens++;
        let finished = false;
        component = factory({ terminal: { rows: 30 }, requestRender() {} }, {}, {}, (result: unknown) => {
          if (finished) return;
          finished = true; closed++; component?.dispose?.(); resolve(result);
        });
        notifyOpened?.();
      }),
    },
    async executeTool(name: string, args: unknown, options: { signal?: AbortSignal } = {}) {
      options.signal?.throwIfAborted();
      const id = `${parentId}/${++serial}`;
      const result = await tools.get(name).execute(id, args, options.signal, undefined, ctx);
      results.push({ name, result });
      await emit("tool_execution_end", { type: "tool_execution_end", toolName: name, toolCallId: id,
        parentToolCallId: parentId, result, isError: !!result.isError });
      return { toolCall: { type: "toolCall", id, name, arguments: args }, result, isError: !!result.isError };
    },
  } as unknown as ExtensionToolContext;
  openuiExtension(api);
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
  return {
    results, markers, entries,
    get closed() { return closed; }, get opens() { return opens; }, get abortCalls() { return abortCalls; },
    get lastCellId() { return lastCellId; },
    start(code: string) {
      active = new AbortController();
      parentId = `pcc-parent-${++call}`;
      const opened = new Promise<void>(resolve => { notifyOpened = resolve; });
      // Catch immediately: cancellation can reject the outer exec before the
      // test resumes after sending the key.
      const completed: Promise<{ value?: any; error?: unknown }> = tools.get("exec").execute(parentId, { code }, active.signal, onUpdate, ctx)
        .then((value: any) => ({ value }), (error: unknown) => ({ error }));
      return { opened, completed, parentId };
    },
    resume(cellId: string) {
      active = new AbortController();
      parentId = `pcc-wait-${++call}`;
      const opened = new Promise<void>(resolve => { notifyOpened = resolve; });
      const completed: Promise<{ value?: any; error?: unknown }> = tools.get("wait")
        .execute(parentId, { cell_id: cellId, yield_time_ms: 1000 }, active.signal, onUpdate, ctx)
        .then((value: any) => ({ value }), (error: unknown) => ({ error }));
      return { opened, completed, parentId };
    },
    key(data: string) {
      assert.ok(component?.handleInput); component.render(100); component.handleInput(data);
    },
    render() { assert.ok(component); return component.render(100).join("\n"); },
    async wait(cellId: string) {
      active = new AbortController();
      parentId = `pcc-wait-${++call}`;
      return tools.get("wait").execute(parentId, { cell_id: cellId, yield_time_ms: 1000 }, active.signal, onUpdate, ctx);
    },
    async restartNotebook() {
      active = new AbortController();
      // TS stops its worker asynchronously after rejecting exec. Follow its
      // explicit idle-state lifecycle instead of racing the worker teardown.
      for (let attempt = 0; attempt < 100; attempt++) {
        const status = await tools.get("notebook").execute(`pcc-status-${++call}`, { input: JSON.stringify({ action: "status" }) }, active.signal, undefined, ctx);
        if (!status.details.activeCells?.length) break;
        assert.notEqual(attempt, 99, "cancelled notebook worker must become idle");
        await delay(20);
      }
      return tools.get("notebook").execute(`pcc-restart-${++call}`, { input: JSON.stringify({ action: "restart" }) }, active.signal, undefined, ctx);
    },
    async shutdown() {
      await emit("session_shutdown", {});
      await registration.shutdown();
      rmSync(cwd, { recursive: true, force: true });
    },
  };
}

const modes = (process.env.OPENUI_PCC_MODES?.split(",") ?? ["code", "notebook", "js", "ts"]) as Mode[];
assert.ok(modes.length && modes.every(mode => ["code", "notebook", "ts", "js"].includes(mode)), "OPENUI_PCC_MODES must contain code, notebook, ts or js");
for (const mode of modes) {
  test(`PCC ${mode}: cancellation remains effective after the cell's yield timeout`, { timeout: 45_000 }, async () => {
    const h = await host(mode);
    try {
      const pending = h.start(`// @exec: {"yield_time_ms":1000}\nawait tools.show_ui({source:${JSON.stringify(SOURCE)},presentation:"inline"}); text("MUST_NOT_PRINT_AFTER_YIELD"); await tools.marker({text:"MUST_NOT_RUN_AFTER_YIELD"});`);
      await Promise.race([pending.opened, pending.completed.then(done => { throw new Error(`Cell finished before UI opened: ${JSON.stringify(done)}`); })]);
      await delay(1200);
      const cellId = h.lastCellId;
      assert.ok(cellId);
      h.key("\x1b");
      const done = await pending.completed;
      if (!done.error && done.value?.details?.status === "yielded") {
        const observed = await h.wait(done.value.details.cellId);
        assert.doesNotMatch(JSON.stringify(observed.content), /MUST_NOT_PRINT_AFTER_YIELD/);
      }
      assert.ok(done.error, `cancel must abort an enclosing cell after its yield timeout: ${JSON.stringify(done)}`);
      const observed = await h.wait(cellId).catch(error => ({ error: String(error) }));
      assert.doesNotMatch(JSON.stringify(observed), /MUST_NOT_PRINT_AFTER_YIELD/);
      assert.deepEqual(h.markers, []);
      if (mode === "ts" || mode === "js") await h.restartNotebook();
      const fresh = await h.start('text("FRESH_CELL_AFTER_YIELD_CANCEL");').completed;
      assert.equal(fresh.error, undefined);
      assert.match(JSON.stringify(fresh.value.content), /FRESH_CELL_AFTER_YIELD_CANCEL/);
      assert.deepEqual(h.markers, []);
    } finally { await h.shutdown(); }
  });
  test(`PCC ${mode}: a previously yielded cell resumes UI in wait and cancels without continuation`, { timeout: 45_000 }, async () => {
    const h = await host(mode);
    try {
      const pause = mode === "js" ? "await yield_control();" : "await new Promise(resolve => setTimeout(resolve,200));";
      const initial = h.start(`// @exec: {"yield_time_ms":10}\n${pause} await tools.show_ui({source:${JSON.stringify(SOURCE)}}); text("MUST_NOT_PRINT_AFTER_WAIT"); await tools.marker({text:"MUST_NOT_RUN_AFTER_WAIT"});`);
      const yielded = await initial.completed;
      assert.equal(yielded.error, undefined);
      assert.equal(yielded.value.details.status, "yielded");
      assert.equal(h.opens, 0, "a call arriving after the parent yields waits for the next Pi scope");
      const cellId = yielded.value.details.cellId;
      const pending = h.resume(cellId);
      await Promise.race([pending.opened, pending.completed.then(done => { throw new Error(`Wait finished before UI opened: ${JSON.stringify(done)}`); })]);
      await delay(1200);
      h.key("\x1b");
      assert.ok((await pending.completed).error);
      const observed = await h.wait(cellId).catch(error => ({ error: String(error) }));
      assert.doesNotMatch(JSON.stringify(observed), /MUST_NOT_PRINT_AFTER_WAIT/);
      assert.deepEqual(h.markers, []);
      if (mode === "ts" || mode === "js") await h.restartNotebook();
      const fresh = await h.start('text("FRESH_CELL_AFTER_WAIT_CANCEL");').completed;
      assert.equal(fresh.error, undefined);
      assert.match(JSON.stringify(fresh.value.content), /FRESH_CELL_AFTER_WAIT_CANCEL/);
      assert.deepEqual(h.markers, []);
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
    test(`PCC ${mode}: ${name} stops the cell before its next statement and recovers through the host's lifecycle`, { timeout: 45_000 }, async () => {
      const h = await host(mode);
      try {
        const pending = h.start(`await tools.show_ui({source:${JSON.stringify(SOURCE)},presentation:"fullscreen"}); await tools.marker({text:"MUST_NOT_RUN"}); text("MUST_NOT_PRINT");`);
        await Promise.race([pending.opened, pending.completed.then(done => { throw new Error(`Cell finished before UI opened: ${JSON.stringify(done)}`); })]);
        h.key(key);
        const done = await pending.completed;
        assert.ok(done.error, "cancellation must reject/abort the enclosing PCC cell");
        assert.equal(h.abortCalls, 1);
        assert.equal(h.closed, 1);
        assert.deepEqual(h.markers, [], "the statement after awaited show_ui must not execute");
        assert.equal(h.results.find(item => item.name === "show_ui").result.structuredContent.status, "cancelled");
        const next = h.start('text("RECOVERED_AFTER_CANCEL");');
        let recovered = await next.completed;
        if (mode === "ts" || mode === "js") {
          assert.match(String(recovered.error ?? JSON.stringify(recovered.value)), /notebook restart/,
            "PCC intentionally requires a checkpoint restart after terminating TS/JS kernels");
          await h.restartNotebook();
          recovered = await h.start('text("RECOVERED_AFTER_CANCEL");').completed;
        }
        assert.equal(recovered.error, undefined);
        assert.match(JSON.stringify(recovered.value.content), /RECOVERED_AFTER_CANCEL/);
        assert.deepEqual(h.markers, [], "a background notebook must not resume cancelled work later");
      } finally { await h.shutdown(); }
    });
  }
}
