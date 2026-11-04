import assert from "node:assert/strict";
import test from "node:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { DocumentModel } from "../src/model.js";
import { createInlineDocument, hasInteractiveContent, isInlineDocument, renderInlineDocument } from "../src/inline-document.js";
import { createReceipt, isSummaryOutcome, renderReceipt } from "../src/summary.js";

const plain = (lines: string[]) => lines.map(line => stripTerminalSequences(line).trimEnd()).join("\n");

const SOURCE = `root = Stack([
  Text("Compare review options", {bold: true}),
  Row([Badge("Ready", "success"), Progress(3, 4, "Prepared checks")]),
  Section("Trade-offs", [Table(["Option", "Duration"], [["Quick", "10 minutes"], ["Thorough", "30 minutes"]])]),
  Card("Next steps", [Markdown("Use **Thorough** for unfamiliar code."), List(["Read the diff", "Run the tests"], true)]),
  CodeBlock("npm test", "sh"), Divider()
]);`;

test("display-only documents render actual themed components without dialog controls or fabricated submission", () => {
  const model = new DocumentModel(SOURCE);
  assert.equal(model.valid, true, model.diagnostics.join("\n"));
  assert.equal(hasInteractiveContent(model), false);
  const colors: string[] = [];

  const component = renderInlineDocument(createInlineDocument(SOURCE, "Review choices"), {
    fg(color, text) { colors.push(color);

 return text; }, bold: text => text,
  }, { expanded: true });

  const output = plain(component.render(88));

  for (const expected of ["Review choices", "Compare review options", "Ready", "Prepared checks", "75%", "Trade-offs", "Thorough", "30 minutes", "Run the tests", "npm test"]) {
    assert.ok(output.includes(expected), `Expected actual content: ${expected}`);
  }

  assert.doesNotMatch(output, /Esc cancel|Tab focus|F2|Submitted|Your response/);
  assert.ok(colors.includes("success"));
  assert.ok(colors.includes("accent"));
  assert.ok(isSummaryOutcome({ status: "displayed" }));
  const receipt = createReceipt({ status: "displayed" }, model);
  assert.deepEqual(receipt.fields, []);
  assert.match(plain(renderReceipt(receipt, {}).render(80)), /Displayed/);
  assert.doesNotMatch(plain(renderReceipt(receipt, {}).render(80)), /Your response was submitted/);
  model.dispose();
});

test("fields, actions and navigation always require interaction even when disabled or hidden", () => {
  for (const body of [
    'Input("name", "Name", "Ada", "", {disabled:true})',
    'Button("Do nothing", "noop", {disabled:true})',
    'Tabs("page", [{value:"a",label:"A",children:[Text("Read only")]},{value:"b",label:"B",children:[Select("choice","Choice",["One","Two"],"One")]}], "a")',
    'Steps("page", [{value:"a",label:"A",children:[Text("Read only")]}], "a")',
  ]) {
    const model = new DocumentModel(`root = Stack([${body}]);`);
    assert.equal(model.valid, true, model.diagnostics.join("\n"));
    assert.equal(hasInteractiveContent(model), true, body);
    model.dispose();
  }
});

test("compact inline documents disclose truncation and expansion restores all content", () => {
  const source = `root = Stack([${Array.from({ length: 25 }, (_, index) => `Text("Evidence item ${index}")`).join(",")}]);`;
  const document = createInlineDocument(source, "Evidence");
  const compact = renderInlineDocument(document, {});
  const expanded = renderInlineDocument(document, {}, { expanded: true });
  const compactOutput = plain(compact.render(80));
  assert.match(compactOutput, /Evidence item 0/);
  assert.match(compactOutput, /Expand to see the full document/);
  assert.doesNotMatch(compactOutput, /Evidence item 24/);
  assert.match(plain(expanded.render(80)), /Evidence item 24/);

  for (const width of [0, 1, 2, 9, 30, 80]) {
    for (const component of [compact, expanded]) {
      assert.ok(component.render(width).every(line => visibleWidth(line) <= width), `Overflow at ${width}`);
    }
  }
});

test("persisted display metadata is bounded and malformed or interactive history cannot expose dead controls", () => {
  const hostile = "界🙂\x1b[2J\x1b]52;c;ZXZpbA==\x07";
  const document = createInlineDocument(`root = Stack([Text(${JSON.stringify(hostile)})]);`, hostile);
  assert.ok(isInlineDocument(document));
  const output = renderInlineDocument(document, {}).render(20).join("\n");
  assert.equal(output.includes("\x1b[2J"), false);
  assert.equal(output.includes("\x1b]52"), false);
  assert.ok(!isInlineDocument({ ...document, source: "x".repeat(1_000_000) }));
  assert.ok(!isInlineDocument({ ...document, title: null }));
  assert.match(plain(renderInlineDocument(createInlineDocument('root = Stack([Unknown("bad")]);'), {}).render(80)), /unavailable|Unknown/);
  const interactive = renderInlineDocument(createInlineDocument('root = Stack([Input("name","Name","Ada")]);'), {});
  assert.match(plain(interactive.render(80)), /Interactive documents require an active OpenUI\s+panel/);
  assert.doesNotMatch(plain(interactive.render(80)), /Ada/);
});
