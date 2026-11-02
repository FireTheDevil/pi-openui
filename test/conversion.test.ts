import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { Type } from "typebox";
import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { registerToolWithConversion } from "../src/conversion.js";

const CHANNEL = "@howaboua/pi-codex-conversion.extension-code-mode-tools/v1";
const REFRESH = "@howaboua/pi-codex-conversion.extension-code-mode-tools-refresh/v1";
const tool: ToolDefinition = {
  name: "show_ui", label: "OpenUI", description: "Native terminal document",
  promptSnippet: "Render a document", promptGuidelines: ["Use actual choices"],
  executionMode: "sequential", parameters: Type.Object({ source: Type.String() }),
  outputSchema: Type.Object({ status: Type.String() }),
  execute: async () => { throw new Error("Direct execution would bypass Pi admission"); },
};
function fixture() {
  const bus = new EventEmitter();
  const registered: ToolDefinition[] = [];
  const shutdown: Function[] = [];
  let refreshes = 0;
  bus.on(REFRESH, () => { refreshes++; });
  const pi = {
    registerTool: (value: ToolDefinition) => registered.push(value),
    on: (event: string, callback: Function) => { if (event === "session_shutdown") shutdown.push(callback); },
    events: {
      on(name: string, callback: (...args: any[]) => void) { bus.on(name, callback); return () => bus.off(name, callback); },
      emit(name: string, value: unknown) { bus.emit(name, value); },
    },
  } as unknown as ExtensionAPI;
  return {
    pi, bus, registered, get refreshes() { return refreshes; },
    snapshot() {
      const tools: any[] = [];
      bus.emit(CHANNEL, { refreshGates: true, add: (provider: Function, active: boolean) => { if (active) tools.push(...provider()); } });
      return tools;
    },
    shutdown() { shutdown.forEach(callback => callback()); },
  };
}

test("conversion support registers one Pi callable and discovers blocking metadata regardless of load order", () => {
  const h = fixture();
  registerToolWithConversion(h.pi, tool);
  assert.deepEqual(h.registered, [tool]);
  assert.equal(h.refreshes, 1);
  const [adapted] = h.snapshot();
  assert.equal(adapted.name, "show_ui");
  assert.equal(adapted.topLevelName, "show_ui", "PCC applies Pi's callable eligibility gate to the original tool");
  assert.equal(adapted.blocking, true);
  assert.equal(adapted.executionPipeline, "pi");
  assert.equal(adapted.executionMode, "sequential");
  assert.equal(adapted.inputSchema, tool.parameters);
  assert.deepEqual(JSON.parse(adapted.output), tool.outputSchema);
  assert.equal(adapted.promptGuidelines, tool.promptGuidelines);
  assert.equal(h.snapshot()[0], adapted, "a later-loaded PCC discovers the same callable");
  assert.equal(h.registered.length, 1);
  h.shutdown(); h.shutdown();
  assert.deepEqual(h.snapshot(), []);
  assert.equal(h.refreshes, 2, "shutdown unregisters once");
});

test("conversion protocol ignores malformed requests and cleans up failed refresh registration", () => {
  const h = fixture();
  registerToolWithConversion(h.pi, tool);
  let added = false;
  for (const value of [undefined, null, {}, { add: "wrong", refreshGates: true }, { add: () => { added = true; } }]) {
    h.bus.emit(CHANNEL, value);
  }
  assert.equal(added, false);
  const failure = fixture();
  failure.bus.on(REFRESH, () => { throw new Error("upstream registration failed"); });
  assert.throws(() => registerToolWithConversion(failure.pi, tool), /upstream registration failed/);
  assert.equal(failure.bus.listenerCount(CHANNEL), 0);
});

test("Pi-only hosts register the unchanged tool without a conversion dependency", () => {
  const registered: ToolDefinition[] = [];
  registerToolWithConversion({ registerTool: (value: ToolDefinition) => { registered.push(value); } } as unknown as ExtensionAPI, tool);
  assert.deepEqual(registered, [tool]);
});

test("conversion invokes Pi admission and preserves typed outcomes and structured diagnostics", async () => {
  const h = fixture(); registerToolWithConversion(h.pi, tool);
  const [adapted] = h.snapshot();
  for (const data of [{ status: "submitted", values: { accepted: true, count: 3 } }, { status: "cancelled" }, { status: "displayed" }, { status: "error", error: "Unknown component" }]) {
    const captured: unknown[] = [];
    const signal = new AbortController().signal;
    const input = { source: "root = Text(\"hello\");" };
    const update = () => {};
    const result = { content: [{ type: "text", text: JSON.stringify(data) }], details: {}, structuredContent: data };
    const actual = await adapted.invoke(input, {
      onUpdate: update, captureResult: (value: unknown) => captured.push(value),
      executeTool: async (name: string, args: unknown, options: any) => {
        assert.equal(name, "show_ui"); assert.equal(args, input); assert.equal(options.signal, signal); assert.equal(options.onUpdate, update);
        return { result, isError: data.status === "error" };
      },
    }, signal);
    assert.equal(actual, data);
    assert.deepEqual(captured, [result]);
  }
});

test("conversion returns form cancellation normally while external aborts still reject", async () => {
  const h = fixture(); registerToolWithConversion(h.pi, tool);
  const [adapted] = h.snapshot();
  let calls = 0;
  const cancelled = { content: [{ type: "text", text: '{"status":"cancelled"}' }], structuredContent: { status: "cancelled" } };
  const context = { executeTool: async () => { calls++; return { result: cancelled, isError: false }; } };
  const signal = new AbortController().signal;
  assert.equal(await adapted.invoke({}, context, signal), cancelled.structuredContent);
  assert.equal(signal.aborted, false);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(adapted.invoke({}, context, aborted.signal), { name: "AbortError" });
  assert.equal(calls, 1);
  const during = new AbortController();
  await assert.rejects(adapted.invoke({}, { executeTool: async () => {
    during.abort();
    return { result: { structuredContent: { status: "submitted" }, content: [] }, isError: false };
  } }, during.signal), { name: "AbortError" });
});
