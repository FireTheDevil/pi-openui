# Inline presentation and cancellation

`show_ui` uses inline presentation by default. Its behavior depends on the document:

| Document | Default behavior | Result |
| --- | --- | --- |
| Display components only, such as Text, Table, Markdown or CodeBlock | Render persistent content in the conversation without taking keyboard focus | `status: "displayed"` |
| Fields, Tabs/Steps navigation or buttons | Focus a compact native view in Pi's editor area while leaving conversation context visible | Typed `submitted` result after a final action |
| Explicit `presentation: "fullscreen"` | Open an expanded view for inspection or interaction | Submission for a form; Enter closes display-only content and leaves it inline |

`presentation: "auto"` and `"inline"` both prefer inline content. Choose fullscreen when the user asks to expand something or sustained inspection needs the space. The component catalog is unchanged: fullscreen does not add a chart, Mermaid or browser renderer.

For example, a table can be shown without an acknowledgement button:

```js
const result = await tools.show_ui({
  source: 'root = Stack([Text("Supplied test results", {bold: true}), Table(["Suite", "Passed"], [["Unit", 24], ["Integration", 8]])]);',
  presentation: "inline",
  summary: { title: "Test results" }
});
text(result); // {status: "displayed"}; no user decision was requested.
```

The example uses Pi's native code-mode invocation syntax. Direct tool calls pass the same arguments. The conversion adapter described below also exposes `tools.show_ui`; other adapters may expose a different invocation API.

## Actual Pi captures

These captures use Pi 1.4.0 with conversion Deno Notebook Mode and the dark theme. The inline choice keeps the preceding conversation and running-cell context visible. The focused selection is “Quick pass”; arrows change it, Tab moves to the submit button, and F2 expands the same view.

![Interactive inline choice in conversion Notebook Mode](screenshots/inline-notebook-form.png)

F2 opens the same form fullscreen. Collapse returns to the inline layout without submitting or resetting the selection.

![The same form expanded with F2](screenshots/inline-expanded-form.png)

This display-only table returned `displayed` without waiting for acknowledgement. The capture was taken after closing and reopening the actual Pi session: the rendered table persisted, and the prompt is ready for input. “Release status” and the sentinel tool are fixed test content, not a report about an external release.

![Persistent display-only content after resuming the notebook session](screenshots/inline-notebook-display.png)

## Interaction and expansion

An inline form still takes keyboard focus and waits for input; it is not a background widget competing with the prompt editor. Tab, arrows and Enter work as usual. F2 expands the current interactive view or returns it inline, preserving values, draft text, focus and local state. Expansion does not submit the form or create a second tool call.

Pi's host mode and OpenUI presentation are separate choices. `pi --tui-mode fullscreen` enables the host's mouse routing for both inline and expanded OpenUI views. `pi --tui-mode regular` supports keyboard interaction and leaves mouse handling to the terminal. Resizing reflows content and adjusts the inline viewport; large forms scroll rather than covering the entire conversation by default.

After submission, the compact form is replaced by its themed receipt. The complete typed result remains available to the caller. Display-only content remains as rendered content rather than an invented submission receipt. Long inline displays have a compact preview; expand transcript details with Pi's usual shortcut (Ctrl+O by default) to see the complete document. F2 applies while an interactive or expanded inspection view is open. Native code-mode presentation metadata is stored separately from model-visible output, so scripts should still emit data the model needs.

## Cancellation

Escape or Ctrl+C means **stop the active run**, not merely close the view and return a normal choice. The extension requests Pi's abort before resolving the UI call. This lets the code/notebook runtime interrupt the waiting cell before it executes downstream operations.

The machine outcome records cancellation without submitted fields. Scripts must not interpret defaults as a choice, retry automatically, or catch cancellation in order to perform work that depended on the dismissed form. Do not schedule unrelated background work around an awaited UI call when that work depends on the answer. Cancellation cannot undo work already completed before the UI opened.

Closing a fullscreen display-only document with Enter is different: it returns `displayed` and leaves the content inline. Escape still cancels. F2 collapse of that display-only view also returns it to persistent inline content.

Tool/session aborts and shutdown release the view and listeners. A later user request can open a fresh UI. Cancelling `/openui-demo` does not submit a synthetic user action or start an extra model turn.

## Execution modes

Normal Pi invokes `show_ui` directly. Native Pi code mode invokes `await tools.show_ui(...)` and receives structured output in `on` and `only` configurations; keep the underlying tool callable. Code-only configuration changes tool exposure, not the native rendering path.

`@howaboua/pi-codex-conversion` 4.0.7 exposes `await tools.show_ui({...})` through the same bridge in its Code and Notebook runtimes. Because `show_ui` declares an output schema, the bridge returns structured output, including `status` and submitted typed fields. Its enclosing `exec` tool and persistent notebook lifecycle are separate from native Pi `codemode`. Use unique top-level bindings or reuse existing ones in a notebook; a second `const result` in the same kernel can be a redeclaration error.

OpenUI also registers the callable as blocking through the conversion package's public extension-tool protocol. This keeps the enclosing cell and its abort handler attached while user input is pending, even after the cell's yield budget expires. Cancelling the UI terminates that interaction rather than leaving its downstream work paused for a later `wait`. After submission, ordinary script execution and yielding can resume. Other tools retain the adapter's ordinary scheduling. This integration adds no conversion-package runtime dependency and does not patch its globals or runtime.

Configure the adapter through `/codex` and its General execution-mode setting. An isolated test agent directory can instead contain `pi-codex-conversion.json`:

```json
{
  "executionMode": "notebook",
  "scope": { "allProviders": "on" }
}
```

Use `"code"` for Code Mode. The directory is Pi's configured agent directory (`PI_CODING_AGENT_DIR` when explicitly set). Load the adapter and this extension in the same interactive Pi session. This file configures the conversion adapter; it does not select Pi's native `codemode`.

Both presentation choices are implemented at the shared `show_ui` boundary. Cancellation uses Pi's run-abort signal to reach the enclosing runtime. Conversion Code and Deno Notebook Mode allow a fresh call afterward. The alternative TypeScript/JavaScript notebook backends stop their kernel and require an explicit top-level notebook-tool request before another cell: `notebook({input: '{"action":"restart"}'})`. That restart restores the last durable checkpoint; it cannot be issued through `tools.notebook` inside the stopped cell. OpenUI does not silently reset or restart persistent notebook state. External effects that completed before cancellation are not rolled back.

For evaluation, run each mode with an observable operation immediately after the awaited UI. Verify that submission reaches it, cancellation does not, a malformed document returns diagnostics, and a subsequent independent request works. Distinguish a completed/cancelled cell display from proof that downstream code stopped. See the [model evaluation guide](model-evaluation.md) for generation-quality checks and the distinction between a deterministic test provider and an external model.

## Repeat the adapter checks

The conversion package is an optional integration, not an extension dependency. Its runtime tests use a separately installed 4.0.7 package and an isolated Pi agent directory:

```sh
OPENUI_PCC_PACKAGE=/absolute/path/to/pi-codex-conversion \
PI_CODING_AGENT_DIR=/absolute/path/to/isolated-pi-agent \
OPENUI_PCC_MODES=code,notebook,js,ts \
npm run test:compat
```

These checks execute the real conversion runtimes with a simulated terminal/session boundary. All four modes run by default; `OPENUI_PCC_MODES` can restrict the set. They exercise inline displays, local state changes and typed submission, cancellation before a downstream sentinel tool call or print, and recovery according to each backend's lifecycle. Actual CLI tests complement them by checking the full extension registration and terminal lifecycle. Neither kind of test measures external-model generation quality.

All 28 runtime compatibility tests passed with Pi 1.4.0, Node 24.19 and conversion 4.0.7: Code used Rust v0.163.0; Deno Notebook used Deno 2.9.8; JavaScript Notebook used quickjs-wasi 3.6.3; TypeScript Notebook used tsrs 0.20.0-ts7.1.0-beta. The suite includes cancellation after the requested yield budget expires and cancellation of a UI opened by `wait` on a previously yielded cell. Both paths probe the original cell afterward to ensure no deferred output or sentinel runs. The JavaScript/TypeScript recovery checks explicitly restart the stopped notebook through its top-level lifecycle tool before testing a new cell.

## Verified CLI paths

Six actual Pi 1.4.0 CLI runs passed with Node 24 and a deterministic local provider:

| Execution path | Pi host TUI | Theme | Result |
| --- | --- | --- | --- |
| Direct `show_ui` | Fullscreen | Light | Passed |
| Native code mode `on` | Fullscreen | Dark | Passed |
| Native code mode `only` | Fullscreen | Dark | Passed |
| Conversion Code Mode | Fullscreen | Light | Passed |
| Conversion Deno Notebook Mode | Fullscreen | Dark | Passed |
| Direct `show_ui` | Regular | Dark | Passed |

The conversion runs used `@howaboua/pi-codex-conversion` 4.0.7, its Rust runtime v0.163.0 and Deno 2.9.8. The adapter's alternative TypeScript/JavaScript notebook backends were not part of this CLI matrix.

Every run covered inline context, resize to 68×28, F2 expansion/collapse, typed submission, Escape cancellation before an unguarded downstream sentinel or model follow-up, a fresh request afterward, explicit fullscreen presentation, a nonblocking static display and malformed source. Fullscreen-host runs used actual terminal mouse input; the regular-host run used keyboard input. Conversion runtime tests additionally covered Ctrl+C cancellation.

Two additional CLI runs targeted late cancellation in conversion Code and Deno Notebook Mode: the cell requested a one-second yield budget, the UI stayed open for over three seconds, and Escape still terminated the parent execution. A fresh `wait` on the original cell ID could not resume the deferred sentinel. The transcript had no stale “Running show_ui” badge after termination, and later requests worked. A separate gallery run verified that display-only content survived closing and reopening the actual Pi session.

Pi may show its standard red “Error: This operation was aborted” message after cancellation. That records the interrupted execution; it is not a failed form validation or permission to continue the cell. The cancellation receipt does not contain invented choices.

The screenshots replay unmodified PTY output from these runs. Browser tooling is used only by the external screenshot harness, not by the extension. No external model provider was used; these runs prove runtime integration, not model-generated UI quality.
