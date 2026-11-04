import assert from "node:assert/strict";
import test from "node:test";
import { Type } from "typebox";
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
  let aborts = 0;
  let sideEffects = 0;
  let run = new AbortController();
  const nestedResults: any[] = [];
  let notifyOpened!: () => void;
  const opened = new Promise<void>(resolve => { notifyOpened = resolve; });

  const api: Pick<ExtensionAPI, "registerToolRenderer" | "registerMessageRenderer" | "registerEntryRenderer" | "registerTool" | "registerCommand" | "on" | "getActiveTools" | "getAllTools" | "getSettings" | "appendEntry" | "sendUserMessage" | "sendMessage"> = {
    registerToolRenderer() {},
    registerMessageRenderer() {},
    registerEntryRenderer() {},
    registerTool: (tool: any) => tools.set(tool.name, tool),
    registerCommand() {},
    on: (name, callback) => {
      handlers.set(name, callback);

      return () => { handlers.delete(name); };
    },
    getActiveTools: () => active,
    getAllTools: () => [...tools.values()].map(tool => ({ ...tool, exposure: tool.exposure ?? "direct" })),
    getSettings: () => ({ codemode: { mode } }),
    appendEntry() {},
    sendUserMessage() { userTurns++; },
    sendMessage() { userTurns++; },
  };

  // SAFETY: The typed fixture supplies OpenUI registration/message capabilities; optional conversion events are absent.
  openuiExtension(api as ExtensionAPI);
  tools.set("sentinel", {
    name: "sentinel", label: "Sentinel", description: "Record that the next statement ran.",
    parameters: Type.Object({}),
    async execute() { sideEffects++;

 return { content: [{ type: "text", text: "effect recorded" }] }; },
  });
  // SAFETY: These modes use the supplied tool registration, tool/settings discovery and event capabilities; model registration is disabled.
  createCodemodeExtension({ mode, models: false, inlineBudget: 20_000 })(api as ExtensionAPI);

  const ctx = {
    mode: "tui", hasUI: true,
    get signal() { return run.signal; },
    abort() { aborts++; run.abort(); },
    sessionManager: { getBranch: () => [] },
    tools: [...tools.values()],
    ui: {
      custom: <T>(factory: Function) => new Promise<T>(resolve => {
        view = factory({ terminal: { rows: 30 }, requestRender() {} }, {}, {}, (result: T) => {
          closed++; view.dispose(); resolve(result);
        });
        notifyOpened();
      }),
    },
    executeTool: async (name: string, args: Parameters<ExtensionToolContext["executeTool"]>[1], options: Parameters<ExtensionToolContext["executeTool"]>[2] = {}) => {
      const id = `code-parent/${++count}`;
      const toolCall = { type: "toolCall", id, name, arguments: args };
      const result = await tools.get(name).execute(id, args, options.signal, undefined, ctx);
      nestedResults.push({ name, result });
      handlers.get("tool_execution_end")?.({ type: "tool_execution_end", toolName: name, toolCallId: id, parentToolCallId: "code-parent", result, isError: !!result.isError }, ctx);

      return { toolCall, result, isError: !!result.isError };
    },
  };

  return {
    tools, handlers, ctx, opened, nestedResults,
    get closed() { return closed; }, get userTurns() { return userTurns; },
    get aborts() { return aborts; }, get sideEffects() { return sideEffects; },
    key(data: string) { view.render(100); view.handleInput(data); },
    lines() { return view.render(100).join("\n"); },
    async execute(code: string, signal?: AbortSignal) {
      run = new AbortController();
      const abort = () => run.abort(signal?.reason);

      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });

      try { return await tools.get("codemode").execute("code-parent", { code }, run.signal, undefined, ctx); }
      finally { signal?.removeEventListener("abort", abort); }
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
    // SAFETY: The host section dictionary starts empty and this handler adds only modelPrompt text.
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

for (const mode of ["on", "only"] as const) {
  for (const [label, key] of [["Escape", "\x1b"], ["Ctrl+C", "\x03"]]) {
    test(`native QuickJS (${mode}) ${label} returns cancellation normally and lets the caller continue`, { timeout: 15_000 }, async () => {
      const h = host(mode);
      // The caller can skip choice-dependent work and still clean up or continue
      // unrelated work. Dismissing the form is not an execution interruption.
      const pending = h.execute(`try { const result = await tools.show_ui({source: ${JSON.stringify(SOURCE)}}); text(result); if (result.status === "submitted") { await tools.sentinel({}); text("SUBMITTED_ONLY"); } else if (result.status === "cancelled") { text("FORM_DISMISSED"); } } catch { text("UNEXPECTED_EXCEPTION"); } finally { text("CLEANUP_RAN"); } await tools.sentinel({}); text("CALLER_CONTINUED");`);

      try {
        await h.opened;
        h.key(key);
        const result = await pending;
        const output = result.content.map((item: any) => item.text ?? "").join("\n");
        assert.equal(result.isError, undefined);
        assert.match(output, /"status":"cancelled"/);
        assert.match(output, /FORM_DISMISSED/);
        assert.match(output, /CLEANUP_RAN/);
        assert.match(output, /CALLER_CONTINUED/);
        assert.doesNotMatch(output, /UNEXPECTED_EXCEPTION|SUBMITTED_ONLY/);
        assert.equal(h.sideEffects, 1, "only the caller's unconditional continuation should execute");
        assert.equal(h.aborts, 0);
        assert.equal(h.ctx.signal?.aborted, false);
        assert.equal(h.closed, 1);
        const nested = h.nestedResults.find(item => item.name === "show_ui");
        assert.deepEqual(nested?.result.structuredContent, { status: "cancelled" });
        assert.equal(nested.result.isError, undefined);
        assert.equal(nested.result.details.openuiReceipt.status, "cancelled");
        assert.deepEqual(nested.result.details.openuiReceipt.fields, [], "cancellation must not submit default field values");

        const next = await h.execute('await tools.sentinel({}); text("NEW_USER_REQUEST");');
        assert.equal(next.isError, undefined);
        assert.match(next.content.map((item: any) => item.text ?? "").join("\n"), /NEW_USER_REQUEST/);
        assert.equal(h.sideEffects, 2, "a subsequent run still executes normally");
      } finally { h.shutdown(); }
    });
  }
}

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
    assert.equal(h.aborts, 0, "an external abort must not recursively abort the host");
    assert.match(result.content.map((item: any) => item.text ?? "").join("\n"), /abort/i);
  } finally { h.shutdown(); }
});

test("native QuickJS timeout closes the waiting panel and permits a later run", { timeout: 15_000 }, async () => {
  const h = host();
  const pending = h.execute(`// @options: {"timeout_ms": 250}\nawait tools.show_ui({source: ${JSON.stringify(SOURCE)}}); await tools.sentinel({}); text("AFTER_TIMEOUT");`);

  try {
    await h.opened;
    const result = await pending;
    const output = result.content.map((item: any) => item.text ?? "").join("\n");
    assert.equal(result.isError, true);
    assert.match(output, /timeout|timed out/i);
    assert.doesNotMatch(output, /AFTER_TIMEOUT/);
    assert.equal(h.sideEffects, 0);
    assert.equal(h.closed, 1);
    assert.equal(h.aborts, 0);
    const next = await h.execute('text("RECOVERED_AFTER_TIMEOUT");');
    assert.equal(next.isError, undefined);
    assert.match(next.content.map((item: any) => item.text ?? "").join("\n"), /RECOVERED_AFTER_TIMEOUT/);
  } finally { h.shutdown(); }
});
