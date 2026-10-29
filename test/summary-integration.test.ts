import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import openuiExtension from "../src/index.js";
import type { OpenUIView } from "../src/view.js";

const SOURCE = `$internal = "keep this for the agent";
root = Stack([
  Input("owner", "Owner", "Ada"),
  Select("priority", "Review style", [{value: "deep", label: "Deep review"}], "deep"),
  NumberInput("retries", "Retry limit", 3),
  Toggle("enabled", "Checks enabled", true),
  MultiSelect("checks", "Selected checks", ["Tests", "Types"], ["Tests", "Types"]),
  Button("Submit review", @ToAssistant("Use these choices", {internal: $internal}))
]);`;
const theme = { fg: (_color: string, value: string) => value, bg: (_color: string, value: string) => value,
  bold: (value: string) => value, italic: (value: string) => value };

function host() {
  const tools = new Map<string, any>(), commands = new Map<string, any>(), events = new Map<string, Function>();
  const messageRenderers = new Map<string, Function>(), entryRenderers = new Map<string, Function>();
  const messages: any[] = [], entries: any[] = [];
  let view: OpenUIView;
  let userMessages = 0;
  const api = {
    registerTool: (tool: any) => tools.set(tool.name, tool),
    registerCommand: (name: string, command: any) => commands.set(name, command),
    registerMessageRenderer: (name: string, renderer: Function) => messageRenderers.set(name, renderer),
    registerEntryRenderer: (name: string, renderer: Function) => entryRenderers.set(name, renderer),
    registerToolRenderer() {},
    on: (name: string, handler: Function) => events.set(name, handler),
    getActiveTools: () => [...tools.keys()],
    appendEntry: (customType: string, data: unknown) => entries.push({ type: "custom", customType, data }),
    sendMessage: (message: unknown, options: unknown) => messages.push({ message, options }),
    sendUserMessage() { userMessages++; },
  } as unknown as ExtensionAPI;
  const ctx = { mode: "tui", hasUI: true, sessionManager: { getBranch: () => entries }, ui: {
    notify() {},
    custom: (factory: Function) => new Promise(resolve => {
      view = factory({ terminal: { rows: 50 }, requestRender() {} }, theme, {}, resolve);
    }),
  } };
  openuiExtension(api);
  const lines = () => view.render(100).map(stripTerminalSequences);
  return { tools, commands, ctx, messages, entries, events, messageRenderers, entryRenderers,
    get userMessages() { return userMessages; },
    key(data: string) { lines(); view.handleInput(data); },
    click(label: string) {
      const frame = lines(), y = frame.findIndex(line => line.includes(label));
      assert.ok(y >= 0, frame.join("\n"));
      const x = frame[y].indexOf(label) + 1;
      view.handleMouse({ type: "click", button: "left", x, y, screenX: x, screenY: y,
        width: 100, height: 50, shift: false, alt: false, ctrl: false });
    },
  };
}

test("tool receipts select readable fields while preserving the complete typed machine result", async () => {
  const h = host(), tool = h.tools.get("show_ui");
  const params = { source: SOURCE, summary: { title: "Review configuration", fields: ["priority", "retries"] } };
  const pending = tool.execute("direct", params, undefined, undefined, h.ctx);
  h.click("Submit review");
  const result = await pending;
  const expected = { status: "submitted", action: "continue_conversation", message: "Use these choices",
    context: { internal: "keep this for the agent" }, state: { $internal: "keep this for the agent" },
    values: { owner: "Ada", priority: "deep", retries: 3, enabled: true, checks: ["Tests", "Types"] } };
  assert.deepEqual(result.structuredContent, expected);
  assert.deepEqual(JSON.parse(result.content[0].text), expected);
  assert.deepEqual(result.details.openuiReceipt.fields, [
    { name: "priority", label: "Review style", value: "Deep review" },
    { name: "retries", label: "Retry limit", value: "3" },
  ]);
  const renderContext = { expanded: false, args: params, isError: false };
  const compact = tool.renderResult(result, { expanded: false, isPartial: false }, theme, renderContext).render(80).join("\n");
  assert.match(compact, /Submitted.*Review configuration/);
  assert.match(compact, /Review style\s+Deep review/);
  assert.doesNotMatch(compact, /\$internal|"status"|"values"/);
  const expanded = tool.renderResult(result, { expanded: true, isPartial: false }, theme, { ...renderContext, expanded: true }).render(80).join("\n");
  assert.match(expanded, /Full structured result/);
  assert.match(expanded, /keep this for the agent/);
  const call = tool.renderCall(params, theme, renderContext).render(80).join("\n");
  assert.doesNotMatch(call, /root =|MultiSelect/);
  assert.equal(h.messages.length + h.userMessages, 0, "a direct tool result must not inject another model message");
});

test("direct cancellation and malformed source get receipts without fabricated submitted fields", async () => {
  const h = host(), tool = h.tools.get("show_ui");
  const pending = tool.execute("cancel", { source: SOURCE, summary: { title: "Review configuration" } }, undefined, undefined, h.ctx);
  h.key("\x1b");
  const cancelled = await pending;
  assert.deepEqual(cancelled.structuredContent, { status: "cancelled" });
  assert.equal(cancelled.details.openuiReceipt.title, "Review configuration");
  assert.deepEqual(cancelled.details.openuiReceipt.fields, []);
  const error = await tool.execute("bad", { source: 'root = Missing()', summary: { title: "Review configuration" } }, undefined, undefined, h.ctx);
  assert.equal(error.structuredContent.status, "error");
  assert.equal(error.details.openuiReceipt.status, "error");
  assert.equal(error.details.openuiReceipt.title, "Review configuration");
  assert.deepEqual(error.details.openuiReceipt.fields, []);
  const alreadyAborted = new AbortController(); alreadyAborted.abort();
  const aborted = await tool.execute("pre-aborted", { source: SOURCE, summary: { title: "Review configuration" } }, alreadyAborted.signal, undefined, h.ctx);
  assert.equal(aborted.details.openuiReceipt.title, "Review configuration");
  assert.deepEqual(aborted.structuredContent, { status: "cancelled" });
  assert.equal(h.messages.length + h.userMessages, 0);
});

test("Pi validation errors and incomplete historical results render safely", () => {
  const tool = host().tools.get("show_ui");
  const context = { isError: true };
  for (const result of [
    { content: [{ type: "text", text: "Invalid arguments" }], details: {} },
    { content: [{ type: "text", text: '{"status":"submitted"}' }], details: undefined },
    { content: [{ type: "text", text: "Blocked by host" }], details: { status: "submitted", values: null } },
  ]) {
    const frame = tool.renderResult(result, { expanded: false, isPartial: false }, theme, context).render(50).join("\n");
    assert.match(frame, /Error/);
    assert.doesNotMatch(frame, /✓ Submitted/);
  }
  const waiting = tool.renderResult({ content: [], details: {} }, { isPartial: true }, theme, context).render(50).join("\n");
  assert.match(waiting, /Waiting for your response/);
  assert.doesNotMatch(waiting, /Error/);
});

test("demo sends one themed custom message containing the complete action", async () => {
  const h = host();
  const pending = h.commands.get("openui-demo").handler("", h.ctx);
  h.click("Send to Pi");
  await pending;
  assert.equal(h.messages.length, 1);
  const { message, options } = h.messages[0];
  assert.equal(message.customType, "openui-action");
  assert.equal(message.display, true);
  assert.deepEqual(options, { triggerTurn: true, deliverAs: "followUp" });
  const data = JSON.parse(message.content.slice("OpenUI user action: ".length));
  assert.equal(data.status, "submitted");
  assert.deepEqual(data.values, message.details.values);
  assert.equal(data.openuiReceipt, undefined);
  const frame = h.messageRenderers.get(message.customType)!(message, { expanded: false }, theme).render(80).join("\n");
  assert.match(frame, /Submitted.*Next step/);
  assert.doesNotMatch(frame, /"state"|"values"/);
  assert.equal(h.userMessages, 0);
});

test("demo cancellation produces a persistent receipt without starting an agent turn", async () => {
  const h = host();
  const pending = h.commands.get("openui-demo").handler("", h.ctx);
  h.key("\x1b"); await pending;
  assert.equal(h.entries.length, 1);
  const entry = h.entries[0];
  assert.equal(entry.customType, "openui-demo-receipt");
  const frame = h.entryRenderers.get(entry.customType)!(entry, { expanded: false }, theme).render(40).join("\n");
  assert.match(frame, /Cancelled/);
  assert.equal(h.messages.length + h.userMessages, 0);
});
