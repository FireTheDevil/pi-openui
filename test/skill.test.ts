import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { formatSkillsForPrompt, loadSkills } from "@earendil-works/pi-coding-agent";
import { childNodes, DocumentModel } from "../src/model.js";
import type { ElementNode } from "@openuidev/lang-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillPath = resolve(root, "skills/openui/SKILL.md");

test("Pi discovers the bundled OpenUI skill without diagnostics and exposes it to native code-mode prompts", () => {
  const loaded = loadSkills({
    cwd: root,
    agentDir: resolve(root, "artifacts/unused-skill-test-agent"),
    skillPaths: [resolve(root, "skills")],
    includeDefaults: false,
  });
  assert.deepEqual(loaded.diagnostics, []);
  assert.equal(loaded.skills.length, 1);
  const skill = loaded.skills[0];
  assert.equal(skill.name, "openui");
  assert.equal(skill.filePath, skillPath);
  assert.equal(skill.disableModelInvocation, false);
  const prompt = formatSkillsForPrompt(loaded.skills, "indirect");
  assert.match(prompt, /<name>openui<\/name>/);
  assert.match(prompt, /show_ui/);
  assert.ok(prompt.includes(skillPath));
});

test("complete OpenUI examples in the skill parse with the shipped component schemas", () => {
  const source = readFileSync(skillPath, "utf8");
  const examples = [...source.matchAll(/```openui\n([\s\S]*?)\n```/g)].map(match => match[1]);
  assert.equal(examples.length, 3);
  for (const [index, example] of examples.entries()) {
    const model = new DocumentModel(example);
    try {
      assert.equal(model.valid, true, `Example ${index + 1}: ${model.diagnostics.join("; ")}`);
      if (index === 0) assert.deepEqual(model.formValues, { depth: "focused" });
      else if (index === 1) {
        assert.deepEqual(model.formValues, { owner: "", checks: ["tests"], retries: 2, confirmed: false });
        assert.deepEqual(model.fieldErrors, { owner: "Required.", confirmed: "Must be checked." });
      } else {
        assert.deepEqual(model.formValues, { people: 2, hours: 3, rate: 50 });
        assert.deepEqual(model.fieldErrors, {});
      }
    } finally { model.dispose(); }
  }
});

test("the skill's scenario example recomputes locally, resets and submits the derived result", () => {
  const skill = readFileSync(skillPath, "utf8");
  const examples = [...skill.matchAll(/```openui\n([\s\S]*?)\n```/g)].map(match => match[1]);
  const model = new DocumentModel(examples[2]);
  function nodes(node: ElementNode): ElementNode[] { return [node, ...childNodes(node).flatMap(nodes)]; }
  function find(type: string, name?: string): ElementNode {
    const node = nodes(model.root!).find(node => node.typeName === type && (name === undefined || node.props.name === name || node.props.label === name));
    assert.ok(node, `Missing ${type} ${name ?? ""}`);
    return node;
  }
  try {
    assert.equal(model.valid, true, model.diagnostics.join("; "));
    model.setField(find("NumberInput", "people"), 5);
    model.setField(find("NumberInput", "hours"), 4);
    model.setField(find("Slider", "rate"), 80);
    assert.deepEqual(find("Table").props.rows, [["Person-hours", 20], ["Estimated cost (USD)", 1600]]);
    assert.equal(model.activate(find("Button", "Reset estimate")).status, "updated");
    assert.deepEqual(model.formValues, { people: 2, hours: 3, rate: 50 });
    assert.deepEqual(find("Table").props.rows, [["Person-hours", 6], ["Estimated cost (USD)", 300]]);
    model.setField(find("NumberInput", "people"), 3);
    const result = model.activate(find("Button", "Use this estimate"));
    assert.equal(result.status, "submitted");
    if (result.status === "submitted") {
      assert.deepEqual(result.values, { people: 3, hours: 3, rate: 50 });
      assert.deepEqual(result.context, { people: 3, hours: 3, rate: 50, total: 450 });
    }
  } finally { model.dispose(); }
});

test("the skill's local component reference resolves inside the shipped documentation", () => {
  const source = readFileSync(skillPath, "utf8");
  const links = [...source.matchAll(/\]\((\.\.?\/[^)#]+)(?:#[^)]*)?\)/g)].map(match => match[1]);
  assert.ok(links.length > 0);
  for (const link of links) {
    const target = resolve(dirname(skillPath), link);
    assert.ok(target.startsWith(resolve(root, "docs") + "/"));
    assert.ok(readFileSync(target, "utf8").length > 0);
  }
});
