# Evaluating real model behavior

The production extension registers `show_ui` in Pi's normal tool registry and injects its lang-core prompt into normal agent turns. It has no provider-specific or fixture-only execution path. A tool-capable model can generate the `source`, open the native UI, receive typed results or validation diagnostics, and continue the task. Pi handles model authentication and network calls.

There are three cooperating layers:

| Layer | Responsibility |
| --- | --- |
| Active tool/schema guidance | Describe the callable, supported components, types, language rules and core interaction policy while `show_ui` is active in TUI mode |
| Bundled `openui` skill | Decide when interaction helps, choose a composition, ground the content, use state and actions, and select useful receipt fields |
| Runtime | Parse and validate documents, render native controls, evaluate local actions, preserve typed results and render receipts |

The behavioral goal is an interface chosen for the user's task: useful comparisons, decisions, scenario exploration and workflows. A valid document alone does not establish that a model chose a useful interface.

## Run with a configured provider

Use a provider and model already configured in your Pi installation. Replace `PROVIDER` and `MODEL` below with their configured names:

```sh
pi --provider PROVIDER --model MODEL --tui-mode fullscreen \
  -e ./src/index.ts --skill ./skills/openui/SKILL.md
```

For native code mode, add `--tools +codemode`. Keep `read` or `bash` callable so Pi can expose and load the skill. `/skill:openui` explicitly loads the detailed design guidance. Test ordinary automatic skill discovery as well as explicit loading.

## Manual acceptance cases

| User request | What to assess |
| --- | --- |
| “What does git stash pop do?” | A concise prose answer without opening a blocking panel |
| “Compare these plans and let me choose: Basic costs $10/month for 2 workers; Standard costs $20 for 5; Pro costs $40 for 12.” | Accurate supplied facts in a useful comparison, readable selection labels and a final choice action |
| “Each worker costs $15/month. Let me vary the worker count from 1 to 20 and see the total.” | A numeric control bound to a calculated total, immediate local updates, clear units and a final action |
| “Configure the test run. We already use TypeScript and pnpm. I need to choose unit/integration suites and a retry count.” | Ask only for suites and retries; return an array and number; avoid re-asking known setup details |
| “Compare those options in plain text; don't open a UI.” | Respect the requested medium |
| “Collect a service name and replica count through native code mode, then prepare a deployment command without running it.” | Await the panel, output needed typed values, prepare the command after submission and accurately describe what has happened |
| Cancel an open panel | Receive a cancellation result and continue appropriately without automatically reopening the panel |
| Supply malformed source in a direct test call | Return actionable diagnostics; a model repairing a document should change the reported defect rather than retrying unchanged |

For each run, record provider/model, whether the skill loaded, the chosen components, document diagnostics, actual interactions, returned types and continuation. Evaluate usefulness and correctness rather than matching exact wording. Check that the receipt reflects submitted choices and does not imply unperformed work.

## What has been verified

Automated tests cover parsing, state evaluation, native rendering, actions, typed results, skill loading, error handling and native code mode. The skill's complete documents are parsed by the shipped model; its scenario example is exercised through edits, recalculation, reset and submission.

Actual Pi CLI runs with a deterministic local provider verify the prompt/tool/session wiring and themed receipts. Those runs do not measure an external model's component choice, document-generation success or repair behavior. No external provider credentials were configured in the development workspace when this guidance was added, so these real-model acceptance cases have not been run there.
