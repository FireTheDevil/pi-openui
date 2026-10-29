import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("Pi's actual loader resolves TypeScript siblings and shares its native TUI", () => {
  // Plain Node, without tsx: Pi's jiti loader must resolve the .js imports to .ts.
  const script = `
    import assert from "node:assert/strict";
    import { mkdtemp, rm } from "node:fs/promises";
    import { tmpdir } from "node:os";
    import { join, resolve } from "node:path";
    import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";
    import { Input } from "@earendil-works/pi-tui";
    const emptyAgentDir = await mkdtemp(join(tmpdir(), "pi-openui-loader-"));
    try {
      const loaded = await discoverAndLoadExtensions([resolve("src/index.ts")], process.cwd(), emptyAgentDir);
      assert.deepEqual(loaded.errors, []);
      assert.equal(loaded.extensions.length, 1);
      const extension = loaded.extensions[0];
      assert.ok(extension.commands.has("openui-demo"));
      const tool = extension.tools.get("show_ui").definition;
      let view;
      const ctx = { mode: "tui", hasUI: true, ui: {
        custom(factory) {
          return new Promise(resolve => {
            view = factory({ terminal: { rows: 30 }, requestRender() {} }, {}, {}, resolve);
          });
        }
      }};
      const source = 'root = Stack([Input("note", "Note", ""), Button("Send", "send")]);';
      const pending = tool.execute("loader", { source }, undefined, undefined, ctx);
      assert.ok(view.controls[0].widget instanceof Input, "must use host Pi Input constructor");
      view.render(60);
      view.handleInput("hello");
      view.handleInput("\\t");
      view.handleInput("\\r");
      const result = await pending;
      assert.equal(result.details.status, "submitted");
      assert.equal(result.details.values.note, "hello");
    } finally {
      await rm(emptyAgentDir, { recursive: true, force: true });
    }
  `;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: new URL("..", import.meta.url), encoding: "utf8", timeout: 30_000,
  });
  assert.equal(child.status, 0, child.stderr || child.error?.message);
});
