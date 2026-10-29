import assert from "node:assert/strict";
import test from "node:test";
import {
  createCodemodeExtension,
  type ExtensionAPI, type ExtensionToolContext,
} from "@earendil-works/pi-coding-agent";
import openuiExtension from "../src/index.js";
import type { OpenUIView } from "../src/view.js";

const SOURCE = '$count = 0;\nroot = Stack([Text("Count: " + $count), Button("Add", @Set($count, $count + 1)), Button("Send", @ToAssistant("Count confirmed", {count: $count}))]);';

/** Actual Pi codemode definition and QuickJS worker; only the host UI/session boundary is a fixture. */
function host(mode: "on" | "only" = "on") {
  const tools = new Map<string, any>();
  const handlers = new Map<string, Function>();
  const active = ["show_ui", "codemode"];
  let view: OpenUIView;
  let closed = 0;
  let count = 0;
  let userTurns = 0;
  let notifyOpened!: () => void;
  const opened = new Promise<void>(resolve => { notifyOpened = resolve; });
  const api = {
    registerToolRenderer() {},
    registerMessageRenderer() {},
    registerEntryRenderer() {},
    registerTool: (tool: any) => tools.set(tool.name, tool),
    registerCommand() {},
    on: (name: string, callback: Function) => handlers.set(name, callback),
    getActiveTools: () => active,
    getAllTools: () => [...tools.values()].map(tool => ({ ...tool, exposure: tool.exposure ?? "direct" })),
    getSettings: () => ({ codemode: { mode } }),
    appendEntry() {},
    sendUserMessage() { userTurns++; },
    sendMessage() { userTurns++; },
  } as unknown as ExtensionAPI;
  openuiExtension(api);
  createCodemodeExtension({ mode, models: false, inlineBudget: 20_000 })(api);
  const ctx = {
    mode: "tui", hasUI: true, signal: undefined,
    sessionManager: { getBranch: () => [] },
    tools: [...tools.values()],
    ui: {
      custom: (factory: Function) => new Promise(resolve => {
        view = factory({ terminal: { rows: 30 }, requestRender() {} }, {}, {}, (result: unknown) => {
          closed++; view.dispose(); resolve(result);
        });
        notifyOpened();
      }),
    },
    executeTool: async (name: string, args: unknown, options: { signal?: AbortSignal } = {}) => {
      const id = `code-parent/${++count}`;
      const toolCall = { type: "toolCall", id, name, arguments: args };
      const result = await tools.get(name).execute(id, args, options.signal, undefined, ctx);
      handlers.get("tool_execution_end")?.({ type: "tool_execution_end", toolName: name, toolCallId: id, parentToolCallId: "code-parent", result, isError: !!result.isError }, ctx);
      return { toolCall, result, isError: !!result.isError };
    },
  } as unknown as ExtensionToolContext;
  return {
    tools, handlers, ctx, opened, get closed() { return closed; }, get userTurns() { return userTurns; },
    key(data: string) { view.render(100); view.handleInput(data); },
    lines() { return view.render(100).join("\n"); },
    execute(code: string, signal?: AbortSignal) {
      return tools.get("codemode").execute("code-parent", { code }, signal, undefined, ctx);
    },
    shutdown() { handlers.get("session_shutdown")?.({}, ctx); },
    loadout() {
      return tools.get("codemode").prepareLoadout({
        declared: [...tools.values()], callable: [tools.get("show_ui")], registered: [...tools.values()],
        getExposure: (name: string) => tools.get(name).exposure ?? "direct",
        getNamespace: () => undefined,
        getPromptGuidelines: (name: string) => tools.get(name).promptGuidelines ?? [],
      });
    },
  };
}

test("native code-only loadout hides the declaration while keeping OpenUI generation guidance", () => {
  for (const mode of ["on", "only"] as const) {
    const h = host(mode);
    const changes = h.loadout();
    assert.equal(changes.hiddenDeclarations.includes("show_ui"), mode === "only");
    if (mode === "only") assert.match(changes.descriptions.codemode, /show_ui/);
    const event = { systemPromptOptions: { sections: {} as Record<string, string> } };
    h.handlers.get("before_agent_start")!(event, h.ctx);
    assert.match(event.systemPromptOptions.sections.openui, /@Set|@ToAssistant/);
  }
});

for (const mode of ["on", "only"] as const) {
  test(`native QuickJS (${mode}) waits for local actions and receives structured ToAssistant data`, { timeout: 15_000 }, async () => {
    const h = host(mode);
    const pending = h.execute(`const result = await tools.show_ui({source: ${JSON.stringify(SOURCE)}}); if (typeof result !== "object") throw new Error("Expected structured output"); text({status: result.status, message: result.message, count: result.context.count, stored: result.state.$count});`);
    try {
      await h.opened;
      h.key("\r");
      assert.equal(h.closed, 0, "local Set must leave the nested tool awaiting a user action");
      assert.match(h.lines(), /Count: 1/);
      h.key("\t");
      h.key("\r");
      const result = await pending;
      assert.equal(result.isError, undefined);
      const text = result.content.map((item: any) => item.text ?? "").join("\n");
      assert.match(text, /"status":"submitted"/);
      assert.match(text, /"message":"Count confirmed"/);
      assert.match(text, /"count":1,"stored":1/);
      assert.equal(h.closed, 1);
      assert.equal(result.details.calls[0].id, "code-parent/1");
      assert.equal(result.details.calls[0].status, "ok");
      assert.equal(h.userTurns, 0, "nested submission must not also enqueue a duplicate user turn");
    } finally { h.shutdown(); }
  });
}

test("native QuickJS receives structured Escape cancellation", { timeout: 15_000 }, async () => {
  const h = host();
  const pending = h.execute(`const result = await tools.show_ui({source: ${JSON.stringify(SOURCE)}}); text(result.status);`);
  try {
    await h.opened;
    h.key("\x1b");
    const result = await pending;
    assert.equal(result.isError, undefined);
    assert.match(result.content.map((item: any) => item.text ?? "").join("\n"), /cancelled/);
    assert.equal(h.closed, 1);
  } finally { h.shutdown(); }
});

test("native QuickJS receives structured malformed-document errors", { timeout: 15_000 }, async () => {
  const h = host();
  const result = await h.execute('const result = await tools.show_ui({source:"root = Unknown()"}); text({status:result.status,error:result.error});');
  assert.equal(result.isError, undefined, "the script handles show_ui's structured error status");
  assert.match(result.content.map((item: any) => item.text ?? "").join("\n"), /"status":"error"/);
  assert.equal(result.details.calls[0].status, "error");
  assert.equal(h.closed, 0);
});

test("aborting native QuickJS closes its waiting OpenUI panel", { timeout: 15_000 }, async () => {
  const h = host();
  const abort = new AbortController();
  const pending = h.execute(`text(await tools.show_ui({source: ${JSON.stringify(SOURCE)}}));`, abort.signal);
  try {
    await h.opened;
    abort.abort();
    const result = await pending;
    assert.equal(result.isError, true);
    assert.equal(h.closed, 1);
    assert.match(result.content.map((item: any) => item.text ?? "").join("\n"), /abort/i);
  } finally { h.shutdown(); }
});
