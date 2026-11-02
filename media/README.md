# Terminal demonstration

`openui-demo.mp4` is a 34-second recording of actual Pi 1.4.0 terminal output on Node 24.19.0, using the dark theme. `openui-demo-preview.gif` is the shorter animated README preview. The video shows a trip-budget explorer, local recalculation, tabs, expansion, Hide, a normal chat turn and Restore with edited values intact.

The [OpenUI document](trip-budget.openui) was authored by the coding model and replayed through a deterministic local provider calling the actual `show_ui` tool. No external LLM request was made. Prices are illustrative NZD amounts, not live quotes. The recording therefore demonstrates rendering and interaction, rather than evaluating a live model's interface choices.

The development preview combines the expansion work in [PR #9](https://github.com/FireTheDevil/pi-openui/pull/9), the single widget header in [PR #10](https://github.com/FireTheDevil/pi-openui/pull/10), and Hide/Restore for [issue #11](https://github.com/FireTheDevil/pi-openui/issues/11). All source files were stable during capture. Exactly one `show_ui` call mounted the explorer; local changes, Hide and Restore made no additional model/tool calls or transmitted edited values. The separate chat message used the normal provider loop.

The recording tools rendered captured PTY output through xterm and encoded it with FFmpeg. Those tools are external to the extension. The MP4 uses H.264, `yuv420p`, 12 fps and fast-start metadata at 1170 × 874 pixels. The repository's existing npm `files` allowlist excludes this `media/` directory, so the video adds no package runtime dependencies or tarball weight. README links use immutable GitHub URLs so they also work outside the repository.

Recorded on 2026-11-03 (Pacific/Auckland).
