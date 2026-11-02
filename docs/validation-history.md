# Validation history

Recorded release checks and their scope. These results do not guarantee behavior with every model or environment.

## v0.7.0 — local widgets

For v0.7.0, all 236 core tests and type checking passed. Local-widget tests cover immediate mounting, reactive calculations, keyboard/mouse focus, independent state, disposal and replay. All 32 optional runtime compatibility tests passed across conversion Code/Deno/JavaScript/TypeScript. Seven actual CLI configurations passed the local-widget scenario, including regular/fullscreen hosts, a light-theme session-resume check and Shift+F6 cycling. See the [local-widget validation matrix and actual notebook captures](local-interaction.md#verification). These checks use a deterministic provider, not external model generation.

## v0.6.1 — inline displays and answer collection

The v0.6.1 baseline passed all 199 core tests and type checking. Six actual Pi 1.4.0 CLI configurations on Node 24 also passed: direct tools in regular/fullscreen host modes, native code `on`/`only`, and conversion 4.0.7 Code/Deno Notebook Mode. Escape from inline forms and Ctrl+C from fullscreen forms returned normal cancellation results, allowed caller/model continuation and left later UI calls usable without a restart. Rendering checks covered inline context, resizing, F2 expansion/collapse, submission, static displays and malformed input. The [inline presentation guide](inline-ui.md#verified-cli-paths) gives the exact matrix and [cancellation screenshot](inline-ui.md#actual-pi-captures).

A separate session-reopen check verified persistent inline content. The current cancellation contract returns a normal result to the caller; it does not terminate the enclosing code or notebook execution.

The v0.6.1 baseline of 28 optional compatibility tests passed against the actual conversion Code, Deno, JavaScript and TypeScript runtimes with a simulated terminal/session boundary. Cancellation checks verified ordinary returned results and exactly-once caller continuation, including after a yield budget expires and during `wait` on a previously yielded cell. Deno, JavaScript and TypeScript notebook variables and closures remained usable in later cells without a restart. Run `npm run test:compat` with the external package and isolated agent-directory variables described in the [adapter test instructions](inline-ui.md#repeat-the-adapter-checks).

## Earlier catalog and receipt releases

Earlier catalog and receipt releases were also tested with all 25 components, keyboard/mouse editing, local actions, reset, streaming, typed results and cancellation in dark and light themes. All CLI runs used a local deterministic provider; external model providers have not been tested. The [catalog gallery](catalog-demo.md) captures actual PTY output; recording and screenshot tooling are excluded from the repository and package.
