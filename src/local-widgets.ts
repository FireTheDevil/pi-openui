import { createHash } from "node:crypto";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text, isKeyRelease, matchesKey, stripTerminalSequences, truncateToWidth, visibleWidth, type Component, type TUI, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { DocumentModel, limits } from "./model.js";
import { localDocumentDiagnostics } from "./local-policy.js";
import { presentation, safeText, type HostTheme } from "./presentation.js";
import { OpenUIView, type ViewEdge, type ViewOptions } from "./view.js";

export const OPENUI_LOCAL_ENTRY = "openui-local-widget";
export const OPENUI_LOCAL_CLOSE_ENTRY = "openui-local-close";
export const MAX_LOCAL_WIDGETS = 16;
type MountResult = { status: "mounted"; widgetId: string } | { status: "error"; error: string };
interface StoredWidget { version: 1; widgetId: string; source: string; title: string; }
type HeaderAction = "expand" | "hide" | "restore" | "close";
// These methods are public on Pi 1.4's TuiMainScreen/TuiAltScreen. The common
// TUI interface omits the focus getter and viewport operations, so check them.
type HostTUI = TUI & {
  getFocusedComponent?(): Component | null;
  readonly viewportTop?: number;
  scrollBy?(lines: number): void;
};
type LocalWidgetLayout = Readonly<{ width: number; edge: ViewEdge }>;
function localWidgetLayout(hostWidth: number): LocalWidgetLayout | undefined {
  if (!Number.isFinite(hostWidth)) return undefined;
  const columns = Math.floor(hostWidth);
  const width = columns - (columns >= 22 ? 2 : 1);
  return width > 0 ? { width, edge: width >= 20 ? "right" : "none" } : undefined;
}
interface Widget {
  data: StoredWidget;
  model: DocumentModel;
  view: OpenUIView;
  options: ViewOptions;
  component: Component & { focused: boolean; capturesViewportInput?: boolean };
  disposed: boolean;
  expanded: boolean;
  hidden: boolean;
  hiddenOrder: number;
  theme: HostTheme;
  headerHits?: Array<{ action: HeaderAction; x: number; width: number }>;
  headerGesture?: { action: HeaderAction; x: number; y: number; cancelled?: boolean };
  width?: number;
  layout?: LocalWidgetLayout;
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
  let hiddenSerial = 0;
  let disposed = false;
  let revealProbe: Widget | undefined;

  const focused = () => host?.getFocusedComponent?.() ?? null;
  const owned = (component: Component | null) => [...widgets.values()].find(widget => widget.component === component);
  const visibleWidgets = () => [...widgets.values()].filter(widget => !widget.hidden);
  const lastVisible = () => visibleWidgets().find(widget => widget.data.widgetId === lastId) ?? visibleWidgets().at(-1);
  const lastHidden = () => [...widgets.values()].filter(widget => widget.hidden).sort((a, b) => b.hiddenOrder - a.hiddenOrder)[0];
  const completions = (prefix: string, accepts: (widget: Widget) => boolean = () => true) => [...widgets.values()]
    .filter(widget => accepts(widget) && `${widget.data.widgetId} ${widget.data.title}`.toLowerCase().includes(prefix.trim().toLowerCase()))
    .map(widget => ({ value: widget.data.widgetId, label: widget.data.widgetId, description: `${widget.data.title}${widget.hidden ? " · hidden" : ""}` }));
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
    if (!visibleWidgets().length) { captureEditor(); removeHint(); return; }
    context.ui.setWidget("openui-local-focus", (tui, theme) => {
      host = tui as HostTUI;
      captureEditor();
      return {
        invalidate() {},
        render(width: number) {
          const visible = visibleWidgets();
          const active = visible.find(widget => widget.component === focused());
          const text = active ? `${active.data.widgetId} · local only · F6/Esc chat · Shift+F6 next · /openui-close`
            : `${visible.length} local widget${visible.length === 1 ? "" : "s"} · F6 interact · Shift+F6 next · /openui-focus [id]`;
          return visible.length ? [truncateToWidth(theme.fg("dim", text), Math.max(0, width), "")] : [];
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
    // Probe with a unique header only in these synchronous render results.
    // Visible headers can repeat or be truncated, so they cannot identify a
    // widget reliably. No marker is rendered to the terminal or persisted.
    const marker = `OpenUI focus probe: ${widget.data.widgetId}`;
    let targetRow: number | undefined;
    revealProbe = widget;
    try {
      for (const child of host.children ?? []) {
        const lines = child.render(Math.max(1, widget.width ?? host.terminal.columns));
        const row = lines.findIndex(line => stripTerminalSequences(line) === marker);
        if (row >= 0) { targetRow = row; break; }
      }
    } finally { revealProbe = undefined; }
    if (targetRow !== undefined) host.scrollBy(targetRow - host.viewportTop);
  }
  function focus(widget: Widget, scroll = true): boolean {
    refreshHost();
    if (widget.disposed || widget.hidden || !canFocus()) return false;
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
    const all = visibleWidgets();
    if (!all.length) return;
    const index = all.findIndex(widget => widget.data.widgetId === (current?.data.widgetId ?? lastId));
    const target = next ? all[(index + 1) % all.length] : lastVisible();
    if (target) focus(target);
  }
  function attach(ctx: ExtensionContext): boolean {
    context = ctx;
    disposed = false;
    refreshHost();
    if (!host?.getFocusedComponent) return false;
    if (!unsubscribe) unsubscribe = ctx.ui.onTerminalInput(data => {
      if (disposed || !visibleWidgets().length || isKeyRelease(data)) return;
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
  function hide(widget: Widget): boolean {
    if (widget.disposed || widget.hidden) return false;
    widget.view.cancelPointerGesture();
    if (focused() === widget.component) blur();
    widget.hidden = true;
    widget.hiddenOrder = ++hiddenSerial;
    if (widget.headerGesture) widget.headerGesture.cancelled = true;
    refreshHost();
    requestRender();
    return true;
  }
  function restore(widget: Widget): boolean {
    if (widget.disposed || !widget.hidden) return false;
    widget.view.cancelPointerGesture();
    widget.hidden = false;
    if (widget.headerGesture) widget.headerGesture.cancelled = true;
    if (!focus(widget, false)) {
      widget.hidden = true;
      refreshHost();
      requestRender();
      return false;
    }
    // The transcript grew from a single row. Refresh its public layout before
    // scrollBy so the old extent/follow-end position cannot hide the restored
    // widget. This also covers restoring an older placeholder with the mouse.
    if (host?.mode === "fullscreen") host.renderNow?.();
    reveal(widget);
    requestRender();
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
    } else refreshHost();
    requestRender();
    return true;
  }
  function create(data: StoredWidget): Widget {
    const model = new DocumentModel(data.source);
    const options: ViewOptions = {
      interaction: "local", title: data.title, theme: {}, fillHeight: false, surface: "inline",
      getHeight: () => Math.max(5, Math.min(widget.expanded ? 48 : 18,
        Math.floor((host?.terminal.rows ?? 30) * (widget.expanded ? 3 / 4 : 1 / 2)))),
      requestRender, onDone() {}, onBlur: blur,
      showHeading: false,
    };
    const widget = { data, model, options, disposed: false, expanded: false, hidden: false, hiddenOrder: 0, theme: {} } as Widget;
    const toggleExpanded = () => {
      widget.view.cancelPointerGesture();
      widget.expanded = !widget.expanded;
      if (widget.headerGesture) widget.headerGesture.cancelled = true;
      widget.view.invalidate();
      requestRender();
    };
    widget.view = new OpenUIView(model, options);
    widget.view.focused = false;
    widget.component = {
      // Pi 1.5 otherwise consumes PgUp/PgDn for conversation scrolling before
      // dispatching to a focused transcript component. Older hosts ignore this.
      capturesViewportInput: true,
      get focused() { return widget.view.focused; },
      set focused(value: boolean) {
        if (!value) {
          widget.view.cancelPointerGesture();
          if (widget.headerGesture) widget.headerGesture.cancelled = true;
        }
        widget.view.focused = value;
      },
      invalidate() { if (!widget.disposed) widget.view.invalidate(); },
      render(width: number) {
        if (widget.width !== width) {
          widget.view.cancelPointerGesture();
          if (widget.headerGesture) widget.headerGesture.cancelled = true;
        }
        widget.width = width;
        const layout = widget.layout = localWidgetLayout(width);
        if (widget.disposed || !layout) {
          widget.headerHits = undefined;
          widget.view.cancelPointerGesture();
          if (widget.headerGesture) widget.headerGesture.cancelled = true;
          return [];
        }
        // Keep the probe's body geometry identical to the visible widget, and
        // retain the host width separately for rendering its transcript parent.
        if (revealProbe === widget) return [`OpenUI focus probe: ${data.widgetId}`,
          ...(widget.hidden ? [] : widget.view.render(layout.width, layout.edge))];
        const style = presentation(() => widget.theme);
        const textWidth = layout.width - (layout.edge === "right" ? 2 : 0);
        const left = safeText(data.title).trim() || "Local explorer";
        const closeLabel = textWidth >= (widget.hidden ? 40 : 30) ? "[Close]" : textWidth >= (widget.hidden ? 12 : 11) ? "[×]" : "";
        const controls: Array<{ action: HeaderAction; label: string }> = widget.hidden
          ? [{ action: "restore", label: textWidth >= 22 ? "[Restore]" : textWidth >= 6 ? "[R]" : "R" }]
          : [
            ...(textWidth >= 18 ? [{ action: "expand" as const, label: textWidth >= 50 ? `[${widget.expanded ? "Collapse" : "Expand"} F2]` : `[${widget.expanded ? "−" : "+"}]` }] : []),
            { action: "hide", label: textWidth >= 30 ? "[Hide]" : textWidth >= 6 ? "[H]" : "H" },
          ];
        if (closeLabel) controls.push({ action: "close", label: closeLabel });
        const actions = controls.map(control => control.label).join(" ");
        const titleWidth = Math.max(0, textWidth - visibleWidth(actions) - 1);
        const title = widget.hidden ? `${safeText(data.title).replace(/\n/g, " ").trim() || "Local explorer"} · hidden · /openui-restore ${data.widgetId}` : left;
        const clippedTitle = truncateToWidth(title, titleWidth, "");
        let header = clippedTitle + " ".repeat(Math.max(0, textWidth - visibleWidth(clippedTitle) - visibleWidth(actions))) + actions;
        let actionStart = textWidth - visibleWidth(actions);
        widget.headerHits = controls.map(control => {
          const hit = { action: control.action, x: actionStart, width: visibleWidth(control.label) };
          actionStart += hit.width + 1;
          return hit;
        });
        header = style.fg(widget.view.focused ? "accent" : "muted", header);
        if (layout.edge === "right") header += " " + style.fg("borderMuted", "┐");
        return [header, ...(widget.hidden ? [] : widget.view.render(layout.width, layout.edge))];
      },
      handleInput(data: string) {
        if (widget.disposed || widget.hidden || focused() !== widget.component) return;
        widget.view.cancelPointerGesture();
        if (widget.headerGesture) widget.headerGesture.cancelled = true;
        if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c") || matchesKey(data, "f6")) { blur(); return; }
        if (cycleKey(data)) { toggle(true); return; }
        if (matchesKey(data, "f2")) { toggleExpanded(); return; }
        // Dedicated paging also reaches Pi 1.4 and bypasses field-owned keys
        // such as calendar months and multiline-editor navigation.
        if (matchesKey(data, "ctrl+pageUp") || matchesKey(data, "ctrl+pageDown")) {
          widget.view.page(matchesKey(data, "ctrl+pageUp") ? -1 : 1);
          return;
        }
        widget.view.handleInput(data);
      },
      handleMouse(event: TuiMouseEvent) {
        if (widget.disposed) return undefined;
        if (!Number.isFinite(event.x) || !Number.isFinite(event.y)) {
          widget.view.cancelPointerGesture();
          if (widget.headerGesture) widget.headerGesture.cancelled = true;
          return undefined;
        }
        const width = widget.layout?.width ?? 0;
        const bodyEvent = { ...event, width, y: event.y - 1, height: Math.max(0, event.height - 1) };
        if (event.type === "wheel") widget.view.cancelPointerGesture();
        // Captured scrollbar tails must never become header or hidden-body
        // actions, even when the pointer has left the widget's inset bounds.
        if (widget.view.ownsScrollbarContinuation(event)) {
          const result = widget.view.handleMouse(bodyEvent);
          return result ? { ...result, focus: false } : undefined;
        }
        if (event.x < 0 || event.x >= width) return undefined;
        const action = event.y === 0
          ? widget.headerHits?.find(hit => event.x >= hit.x && event.x < hit.x + hit.width)?.action
          : undefined;
        if (widget.headerGesture && (event.type === "drag" || event.x !== widget.headerGesture.x || event.y !== widget.headerGesture.y)) widget.headerGesture.cancelled = true;
        if (event.type === "press" || event.type === "click") {
          // Header presses otherwise return before the view sees them. A fresh
          // press clears a consumed scrollbar gesture; cancellation alone keeps
          // that gesture's trailing click blocked.
          if (event.type === "press" && (event.y === 0 || widget.hidden)) {
            widget.view.handleMouse({ ...bodyEvent, y: -1 });
          }
          if (widget.hidden) { captureEditor(); if (!canFocus()) return undefined; }
          else if (focused() !== widget.component && !focus(widget, false)) return undefined;
          const gesture = widget.headerGesture;
          widget.headerGesture = undefined;
          if (event.button === "left" && !event.shift && !event.alt && !event.ctrl && action) {
            if (event.type === "press") widget.headerGesture = { action, x: event.x, y: event.y };
            else if (!gesture || (!gesture.cancelled && gesture.action === action)) {
              if (action === "expand") toggleExpanded();
              else if (action === "hide") hide(widget);
              else if (action === "restore") restore(widget);
              else remove(widget.data.widgetId, true);
            }
            return { handled: true, render: event.type === "click" };
          }
        }
        if (widget.headerGesture) return { handled: true, render: false };
        if (widget.hidden) return action ? { handled: true, render: false } : undefined;
        if (event.y === 0) return { handled: true, render: false };
        const result = widget.view.handleMouse(bodyEvent);
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
    description: "Focus a visible local OpenUI widget by id, or the most recent visible widget. F6/Escape returns to chat.",
    getArgumentCompletions: prefix => completions(prefix, widget => !widget.hidden),
    async handler(args, ctx) {
      if (!widgets.size) { ctx.ui.notify("No local OpenUI widgets are open.", "info"); return; }
      attach(ctx);
      const widget = args.trim() ? widgets.get(args.trim()) : lastVisible();
      if (!widget && widgets.size && !visibleWidgets().length) { ctx.ui.notify("All local OpenUI widgets are hidden. Use /openui-restore [id].", "info"); return; }
      if (!widget) { ctx.ui.notify("Unknown OpenUI widget id.", "error"); return; }
      if (widget.hidden) { ctx.ui.notify(`Widget hidden. Use /openui-restore ${widget.data.widgetId}.`, "info"); return; }
      if (!focus(widget)) ctx.ui.notify("Return to the chat editor before focusing a local widget.", "info");
    },
  });
  pi.registerCommand("openui-hide", {
    description: "Hide a local widget to one line while retaining its live state. Defaults to the most recent visible widget.",
    getArgumentCompletions: prefix => completions(prefix, widget => !widget.hidden),
    async handler(args, ctx) {
      attach(ctx);
      const widget = args.trim() ? widgets.get(args.trim()) : owned(focused()) ?? lastVisible();
      if (!widget || !hide(widget)) ctx.ui.notify("No matching visible local OpenUI widget is open.", "info");
    },
  });
  pi.registerCommand("openui-restore", {
    description: "Restore and focus a hidden local widget with its live state. Defaults to the most recently hidden widget.",
    getArgumentCompletions: prefix => completions(prefix, widget => widget.hidden),
    async handler(args, ctx) {
      attach(ctx);
      const widget = args.trim() ? widgets.get(args.trim()) : lastHidden();
      if (!widget?.hidden) { ctx.ui.notify("No matching hidden local OpenUI widget is open.", "info"); return; }
      if (!restore(widget)) ctx.ui.notify("Return to the chat editor before restoring a local widget.", "info");
    },
  });
  pi.registerCommand("openui-close", {
    description: "Dismiss a local OpenUI widget without submitting values. Accepts a widget id; defaults to the last widget.",
    getArgumentCompletions: prefix => completions(prefix),
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
    context = undefined; host = undefined; editor = null; lastId = undefined; hiddenSerial = 0;
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
      const data: StoredWidget = { version: 1, widgetId, source, title: safeText(title ?? "").replace(/\n/g, " ").trim().slice(0, 160) || "Local explorer" };
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
