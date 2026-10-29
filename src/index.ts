import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import { ACTIONS_DEMO_SOURCE, CATALOG_DEMO_SOURCE, DEMO_SOURCE } from "./demo.js";
import { DocumentModel, limits, modelPrompt } from "./model.js";
import { OpenUIView, type UIResult } from "./view.js";
import { createReceipt, isReceipt, isSummaryOutcome, renderReceipt, renderOpenUICall, type Receipt, type SummaryOptions } from "./summary.js";
import { registerCodeSummaries } from "./code-summary.js";

const MAX_SOURCE_LENGTH = limits.source;
type Outcome = UIResult | { status: "error"; error: string };
type ToolDetails = Outcome & { openuiReceipt: Receipt };
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
  Type.Object({ status: Type.Literal("error"), error: Type.String() }),
]);
interface Panel {
  id: string;
  model: DocumentModel;
  view?: OpenUIView;
  promise?: Promise<Outcome>;
  result?: Outcome;
  close?: (result: UIResult) => void;
  removeAbortListeners: Array<() => void>;
  executing: boolean;
  timer?: ReturnType<typeof setInterval>;
  summary?: SummaryOptions;
  receipt?: Receipt;
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
    const panel: Panel = { id, model: new DocumentModel(), removeAbortListeners: [], executing: false };
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
    panel.close?.(result.status === "error" ? { status: "cancelled" } : result);
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
    panel.promise = ctx.ui.custom<UIResult>((tui, theme, _keys, done) => {
      panel.close = done;
      panel.view = new OpenUIView(panel.model, {
        title,
        theme,
        requestRender: () => tui.requestRender(),
        getHeight: () => Math.max(1, tui.terminal.rows),
        fillHeight: true,
        onDone: (result) => finish(panel, result),
      });
      if (panel.result) done({ status: "cancelled" });
      return panel.view;
    }, {
      // A viewport-sized overlay gives render and mouse events the same origin,
      // even when Pi's editor dock would otherwise clip a tall custom component.
      overlay: true,
      overlayOptions: { width: "100%", maxHeight: "100%", anchor: "top-left", margin: 0 },
    }).then((result) => {
      finish(panel, result);
      return panel.result!;
    }, (error: unknown) => {
      finish(panel, { status: "error", error: String(error) });
      return panel.result!;
    });
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

  function response(result: Outcome, receipt = createReceipt(result)) {
    const serialized = JSON.stringify(result);
    return {
      content: [{ type: "text" as const, text: serialized }],
      details: { ...result, openuiReceipt: receipt },
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
    const summary = call.arguments.summary;
    if (summary && typeof summary === "object" && "title" in summary && typeof summary.title === "string") {
      panel.summary = { title: summary.title.slice(0, 160) };
    }
    update(panel, call.arguments.source, true);
    show(panel, ctx, "OpenUI");
  });

  pi.registerTool({
    name: "show_ui",
    label: "OpenUI",
    description: "Show an interactive native terminal UI from an OpenUI Lang document. Local Set/Reset button actions update the open panel; ToAssistant or a legacy action identifier submits current values. Returns submission or cancellation. Requires interactive Pi TUI mode.",
    promptSnippet: "Display an OpenUI Lang form or table in the terminal and wait for the user's action.",
    promptGuidelines: [
      "Use the OpenUI component library in the openui prompt section. Submit a complete program in source, with root = Stack([...]).",
      "When available, read the openui skill for component selection and form design. Prefer the smallest form that fits the task. Optional summary.title and summary.fields choose the receipt title and field names; Pi handles theme and status. A submitted form means user input was received, not that the requested work was executed.",
      "In native codemode, await tools.show_ui({ source }) and inspect result.status (submitted, cancelled or error). It waits for the user; do not set a short script timeout or open multiple panels concurrently. Include the result in script output if Pi needs to respond to it.",
    ],
    parameters: Type.Object({
      source: Type.String({ minLength: 1, maxLength: MAX_SOURCE_LENGTH, description: "Complete OpenUI Lang program, without Markdown fences." }),
      summary: Type.Optional(summarySchema),
    }),
    outputSchema: outcomeSchema,
    executionMode: "sequential",
    renderCall: (args, theme, context) => renderOpenUICall(args?.source, args?.summary, theme, context.expanded),
    renderResult: (result, options, theme, context) => {
      if (options.isPartial) return new Text(theme.fg("muted", "Waiting for your response…"), 0, 0);
      const details = result.details as ToolDetails | undefined;
      if (isSummaryOutcome(details)) {
        const { openuiReceipt, ...outcome } = details;
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
      const reply = (result: Outcome, receipt?: Receipt) => response(result, receipt ?? createReceipt(result, undefined, params.summary));
      if (ctx.mode !== "tui") return reply({ status: "error", error: "show_ui requires Pi interactive TUI mode; custom terminal components are unavailable in RPC, JSON and print modes." });
      if (signal?.aborted) {
        const old = panels.get(id);
        if (old) release(old);
        return reply({ status: "cancelled" });
      }
      const panel = panels.get(id) ?? create(id);
      panel.summary = params.summary;
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
        show(panel, ctx, params.summary?.title || "OpenUI");
        bindAbort(panel, signal);
        const result = panel.result ?? await panel.promise!;
        return reply(result, panel.receipt);
      } finally {
        release(panel);
      }
    },
  });

  pi.registerCommand("openui-demo", {
    description: "Try OpenUI components; --actions demonstrates buttons, --catalog shows the full library, --stream previews parsing.",
    async handler(args, ctx) {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/openui-demo requires Pi interactive TUI mode.", "error");
        return;
      }
      const flags = args.trim() ? args.trim().split(/\s+/) : [];
      if (new Set(flags).size !== flags.length || flags.some(flag => !["--stream", "--actions", "--catalog"].includes(flag)) || (flags.includes("--actions") && flags.includes("--catalog"))) {
        ctx.ui.notify("Usage: /openui-demo [--actions | --catalog] [--stream]", "error");
        return;
      }
      if (visible) {
        ctx.ui.notify("An OpenUI panel is already open.", "warning");
        return;
      }
      const panel = create(`demo:${Date.now()}`);
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
