import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { ACTIONS_DEMO_SOURCE, DEMO_SOURCE } from "./demo.js";
import { DocumentModel, limits, modelPrompt } from "./model.js";
import { OpenUIView, type UIResult } from "./view.js";

const MAX_SOURCE_LENGTH = limits.source;
type Outcome = UIResult | { status: "error"; error: string };
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
}

/** No host TUI is constructed here: Pi owns the terminal, focus and redraw loop. */
export default function openuiExtension(pi: ExtensionAPI): void {
  const panels = new Map<string, Panel>();
  let visible: Panel | undefined;

  function create(id: string): Panel {
    const panel: Panel = { id, model: new DocumentModel(), removeAbortListeners: [], executing: false };
    panels.set(id, panel);
    return panel;
  }

  function finish(panel: Panel, result: Outcome): void {
    if (panel.result) return;
    panel.result = result;
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
    panel.promise = ctx.ui.custom<UIResult>((tui, _theme, _keys, done) => {
      panel.close = done;
      panel.view = new OpenUIView(panel.model, {
        title,
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

  function response(result: Outcome) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
      details: result,
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
    update(panel, call.arguments.source, true);
    show(panel, ctx, "OpenUI");
  });

  pi.registerTool({
    name: "show_ui",
    label: "OpenUI",
    description: "Show an interactive native terminal UI from an OpenUI Lang document. Local Set/Reset button actions update the open panel; ToAssistant or a legacy action identifier submits current values. Returns submission or cancellation. Requires interactive Pi TUI mode.",
    promptSnippet: "Display an OpenUI Lang form or table in the terminal and wait for the user's action.",
    promptGuidelines: ["Use the OpenUI component library in the openui prompt section. Submit a complete program in source, with root = Stack([...])."],
    parameters: Type.Object({
      source: Type.String({ minLength: 1, maxLength: MAX_SOURCE_LENGTH, description: "Complete OpenUI Lang program, without Markdown fences." }),
    }),
    executionMode: "sequential",
    async execute(id, params, signal, _onUpdate, ctx) {
      if (ctx.mode !== "tui") return response({ status: "error", error: "show_ui requires Pi interactive TUI mode; custom terminal components are unavailable in RPC, JSON and print modes." });
      if (signal?.aborted) {
        const old = panels.get(id);
        if (old) release(old);
        return response({ status: "cancelled" });
      }
      const panel = panels.get(id) ?? create(id);
      panel.executing = true;
      try {
        if (panel.result) return response(panel.result);
        if (visible && visible !== panel) return response({ status: "error", error: "Another OpenUI panel is already open. Retry after it closes." });
        update(panel, params.source, false);
        if (panel.result) return response(panel.result);
        if (!panel.model.valid) {
          const result: Outcome = { status: "error", error: panel.model.diagnostics.join("\n") || "Invalid OpenUI document." };
          finish(panel, result);
          return response(result);
        }
        show(panel, ctx, "OpenUI");
        bindAbort(panel, signal);
        return response(panel.result ?? await panel.promise!);
      } finally {
        release(panel);
      }
    },
  });

  pi.registerCommand("openui-demo", {
    description: "Try OpenUI components; --actions demonstrates stateful buttons, --stream previews incremental parsing.",
    async handler(args, ctx) {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/openui-demo requires Pi interactive TUI mode.", "error");
        return;
      }
      const flags = args.trim() ? args.trim().split(/\s+/) : [];
      if (new Set(flags).size !== flags.length || flags.some(flag => flag !== "--stream" && flag !== "--actions")) {
        ctx.ui.notify("Usage: /openui-demo [--actions] [--stream]", "error");
        return;
      }
      if (visible) {
        ctx.ui.notify("An OpenUI panel is already open.", "warning");
        return;
      }
      const panel = create(`demo:${Date.now()}`);
      const streaming = flags.includes("--stream");
      const source = flags.includes("--actions") ? ACTIONS_DEMO_SOURCE : DEMO_SOURCE;
      try {
        update(panel, streaming ? "" : source, streaming);
        show(panel, ctx, flags.includes("--actions") ? "OpenUI actions demo" : "OpenUI demo");
        if (streaming && !panel.result) {
          let offset = 0;
          panel.timer = setInterval(() => {
            offset = Math.min(source.length, offset + 24);
            const pending = offset < source.length;
            update(panel, source.slice(0, offset), pending);
            if (!pending && panel.timer) clearInterval(panel.timer);
          }, 35);
        }
        const result = panel.result ?? await panel.promise!;
        if (result.status === "submitted") {
          pi.sendUserMessage(`OpenUI user action: ${JSON.stringify(result)}`, { deliverAs: "followUp" });
        } else if (result.status === "error") {
          ctx.ui.notify(result.error, "error");
        }
      } finally {
        release(panel);
      }
    },
  });

  // A schema-invalid, blocked or truncated tool call can end without execute().
  // Close its preview promptly so a retry in the same agent run can open normally.
  pi.on("tool_execution_end", (event) => {
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
  });
}
