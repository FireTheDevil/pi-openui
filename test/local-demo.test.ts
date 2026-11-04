import assert from "node:assert/strict";
import test from "node:test";
import type { RenderedNode } from "../src/catalog.js";
import { childNodes } from "../src/catalog.js";
import { HOSTING_EXPLORER_SOURCE, LOCAL_EXPLANATION_SOURCE } from "../src/local-demo.js";
import { DocumentModel } from "../src/model.js";
import { OpenUIView } from "../src/view.js";

function nodes(model: DocumentModel): RenderedNode[] {
  const result: RenderedNode[] = [];
  const visit = (node: RenderedNode) => { result.push(node); childNodes(node).forEach(visit); };

  if (model.root) visit(model.root);

  return result;
}

function node(model: DocumentModel, type: string, name?: string): RenderedNode {
  const found = nodes(model).find(item => item.typeName === type && (name === undefined || item.props.name === name || item.props.label === name));
  assert.ok(found, `${type} ${name ?? ""}`);

  return found;
}

function create(source: string): DocumentModel {
  const model = new DocumentModel(source);
  assert.equal(model.valid, true, model.diagnostics.join("\n"));

  return model;
}

test("hosting explorer recomputes all plan prices and ties from edited workers", () => {
  const model = create(HOSTING_EXPLORER_SOURCE);

  try {
    for (const [workers, prices, cheapest] of [
      [4, [18, 20, 40], "Basic ($18/month)"],
      [10, [42, 40, 40], "Standard and Pro ($40/month)"],
      [11, [46, 44, 40], "Pro ($40/month)"],
      [0, [10, 20, 40], "Basic ($10/month)"],
      [4.5, [20, 20, 40], "Basic and Standard ($20/month)"],
      [13, [54, 52, 44], "Pro ($44/month)"],
    ] as const) {
      model.setField(node(model, "NumberInput", "workers"), workers);
      // SAFETY: The checked hosting explorer source declares scalar-cell Table rows.
      const rows = node(model, "Table").props.rows as unknown[][];
      assert.deepEqual(rows.map(row => row[3]), prices.map(price => `$${price}`));
      assert.ok(nodes(model).some(item => item.typeName === "Text" && item.props.text === `Cheapest: ${cheapest}`));
      assert.equal(model.valid, true);
    }

    assert.deepEqual(model.activate(node(model, "Button", "Reset workers")), { status: "updated" });
    assert.equal(model.state.$workers, 4);
    // SAFETY: Reset preserves the same validated Table row structure as the initial explorer.
    assert.equal((node(model, "Table").props.rows as unknown[][])[0][3], "$18");
  } finally { model.dispose(); }
});

test("non-form explanation navigates and expands through native keyboard interaction", () => {
  const model = create(LOCAL_EXPLANATION_SOURCE);
  let done = 0;
  const view = new OpenUIView(model, { getHeight: () => 24, requestRender() {}, onDone() { done++; } });

  try {
    view.render(96);
    view.handleInput("\x1b[C");
    assert.equal(model.state.$page, "formula");
    assert.match(view.render(96).join("\n"), /total = base/);
    view.handleInput("\x1b[D");
    view.handleInput("\t");
    view.handleInput("\r");
    assert.equal(model.state.$expanded, true);
    assert.match(view.render(96).join("\n"), /Unused included workers/);
    view.handleInput("\r");
    assert.equal(model.state.$expanded, false);
    assert.doesNotMatch(view.render(96).join("\n"), /Unused included workers/);
    view.handleInput("\r");
    view.handleInput("\t");
    view.handleInput("\r");
    assert.deepEqual(model.state, { $page: "overview", $expanded: false });
    assert.equal(done, 0, "local navigation and actions never submit or close the view");
  } finally { view.dispose(); model.dispose(); }
});
