import { createHash } from "node:crypto";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text, isKeyRelease, matchesKey, stripTerminalSequences, truncateToWidth, visibleWidth, type Component, type TUI, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { DocumentModel, limits } from "./model.js";
import { localDocumentDiagnostics } from "./local-policy.js";
import { presentation, safeText, type HostTheme } from "./presentation.js";
import { OpenUIView, type ViewOptions } from "./view.js";

export const OPENUI_LOCAL_ENTRY = "openui-local-widget";
export const OPENUI_LOCAL_CLOSE_ENTRY = "openui-local-close";
export const MAX_LOCAL_WIDGETS = 16;
type MountResult = { status: "mounted"; widgetId: string } | { status: "error"; error: string };
interface StoredWidget { version: 1; widgetId: string; source: string; title: string; }
// These methods are public on Pi 1.4's TuiMainScreen/TuiAltScreen. The common
// TUI interface omits the focus getter and viewport operations, so check them.
type HostTUI = TUI & {
  getFocusedComponent?(): Component | null;
  readonly viewportTop?: number;
  scrollBy?(lines: number): void;
};
interface Widget {
  data: StoredWidget;
  model: DocumentModel;
  view: OpenUIView;
  options: ViewOptions;
  component: Component & { focused: boolean };
  disposed: boolean;
  theme: HostTheme;
  closeHit?: { x: number; width: number };
  width?: number;
}
// Pi 1.4's matchesKey handles plain F6 but not modified function keys.
const cycleKey = (data: string) => data === "\x1b[17;2~" || /^\x1b\[57369;2(?::[12])?u$/.test(data);
const validId = (value: unknown): value is string => typeof value === "string" && /^openui-[a-f0-9]{12}$/.test(value);
function validData(value: unknown): value is StoredWidget {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as StoredWidget;
  return data.version === 1 && validId(data.widgetId) && typeof data.source === "string"
    && data.source.length > 0 && data.source.length <= limits.source
    && typeof data.title === "string" && data.title.length <= 160;
}

/** Session-owned interactive transcript rows. Only original documents persist;
 * edited values never become a tool result, model message or session entry. */
export function createLocalWidgets(pi: ExtensionAPI) {
  const widgets = new Map<string, Widget>();
  let context: ExtensionContext | undefined;
  let host: HostTUI | undefined;
  let editor: Component | null = null;
  let lastId: string | undefined;
  let unsubscribe: (() => void) | undefined;
  let disposed = false;

  const focused = () => host?.getFocusedComponent?.() ?? null;
  const owned = (component: Component | null) => [...widgets.values()].find(widget => widget.component === component);
  function captureEditor(): void {
    const current = focused() as (Component & { getText?: unknown; setText?: unknown }) | null;
    // Pi focuses selector/input/multiline-dialog wrappers, not their nested
    // editor. Only an actual EditorComponent exposes this public contract.
    // Refresh it so another extension may replace the composer at any time.
    if (current && !owned(current) && !host?.hasOverlay?.() && typeof current.getText === "function"
      && typeof current.setText === "function" && typeof current.handleInput === "function") editor = current;
  }
  const requestRender = () => host?.requestRender();
  const contextEntries = (ctx: ExtensionContext) => ctx.sessionManager.buildContextEntries?.() ?? ctx.sessionManager.getBranch();
  function removeHint(): void {
    // A disconnected/replaced host may no longer accept UI cleanup requests.
    try { context?.ui.setWidget("openui-local-focus", undefined); } catch { /* local resources are still disposed below */ }
  }
  function blur(): void {
    if (owned(focused()) && editor) host?.setFocus(editor);
    requestRender();
  }
  function refreshHost(): void {
    if (!context || !widgets.size) return;
    context.ui.setWidget("openui-local-focus", (tui, theme) => {
      host = tui as HostTUI;
      captureEditor();
      return {
        invalidate() {},
        render(width: number) {
          const active = owned(focused());
          const text = active ? `${active.data.widgetId} · local only · F6/Esc chat · Shift+F6 next · /openui-close`
            : `${widgets.size} local widget${widgets.size === 1 ? "" : "s"} · F6 interact · Shift+F6 next · /openui-focus [id]`;
          return widgets.size ? [truncateToWidth(theme.fg("dim", text), Math.max(0, width), "")] : [];
        },
      };
    }, { placement: "belowEditor" });
  }
  function canFocus(): boolean {
    return !!host?.getFocusedComponent && !!editor && !host.hasOverlay?.() && (focused() === editor || !!owned(focused()));
  }
  function reveal(widget: Widget): void {
    if (host?.mode !== "fullscreen" || typeof host.scrollBy !== "function" || typeof host.viewportTop !== "number") return;
    // Pi keeps its document in the public child tree even in fullscreen mode.
    // The fullscreen layout root's render() can omit its flex-sized transcript;
    // render the containing document child at its actual last rendered width.
    const prefix = `${widget.data.widgetId} · `;
    for (const child of host.children ?? []) {
      const lines = child.render(Math.max(1, widget.width ?? host.terminal.columns));
      const row = lines.findIndex(line => stripTerminalSequences(line).startsWith(prefix));
      if (row >= 0) { host.scrollBy(row - host.viewportTop); break; }
    }
  }
  function focus(widget: Widget, scroll = true): boolean {
    refreshHost();
    if (widget.disposed || !canFocus()) return false;
    lastId = widget.data.widgetId;
    host!.setFocus(widget.component);
    if (scroll) reveal(widget);
    requestRender();
    return true;
  }
  function toggle(next = false): void {
    refreshHost();
    if (!canFocus()) return;
    const current = owned(focused());
    if (current && !next) { blur(); return; }
    const all = [...widgets.values()];
    const index = all.findIndex(widget => widget.data.widgetId === (current?.data.widgetId ?? lastId));
    const target = next ? all[(index + 1) % all.length] : widgets.get(lastId ?? "") ?? all.at(-1);
    if (target) focus(target);
  }
  function attach(ctx: ExtensionContext): boolean {
    context = ctx;
    disposed = false;
    refreshHost();
    if (!host?.getFocusedComponent) return false;
    if (!unsubscribe) unsubscribe = ctx.ui.onTerminalInput(data => {
      if (disposed || !widgets.size || isKeyRelease(data)) return;
      if (matchesKey(data, "f6") || cycleKey(data)) {
        refreshHost();
        if (!canFocus()) return;
        toggle(cycleKey(data));
        return { consume: true };
      }
      return undefined;
    });
    return true;
  }
  function remove(id: string, persist: boolean): boolean {
    const widget = widgets.get(id);
    if (!widget) return false;
    if (focused() === widget.component) blur();
    widget.disposed = true;
    widget.view.dispose();
    widget.model.dispose();
    widgets.delete(id);
    if (lastId === id) lastId = [...widgets.keys()].at(-1);
    if (persist) pi.appendEntry(OPENUI_LOCAL_CLOSE_ENTRY, { version: 1, widgetId: id });
    if (!widgets.size) {
      unsubscribe?.(); unsubscribe = undefined;
      removeHint();
    }
    requestRender();
    return true;
  }
  function create(data: StoredWidget): Widget {
    const model = new DocumentModel(data.source);
    const options: ViewOptions = {
      interaction: "local", title: data.title, theme: {}, fillHeight: false, surface: "inline",
      getHeight: () => Math.max(5, Math.min(18, Math.floor((host?.terminal.rows ?? 30) / 2))),
      requestRender, onDone() {}, onBlur: blur,
    };
    const widget = { data, model, options, disposed: false, theme: {} } as Widget;
    widget.view = new OpenUIView(model, options);
    widget.view.focused = false;
    widget.component = {
      get focused() { return widget.view.focused; },
      set focused(value: boolean) { widget.view.focused = value; },
      invalidate() { if (!widget.disposed) widget.view.invalidate(); },
      render(width: number) {
        if (widget.disposed || width < 1) return [];
        widget.width = width;
        const style = presentation(() => widget.theme);
        const left = `${data.widgetId} · ${safeText(data.title)}`;
        const label = "[Close]";
        const gap = Math.max(1, width - visibleWidth(left) - label.length);
        const header = truncateToWidth(left, Math.max(0, width - label.length - 1), "") + " ".repeat(Math.min(gap, Math.max(0, width - label.length))) + label;
        widget.closeHit = { x: Math.max(0, visibleWidth(header) - label.length), width: label.length };
        return [truncateToWidth(style.fg(widget.view.focused ? "accent" : "muted", header), width, ""), ...widget.view.render(width)];
      },
      handleInput(data: string) {
        if (widget.disposed || focused() !== widget.component) return;
        if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c") || matchesKey(data, "f6")) { blur(); return; }
        if (cycleKey(data)) { toggle(true); return; }
        widget.view.handleInput(data);
      },
      handleMouse(event: TuiMouseEvent) {
        if (widget.disposed) return undefined;
        if (event.type === "press" || event.type === "click") {
          if (!focus(widget, false)) return undefined;
          if (event.button === "left" && event.type === "click" && event.y === 0 && widget.closeHit
            && event.x >= widget.closeHit.x && event.x < widget.closeHit.x + widget.closeHit.width) {
            remove(widget.data.widgetId, true);
            return { handled: true, render: true };
          }
        }
        if (event.y === 0) return { handled: true, render: false };
        const result = widget.view.handleMouse({ ...event, y: event.y - 1, height: Math.max(0, event.height - 1) });
        // The manager owns keyboard focus and restores the actual chat editor.
        return result ? { ...result, focus: false } : undefined;
      },
    };
    return widget;
  }
  pi.registerEntryRenderer<StoredWidget>(OPENUI_LOCAL_ENTRY, (entry, _options, theme) => {
    if (!validData(entry.data)) return undefined;
    const widget = widgets.get(entry.data.widgetId);
    if (!widget || widget.disposed || widget.data.source !== entry.data.source) return new Text(theme.fg("dim", "OpenUI local widget closed or unavailable."), 0, 0);
    widget.theme = theme;
    widget.options.theme = theme;
    return widget.component;
  });
  pi.registerCommand("openui-focus", {
    description: "Focus a local OpenUI widget by id, or the most recent widget. F6/Escape returns to chat.",
    async handler(args, ctx) {
      if (!widgets.size) { ctx.ui.notify("No local OpenUI widgets are open.", "info"); return; }
      attach(ctx);
      const widget = widgets.get(args.trim() || lastId || "");
      if (!widget) { ctx.ui.notify("Unknown OpenUI widget id.", "error"); return; }
      if (!focus(widget)) ctx.ui.notify("Return to the chat editor before focusing a local widget.", "info");
    },
  });
  pi.registerCommand("openui-close", {
    description: "Dismiss a local OpenUI widget without submitting values. Accepts a widget id; defaults to the last widget.",
    async handler(args, ctx) {
      const id = args.trim() || owned(focused())?.data.widgetId || lastId || "";
      if (!remove(id, true)) ctx.ui.notify("No matching local OpenUI widget is open.", "info");
    },
  });
  function clear(): void {
    disposed = true;
    blur();
    unsubscribe?.(); unsubscribe = undefined;
    for (const id of [...widgets.keys()]) remove(id, false);
    removeHint();
    context = undefined; host = undefined; editor = null; lastId = undefined;
  }
  return {
    mount(toolCallId: string, source: string, title: string | undefined, ctx: ExtensionContext): MountResult {
      if (typeof ctx.ui.setWidget !== "function" || typeof ctx.ui.onTerminalInput !== "function") {
        return { status: "error", error: "Local widgets require Pi's native interactive TUI widget and focus APIs." };
      }
      const diagnostics = localDocumentDiagnostics(source);
      if (diagnostics.length) return { status: "error", error: diagnostics.join("\n") };
      const widgetId = `openui-${createHash("sha256").update(toolCallId).digest("hex").slice(0, 12)}`;
      if (widgets.has(widgetId)) return widgets.get(widgetId)!.data.source === source
        ? { status: "mounted", widgetId }
        : { status: "error", error: "This tool call already owns a different local document. Use a new call to mount another widget." };
      if (widgets.size >= MAX_LOCAL_WIDGETS) return { status: "error", error: `At most ${MAX_LOCAL_WIDGETS} local widgets may remain open. Use /openui-close <id> before mounting another.` };
      const data: StoredWidget = { version: 1, widgetId, source, title: safeText(title || "Local explorer").replace(/\n/g, " ").slice(0, 160) };
      const widget = create(data);
      if (!widget.model.valid) {
        const error = widget.model.diagnostics.join("\n") || "Invalid local OpenUI document.";
        widget.view.dispose(); widget.model.dispose();
        return { status: "error", error };
      }
      widgets.set(widgetId, widget);
      lastId = widgetId;
      try {
        if (!attach(ctx)) throw new Error("Local widgets require Pi's native TUI focus API (Pi 1.4 or newer).");
        pi.appendEntry(OPENUI_LOCAL_ENTRY, data);
        requestRender();
      } catch (error) {
        remove(widgetId, false);
        return { status: "error", error: `Unable to mount local widget: ${error instanceof Error ? error.message : String(error)}` };
      }
      return { status: "mounted", widgetId };
    },
    rehydrate(ctx: ExtensionContext): void {
      clear();
      if (ctx.mode !== "tui") return;
      const documents = new Map<string, StoredWidget>();
      for (const entry of contextEntries(ctx)) {
        if (entry.type !== "custom") continue;
        if (entry.customType === OPENUI_LOCAL_ENTRY && validData(entry.data)) documents.set(entry.data.widgetId, entry.data);
        else if (entry.customType === OPENUI_LOCAL_CLOSE_ENTRY && entry.data && typeof entry.data === "object") {
          const closed = entry.data as { version?: unknown; widgetId?: unknown };
          if (closed.version === 1 && validId(closed.widgetId)) documents.delete(closed.widgetId);
        }
      }
      for (const data of [...documents.values()].slice(-MAX_LOCAL_WIDGETS)) {
        if (localDocumentDiagnostics(data.source).length) continue;
        const widget = create(data);
        if (!widget.model.valid) { widget.view.dispose(); widget.model.dispose(); continue; }
        widgets.set(data.widgetId, widget);
        lastId = data.widgetId;
      }
      if (widgets.size) {
        try { if (!attach(ctx)) clear(); } catch { clear(); }
      }
    },
    prune(ctx: ExtensionContext): void {
      const visible = new Set(contextEntries(ctx).flatMap(entry => entry.type === "custom"
        && entry.customType === OPENUI_LOCAL_ENTRY && validData(entry.data) ? [entry.data.widgetId] : []));
      for (const id of [...widgets.keys()]) if (!visible.has(id)) remove(id, false);
    },
    clear,
    suspend: blur,
  };
}
