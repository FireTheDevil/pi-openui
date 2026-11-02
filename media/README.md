# Interactive responses in Pi

`openui-demo.mp4` is an 83-second recording of six actual Pi sessions. The 15-second `openui-demo-preview.gif` samples every scene, including the planner’s choices and Pi’s follow-up. The examples mix coding explanations with everyday decisions, using 22 of the extension’s 25 components.

| Start | Example source | What interaction changes |
| --- | --- | --- |
| 0:00 | [Code explorer](code-explorer.openui) | Selecting a function changes the explanation and syntax-highlighted code. |
| 0:16 | [Failure triage](failure-triage.openui) | Filter recorded test results, inspect a failure, and reveal a candidate fix. |
| 0:27 | [Laptop comparison](laptop-comparison.openui) | Changing the priority moves the recommendation and explains the trade-off. |
| 0:38 | [Heating bill](heating-bill.openui) | Change usage, see the cost and budget impact, then Hide and Restore with edits retained. |
| 0:55 | [Request walkthrough](request-path.openui) | Step through authentication, simulate a cache hit, and inspect the database path. |
| 1:10 | [Weekend planner](weekend-planner.openui) | Choose a date, enter a name and select activities; submit them for Pi’s tailored follow-up. |

The [scene manifest](showcase.json) records each user prompt, document, title and interaction mode. To try an example, ask Pi to read its `.openui` file and call `show_ui` with the file’s contents as `source` and the manifest’s `interaction`. Five scenes use `local`; the planner uses `collect`. These are fixed examples; during ordinary use the model can generate a document for the current task.

## What the recording verifies

The documents were authored by the coding model and replayed through a deterministic local provider calling the real `show_ui` tool. All terminal rendering, keyboard/mouse input, local state evaluation and tool results are real. No external LLM request was made; this demonstrates rendering and interaction rather than evaluating a live model’s interface choices. The video keeps a replay label visible throughout.

Each scene makes exactly one `show_ui` call. Local interactions, expansion, Hide and Restore make no further tool/provider calls. The planner remains pending while fields are edited, then returns typed values: date `2026-11-08`, host `Mira`, activities `walk` and `picnic`, and indoor backup `true`. The deterministic provider builds its next response from that actual result, including the selected activities and backup choice.

All six documents passed parsing, rendering and keyboard checks. The five local documents passed local-action validation and did not submit during local changes. Separate actual Pi CLI captures verified their visible outcomes and the planner’s submission. This media update changes no production code; it does not repeat the earlier code/notebook compatibility or clean-install matrices.

## Example data and scope

The laptops, prices, code and test results are illustrative. Filtering does not rerun tests, and the planner does not book anything. The heating calculation models one 1 kW heater at $0.20/kWh, excluding other appliances and fees; the lower-use setting explicitly assumes 25% savings. Dates are fixed to the recording’s example weekend.

The request diagram uses terminal text in `CodeBlock`. It does not demonstrate a map, graphical chart or Mermaid renderer. Components shown: Badge, Button, Card, CodeBlock, DatePicker, Divider, Input, List, Markdown, MultiSelect, NumberInput, Progress, Row, Section, Select, Slider, Stack, Steps, Table, Text, Toggle and Tree.

## Recording environment

Recorded on 2026-11-03 (Pacific/Auckland), using Pi 1.4.0, Node 24.19.0, Linux, the dark theme and a 120-column × 44-row fullscreen host. The development preview combines [PR #9](https://github.com/FireTheDevil/pi-openui/pull/9), the single widget header in [PR #10](https://github.com/FireTheDevil/pi-openui/pull/10), and Hide/Restore from [PR #12](https://github.com/FireTheDevil/pi-openui/pull/12). Source files stayed unchanged throughout capture. Sessions ran in isolated temporary directories; normal user configuration was unchanged.

Captured PTY output was replayed through xterm and encoded with FFmpeg. Chapter captions and click indicators annotate the actual input; browser tooling is used only to produce the recording, not by the extension. The MP4 uses H.264, `yuv420p`, 12 fps and fast-start metadata at 1090 × 888 pixels (1.18 MB). The GIF is 860 × 701 pixels (0.79 MB). Media and recording tooling add no extension runtime dependencies; the npm `files` allowlist excludes this entire `media/` directory. README media links use immutable GitHub URLs.
