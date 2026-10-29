import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import openuiExtension from "../src/index.js";
import { DEMO_SOURCE } from "../src/demo.js";
import { DocumentModel, limits } from "../src/model.js";
import type { OpenUIView } from "../src/view.js";

// A host boundary fixture: the actual lang-core model and Pi TUI widgets run inside it.
function host(mode = "tui") {
  const events = new Map<string, Function>();
  const tools = new Map<string, any>();
  const commands = new Map<string, any>();
  const sent: Array<{ message: string; options: unknown }> = [];
  const notices: string[] = [];
  let component: OpenUIView | undefined;
  let opens = 0;
  let closes = 0;
  let customOptions: unknown;
  const api = {
    on: (name: string, handler: Function) => events.set(name, handler),
    registerTool: (tool: any) => tools.set(tool.name, tool),
    registerCommand: (name: string, command: any) => commands.set(name, command),
    getActiveTools: () => [...tools.keys()],
    sendUserMessage: (message: string, options: unknown) => sent.push({ message, options }),
  } as unknown as ExtensionAPI;
  const ctx = {
    mode,
    hasUI: mode === "tui" || mode === "rpc",
    signal: undefined,
    ui: {
      notify: (message: string) => notices.push(message),
      custom: (factory: Function, options: unknown) => {
        customOptions = options;
        opens++;
        return new Promise((resolve) => {
          let closed = false;
          component = factory({ terminal: { rows: 30 }, requestRender() {} }, {}, {}, (result: unknown) => {
            if (closed) return;
            closed = true;
            closes++;
            component?.dispose();
            resolve(result);
          });
        });
      },
    },
  } as unknown as ExtensionContext;
  openuiExtension(api);
  return {
    events, tools, commands, sent, notices, ctx,
    get opens() { return opens; },
    get closes() { return closes; },
    get customOptions() { return customOptions; },
    key(data: string) { assert.ok(component); component.render(80); component.handleInput(data); },
    render() { assert.ok(component); return component.render(80).join("\n"); },
    execute(source: string, id = "call-1", signal?: AbortSignal) {
      return tools.get("show_ui").execute(id, { source }, signal, undefined, ctx);
    },
    stream(source: string, id = "call-1") {
      events.get("message_update")!({
        assistantMessageEvent: {
          type: "toolcall_delta", contentIndex: 0, delta: "ignored raw JSON",
          partial: { content: [{ type: "toolCall", name: "show_ui", id, arguments: { source } }] },
        },
      }, ctx);
    },
  };
}

test("registers the tool, command and generated prompt only in TUI mode", () => {
  const h = host();
  assert.ok(h.tools.has("show_ui"));
  assert.ok(h.commands.has("openui-demo"));
  const event = { systemPromptOptions: { sections: {} as Record<string, string> } };
  h.events.get("before_agent_start")!(event, h.ctx);
  assert.match(event.systemPromptOptions.sections.openui, /Select/);
  h.events.get("before_agent_start")!(event, { ...h.ctx, mode: "rpc" });
  assert.equal(event.systemPromptOptions.sections.openui, undefined);
});

test("show_ui returns a submitted action to the active tool call", async () => {
  const h = host();
  const result = h.execute('root = Stack([Button("Continue", "continue")]);');
  assert.deepEqual(h.customOptions, {
    overlay: true,
    overlayOptions: { width: "100%", maxHeight: "100%", anchor: "top-left", margin: 0 },
  });
  assert.equal(h.render().split("\n").length, 30);
  h.key("\r");
  const value = await result;
  assert.equal(value.details.status, "submitted");
  assert.equal(value.details.action, "continue");
  assert.equal(h.opens, 1);
  assert.equal(h.closes, 1);
  assert.equal(h.sent.length, 0);
});

test("invalid source returns actionable diagnostics without opening a panel", async () => {
  const h = host();
  const result = await h.execute('root = ImaginaryWidget("oops");');
  assert.equal(result.isError, true);
  assert.equal(result.details.status, "error");
  assert.match(result.details.error, /ImaginaryWidget|unknown/i);
  assert.equal(h.opens, 0);
});

test("RPC and headless modes never call custom()", async () => {
  for (const mode of ["rpc", "json", "print"]) {
    const h = host(mode);
    const result = await h.execute('root = Text("hello");');
    assert.equal(result.isError, true);
    assert.match(result.details.error, /interactive TUI/);
    assert.equal(h.opens, 0);
  }
});

test("AbortSignal and Escape cancel the panel exactly once", async () => {
  const h = host();
  const abort = new AbortController();
  const pending = h.execute('root = Stack([Button("Go", "go")]);', "abort", abort.signal);
  abort.abort();
  assert.equal((await pending).details.status, "cancelled");
  assert.equal(h.closes, 1);
  const next = h.execute('root = Stack([Button("Go", "go")]);', "escape");
  h.key("\x1b");
  assert.equal((await next).details.status, "cancelled");
  assert.equal(h.closes, 2);
});

test("partial arguments reuse one custom UI and cannot submit before execute", async () => {
  const h = host();
  const source = 'root = Stack([Button("Send", "send")]);';
  h.stream(source.slice(0, 19));
  h.stream(source);
  h.key("\r");
  assert.equal(h.closes, 0);
  const result = h.execute(source);
  h.key("\r");
  assert.equal((await result).details.action, "send");
  assert.equal(h.opens, 1);
});

test("cancelling a streaming preview prevents reopening on execution", async () => {
  const h = host();
  const source = 'root = Stack([Button("Send", "send")]);';
  h.stream(source.slice(0, 20));
  h.key("\x1b");
  h.stream(source);
  assert.equal((await h.execute(source)).details.status, "cancelled");
  assert.equal(h.opens, 1);
});

test("a malformed final document closes the preview and reports an error", async () => {
  const h = host();
  h.stream('root = Text("hello');
  const result = await h.execute('root = Unknown("hello");');
  assert.equal(result.isError, true);
  assert.equal(h.closes, 1);
});

test("shutdown and interrupted generation release previews", async () => {
  for (const event of ["session_shutdown", "agent_end"]) {
    const h = host();
    h.stream('root = Text("hello');
    h.events.get(event)!({}, h.ctx);
    await Promise.resolve();
    assert.equal(h.closes, 1);
  }
});

test("demo covers all six components and sends the selected action to Pi", async () => {
  const model = new DocumentModel(DEMO_SOURCE);
  assert.equal(model.valid, true, model.diagnostics.join("\n"));
  model.dispose();
  const h = host();
  const result = h.commands.get("openui-demo").handler("", h.ctx);
  h.key("\x1b[B");
  h.key("\t");
  h.key("ship it");
  h.key("\t");
  h.key("\r");
  await result;
  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0].message, /next_step/);
  assert.match(h.sent[0].message, /Implement/);
  assert.match(h.sent[0].message, /ship it/);
  const action = JSON.parse(h.sent[0].message.slice("OpenUI user action: ".length));
  assert.deepEqual(action.values, { choice: "Implement", note: "ship it" });
  assert.deepEqual(h.sent[0].options, { deliverAs: "followUp" });
});

test("streaming demo can be cancelled without sending an action", async () => {
  const h = host();
  const result = h.commands.get("openui-demo").handler("--stream", h.ctx);
  h.key("\x1b");
  await result;
  assert.equal(h.closes, 1);
  assert.equal(h.sent.length, 0);
});

test("a stream abort closes the preview and its completed tool stays cancelled", async () => {
  const h = host();
  const abort = new AbortController();
  h.ctx.signal = abort.signal;
  const source = 'root = Stack([Button("Send", "send")]);';
  h.stream(source);
  abort.abort();
  assert.equal(h.closes, 1);
  assert.equal((await h.execute(source)).details.status, "cancelled");
  assert.equal(h.opens, 1);
});

test("oversized source is rejected before parsing or rendering", async () => {
  const h = host();
  const result = await h.execute("x".repeat(limits.source + 1));
  assert.equal(result.isError, true);
  assert.match(result.details.error, /exceeds/);
  assert.equal(h.opens, 0);
});

test("a failed host custom UI becomes an error result", async () => {
  const h = host();
  h.ctx.ui.custom = async () => { throw new Error("host failed"); };
  const result = await h.execute('root = Stack([Button("Send", "send")]);');
  assert.equal(result.isError, true);
  assert.match(result.details.error, /host failed/);
});

test("streaming demo becomes interactive after the last chunk", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const h = host();
  const result = h.commands.get("openui-demo").handler("--stream", h.ctx);
  t.mock.timers.tick(35 * Math.ceil(DEMO_SOURCE.length / 24));
  h.key("\t");
  h.key("\t");
  h.key("\r");
  await result;
  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0].message, /next_step/);
});

test("an already aborted demo does not start an interval", async (t) => {
  const h = host();
  const abort = new AbortController();
  abort.abort();
  h.ctx.signal = abort.signal;
  const timer = t.mock.method(globalThis, "setInterval");
  await h.commands.get("openui-demo").handler("--stream", h.ctx);
  assert.equal(timer.mock.callCount(), 0);
  assert.equal(h.sent.length, 0);
  assert.equal(h.closes, 1);
});

test("a rejected tool call closes its preview so a same-run retry can open", async () => {
  const h = host();
  h.stream("");
  h.events.get("tool_execution_end")!({ toolName: "show_ui", toolCallId: "call-1", isError: true }, h.ctx);
  assert.equal(h.closes, 1);
  const result = h.execute('root = Stack([Button("Retry", "retry")]);', "retry");
  h.key("\r");
  assert.equal((await result).details.action, "retry");
  assert.equal(h.opens, 2);
});
