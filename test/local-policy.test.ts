import assert from "node:assert/strict";
import { test } from "node:test";
import type { ElementNode } from "@openuidev/lang-core";
import { DocumentModel, limits } from "../src/model.js";
import { localActionError, localDocumentDiagnostics } from "../src/local-policy.js";
import { HOSTING_EXPLORER_SOURCE, LOCAL_EXPLANATION_SOURCE } from "../src/local-demo.js";

const document = (action: string, extra = "") => `$count = 0\n$show = false\n${extra}\nroot = Stack([Button("Change", ${action}), Text("Count: " + $count)])`;

test("local policy accepts Set, Reset, ordered local actions and static aliases", () => {
  for (const source of [
    document("@Set($count, $count + 1)"),
    document("@Reset($count, $show)"),
    document("Action([@Set($count, 4), @Reset($show)])"),
    document("$show ? @Set($count, 1) : @Reset($count)"),
    document("change", "change = @Set($count, $count + 1)"),
    document("change", "change = $show ? add : reset\nadd = @Set($count, 2)\nreset = @Reset($count)"),
    document("Action(steps)", "steps = [@Set($count, 4), @Reset($show)]"),
    '$count = 0\nroot = Stack(@Each([{amount: 1}, {amount: 2}], "item", Button("Add " + item.amount, @Set($count, $count + item.amount))))',
  ]) assert.deepEqual(localDocumentDiagnostics(source), [], source);
});

test("local policy permits reactive calculations, tabs and content that merely mentions actions", () => {
  const source = '$workers = 4\n$page = "price"\nroot = Stack([NumberInput("workers", "Workers", $workers, {min: 0}), Tabs("page", [{value: "price", label: "Price", children: [Text("Basic: " + (10 + 4 * @Max([0, $workers - 2]))) ]}, {value: "notes", label: "Notes", children: [CodeBlock("Button(\\\"Send\\\", @ToAssistant(\\\"x\\\"))"), Text("@Run and @OpenUrl are not used here")]}], $page)])';
  assert.deepEqual(localDocumentDiagnostics(source), []);
  const model = new DocumentModel(source);
  assert.equal(model.valid, true, model.diagnostics.join("\n"));
});

test("all submission and external forms are rejected without evaluating their current branch", () => {
  for (const action of [
    '"submit"', '@ToAssistant("Answer", {count: $count})',
    'Action([@Set($count, 1), @ToAssistant("Answer")])',
    '$show ? @ToAssistant("Answer") : @Reset($count)',
    '{type: "continue_conversation", context: "answer"}',
    '{steps: [{type: "continue_conversation", message: "answer"}]}',
    '@Run(result)', '@OpenUrl("https://example.com")', '@CustomAction($count)',
  ]) assert.notEqual(localDocumentDiagnostics(document(action)).length, 0, action);
});

test("inactive components, loop templates, unused declarations and aliases cannot hide external actions", () => {
  for (const source of [
    '$show = false\nroot = Stack([$show ? Button("Send", @ToAssistant("Answer")) : Text("Hidden")])',
    '$page = "one"\nroot = Stack([Tabs("page", [{value: "one", label: "One", children: [Text("One")]}, {value: "two", label: "Two", children: [Button("Send", "submit")]}], $page)])',
    'root = Stack(@Each([], "item", Button("Send", @ToAssistant("Answer"))))',
    'root = Stack([Text("Hello")])\nunused = @ToAssistant("Answer")',
    'root = Stack([Text("Hello")])\nunused = Query("tool", {})',
    'root = Stack([Text("Hello")])\nunused = Mutation("tool", {})',
    document("hidden", 'hidden = $show ? @Reset($count) : send\nsend = @ToAssistant("Answer")'),
  ]) assert.notEqual(localDocumentDiagnostics(source).length, 0, source);
});

test("raw component objects cannot bypass action validation, even behind a conditional", () => {
  for (const source of [
    'root = Stack([{type: "element", typeName: "Button", props: {label: "Send", action: "submit"}}])',
    '$visible = false\n$widget = {type: "element", typeName: "Button", props: {label: "Send", action: "submit"}}\nroot = Stack([$visible ? $widget : Text("Safe"), Button("Show", @Set($visible, true))])',
  ]) {
    // These are accepted by the underlying evaluator: the local policy must
    // reject them before mounting, rather than only inspecting visible buttons.
    const model = new DocumentModel(source);
    assert.equal(model.valid, true, model.diagnostics.join("\n"));
    assert.match(localDocumentDiagnostics(source).join("\n"), /Raw component objects/);
  }
});

test("hosting explorer and general local explanation satisfy the local contract", () => {
  for (const source of [HOSTING_EXPLORER_SOURCE, LOCAL_EXPLANATION_SOURCE]) {
    assert.deepEqual(localDocumentDiagnostics(source), []);
    const model = new DocumentModel(source);
    assert.equal(model.valid, true, model.diagnostics.join("\n"));
  }
});

test("unprovable dynamic action sources and recursive aliases fail closed", () => {
  for (const action of ["$count", "settings.action", "actions[0]", "@First(actions)", "missing", "loop"])
    assert.notEqual(localDocumentDiagnostics(document(action, "loop = other\nother = loop")).length, 0, action);
  const generated = 'root = Stack(@Each([{action: "submit"}], "item", Button("Send", item.action)))';
  assert.match(localDocumentDiagnostics(generated).join("\n"), /Dynamic or object actions/);
});

test("compact shared action graphs are rejected before exponential lang-core materialization", () => {
  const lines = ['$count = 0', '$flag = false', 'a0 = @Reset($count)'];
  // Only 31 distinct actions, but expanding both branches recursively would
  // visit more than a billion action paths before the widget could mount.
  for (let index = 1; index <= 30; index++) lines.push(`a${index} = $flag ? a${index - 1} : a${index - 1}`);
  lines.push('root = Stack([Button("Reset", a30)])');
  const started = performance.now();
  assert.match(localDocumentDiagnostics(lines.join("\n")).join("\n"), /expands beyond 16,384 syntax nodes/);
  assert.ok(performance.now() - started < 5000, "a compact shared graph must not stall the terminal");
});

test("static data expansion has the same bound while ordinary shared aliases remain supported", () => {
  const lines = ['a0 = [1]'];
  for (let index = 1; index <= 30; index++) lines.push(`a${index} = [a${index - 1}, a${index - 1}]`);
  lines.push('root = Stack([Text("Count: " + @Count(a30))])');
  assert.match(localDocumentDiagnostics(lines.join("\n")).join("\n"), /expands beyond 16,384 syntax nodes/);
  const ordinary = '$count = 2\nlabel = "Count: " + $count\nreset = @Reset($count)\nroot = Stack([Text(label), Text(label), Button("Reset", reset)])';
  assert.deepEqual(localDocumentDiagnostics(ordinary), []);
  const model = new DocumentModel(ordinary);
  assert.equal(model.valid, true, model.diagnostics.join("\n"));
});

test("memoized action graphs still reject cycles and excessive nesting on a deeper path", () => {
  for (const declarations of [
    'loop = $show ? loop : @Reset($count)',
    'loop = Action([other])\nother = $show ? @Reset($count) : loop',
    'loop = other\nother = loop',
  ]) assert.notEqual(localDocumentDiagnostics(document("loop", declarations)).length, 0, declarations);
  const lines = ['$count = 0', '$flag = false', 'leaf = @Reset($count)', 'a0 = $flag ? leaf : leaf'];
  for (let index = 1; index <= limits.actionSteps; index++) lines.push(`a${index} = $flag ? a${index - 1} : leaf`);
  // Visit/cache leaf through a shallow path first; the deeper reuse still has
  // to satisfy the nesting limit, rather than bypassing it through the cache.
  lines.push(`root = Stack([Button("Shallow", leaf), Button("Deep", a${limits.actionSteps})])`);
  assert.match(localDocumentDiagnostics(lines.join("\n")).join("\n"), /nesting limit/);

  const aliases = ['$count = 0', 'a0 = @Reset($count)'];
  for (let index = 1; index <= limits.depth + 1; index++) aliases.push(`a${index} = a${index - 1}`);
  aliases.push(`root = Stack([Button("Deep", a${limits.depth + 1})])`);
  assert.match(localDocumentDiagnostics(aliases.join("\n")).join("\n"), /Cannot prove/);
});

test("invalid local steps are rejected before mounting", () => {
  for (const action of ['@Set($missing, 1)', '@Set("$count", 1)', '@Set($count)', '@Reset()', '@Reset($missing)', 'Action([])', 'Action($count)', 'Action([@Reset($count)], @Reset($count))'])
    assert.notEqual(localDocumentDiagnostics(document(action)).length, 0, action);
  const tooMany = `Action([${Array.from({ length: limits.actionSteps + 1 }, () => "@Set($count, 1)").join(",")}])`;
  assert.match(localDocumentDiagnostics(document(tooMany)).join("\n"), /at most 32/);
  assert.notEqual(localDocumentDiagnostics(" ").length, 0);
  assert.match(localDocumentDiagnostics(" ".repeat(limits.source + 1))[0], /exceeds/);
});

test("evaluated-plan guard permits only valid local steps and rejects every submission shape", () => {
  const model = new DocumentModel(document("Action([@Set($count, $count + 1), @Reset($show)])"));
  const button = (model.root!.props.children as ElementNode[])[0];
  assert.equal(localActionError(button.props.action), undefined);
  assert.deepEqual(model.activate(button), { status: "updated" });
  assert.equal(model.state.$count, 1);
  for (const action of [
    "submit", null, {}, { steps: [] },
    { steps: [{ type: "continue_conversation", message: "Answer" }] },
    { steps: [{ type: "open_url", url: "https://example.com" }] },
    { steps: [{ type: "run", statementId: "request" }] },
    { steps: [{ type: "custom_action", name: "save", params: {} }] },
    { steps: [{ type: "set", target: "count", valueAST: { k: "Num", v: 1 } }] },
    { steps: [{ type: "reset", targets: [] }] },
    { steps: [null] },
  ]) assert.equal(typeof localActionError(action), "string", JSON.stringify(action));
});
