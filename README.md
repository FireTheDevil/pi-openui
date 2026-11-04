# Pi OpenUI

Render OpenUI Lang as native terminal UI in Pi. Use interactive comparisons, explanations, local calculators, or forms that return typed answers to the agent. No React, browser, webview, or separate terminal loop.

## Project status

This is an experimental, best-effort personal project. Issues and pull requests are welcome. Responses, acceptance, and timelines are not guaranteed.

The implementation has been generated with AI assistance so far. Automated checks and local testing do not guarantee correctness. Review it for your use case.

The package declares Pi 1.4+ peers. That range permits installation, not verified compatibility with every later version. The 0.8.0 automated and native checks used Pi 1.4.0 development dependencies. Earlier deterministic-provider CLI checks cover specific Pi 1.4.0 and 1.5.0 paths; they are not a fresh 0.8.0 compatibility matrix or real-model evaluation. See the [validation history](docs/validation-history.md) for exact scope and limitations.

See the [0.8.0 release notes](docs/release-notes.md#080) for additions, intentional breaking changes, and migration guidance. The [versioning policy](docs/versioning.md) describes future releases.

## Install

Requires Node.js 22.19+ and Pi with the `@earendil-works` package namespace. Recorded development checks use Node 24. Pi supplies its own TUI at runtime; OpenUI uses `@openuidev/lang-core` 1.0.2.

Install the extension and bundled skill from GitHub:

```sh
pi install git:github.com/FireTheDevil/pi-openui
```

Restart Pi or run `/reload`, then try `/openui-demo --local`.

To install a branch or tag, replace `BRANCH_OR_TAG` with its name:

```sh
pi install git:github.com/FireTheDevil/pi-openui@BRANCH_OR_TAG
```

### npm (not yet published)

The npm package `@firethedevil/pi-openui` is not yet published. Use the GitHub installation above.

## See it in Pi

[![Six interactive Pi responses with code, failures, comparisons, scenarios, walkthroughs, and planning](https://raw.githubusercontent.com/FireTheDevil/pi-openui/6041f69177f5f8c68dbb43616d8dc27c05fa09e9/media/openui-demo-preview.gif)](https://raw.githubusercontent.com/FireTheDevil/pi-openui/6041f69177f5f8c68dbb43616d8dc27c05fa09e9/media/openui-demo.mp4)

[Download the full video (MP4, 83 seconds)](https://raw.githubusercontent.com/FireTheDevil/pi-openui/6041f69177f5f8c68dbb43616d8dc27c05fa09e9/media/openui-demo.mp4) · [Six example sources and recording notes](https://github.com/FireTheDevil/pi-openui/blob/6041f69177f5f8c68dbb43616d8dc27c05fa09e9/media/README.md)

Explore code and failure diagnoses, compare laptop trade-offs, simulate heating costs, step through a request, then submit a weekend plan that shapes Pi's next response. This historical recording combines 22 components across six scenes, not the full current 28-component catalog. The heating explorer shows Hide and Restore with edits intact.

Recorded in actual Pi using model-authored OpenUI documents and deterministic provider replay, without external LLM calls. Example data is illustrative. The 15-second preview samples every scene.

## Get started

Try these commands in an interactive Pi session:

| Command | What to try |
| --- | --- |
| `/openui-demo --local` | Adjust hosting costs locally while keeping chat available |
| `/openui-demo --local-tabs` | Browse a tabbed explanation without sending an answer |
| `/openui-demo` | Choose a next step, enter instructions, and activate **Send to Pi** |
| `/openui-demo --actions` | Increment, apply an ordered plan, reset, then submit |
| `/openui-demo --catalog` | Explore all 28 components across Forms, Layout, Display, and Advanced pages |

Collecting demos accept `--stream` for a read-only preview until complete, or `--fullscreen` to start expanded. Local demos accept neither flag. F2 expands or collapses the focused form or local widget without losing edits. Pi's `--tui-mode fullscreen` enables mouse routing; regular host mode supports keyboard interaction.

The bundled [openui skill](skills/openui/SKILL.md) guides the model to use UI proactively when it helps you understand, compare, explore, or supply an answer. Try asking, "Let me vary a worker count from 1 to 20 at $15 per worker and see the monthly total while we keep chatting." Tables, typed controls, Tabs, Tree, and Accordion support these tasks. Charts, maps, Mermaid, and browser interactions are not supported.

Pi loads the skill on demand. Use `/skill:openui` to load it explicitly. Keep `read` or `bash` callable for skill discovery with restricted tool lists. Model choice and document quality vary; see [model evaluation](docs/model-evaluation.md).

### Local exploration or an answer for the agent

| Need | `show_ui` contract | Result |
| --- | --- | --- |
| Read static information | Display-only source with default interaction | `displayed`; persistent transcript content |
| Explore without answering | `interaction: "local"` with auto or inline presentation | `mounted` with a widget ID; chat stays available |
| Give the agent an answer | Default interaction or `interaction: "collect"` | Waits for `submitted` or `cancelled` |

Removing Submit does not make a default form nonblocking. Local widgets allow Set and Reset, not submission or external actions. Edits, Hide, Restore, blur, and dismissal send no values to the model. Live edits survive ordinary turns, but session replay restores original defaults, visible and compact. Use F6 to move between chat and a widget. See [local interaction](docs/local-interaction.md) for focus, commands, and lifecycle.

In collect mode, Escape or Ctrl+C returns an ordinary `cancelled` result without stopping the caller or notebook. A submitted receipt confirms input was received, not that external work was performed. See [presentation and cancellation](docs/inline-ui.md) and [submission receipts](docs/submission-summaries.md).

## Component catalog

The current catalog has 28 components. [Component signatures, settings, limits, and keys](docs/components.md) are the reference.

| Family | Components |
| --- | --- |
| Fields | Input, Select, Checkbox, MultiSelect, TextArea, NumberInput, Toggle, Slider, DatePicker, Tree, EditableTable |
| Layout and navigation | Stack, Row, Section, Card, Tabs, Steps, Accordion |
| Display | Text, Markdown, CodeBlock, List, Badge, Progress, Table, Divider, Callout |
| Actions | Button |

Values remain strings, booleans, numbers, string arrays, or arrays of typed plain records through editing and submission. EditableTable applies valid edits locally immediately. Invalid numeric text stays visible and blocks collection without locking other controls or pages. There are no Save or Discard controls.

The catalog lives in `src/catalog.ts`. To regenerate its names and count from a source checkout after installing dependencies:

```sh
node --import tsx --input-type=module -e 'import { componentSpecs } from "./src/catalog.ts"; const names = Object.keys(componentSpecs); console.log(names.length, names.join(", "));'
```

## Documentation

- [Tool API, actions, streaming, and native code mode](docs/tool-api.md).
- [Component reference](docs/components.md) and [catalog screenshots](docs/catalog-demo.md).
- [Local widgets](docs/local-interaction.md) and [inline presentation and cancellation](docs/inline-ui.md).
- [Submission receipts](docs/submission-summaries.md), [action demo](docs/action-demo.md), and [themes](docs/themes.md).
- [Model guidance and evaluation](docs/model-evaluation.md). The upstream-generated action prompt still advertises unsupported actions and actionless buttons, tracked in [issue #15](https://github.com/FireTheDevil/pi-openui/issues/15).
- [Architecture decisions](docs/adr/README.md), [release notes](docs/release-notes.md), [versioning](docs/versioning.md), and [validation history](docs/validation-history.md).

### Run from source

See [source setup and loading](docs/development.md#run-from-source).

### Agent tool

See [`show_ui` arguments, examples, and results](docs/tool-api.md#tool-arguments-and-results).

### Native code mode

See [native code mode and the optional conversion adapter](docs/tool-api.md#native-code-mode).

### Button actions

See [supported actions, ordered plans, and rollback](docs/tool-api.md#button-actions).

### Appearance

See [themes and responsive layout](docs/tool-api.md#appearance).

### Interaction and streaming

See [validation and streaming](docs/tool-api.md#validation-and-streaming) and [keyboard and mouse controls](docs/components.md#keyboard-and-mouse).

### Submission summaries

See [receipt configuration, rendering, and verification](docs/submission-summaries.md).

### Model guidance

See [generated prompts, skill loading, and current limitations](docs/tool-api.md#model-guidance).

## Development

See the [development guide](docs/development.md) for source setup, checks, and integration verification.

## Contributing

[Issues](https://github.com/FireTheDevil/pi-openui/issues) and pull requests are welcome. Search existing issues first. For substantive code changes, API changes, or features, open an issue to discuss the problem and approach before writing a PR. Small typo and documentation fixes can go directly to a PR.

Read [CONTRIBUTING.md](CONTRIBUTING.md) for report formats, setup, checks, privacy, and contribution scope. The project uses the [MIT license](LICENSE).
