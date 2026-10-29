import assert from "node:assert/strict";
import test from "node:test";
import { Text, stripTerminalSequences } from "@earendil-works/pi-tui";
import type { EntryRenderer, ExtensionAPI, ExtensionContext, ToolRendererResolver, ToolRenderers } from "@earendil-works/pi-coding-agent";
import { CODE_RECEIPT_ENTRY, registerCodeSummaries } from "../src/code-summary.js";
import { createReceipt, type SummaryOutcome } from "../src/summary.js";

const outcome: SummaryOutcome = { status: "submitted", action: "continue_conversation", message: "Review configuration",
  values: { owner: "Ada", checks: ["Tests", "Types"], enabled: true, count: 3 }, state: { $owner: "Ada", $internal: "preserved" } };
const header = "Script completed\nWall time 1.0 seconds\nOutput:\n";
const theme = { fg: (_color: string, text: string) => text, bg: (_color: string, text: string) => text,
  bold: (text: string) => text, italic: (text: string) => text } as any;
const text = (component: any) => component.render(100).map((line: string) => stripTerminalSequences(line).trimEnd()).join("\n");
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function fixture() {
  let resolver!: ToolRendererResolver;
  let entryRenderer!: EntryRenderer;
  let entries: any[] = [];
  const appended: any[] = [];
  const immediate: string[] = [];
  let invalidations = 0;
  const api = {
    registerToolRenderer(value: ToolRendererResolver) { resolver = value; },
    registerEntryRenderer(type: string, value: EntryRenderer) { assert.equal(type, CODE_RECEIPT_ENTRY); entryRenderer = value; },
    appendEntry(customType: string, data: unknown) {
      const entry = { type: "custom", customType, data, id: `entry-${appended.length}`, parentId: null, timestamp: "2026-10-30" };
      appended.push(entry); entries.push(entry);
      // Pi emits entry_appended and invokes the entry renderer immediately.
      immediate.push(text(entryRenderer(entry as any, { expanded: false }, theme)));
    },
  } as unknown as ExtensionAPI;
  const hooks = registerCodeSummaries(api);
  const original: ToolRenderers = {
    renderCall: args => new Text(`CODE: ${(args as { code: string }).code}`, 0, 0),
    renderResult: result => new Text(`CALLS: ${JSON.stringify(result.details?.calls ?? [])}\n${result.content.filter(item => item.type === "text").map(item => item.text === header ? "" : item.text).join("\n")}`, 0, 0),
  };
  const wrapped = resolver("codemode", () => original)!;
  const context = (id = "code") => ({ args: { code: "const result = await tools.show_ui({source: 'SECRET_SOURCE'}); text(result);" }, toolCallId: id,
    state: {}, cwd: "/workspace", invalidate() { invalidations++; }, lastComponent: undefined, executionStarted: true, argsComplete: true,
    isPartial: false, expanded: false, showImages: true, isError: false, durationMs: 1000, outputPad: 1 });
  const call = (id = "code/1", name = "show_ui") => ({ id, name, args: '{"source":"SECRET_SOURCE"}', status: "ok" });
  const result = (items: string[] = [JSON.stringify(outcome)], calls = [call()]) => ({ content: [{ type: "text" as const, text: header }, ...items.map(value => ({ type: "text" as const, text: value }))], details: { calls } });
  function record(value: SummaryOutcome = outcome, id = "code/1", parent: string | undefined = "code") {
    const receipt = createReceipt(value, undefined, { title: "Review setup" });
    const raw = clone(value);
    hooks.onToolEnd({ type: "tool_execution_end", toolName: "show_ui", toolCallId: id, parentToolCallId: parent,
      isError: value.status === "error", result: { content: [{ type: "text", text: JSON.stringify(raw) }], structuredContent: raw,
        details: { ...raw, openuiReceipt: receipt } } });
    return raw;
  }
  function rehydrate(branch: any[]) {
    entries = branch;
    hooks.rehydrate({ sessionManager: { getBranch: () => entries, getEntries: () => { throw new Error("Must not read sibling branches"); } } } as unknown as ExtensionContext);
  }
  return { hooks, wrapped, original, resolver, context, call, result, record, rehydrate, appended, immediate,
    get invalidations() { return invalidations; }, renderEntry(entry: any, expanded = false) { return entryRenderer(entry, { expanded }, theme); } };
}

test("native code summaries are separate persistent receipts and keep raw agent output intact", () => {
  const f = fixture();
  const raw = f.record();
  assert.equal(f.appended.length, 1);
  assert.match(f.immediate[0], /Submitted.*Review setup/);
  assert.match(f.immediate[0], /Ada/);
  const result = f.result();
  const untouched = clone(result);
  f.hooks.onToolEnd({ type: "tool_execution_end", toolName: "codemode", toolCallId: "code", result, isError: false });
  const context = f.context();
  assert.equal(text(f.wrapped.renderCall!(context.args, theme, context)), "OpenUI · code mode");
  const collapsed = text(f.wrapped.renderResult!(result, { expanded: false, isPartial: false }, theme, context));
  assert.match(collapsed, /summary below/);
  assert.doesNotMatch(collapsed, /SECRET_SOURCE|\$internal|Ada|Review setup/, "receipt belongs in its own transcript row");
  assert.deepEqual(result, untouched, "renderer must not change the model's content/details");
  assert.deepEqual(raw, outcome, "the structured result stays exact");
  assert.equal(f.appended[0].customType, CODE_RECEIPT_ENTRY);
});

test("expanded code and receipt retain the source, script output and full structured data", () => {
  const f = fixture(); f.record();
  const context = { ...f.context(), expanded: true };
  const result = f.result();
  assert.match(text(f.wrapped.renderCall!(context.args, theme, context)), /SECRET_SOURCE/);
  assert.match(text(f.wrapped.renderResult!(result, { expanded: true, isPartial: false }, theme, context)), /\$internal/);
  assert.match(text(f.renderEntry(f.appended[0], true)), /\$internal/);
  assert.doesNotMatch(text(f.renderEntry(f.appended[0])), /\$internal/);
});

test("only confirmed OpenUI calls condense code and result-driven changes request one redraw", async () => {
  const f = fixture();
  const context = f.context();
  assert.match(text(f.wrapped.renderCall!(context.args, theme, context)), /SECRET_SOURCE/);
  f.record();
  assert.match(text(f.wrapped.renderCall!(context.args, theme, context)), /SECRET_SOURCE/, "nested completion alone does not prove the rest of a script is OpenUI-only");
  f.wrapped.renderResult!(f.result(), { expanded: false, isPartial: false }, theme, context);
  await Promise.resolve();
  assert.equal(f.invalidations, 1);
  assert.equal(text(f.wrapped.renderCall!(context.args, theme, context)), "OpenUI · code mode");
  f.wrapped.renderResult!(f.result(), { expanded: false, isPartial: false }, theme, context);
  await Promise.resolve();
  assert.equal(f.invalidations, 1, "stable rendering must not loop");
  assert.equal(f.resolver("read", () => f.original), f.original);
});

test("mixed scripts preserve source, unrelated calls and every non-exact output block", () => {
  const f = fixture(); f.record();
  const combined = `==> text 1/2 <==\n${JSON.stringify(outcome)}\n==> text 2/2 <==\nOther important data`;
  const result = f.result([combined], [f.call(), f.call("code/2", "read")]);
  const untouched = clone(result);
  f.hooks.onToolEnd({ type: "tool_execution_end", toolName: "codemode", toolCallId: "code", result, isError: false });
  const context = f.context();
  assert.match(text(f.wrapped.renderCall!(context.args, theme, context)), /SECRET_SOURCE/);
  const rendered = text(f.wrapped.renderResult!(result, { expanded: false, isPartial: false }, theme, context));
  assert.match(rendered, /Other important data/);
  assert.match(rendered, /"name":"read"/);
  assert.match(rendered, /\$internal/, "a combined block with unrelated text stays intact");
  assert.deepEqual(result, untouched);
});

test("only exact known printed outcomes are omitted; derived output, whitespace, errors and truncation remain", () => {
  for (const output of [JSON.stringify({ status: "submitted", values: outcome.status === "submitted" ? outcome.values : {} }),
    `prefix ${JSON.stringify(outcome)}`, `${JSON.stringify(outcome)} `, `Script error:\n${JSON.stringify(outcome)}`]) {
    const f = fixture(); f.record();
    const result = f.result([output]);
    const context = f.context();
    const rendered = text(f.wrapped.renderResult!(result, { expanded: false, isPartial: false }, theme, context));
    assert.match(rendered, /submitted/);
    assert.match(text(f.wrapped.renderCall!(context.args, theme, context)), /SECRET_SOURCE/);
    assert.equal(result.content[1].text, output);
  }
  const f = fixture(); f.record();
  const result = { ...f.result(), details: { ...f.result().details, fullOutputPath: "/tmp/full-code-output" } };
  const context = f.context();
  f.wrapped.renderResult!(result, { expanded: false, isPartial: false }, theme, context);
  assert.match(text(f.wrapped.renderCall!(context.args, theme, context)), /SECRET_SOURCE/);
});

test("multiple known responses use separate receipts and condense Pi's exact multi-text framing", () => {
  const f = fixture(); f.record(); f.record({ status: "cancelled" }, "code/2");
  const combined = `==> text 1/2 <==\n${JSON.stringify(outcome)}\n==> text 2/2 <==\n{"status":"cancelled"}`;
  const result = f.result([combined], [f.call(), f.call("code/2")]);
  const context = f.context();
  const rendered = text(f.wrapped.renderResult!(result, { expanded: false, isPartial: false }, theme, context));
  assert.equal(f.appended.length, 2);
  assert.match(f.immediate[1], /Cancelled/);
  assert.match(rendered, /2 OpenUI responses/);
  assert.doesNotMatch(rendered, /==> text|"status"/);
  assert.equal(text(f.wrapped.renderCall!(context.args, theme, context)), "OpenUI · code mode");
});

test("receipts rehydrate on the active branch and clear across session or branch changes", () => {
  const f = fixture(); f.record();
  const entry = clone(f.appended[0]);
  const result = f.result();
  const message = { type: "message", message: { role: "toolResult", toolName: "codemode", toolCallId: "code", ...result, isError: false } };
  f.rehydrate([entry, message]);
  let context = f.context();
  assert.equal(text(f.wrapped.renderCall!(context.args, theme, context)), "OpenUI · code mode");
  assert.match(text(f.renderEntry(entry)), /Review setup/);
  f.rehydrate([]);
  assert.match(text(f.wrapped.renderCall!(context.args, theme, context)), /SECRET_SOURCE/, "an existing renderer state cannot leak across branches");
  assert.match(text(f.wrapped.renderResult!(result, { expanded: false, isPartial: false }, theme, context)), /\$internal/);
  f.rehydrate([entry, message]);
  context = f.context();
  assert.equal(text(f.wrapped.renderCall!(context.args, theme, context)), "OpenUI · code mode");
  f.hooks.clear();
  assert.match(text(f.wrapped.renderCall!(context.args, theme, context)), /SECRET_SOURCE/);
});

test("direct calls, duplicate events and malformed persistence cannot create duplicate or invalid receipts", () => {
  const f = fixture();
  f.hooks.onToolEnd({ type: "tool_execution_end", toolName: "show_ui", toolCallId: "direct-no-parent", isError: false,
    result: { details: { openuiReceipt: createReceipt(outcome) }, structuredContent: outcome } });
  assert.equal(f.appended.length, 0);
  f.record(outcome, "same"); f.record(outcome, "same");
  assert.equal(f.appended.length, 1);
  const malformed = { type: "custom", customType: CODE_RECEIPT_ENTRY, data: { version: 1, parentToolCallId: "code", toolCallId: "code/1", receipt: { status: "submitted" }, outcome } };
  f.rehydrate([malformed]);
  assert.equal(f.renderEntry(malformed), undefined);
  const context = f.context();
  assert.match(text(f.wrapped.renderResult!(f.result(), { expanded: false, isPartial: false }, theme, context)), /\$internal/);
});
