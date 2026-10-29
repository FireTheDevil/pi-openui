import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { formatSkillsForPrompt, loadSkills } from "@earendil-works/pi-coding-agent";
import { DocumentModel } from "../src/model.js";

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
  assert.equal(examples.length, 2);
  for (const [index, example] of examples.entries()) {
    const model = new DocumentModel(example);
    try {
      assert.equal(model.valid, true, `Example ${index + 1}: ${model.diagnostics.join("; ")}`);
      if (index === 0) assert.deepEqual(model.formValues, { depth: "focused" });
      else {
        assert.deepEqual(model.formValues, { owner: "", checks: ["tests"], retries: 2, confirmed: false });
        assert.deepEqual(model.fieldErrors, { owner: "Required.", confirmed: "Must be checked." });
      }
    } finally { model.dispose(); }
  }
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
