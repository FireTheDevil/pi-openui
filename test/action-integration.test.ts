import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, type TuiMouseEvent } from "@earendil-works/pi-tui";
import openuiExtension from "../src/index.js";
import { ACTIONS_DEMO_SOURCE } from "../src/demo.js";
import type { OpenUIView } from "../src/view.js";

function host() {
  const handlers = new Map<string, Function>();
  const tools = new Map<string, any>();
  const commands = new Map<string, any>();
  const sent: string[] = [];
  let view: OpenUIView;
  let closed = 0;
  const api = {
    registerToolRenderer() {},
    registerMessageRenderer() {},
    registerEntryRenderer() {},
    appendEntry() {},
    on: (name: string, handler: Function) => handlers.set(name, handler),
    registerTool: (tool: any) => tools.set(tool.name, tool),
    registerCommand: (name: string, command: any) => commands.set(name, command),
    getActiveTools: () => [...tools.keys()],
    sendUserMessage: (content: string) => sent.push(content),
    sendMessage: (message: {content:string}) => sent.push(message.content),
  } as unknown as ExtensionAPI;
  const ctx = {
    mode: "tui", hasUI: true,
    ui: {
      notify: (message: string) => { throw new Error(message); },
      custom: (factory: Function) => new Promise(resolve => {
        view = factory({ terminal: { rows: 40 }, requestRender() {} }, {}, {}, (result: unknown) => {
          closed++; view.dispose(); resolve(result);
        });
      }),
    },
  } as unknown as ExtensionContext;
  openuiExtension(api);
  const lines = () => view.render(100).map(stripTerminalSequences);
  const click = (text: string, rowOffset = 0) => {
    const frame = lines();
    const y = frame.findIndex(line => line.includes(text));
    assert.ok(y >= 0, `Missing ${text}: ${frame.join("\n")}`);
    const x = frame[y].indexOf(text) + (rowOffset ? 0 : 1);
    const base: Omit<TuiMouseEvent, "type"> = {
      button: "left", x, y: y + rowOffset, screenX: x, screenY: y + rowOffset,
      width: 100, height: frame.length, shift: false, ctrl: false, alt: false,
    };
    for (const type of ["press", "release", "click"] as const) view.handleMouse({ ...base, type });
  };
  return {
    sent, lines, click, get closed() { return closed; },
    key(data: string) { lines(); view.handleInput(data); },
    command(args: string) { return commands.get("openui-demo").handler(args, ctx); },
    execute(source = ACTIONS_DEMO_SOURCE) { return tools.get("show_ui").execute("actions", { source }, undefined, undefined, ctx); },
    stream() {
      handlers.get("message_update")!({ assistantMessageEvent: {
        type: "toolcall_delta", contentIndex: 0, delta: "",
        partial: { content: [{ type: "toolCall", id: "actions", name: "show_ui", arguments: { source: ACTIONS_DEMO_SOURCE } }] },
      } }, ctx);
    },
  };
}

test("action demo keeps local Set/Reset plans open and sends current state only on ToAssistant", async () => {
  const h = host();
  const pending = h.command("--actions");
  h.key("\x1b[B");
  h.key("\t");
  h.key("Draft note");
  h.key("\t");
  h.key("\r");
  h.key("\r");
  assert.ok(h.lines().some(line => line.includes("Count: 2")));
  h.click("[ Mark ready ]");
  assert.ok(h.lines().some(line => line.includes("Status: Ready to send")));
  assert.equal(h.closed, 0);
  assert.equal(h.sent.length, 0);
  h.click("[ Reset all ]");
  assert.ok(h.lines().some(line => line.includes("Count: 0 | Selected: Review | Status: Draft")));
  assert.ok(h.lines().some(line => line.includes("Add an optional note")));
  assert.equal(h.closed, 0);
  h.click("Instructions", 1);
  h.key("Reviewed plan");
  h.click("[ Increment count ]");
  h.click("[ Mark ready ]");
  h.click("[ Send to Pi ]");
  await pending;
  assert.equal(h.closed, 1);
  assert.equal(h.sent.length, 1);
  const action = JSON.parse(h.sent[0].slice("OpenUI user action: ".length));
  assert.equal(action.status, "submitted");
  assert.equal(action.message, "Use this plan");
  assert.deepEqual(action.context, { count: 1, choice: "Implement", note: "Reviewed plan", status: "Ready to send" });
  assert.deepEqual(action.values, { choice: "Implement", note: "Reviewed plan" });
  assert.deepEqual(action.state, Object.fromEntries(Object.entries(action.context).map(([key, value]) => [`$${key}`, value])));
});

test("streamed action previews reject keyboard and mouse mutations until tool execution", async () => {
  const h = host();
  h.stream();
  h.click("[ Increment count ]");
  h.click("Instructions", 1);
  h.key("must not be entered");
  h.click("[ Send to Pi ]");
  assert.equal(h.closed, 0);
  assert.ok(h.lines().some(line => line.includes("Count: 0")));
  assert.ok(!h.lines().some(line => line.includes("must not be entered")));
  const pending = h.execute();
  h.click("[ Increment count ]");
  assert.ok(h.lines().some(line => line.includes("Count: 1")));
  assert.equal(h.closed, 0);
  h.click("[ Send to Pi ]");
  const result = await pending;
  assert.equal(result.details.status, "submitted");
  assert.equal(result.details.context.count, 1);
  assert.equal(h.sent.length, 0, "tool action travels in its result, not a duplicate user turn");
});

test("streaming action demo becomes editable after completion", async t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const h = host();
  const pending = h.command("--actions --stream");
  t.mock.timers.tick(35 * Math.ceil(ACTIONS_DEMO_SOURCE.length / 24));
  h.click("[ Increment count ]");
  assert.ok(h.lines().some(line => line.includes("Count: 1")));
  h.key("\x1b");
  await pending;
  assert.equal(h.sent.length, 0);
});

test("tool submission evaluates ToAssistant context after earlier steps in its Action sequence", async () => {
  const h = host();
  const pending = h.execute('$count = 0;\nroot = Stack([Button("Update and send", Action([@Set($count, $count + 1), @ToAssistant("Counter updated", {count: $count})]))]);');
  h.key("\r");
  const result = await pending;
  assert.equal(result.details.message, "Counter updated");
  assert.deepEqual(result.details.context, { count: 1 });
  assert.equal(result.details.state.$count, 1);
  assert.equal(h.closed, 1);
});
