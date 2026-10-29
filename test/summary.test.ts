import assert from "node:assert/strict";
import test from "node:test";
import type { ElementNode } from "@openuidev/lang-core";
import { stripTerminalSequences, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { childNodes } from "../src/catalog.js";
import { DocumentModel } from "../src/model.js";
import type { HostTheme } from "../src/presentation.js";
import { createReceipt, renderOpenUICall, renderReceipt, type Receipt, type SummaryOutcome } from "../src/summary.js";

const SOURCE = `$reviewLabel = "Initial label";
$owner = "Ada";
root = Stack([
  Tabs("page", [
    {value: "shown", label: "Shown", children: [Input("owner", "Owner", $owner)]},
    {value: "hidden", label: "Hidden", children: [Input("hidden", "Hidden page answer", "retained")]}
  ], "shown"),
  Steps("workflow", [{value: "confirm", label: "Confirm", children: [Checkbox("accepted", "Confirmation", true)]}], "confirm"),
  Select("priority", $reviewLabel, [{value: "deep", label: "Deep review"}, {value: "quick", label: "Quick pass"}], "deep"),
  MultiSelect("checks", "Checks", [{value: "tests", label: "Tests"}, {value: "types", label: "Types"}], ["tests", "types"]),
  TextArea("notes", "Review notes", "First line\\nSecond line"),
  NumberInput("retries", "Retries", 3),
  Toggle("enabled", "Checks enabled", false),
  Slider("coverage", "Coverage", 75, 0, 100),
  DatePicker("date", "Target date", "2026-11-16"),
  Tree("file", "Selected file", [{value: "src", label: "Source", children: [{value: "model", label: "model.ts"}]}], "model"),
  Button("Rename", @Set($reviewLabel, "Review style")),
  Button("Submit", @ToAssistant("Use this review configuration", {owner: $owner}))
]);`;

function all(model: DocumentModel): ElementNode[] {
  const nodes: ElementNode[] = [];
  const visit = (node: ElementNode) => { nodes.push(node); childNodes(node).forEach(visit); };
  if (model.root) visit(model.root);
  return nodes;
}

function fixture() {
  const model = new DocumentModel(SOURCE);
  assert.equal(model.valid, true, model.diagnostics.join("\n"));
  model.setField(all(model).find(node => node.props.name === "owner")!, "Grace");
  assert.equal(model.activate(all(model).find(node => node.typeName === "Button" && node.props.label === "Rename")!).status, "updated");
  const outcome = model.activate(all(model).find(node => node.typeName === "Button" && node.props.label === "Submit")!);
  assert.equal(outcome.status, "submitted");
  if (outcome.status !== "submitted") throw new Error("Expected submitted form");
  return { model, outcome };
}

const plain = (lines: string[]) => lines.map(stripTerminalSequences).join("\n");

test("receipts use final labels and values across every field type and hidden pages without changing typed results", () => {
  const { model, outcome } = fixture();
  const before = structuredClone(outcome);
  const receipt = createReceipt(outcome, model, { title: "Review configuration" });
  assert.equal(receipt.version, 1);
  assert.equal(receipt.status, "submitted");
  assert.equal(receipt.title, "Review configuration");
  const fields = new Map(receipt.fields.map(field => [field.name, field]));
  assert.equal(fields.get("owner")?.value, "Grace");
  assert.equal(fields.get("hidden")?.value, "retained");
  assert.equal(fields.get("priority")?.label, "Review style");
  assert.equal(fields.get("priority")?.value, "Deep review");
  assert.equal(fields.get("accepted")?.value, "Yes");
  assert.equal(fields.get("enabled")?.value, "No");
  assert.match(fields.get("checks")?.value ?? "", /Tests.*Types/s);
  assert.equal(fields.get("notes")?.value, "First line\nSecond line");
  assert.equal(fields.get("retries")?.value, "3");
  assert.equal(fields.get("coverage")?.value, "75");
  assert.equal(fields.get("date")?.value, "2026-11-16");
  assert.equal(fields.get("file")?.value, "model.ts");
  assert.equal(fields.has("page"), false);
  assert.equal(fields.has("workflow"), false);
  assert.equal(receipt.fields.length, 11);
  assert.deepEqual(outcome, before);
  assert.equal(typeof outcome.values.retries, "number");
  assert.equal(typeof outcome.values.accepted, "boolean");
  assert.deepEqual(outcome.values.checks, ["tests", "types"]);
});

test("receipt field hints order known fields, ignore unknown names and fall back to names without model metadata", () => {
  const { model, outcome } = fixture();
  const receipt = createReceipt(outcome, model, { fields: ["date", "unknown", "owner", "date", "page"] });
  assert.deepEqual(receipt.fields.map(field => field.name), ["date", "owner"]);
  assert.equal(receipt.title, "OpenUI");
  const fallback = createReceipt({ ...outcome, values: { external: "external answer", enabled: false, count: 4, choices: ["a", "b"] } });
  assert.match(fallback.fields.find(field => field.name === "external")?.label ?? "", /^external$/i);
  assert.equal(fallback.fields.find(field => field.name === "external")?.value, "external answer");
  assert.equal(fallback.fields.find(field => field.name === "enabled")?.value, "No");
  assert.equal(fallback.fields.find(field => field.name === "count")?.value, "4");
  assert.match(fallback.fields.find(field => field.name === "choices")?.value ?? "", /a.*b/);
});

test("compact receipts omit extra fields while expanded receipts expose full fields and original structured details", () => {
  const { model, outcome } = fixture();
  const receipt = createReceipt(outcome, model, { title: "Review configuration" });
  const compact = plain(renderReceipt(receipt, {}).render(100));
  const expanded = plain(renderReceipt(receipt, {}, { expanded: true, outcome }).render(100));
  assert.match(compact, /submitted/i);
  assert.match(compact, /Review configuration/);
  assert.match(compact, /Owner/);
  assert.match(compact, /Grace/);
  assert.match(compact, /more|expand/i);
  assert.doesNotMatch(compact, /model\.ts/);
  assert.match(expanded, /model\.ts/);
  assert.match(expanded, /First line/);
  assert.match(expanded, /Second line/);
  assert.match(expanded, /"status"\s*:\s*"submitted"/);
  assert.match(expanded, /"retries"\s*:\s*3/);
  assert.match(expanded, /"accepted"\s*:\s*true/);
});

test("receipt statuses use Pi semantic colors and cancellation or errors never include submitted fields", () => {
  const colors: string[] = [];
  const theme: HostTheme = {
    fg: (color, value) => { colors.push(color); return `\x1b[36m${value}\x1b[39m`; },
    bold: value => `\x1b[1m${value}\x1b[22m`,
  };
  const { model, outcome } = fixture();
  const submitted = renderReceipt(createReceipt(outcome, model), theme).render(80);
  assert.ok(colors.includes("success"));
  assert.ok(submitted.join("").includes("\x1b[1m"));
  const cancelled = createReceipt({ status: "cancelled" }, model);
  assert.deepEqual(cancelled.fields, []);
  assert.match(plain(renderReceipt(cancelled, theme).render(80)), /cancelled/i);
  const error = createReceipt({ status: "error", error: "Document has mismatched brackets." }, model);
  assert.deepEqual(error.fields, []);
  assert.match(plain(renderReceipt(error, theme).render(80)), /mismatched brackets/);
  assert.ok(colors.includes("error"));
  assert.doesNotMatch(plain(renderReceipt(cancelled, theme).render(80)), /Grace|Deep review/);
});

test("receipt renderers sanitize terminal controls and fit narrow Unicode viewports", () => {
  const hostile = "界🙂 text\x1b[2J\x1b]52;c;ZXZpbA==\x07\x1b_pi:c\x07";
  const outcome: SummaryOutcome = { status: "submitted", action: "send", values: { note: hostile }, state: {} };
  const receipt: Receipt = {
    version: 1, status: "submitted", title: hostile,
    fields: [{ name: "note", label: hostile, value: `${hostile}\n${"long value ".repeat(60)}` }],
    message: hostile,
  };
  for (const width of [0, 1, 2, 8, 24, 80]) {
    for (const expanded of [false, true]) {
      const cases: Component[] = [
        renderReceipt(receipt, {}, { expanded, outcome }),
        renderReceipt({ ...receipt, status: "error", error: hostile }, {}, { expanded }),
        renderOpenUICall(hostile, { title: hostile }, {}, expanded),
      ];
      for (const component of cases) {
        const lines = component.render(width);
        assert.ok(lines.every(line => visibleWidth(line) <= width), `Must fit ${width} columns`);
        const output = lines.join("\n");
        assert.equal(output.includes("\x1b[2J"), false);
        assert.equal(output.includes("\x1b]52"), false);
        assert.equal(output.includes("\x1b_pi:c"), false);
      }
    }
  }
  assert.ok(renderReceipt(receipt, {}).render(80).length < 25, "compact multiline values stay bounded");
});

test("tool call rendering hides source by default and exposes it on expansion", () => {
  const compact = plain(renderOpenUICall(SOURCE, { title: "Review configuration" }, {}, false).render(100));
  const expanded = plain(renderOpenUICall(SOURCE, { title: "Review configuration" }, {}, true).render(100));
  assert.match(compact, /Review configuration/);
  assert.doesNotMatch(compact, /root = Stack|@ToAssistant|\$reviewLabel/);
  assert.match(expanded, /root = Stack/);
  assert.match(expanded, /@ToAssistant/);
  const partial = renderOpenUICall(undefined, undefined, {}, false);
  assert.doesNotThrow(() => partial.render(40));
});
