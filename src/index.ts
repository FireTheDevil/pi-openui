import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Text, matchesKey } from "@earendil-works/pi-tui";
import { ACTIONS_DEMO_SOURCE, CATALOG_DEMO_SOURCE, DEMO_SOURCE } from "./demo.js";
import { DocumentModel, limits, modelPrompt } from "./model.js";
import { OpenUIView, type UIResult } from "./view.js";
import { createReceipt, isReceipt, isSummaryOutcome, renderReceipt, renderOpenUICall, type Receipt, type SummaryOptions } from "./summary.js";
import { registerCodeSummaries } from "./code-summary.js";
import { createInlineDocument, hasInteractiveContent, isInlineDocument, renderInlineDocument, type InlineDocument } from "./inline-document.js";
import { registerToolWithConversion } from "./conversion.js";

const MAX_SOURCE_LENGTH = limits.source;
type Outcome = UIResult | { status: "displayed" } | { status: "error"; error: string };
type ToolDetails = Outcome & { openuiReceipt: Receipt; openuiDocument?: InlineDocument };
type Presentation = "auto" | "inline" | "fullscreen";
type Surface = Exclude<Presentation, "auto">;
const SWITCH_SURFACE = Symbol("switchSurface");
const summarySchema = Type.Object({
  title: Type.Optional(Type.String({ maxLength: 160, description: "Neutral title for the submission receipt, such as Review configuration." })),
  fields: Type.Optional(Type.Array(Type.String({ pattern: "^[A-Za-z_][A-Za-z0-9_-]{0,63}$" }), {
    maxItems: 256, uniqueItems: true, description: "Ordered field names to show in the receipt. This only changes presentation; the full result is retained.",
  })),
}, { additionalProperties: false });
const outcomeSchema = Type.Union([
  Type.Object({
    status: Type.Literal("submitted"),
    action: Type.String(),
    message: Type.Optional(Type.String()),
    context: Type.Optional(Type.Unknown()),
    state: Type.Record(Type.String(), Type.Unknown()),
    values: Type.Record(Type.String(), Type.Union([Type.String(), Type.Boolean(), Type.Number(), Type.Array(Type.String())])),
  }),
  Type.Object({ status: Type.Literal("cancelled") }),
  Type.Object({ status: Type.Literal("displayed") }),
  Type.Object({ status: Type.Literal("error"), error: Type.String() }),
]);
interface Panel {
  id: string;
  model: DocumentModel;
  view?: OpenUIView;
  promise?: Promise<Outcome>;
  result?: Outcome;
  close?: (result: Outcome | typeof SWITCH_SURFACE) => void;
  removeAbortListeners: Array<() => void>;
  executing: boolean;
  timer?: ReturnType<typeof setInterval>;
  summary?: SummaryOptions;
  receipt?: Receipt;
  surface: Surface;
  userChangedSurface?: boolean;
  document?: InlineDocument;
  displayOnly?: boolean;
}

/** No host TUI is constructed here: Pi owns the terminal, focus and redraw loop. */
export default function openuiExtension(pi: ExtensionAPI): void {
  const panels = new Map<string, Panel>();
  let visible: Panel | undefined;
  const codeSummaries = registerCodeSummaries(pi);

  pi.registerMessageRenderer<ToolDetails>("openui-action", (message, options, theme) => {
    if (!isSummaryOutcome(message.details)) return;
    const { openuiReceipt, ...outcome } = message.details;
    return renderReceipt(isReceipt(openuiReceipt) ? openuiReceipt : createReceipt(outcome), theme, { expanded: options.expanded, outcome });
  });
  pi.registerEntryRenderer<{ receipt: Receipt }>("openui-demo-receipt", (entry, options, theme) => {
    return isReceipt(entry.data?.receipt) ? renderReceipt(entry.data.receipt, theme, { expanded: options.expanded }) : undefined;
  });

  function create(id: string): Panel {
    const panel: Panel = { id, model: new DocumentModel(), removeAbortListeners: [], executing: false, surface: "inline" };
    panels.set(id, panel);
    return panel;
  }

  function finish(panel: Panel, result: Outcome): void {
    if (panel.result) return;
    panel.result = result;
    panel.receipt = createReceipt(result, panel.model, panel.summary);
    if (panel.timer) clearInterval(panel.timer);
    for (const remove of panel.removeAbortListeners.splice(0)) remove();
    if (visible === panel) visible = undefined;
    // Also cover a host failure or cancellation before custom() mounts the view.
    panel.view?.dispose();
    panel.close?.(result);
  }

  function bindAbort(panel: Panel, signal?: AbortSignal): void {
    if (!signal || panel.result) return;
    const abort = () => finish(panel, { status: "cancelled" });
    signal.addEventListener("abort", abort, { once: true });
    panel.removeAbortListeners.push(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) abort();
  }

  function release(panel: Panel): void {
    finish(panel, { status: "cancelled" });
    panel.model.dispose();
    panels.delete(panel.id);
  }

  function show(panel: Panel, ctx: ExtensionContext, title: string): void {
    if (panel.promise || panel.result) return;
    visible = panel;
    // Do not await custom() from message_update: the provider must keep streaming.
    panel.promise = (async () => {
      try {
        while (!panel.result) {
          const result = await ctx.ui.custom<Outcome | typeof SWITCH_SURFACE>((tui, theme, _keys, done) => {
            panel.close = done;
            panel.view ??= new OpenUIView(panel.model, {
              title, theme, surface: panel.surface, dismissOnEnter: panel.displayOnly,
              requestRender: () => tui.requestRender(),
              getHeight: () => panel.surface === "fullscreen" ? Math.max(1, tui.terminal.rows)
                : Math.max(3, Math.min(18, Math.floor(tui.terminal.rows / 2))),
              onToggleExpanded: () => {
                if (panel.displayOnly && panel.surface === "fullscreen") { finish(panel, { status: "displayed" }); return; }
                panel.userChangedSurface = true;
                panel.surface = panel.surface === "inline" ? "fullscreen" : "inline";
                panel.close?.(SWITCH_SURFACE);
              },
              onDone: result => finish(panel, result),
            });
            panel.view.setSurface(panel.surface);
            const view = panel.view;
            if (panel.result) done(panel.result);
            // Pi disposes each mounted component on close. Keep the underlying
            // view alive across surface switches to preserve drafts and focus.
            return {
              model: panel.model,
              get focused() { return view.focused; },
              set focused(value: boolean) { view.focused = value; },
              render: (width: number) => view.render(width),
              invalidate: () => view.invalidate(),
              handleInput: (data: string) => {
                if (panel.displayOnly && !panel.model.streaming && matchesKey(data, "enter")) finish(panel, { status: "displayed" });
                else view.handleInput(data);
              },
              handleMouse: view.handleMouse.bind(view),
              dispose() { if (panel.result) view.dispose(); },
            };
          }, panel.surface === "fullscreen" ? {
            overlay: true,
            overlayOptions: { width: "100%", maxHeight: "100%", anchor: "top-left", margin: 0 },
          } : undefined);
          if (result !== SWITCH_SURFACE) finish(panel, result);
        }
      } catch (error) { finish(panel, { status: "error", error: String(error) }); }
      return panel.result!;
    })();
    bindAbort(panel, ctx.signal);
  }

  function update(panel: Panel, source: string, streaming: boolean): void {
    if (panel.result) return;
    if (source.length > MAX_SOURCE_LENGTH) {
      finish(panel, { status: "error", error: `OpenUI source exceeds ${MAX_SOURCE_LENGTH} characters.` });
      return;
    }
    panel.model.update(source, streaming);
    panel.view?.refresh();
  }

  function response(result: Outcome, receipt = createReceipt(result), document?: InlineDocument) {
    const serialized = JSON.stringify(result);
    return {
      content: [{ type: "text" as const, text: serialized }],
      details: { ...result, openuiReceipt: receipt, ...(document ? { openuiDocument: document } : {}) },
      // Native codemode returns structuredContent when outputSchema is declared.
      // Normalize through JSON so scripts and direct model calls see the same data.
      structuredContent: JSON.parse(serialized),
      ...(result.status === "error" ? { isError: true } : {}),
    };
  }

  pi.on("before_agent_start", (event, ctx) => {
    if (ctx.mode === "tui" && pi.getActiveTools().includes("show_ui")) {
      event.systemPromptOptions.sections.openui = modelPrompt;
    } else {
      delete event.systemPromptOptions.sections.openui;
    }
  });

  pi.on("message_update", (event, ctx) => {
    if (ctx.mode !== "tui" || ctx.signal?.aborted) return;
    const delta = event.assistantMessageEvent;
    if (delta.type !== "toolcall_start" && delta.type !== "toolcall_delta" && delta.type !== "toolcall_end") return;
    const call = delta.type === "toolcall_end" ? delta.toolCall : delta.partial.content[delta.contentIndex];
    if (call?.type !== "toolCall" || call.name !== "show_ui" || typeof call.arguments.source !== "string") return;
    let panel = panels.get(call.id);
    // Only one custom UI owns keyboard focus. Other calls open sequentially on execute.
    if (!panel && (visible || panels.size >= 32)) return;
    panel ??= create(call.id);
    if (!panel.promise) panel.surface = call.arguments.presentation === "fullscreen" ? "fullscreen" : "inline";
    const summary = call.arguments.summary;
    if (summary && typeof summary === "object" && "title" in summary && typeof summary.title === "string") {
      panel.summary = { title: summary.title.slice(0, 160) };
    }
    update(panel, call.arguments.source, true);
    // Display-only content needs no focused dialog. Start a read-only preview
    // only after the parsed document contains controls.
    if (hasInteractiveContent(panel.model)) show(panel, ctx, "OpenUI");
  });

  registerToolWithConversion(pi, {
    name: "show_ui",
    label: "OpenUI",
    description: "Render OpenUI Lang inline in Pi's terminal conversation. Display-only documents return immediately; choices and forms wait inline for user input. Use presentation: fullscreen for explicit expanded inspection; F2 toggles interactive forms. Local Set/Reset actions update controls, ToAssistant submits current values. Escape or Ctrl+C closes the form and returns status: cancelled as a normal result. Requires interactive Pi TUI mode.",
    promptSnippet: "Render useful content inline, or collect structured input inline with optional fullscreen expansion.",
    promptGuidelines: [
      "Use the OpenUI component library in the openui prompt section. Submit a complete program in source, with root = Stack([...]).",
      "Use UI proactively when interaction helps; keep simple answers and requested plain-text comparisons in prose. When available, read the openui skill for interaction patterns and component selection. Ground displayed facts in context or tools and bind exploratory controls to visible local calculations.",
      "Optional summary.title and summary.fields choose the receipt title and field names; Pi handles theme and status. Continue from the actual submitted values, respect cancellation, and use error diagnostics to repair invalid documents. A submitted form means user input was received, not that the requested work was executed.",
      "Prefer presentation: auto (the default) or inline for ordinary content and forms. Display-only documents return status: displayed without acknowledgement; do not add a Continue button just to show content. Use fullscreen only when explicitly requested or expanded inspection helps. No chart or Mermaid renderer is provided by this catalog.",
      "In code/notebook execution, await the host's show_ui callable and inspect status (submitted, displayed, cancelled or error). Interactive forms wait for the user; avoid short timeouts and concurrent panels. Cancellation resolves normally and the caller continues; only use values when status is submitted, handle cancelled without treating defaults as user choices, and do not automatically reopen the form. Include relevant results in output when the agent needs them.",
    ],
    parameters: Type.Object({
      source: Type.String({ minLength: 1, maxLength: MAX_SOURCE_LENGTH, description: "Complete OpenUI Lang program, without Markdown fences." }),
      summary: Type.Optional(summarySchema),
      presentation: Type.Optional(Type.Union([Type.Literal("auto"), Type.Literal("inline"), Type.Literal("fullscreen")], {
        description: "Default auto renders ordinary content and forms inline. Fullscreen requests expanded inspection. Users can toggle interactive forms with F2.",
      })),
    }),
    outputSchema: outcomeSchema,
    executionMode: "sequential",
    renderCall: (args, theme, context) => renderOpenUICall(args?.source, args?.summary, theme, context.expanded),
    renderResult: (result, options, theme, context) => {
      if (options.isPartial) return new Text(theme.fg("muted", "Waiting for your response…"), 0, 0);
      const details = result.details as ToolDetails | undefined;
      if (details?.status === "displayed" && isInlineDocument(details.openuiDocument)) {
        return renderInlineDocument(details.openuiDocument, theme, { expanded: options.expanded });
      }
      if (isSummaryOutcome(details)) {
        const { openuiReceipt, openuiDocument: _document, ...outcome } = details;
        const receipt = isReceipt(openuiReceipt) && openuiReceipt.status === outcome.status ? openuiReceipt : createReceipt(outcome);
        return renderReceipt(receipt, theme, { expanded: options.expanded, outcome });
      }
      const message = result.content.filter(item => item.type === "text").map(item => item.text).join("\n");
      let outcome: Outcome;
      try {
        const parsed = JSON.parse(message);
        if (!isSummaryOutcome(parsed)) throw new Error("Unknown result");
        outcome = parsed;
      } catch {
        outcome = { status: "error", error: message || (context.isError ? "OpenUI could not run." : "No OpenUI result was returned.") };
      }
      return renderReceipt(createReceipt(outcome), theme, { expanded: options.expanded, outcome });
    },
    async execute(id, params, signal, _onUpdate, ctx) {
      const reply = (result: Outcome, receipt?: Receipt, document?: InlineDocument) => response(result, receipt ?? createReceipt(result, undefined, params.summary), document);
      if (ctx.mode !== "tui") return reply({ status: "error", error: "show_ui requires Pi interactive TUI mode; custom terminal components are unavailable in RPC, JSON and print modes." });
      if (signal?.aborted) {
        const old = panels.get(id);
        if (old) release(old);
        return reply({ status: "cancelled" });
      }
      const panel = panels.get(id) ?? create(id);
      panel.summary = params.summary;
      const requestedSurface = params.presentation === "fullscreen" ? "fullscreen" : "inline";
      // Optional JSON arguments can arrive after source has opened a preview.
      // Honor the completed request while preserving a user's explicit F2 choice.
      if (!panel.userChangedSurface && panel.surface !== requestedSurface) {
        panel.surface = requestedSurface;
        if (panel.promise) panel.close?.(SWITCH_SURFACE);
      }
      panel.executing = true;
      try {
        if (panel.result) return reply(panel.result, createReceipt(panel.result, panel.model, params.summary));
        if (visible && visible !== panel) return reply({ status: "error", error: "Another OpenUI panel is already open. Retry after it closes." });
        update(panel, params.source, false);
        if (panel.result) return reply(panel.result, panel.receipt);
        if (!panel.model.valid) {
          const result: Outcome = { status: "error", error: panel.model.diagnostics.join("\n") || "Invalid OpenUI document." };
          finish(panel, result);
          return reply(result, panel.receipt);
        }
        panel.displayOnly = !hasInteractiveContent(panel.model);
        if (panel.displayOnly) {
          panel.document = createInlineDocument(params.source, params.summary?.title);
          if (params.presentation !== "fullscreen") {
            finish(panel, { status: "displayed" });
            return reply(panel.result!, panel.receipt, panel.document);
          }
        }
        show(panel, ctx, params.summary?.title || "OpenUI");
        bindAbort(panel, signal);
        const result = panel.result ?? await panel.promise!;
        return reply(result, panel.receipt, result.status === "displayed" ? panel.document : undefined);
      } finally {
        release(panel);
      }
    },
  });

  pi.registerCommand("openui-demo", {
    description: "Try inline OpenUI; --fullscreen expands, --actions demonstrates buttons, --catalog shows all components, --stream previews parsing.",
    async handler(args, ctx) {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/openui-demo requires Pi interactive TUI mode.", "error");
        return;
      }
      const flags = args.trim() ? args.trim().split(/\s+/) : [];
      if (new Set(flags).size !== flags.length || flags.some(flag => !["--stream", "--actions", "--catalog", "--fullscreen"].includes(flag)) || (flags.includes("--actions") && flags.includes("--catalog"))) {
        ctx.ui.notify("Usage: /openui-demo [--actions | --catalog] [--stream] [--fullscreen]", "error");
        return;
      }
      if (visible) {
        ctx.ui.notify("An OpenUI panel is already open.", "warning");
        return;
      }
      const panel = create(`demo:${Date.now()}`);
      panel.surface = flags.includes("--fullscreen") ? "fullscreen" : "inline";
      panel.summary = { title: flags.includes("--catalog") ? "Component catalog" : flags.includes("--actions") ? "Action choices" : "Next step" };
      const streaming = flags.includes("--stream");
      const source = flags.includes("--catalog") ? CATALOG_DEMO_SOURCE : flags.includes("--actions") ? ACTIONS_DEMO_SOURCE : DEMO_SOURCE;
      try {
        update(panel, streaming ? "" : source, streaming);
        show(panel, ctx, flags.includes("--catalog") ? "OpenUI component catalog" : flags.includes("--actions") ? "OpenUI actions demo" : "OpenUI demo");
        if (streaming && !panel.result) {
          let offset = 0;
          panel.timer = setInterval(() => {
            offset = Math.min(source.length, offset + (flags.includes("--catalog") ? 120 : 24));
            const pending = offset < source.length;
            update(panel, source.slice(0, offset), pending);
            if (!pending && panel.timer) clearInterval(panel.timer);
          }, 35);
        }
        const result = panel.result ?? await panel.promise!;
        if (result.status === "submitted") {
          pi.sendMessage({
            customType: "openui-action", content: `OpenUI user action: ${JSON.stringify(result)}`, display: true,
            details: { ...result, openuiReceipt: panel.receipt ?? createReceipt(result, panel.model, panel.summary) },
          }, { triggerTurn: true, deliverAs: "followUp" });
        } else {
          pi.appendEntry("openui-demo-receipt", { receipt: panel.receipt ?? createReceipt(result, panel.model, panel.summary) });
        }
      } finally {
        release(panel);
      }
    },
  });

  // A schema-invalid, blocked or truncated tool call can end without execute().
  // Close its preview promptly so a retry in the same agent run can open normally.
  pi.on("tool_execution_end", (event, ctx) => {
    codeSummaries.onToolEnd(event, ctx);
    if (event.toolName !== "show_ui") return;
    const panel = panels.get(event.toolCallId);
    if (panel) release(panel);
  });
  // Includes interrupted generation and session replacement.
  pi.on("agent_end", () => {
    for (const panel of panels.values()) if (!panel.executing && !panel.id.startsWith("demo:")) release(panel);
  });
  pi.on("session_shutdown", () => {
    for (const panel of panels.values()) release(panel);
    codeSummaries.clear();
  });
  pi.on("session_start", (_event, ctx) => codeSummaries.rehydrate(ctx));
  pi.on("session_tree", (_event, ctx) => codeSummaries.rehydrate(ctx));
}
