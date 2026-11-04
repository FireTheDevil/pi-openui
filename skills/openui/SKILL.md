---
name: openui
description: "Present explanations, comparisons, and exploratory responses with OpenUI widgets when they materially help the user understand, explore, compare, or act on information. Use proactively without an explicit visualization request. Choose static displays, nonblocking local exploration, or answer-collecting forms with show_ui and OpenUI Lang in Pi."
---

# OpenUI in Pi

Use components proactively when they materially improve understanding, exploration, comparison, or action, even without a visualization request. Do not ask permission merely to display a useful component. Respect requests for plain text and all approvals for external actions.

Prefer prose for simple answers, reasoning, progress updates, and ordinary one-step edits. A small comparison may need only a Markdown table. Explain essential conclusions in natural language, not behind disclosures or required interaction. Use the simplest useful representation, without decorative controls or acknowledgement forms.

The active `openui` prompt supplies schemas and language rules. Use only this terminal catalog, not React, HTML, or web components. Charts, maps, Mermaid, and interactive diagrams are unsupported. Use accurate prose, a supported representation, or another appropriate tool instead. Use artifact tools for shareable exports.

## Choose the interaction contract

| User need | Arguments | Result |
| --- | --- | --- |
| Read information without controls | Display-only source; default interaction | `displayed`, no answer |
| Explore, calculate, navigate, or expand without answering | `interaction: "local"`; `presentation: "auto"` or `"inline"` | Immediate `mounted` plus `widgetId`, no values |
| Supply an answer needed for subsequent work | `interaction: "collect"` or default interaction, with controls and a final submit action | Waits for `submitted` or `cancelled` |

Removing Submit does not make a default form nonblocking. Choose local for optional exploration. Use collect only for answers you need, not acknowledgements before routine work.

Use auto or inline normally. Choose fullscreen for explicit expanded inspection or dense collect-mode work. Local mode rejects fullscreen. Its F2/header expansion stays within the transcript and keeps chat available.

## Read the reference for your task

Read the matching reference before composing an unfamiliar pattern. Each provides complete source, tool arguments, expected outcomes, and limits.

- [Display and explanation](references/display-and-explanation.md). Read for static comparisons or optional Accordion/Callout detail that sends no answer.
- [Local exploration](references/local-exploration.md). Read for reactive calculators, Reset, and persistent widget behavior.
- [Answer collection](references/answer-collection.md). Read for a single decision, related typed settings, or exploration followed by explicit submission.
- [Editable records](references/editable-records.md). Read before using EditableTable for typed record edits.

Look up exact signatures, settings, bounds, and keyboard controls in the [component reference](../../docs/components.md). Read the [tool API and execution guide](../../docs/tool-api.md) for actions, streaming, native code mode, and adapter invocation. Read [presentation and cancellation](../../docs/inline-ui.md) for focus and execution-mode behavior, [local interaction](../../docs/local-interaction.md) for widget controls and lifecycle, and [submission receipts](../../docs/submission-summaries.md) for summary options.

## Choose components by task

| Need | Components |
| --- | --- |
| Compare records without editing | Table; Select alongside it if collecting a choice |
| Present distinct related items | Card, optionally in Row |
| Choose one or several alternatives | Select or MultiSelect; Tree for a hierarchy |
| Enter text, a date, or an exact number | Input, TextArea, DatePicker, NumberInput |
| Explore a bounded amount or a setting | Slider or Toggle, with visible dependent values |
| Confirm a necessary agreement | Checkbox; require it only for a task-specific reason |
| Reveal optional detail or related perspectives | Accordion or Tabs |
| Show stages | Steps; implement Next/Back explicitly and enforce required ordering yourself |
| Edit bounded typed records | EditableTable, not Table |
| Explain content or code | Text, Markdown, CodeBlock, List; Callout for a semantic notice |
| Show actual known status or progress | Badge or Progress, never invented progress |
| Group content | Stack root; Section, Row, Card, or a sparing Divider |
| Update state or send an answer | Button with a supported action |

## Ground and compose

Gather missing facts with available tools before composing. Reuse known preferences and answers. Never invent prices, availability, measurements, or completed actions. Preserve units and time ranges. Mark illustrative data and assumptions.

Put purpose, essential controls, and visible consequences before the final action. Ask only for missing decisions, use sensible defaults, and leave optional fields optional. Keep labels short and layouts useful in narrow terminals. Do not convey meaning only through color.

Every control needs a meaningful effect. Bind calculations to state so Text, Table, or Progress updates locally without another model call. Offer Reset when experimentation helps. A local header already shows `summary.title`, so start its body with context or controls, not the same heading.

## Build valid source

Pass a complete OpenUI Lang document as `source`, without Markdown fences.

1. Use `root = Stack([...]);`. Put each `$variable` declaration and named assignment on a separate line. Do not join declarations with semicolons on one line. Declare every Set/Reset target before `root`.
2. Bind correctly typed values. Use strings for text, dates, single selections, Tabs, Steps, and Tree; booleans for Checkbox, Toggle, and Accordion; numbers for NumberInput and Slider; string arrays for MultiSelect; plain typed record arrays for EditableTable.
3. Give every field a unique name, including navigation, disclosures, and editable tables. Keep option, page, and tree values unique. Names are data keys, not labels.
4. Use common `description`, `required`, `disabled`, and `error` settings only when needed. Required booleans must be true. Disabled fields retain submitted values; disabled groups disable descendants. Hidden children still validate and submit. Keep the final collect button outside multipage groups.
5. Match every EditableTable row exactly to its unique typed column keys. Valid edits apply locally immediately. Invalid numeric text stays visible, preserves the last valid typed value, and blocks collection only, not navigation or other controls. Do not add Save/Discard buttons, helper components, or a separate catalog profile. Edits are neither answers nor external writes.

Local widgets mount only after complete validation. Collect streaming previews are read-only until the final document validates. Avoid concurrent collecting forms and short execution deadlines.

## Keep actions and outcomes safe

`@Set($variable, expression)` and `@Reset($variable, ...)` update declared state without closing. `Action([...])` runs up to 32 supported steps in order; each sees prior changes, and a structurally invalid result rolls the plan back.

Collect-mode `@ToAssistant(message, context?)` submits typed values and closes. It must be last in a plan. Legacy string actions also submit. Local mode forbids all submission paths, including hidden or conditional ones, and allows only Set/Reset plans. Query, Mutation, `@Run`, `@OpenUrl`, fetching fresh data, scripts, and external tool execution are unsupported local actions.

Check the result before using answers:

- `mounted` finishes the call. Continue independently authorized work without polling or waiting for a later UI result. Defaults, edits, focus changes, expansion, Hide/Restore, and dismissal supply no answer or approval.
- `displayed` shows content without collecting input. Continue only independently authorized work.
- `submitted` supplies actual `values` and optional action `context`. Do not reconstruct answers from defaults or the receipt.
- `cancelled` supplies no answers. Skip answer-dependent work, do not substitute defaults, and do not reopen automatically. The caller and notebook resume normally without a restart.
- `error` supplies diagnostics. Correct the specific fault instead of resending unchanged source. If needed, explain the issue and fall back to conversation.

Submission is input, not blanket external-action approval or evidence that files changed or a deployment ran. Respect the task's existing authority. The receipt already acknowledges input; do not repeat its whole table, dump JSON, or generate another acknowledgement widget.

Use a neutral `summary.title`. Select important field names in `summary.fields`, not labels or `$variables`; omit navigation and incidental state. Unknown names are ignored. Receipt selection changes presentation only, not submitted data. For local widgets, only the title labels the header; fields do not export edits.

Local state survives ordinary turns but is not a durable answer. Replay restores original defaults, visible and compact, not edits or hidden/expanded state. Dismissal, navigation, shutdown, and compaction can dispose widgets. Hidden widgets retain live state and still count toward the 16-widget limit. Use a separate collect form for a durable choice.

Await `show_ui` in code/notebook tools and emit the result or needed typed fields so the model receives them. Follow the adapter's advertised enclosing API rather than assuming its name. Keep `show_ui` callable and `read` or `bash` available for skill discovery. A pending collect call remains pending across execution yields; elapsed yield time is not an answer or a reason to launch a replacement UI.
