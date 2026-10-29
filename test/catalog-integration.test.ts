import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { childNodes, componentSpecs } from "../src/catalog.js";
import { CATALOG_DEMO_SOURCE } from "../src/demo.js";
import openuiExtension from "../src/index.js";
import { DocumentModel } from "../src/model.js";
import type { OpenUIView } from "../src/view.js";

function host() {
  const handlers = new Map<string, Function>();
  const tools = new Map<string, any>();
  const commands = new Map<string, any>();
  const sent: string[] = [];
  let view: OpenUIView;
  let closed = 0;
  const api = {
    on: (name: string, handler: Function) => handlers.set(name, handler),
    registerTool: (tool: any) => tools.set(tool.name, tool),
    registerCommand: (name: string, command: any) => commands.set(name, command),
    getActiveTools: () => [...tools.keys()],
    sendUserMessage: (message: string) => sent.push(message),
  } as unknown as ExtensionAPI;
  const ctx = {
    mode: "tui", hasUI: true,
    ui: {
      notify: (message: string) => { throw new Error(message); },
      custom: (factory: Function) => new Promise(resolve => {
        view = factory({ terminal: { rows: 60 }, requestRender() {} }, {}, {}, (result: unknown) => {
          closed++; view.dispose(); resolve(result);
        });
      }),
    },
  } as unknown as ExtensionContext;
  openuiExtension(api);
  const lines = () => view.render(110).map(stripTerminalSequences);
  const click = (label: string) => {
    const frame = lines();
    const y = frame.findIndex(line => line.includes(label));
    assert.ok(y >= 0, `Missing ${label}:\n${frame.join("\n")}`);
    const x = frame[y].indexOf(label) + 1;
    const base: Omit<TuiMouseEvent, "type"> = {
      button: "left", x, y, screenX: x, screenY: y, width: 110, height: frame.length,
      shift: false, ctrl: false, alt: false,
    };
    for (const type of ["press", "release", "click"] as const) view.handleMouse({ ...base, type });
  };
  return {
    sent, lines, click, get closed() { return closed; }, get model() { return view.model; },
    key(data: string) { lines(); view.handleInput(data); },
    command(args = "--catalog") { return commands.get("openui-demo").handler(args, ctx); },
    execute() { return tools.get("show_ui").execute("catalog", { source: CATALOG_DEMO_SOURCE }, undefined, undefined, ctx); },
    stream() {
      handlers.get("message_update")!({ assistantMessageEvent: {
        type: "toolcall_delta", contentIndex: 0, delta: "",
        partial: { content: [{ type: "toolCall", id: "catalog", name: "show_ui", arguments: { source: CATALOG_DEMO_SOURCE } }] },
      } }, ctx);
    },
  };
}

test("catalog document contains every registered component and typed hidden-page defaults", () => {
  const model = new DocumentModel(CATALOG_DEMO_SOURCE);
  try {
    assert.equal(model.valid, true, model.diagnostics.join("\n"));
    const names = new Set<string>();
    const visit = (node: NonNullable<DocumentModel["root"]>) => { names.add(node.typeName); childNodes(node).forEach(visit); };
    visit(model.root!);
    assert.deepEqual([...names].sort(), Object.keys(componentSpecs).sort());
    assert.deepEqual(model.formValues.checks, ["Tests"]);
    assert.equal(model.formValues.count, 2);
    assert.equal(model.formValues.enabled, true);
    assert.equal(model.formValues.date, "2026-11-15");
    assert.ok(model.fieldErrors.owner);
    assert.ok(model.fieldErrors.accepted);
  } finally { model.dispose(); }
});

test("catalog navigates layouts and edits all field types before submitting their native values", async () => {
  const h = host();
  const pending = h.command();
  h.click("Submit catalog");
  assert.equal(h.closed, 0, "required fields must prevent submission");
  assert.ok(h.model.fieldErrors.owner);

  // Return focus to the tab strip, then exercise native keyboard navigation.
  h.click("Forms");
  h.key("\t"); h.key("Ada");
  h.key("\t"); h.key("\x1b[B");
  h.key("\t"); h.key(" ");
  h.key("\t"); h.key("\x1b[B"); h.key(" ");
  h.key("\t"); h.key("First line"); h.key("\r"); h.key("Second line");
  assert.equal(h.model.formValues.owner, "Ada");
  assert.equal(h.model.formValues.priority, "deep");
  assert.equal(h.model.formValues.accepted, true);
  assert.deepEqual(h.model.formValues.checks, ["Tests", "Types"]);
  assert.equal(h.model.formValues.notes, "First line\nSecond line");
  h.click("Unavailable");
  assert.equal(h.model.formValues.priority, "deep", "disabled rich option stays unselected");

  h.click("Advanced");
  h.key("\t"); h.key("\x1b[A");
  h.key("\t"); h.key(" ");
  h.key("\t"); h.key("\x1b[C");
  h.key("\t"); h.key("\x1b[C");
  h.key("\t"); h.key("\x1b[C"); h.key("\x1b[B"); h.key(" ");
  assert.equal(h.model.formValues.count, 3);
  assert.equal(h.model.formValues.enabled, false);
  assert.equal(h.model.formValues.ratio, 30);
  assert.equal(h.model.formValues.date, "2026-11-16");
  assert.equal(h.model.formValues.tree, "model");

  h.click("Layout");
  assert.match(h.lines().join("\n"), /Current plan/);
  h.click("Continue to review");
  h.click("Mark workflow complete");
  assert.equal(h.model.formValues.step, "done");
  h.click("Display");
  assert.match(h.lines().join("\n"), /javascript/);
  h.click("Advance progress");
  assert.equal(h.model.state.$progress, 3);
  assert.match(h.lines().join("\n"), /60%/);
  h.click("Submit catalog");
  await pending;
  assert.equal(h.closed, 1);
  assert.equal(h.sent.length, 1);
  const result = JSON.parse(h.sent[0].slice("OpenUI user action: ".length));
  assert.equal(result.message, "Use this review configuration");
  assert.deepEqual(result.context, { owner: "Ada", priority: "deep", accepted: true, checks: ["Tests", "Types"], notes: "First line\nSecond line", retries: 3, enabled: false, coverage: 30, date: "2026-11-16", file: "model" });
  assert.equal(result.values.page, "display");
  assert.equal(result.values.step, "done");
});

test("catalog streaming is read-only and completion preserves cancellation", async () => {
  const h = host();
  h.stream();
  h.click("Advanced");
  h.key("\t"); h.key("blocked");
  assert.equal(h.model.formValues.page, "forms");
  assert.equal(h.model.formValues.owner, "");
  assert.equal(h.closed, 0);
  const pending = h.execute();
  h.click("Advanced");
  assert.equal(h.model.formValues.page, "advanced");
  h.key("\x1b");
  assert.equal((await pending).details.status, "cancelled");
  assert.equal(h.sent.length, 0);
});
