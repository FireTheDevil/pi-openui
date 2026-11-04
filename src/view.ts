import type { RenderedNode } from "./catalog.js";
import {
  Input, Text, matchesKey, truncateToWidth, visibleWidth,
  type Component, type Focusable, type TuiMouseEvent, type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import { z } from "zod";
import { predicateParseContext } from "./predicate-validation.js";
import { isReactiveAssign } from "@openuidev/lang-core";
import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import type { ActionSubmission, DocumentModel } from "./model.js";
import { childNodes, fieldOptions, isField, isElement, optionItems, componentSpecs } from "./catalog.js";
import { createFieldControl, type FieldControl } from "./controls.js";
import { EditableTableControl } from "./editable-table.js";
import { renderDisplay } from "./displays.js";
import { localActionError } from "./local-policy.js";
import { presentation, safeText, type HostTheme, type PresentationStyle } from "./presentation.js";

export { safeText } from "./presentation.js";

export type ViewEdge = "none" | "right";

export type UIResult = ActionSubmission | { status: "cancelled" };

export interface ViewOptions {
  requestRender(): void;
  getHeight(): number;
  onDone(result: UIResult): void;
  title?: string;
  /** Suppress the inner heading when the host supplies the document's title. */
  showHeading?: boolean;
  theme?: HostTheme;
  fillHeight?: boolean;
  /** Inline components share Pi's editor dock with the surrounding transcript. */
  surface?: "inline" | "fullscreen";
  onToggleExpanded?(): void;
  /** Host handles Enter as a normal close for a display-only expanded document. */
  dismissOnEnter?: boolean;
  /** Local widgets never submit; Escape returns keyboard focus to chat. */
  interaction?: "local";
  onBlur?(): void;
}

type PageAncestor = { key: string; value: string | boolean };

type Control = { key: string; node: RenderedNode; widget?: FieldControl; pages: PageAncestor[] };

type Hit = { key: string; part: "label" | "widget" | "button" | "page"; x: number; y: number; width: number; height: number; value?: string };

type MouseHit = Hit & { top: number; bottom: number };

type Point = Readonly<{ x: number; y: number }>;

type ScrollbarLayout = Readonly<{ x: number; top: number; rows: number; bodyLength: number }>;

type ScrollbarGeometry = ScrollbarLayout & Readonly<{
  maxOffset: number; thumbTop: number; thumbRows: number; travel: number;
}>;

type PointerGesture =
  | { kind: "control"; hit: MouseHit; dragged: boolean; x: number; y: number }
  | { kind: "scrollbar-thumb"; layout: ScrollbarLayout; grabRow: number; lastY: number }
  | { kind: "scrollbar-track"; layout: ScrollbarLayout; press: Point; direction: -1 | 1; phase: "pressed" | "await-click" }
  | { kind: "scrollbar-consume" };

function makeScrollbarGeometry(layout: ScrollbarLayout, offset: number): ScrollbarGeometry {
  const maxOffset = layout.bodyLength - layout.rows;
  const thumbRows = Math.max(1, Math.round(layout.rows * layout.rows / layout.bodyLength));
  const travel = layout.rows - thumbRows;

  return { ...layout, maxOffset, thumbRows, travel, thumbTop: layout.top + Math.round(offset / maxOffset * travel) };
}

function hitScrollbar(geometry: ScrollbarGeometry, point: Point):
  { kind: "thumb"; grabRow: number } | { kind: "track"; direction: -1 | 1 } | undefined {
  if (point.x !== geometry.x || point.y < geometry.top || point.y >= geometry.top + geometry.rows) return;

  if (point.y >= geometry.thumbTop && point.y < geometry.thumbTop + geometry.thumbRows) {
    return { kind: "thumb", grabRow: point.y - geometry.thumbTop };
  }

  return { kind: "track", direction: point.y < geometry.thumbTop ? -1 : 1 };
}

function offsetForThumb(geometry: ScrollbarGeometry, pointerY: number, grabRow: number): number {
  const top = Math.max(0, Math.min(geometry.travel, pointerY - geometry.top - grabRow));

  return Math.round(top / geometry.travel * geometry.maxOffset);
}

function sameScrollbarLayout(a: ScrollbarLayout, b: ScrollbarLayout): boolean {
  return a.x === b.x && a.top === b.top && a.rows === b.rows && a.bodyLength === b.bodyLength;
}

type Block = { lines: string[]; hits: Hit[]; positions: Map<string, number>; labels: Map<string, number> };

const block = (): Block => ({ lines: [], hits: [], positions: new Map(), labels: new Map() });

const actionTextSchema = z.string();

const actionStepsSchema = z.object({ steps: z.array(z.discriminatedUnion("type", [
  z.object({ type: z.literal("set"), target: z.string() }),
  z.object({ type: z.literal("reset"), targets: z.array(z.string()) }),
  z.object({ type: z.literal("continue_conversation") }),
])) });

const isActionText = (value: RenderedNode["props"][string]): value is string => actionTextSchema.safeParse(value, predicateParseContext).success;

const navigation = (node: RenderedNode) => node.typeName === "Tabs" || node.typeName === "Steps";

const keyOf = (node: RenderedNode, path: string) => `${path}:${node.typeName}:${node.props.name ?? ""}`;

const tone = (value: RenderedNode["props"][string], fallback: ThemeColor = "accent"): ThemeColor => {
  switch (value) {
    case "default": return "text";
    case "muted": case "accent": case "success": case "warning": case "error": return value;
    default: return fallback;
  }
};

const pad = (line: string, width: number) => truncateToWidth(line, width, "") + " ".repeat(Math.max(0, width - visibleWidth(line)));

/** Pi owns the terminal. This component composes native controls and terminal layouts. */
export class OpenUIView implements Component, Focusable {
  focused = true;
  private controls: Control[] = [];
  private dismissedCallouts = new Set<string>();
  private cache = new Map<string, Control>();
  private focusIndex = 0;
  private offset = 0;
  private followFocus = true;
  private closed = false;
  private activating = false;
  private actionError?: { key: string; message: string };
  private bodyLength = 0;
  private pageSize = 1;
  private mouseHits: MouseHit[] = [];
  private renderedWidth = 0;
  private renderedHeight = 0;
  private viewportSize?: { width: number; height: number };
  private pointerGesture?: PointerGesture;
  private scrollbar?: ScrollbarGeometry;
  private style: PresentationStyle;
  private surface?: "inline" | "fullscreen";
  private surfaceToggle?: { x: number; y: number; width: number };
  private surfaceGesture?: { x: number; y: number; cancelled?: boolean };

  constructor(readonly model: DocumentModel, private readonly options: ViewOptions) {
    this.surface = options.surface;
    this.style = presentation(() => this.options.theme, { requestRender: () => this.options.requestRender(), getHeight: () => this.options.getHeight() });
    this.refresh();
  }

  /** Retain hidden-page widgets too, so draft text/cursors survive page navigation. */
  refresh(resetTargets = new Set<string>()): void {
    if (this.closed) return;

    if (this.pointerGesture?.kind !== "control") this.cancelPointerGesture();
    const focusedKey = this.controls[this.focusIndex]?.key;
    const next: Control[] = [];
    const seen = new Set<string>();

    const visit = (node: RenderedNode, path: string, visible: boolean, pages: PageAncestor[]) => {
      const key = keyOf(node, path);

      if (isField(node) || node.typeName === "Button" || node.typeName === "Callout" && componentSpecs.Callout.shape.settings.parse(node.props.settings ?? undefined)?.dismissible && !this.dismissedCallouts.has(key)) {
        let control = this.cache.get(key);

        if (!control) {
          control = { key, node, pages };

          if (isField(node) && !navigation(node) && node.typeName !== "Accordion") control.widget = createFieldControl(node, this.model, this.style);
          this.cache.set(key, control);
        }

        control.node = node;
        control.pages = pages;
        const binding = node.props.value;
        control.widget?.update(node, isReactiveAssign(binding) && resetTargets.has(binding.target));
        seen.add(key);

        if (visible && !this.model.isDisabled(node)) next.push(control);
      }

      if (node.typeName === "Accordion") {
        childNodes(node).forEach((child, i) => visit(child, `${path}.${i}`, visible && this.model.fieldValue(node) === true, [...pages, { key, value: true }]));
      } else if (navigation(node)) {
        let index = 0;

        for (const page of componentSpecs.Tabs.shape.items.parse(node.props.items ?? [])) {
          for (const child of page.children.filter(isElement)) {
            visit(child, `${path}.${index++}`, visible && page.value === this.model.fieldValue(node), [...pages, { key, value: page.value }]);
          }
        }
      } else childNodes(node).forEach((child, i) => visit(child, `${path}.${i}`, visible, pages));
    };

    if (this.model.root) visit(this.model.root, "root", true, []);

    for (const key of this.cache.keys()) if (!seen.has(key)) this.cache.delete(key);
    this.controls = next;
    const restored = next.findIndex(control => control.key === focusedKey);
    this.focusIndex = restored >= 0 ? restored : Math.min(this.focusIndex, Math.max(0, next.length - 1));
    this.invalidate();
    this.options.requestRender();
  }
  invalidate(): void { for (const control of this.cache.values()) control.widget?.invalidate(); }
  /** Keep field drafts, focus, and local state when the host changes surfaces. */
  setSurface(surface: "inline" | "fullscreen"): void {
    if (this.surface === surface) return;
    this.surface = surface;
    this.cancelPointerGesture();
    this.scrollbar = undefined;
    this.surfaceToggle = undefined;
    this.followFocus = true;
    this.invalidate();
    this.options.requestRender();
  }
  dispose(): void { this.closed = true; this.controls = []; this.cache.clear(); this.mouseHits = []; this.scrollbar = undefined; this.pointerGesture = undefined; this.surfaceGesture = undefined; this.surfaceToggle = undefined; }
  private finish(result: UIResult): void { if (!this.closed) { this.closed = true; this.options.onDone(result); } }
  private moveFocus(delta: number): void {
    this.focusIndex = this.controls.length ? (this.focusIndex + delta + this.controls.length) % this.controls.length : 0;
    this.followFocus = true;
    this.options.requestRender();
  }

  private reveal(control: Control): void {
    for (const page of control.pages) {
      const current = this.cache.get(page.key);

      if (current && this.model.fieldValue(current.node) !== page.value) {
        this.model.setField(current.node, page.value);
        this.refresh();
      }
    }

    if (control.widget instanceof EditableTableControl) control.widget.focusInvalidCell();
    const index = this.controls.findIndex(item => item.key === control.key);

    if (index >= 0) this.focusIndex = index;
    this.followFocus = true;
  }
  private activateButton(control: Control): void {
    if (this.closed || this.activating || this.model.streaming || !this.model.valid || this.model.isDisabled(control.node)) return;

    if (control.node.typeName === "Accordion") {
      this.model.setField(control.node, !this.model.fieldValue(control.node));
      this.refresh();

      return;
    }

    if (control.node.typeName === "Callout") {
      this.dismissedCallouts.add(control.key);
      this.refresh();

      return;
    }

    this.activating = true;
    this.actionError = undefined;

    try {
      const action = control.node.props.action;

      if (this.options.interaction === "local") {
        const error = localActionError(action);

        if (error) { this.actionError = { key: control.key, message: error };

 return; }
      }

      const plan = actionStepsSchema.safeParse(action, predicateParseContext);
      const submits = isActionText(action) || plan.success && plan.data.steps.some(step => step.type === "continue_conversation");
      const draftError = submits && [...this.cache.values()].find(item => !this.model.isDisabled(item.node) && item.widget?.error);

      if (draftError) {
        this.actionError = { key: draftError.key, message: draftError.widget!.error! };
        this.reveal(draftError);

        return;
      }

      const result = this.model.activate(control.node);

      if (result.status === "submitted") { this.finish(result);

 return; }

      if (result.status === "error") {
        // Action rollback re-evaluates the model tree. Refresh node identities
        // before navigating to an invalid field on another page.
        this.refresh();
        this.actionError = { key: control.key, message: result.error };
        const invalid = [...this.cache.values()].find(item => isField(item.node) && this.model.fieldError(item.node));

        if (invalid) this.reveal(invalid);
      }

      const targets = new Set<string>();

      if (result.status === "updated" && plan.success) {
        for (const step of plan.data.steps) {
          if (step.type === "set" && step.target) targets.add(step.target);

          if (step.type === "reset") for (const target of step.targets ?? []) targets.add(target);
        }
      }

      this.refresh(targets);
    } catch (error) {
      this.actionError = { key: control.key, message: error instanceof Error ? error.message : String(error) };
      this.refresh();
    } finally { this.activating = false; this.options.requestRender(); }
  }

  private changePage(control: Control, delta: number): void {
    const items = optionItems(control.node);

    if (!items.length) return;
    const index = items.findIndex(item => item.value === this.model.fieldValue(control.node));
    const next = Math.max(0, Math.min(items.length - 1, index + delta));
    this.model.setField(control.node, items[next].value);
    this.actionError = undefined;
    this.followFocus = true;
    this.refresh();
  }
  handleInput(data: string): void {
    if (this.closed) return;
    this.cancelPointerGesture();

    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
      if (this.options.interaction === "local") this.options.onBlur?.();
      else this.finish({ status: "cancelled" });

      return;
    }

    if (matchesKey(data, "f2") && this.options.onToggleExpanded) { this.options.onToggleExpanded();

 return; }

    const paging = matchesKey(data, "pageUp") || matchesKey(data, "pageDown");

    if (this.model.streaming || !this.model.valid) {
      if (paging) this.scroll(matchesKey(data, "pageUp") ? -this.pageSize : this.pageSize);

      return;
    }

    if (matchesKey(data, "tab") || matchesKey(data, "shift+tab")) { this.moveFocus(matchesKey(data, "tab") ? 1 : -1);

 return; }

    const control = this.controls[this.focusIndex];

    if (paging && (!control?.widget || !["DatePicker", "TextArea"].includes(control.node.typeName))) {
      this.scroll(matchesKey(data, "pageUp") ? -this.pageSize : this.pageSize);

 return;
    }

    if (!control || this.model.isDisabled(control.node)) return;
    this.followFocus = true;

    if (["Button", "Accordion", "Callout"].includes(control.node.typeName)) {
      if (control.node.typeName === "Accordion" && (matchesKey(data, "left") || matchesKey(data, "right"))) {
        this.model.setField(control.node, matchesKey(data, "right"));
        this.refresh();

        return;
      }

      if (matchesKey(data, "enter") || matchesKey(data, "space")) this.activateButton(control);
      else if (matchesKey(data, "up") || matchesKey(data, "down")) this.moveFocus(matchesKey(data, "down") ? 1 : -1);
    } else if (navigation(control.node)) {
      if (matchesKey(data, "left") || matchesKey(data, "right")) this.changePage(control, matchesKey(data, "right") ? 1 : -1);
      else if (matchesKey(data, "enter") || matchesKey(data, "down")) this.moveFocus(1);
      else if (matchesKey(data, "up")) this.moveFocus(-1);
      else if (matchesKey(data, "home")) this.changePage(control, -Infinity);
      else if (matchesKey(data, "end")) this.changePage(control, Infinity);
    } else if (control.widget) {
      const result = control.widget.handleInput(data);

      if (result.handled) { this.actionError = undefined; this.refresh();

 if (result.advance) this.moveFocus(1); }
    }
  }
  private scroll(delta: number): void { this.setManualOffset(this.offset + delta); }
  private setManualOffset(offset: number): void {
    this.followFocus = false;
    this.offset = Math.max(0, Math.min(offset, Math.max(0, this.bodyLength - this.pageSize)));
    this.options.requestRender();
  }
  /** Explicit viewport paging, independent of the focused field's own keys. */
  page(direction: -1 | 1): void {
    if (this.closed) return;
    this.cancelPointerGesture();
    this.scroll(direction * this.pageSize);
  }

  ownsScrollbarContinuation(event: TuiMouseEvent): boolean {
    return !!this.pointerGesture && this.pointerGesture.kind !== "control"
      && (event.type === "drag" || event.type === "move" || event.type === "release" || event.type === "click");
  }

  cancelPointerGesture(): void {
    if (this.pointerGesture?.kind === "control") this.pointerGesture.dragged = true;
    else if (this.pointerGesture) this.pointerGesture = { kind: "scrollbar-consume" };

    if (this.surfaceGesture) this.surfaceGesture.cancelled = true;
  }

  private installScrollbarGeometry(geometry: ScrollbarGeometry | undefined): void {
    const gesture = this.pointerGesture;

    if (gesture && (gesture.kind === "scrollbar-thumb" || gesture.kind === "scrollbar-track")
      && (!geometry || !sameScrollbarLayout(gesture.layout, geometry))) this.cancelPointerGesture();
    this.scrollbar = geometry;
  }

  private handleScrollbarMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    const gesture = this.pointerGesture;

    if (this.ownsScrollbarContinuation(event) && gesture) {
      if (gesture.kind === "scrollbar-thumb") {
        const geometry = this.scrollbar;

        if ((event.type === "drag" || event.type === "release") && geometry && event.y !== gesture.lastY) {
          gesture.lastY = event.y;

          if (geometry.travel > 0) this.setManualOffset(offsetForThumb(geometry, event.y, gesture.grabRow));
        }

        if (event.type === "release" || event.type === "click" || event.type === "move") this.cancelPointerGesture();
      } else if (gesture.kind === "scrollbar-track") {
        const matches = event.x === gesture.press.x && event.y === gesture.press.y;

        if (event.type === "release" && matches && gesture.phase === "pressed") gesture.phase = "await-click";
        else {
          this.cancelPointerGesture();

          if (event.type === "click" && matches && gesture.phase === "await-click") this.scroll(gesture.direction * gesture.layout.rows);
        }
      }

      return { handled: true, render: event.type === "drag" || event.type === "release" || event.type === "click" };
    }

    if (event.type !== "press" || event.button !== "left" || event.shift || event.alt || event.ctrl || !this.scrollbar) return;
    const target = hitScrollbar(this.scrollbar, event);

    if (!target) return;
    this.surfaceGesture = undefined;
    this.followFocus = false;
    this.pointerGesture = target.kind === "thumb"
      ? { kind: "scrollbar-thumb", layout: this.scrollbar, grabRow: target.grabRow, lastY: event.y }
      : { kind: "scrollbar-track", layout: this.scrollbar, press: { x: event.x, y: event.y }, direction: target.direction, phase: "pressed" };

    return { handled: true, capture: true, render: false };
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (this.closed) return;

    if (!Number.isFinite(event.x) || !Number.isFinite(event.y)) { this.cancelPointerGesture();

 return; }

    if (event.type === "wheel") this.cancelPointerGesture();

    if (event.type === "press") this.pointerGesture = undefined;
    const scrollbarResult = this.handleScrollbarMouse(event);

    if (scrollbarResult) return scrollbarResult;
    const toggle = this.surfaceToggle;
    const onToggle = toggle && event.x >= toggle.x && event.x < toggle.x + toggle.width && event.y === toggle.y;

    if (this.options.onToggleExpanded && event.button === "left" && !event.shift && !event.alt && !event.ctrl) {
      if (event.type === "press" && onToggle) {
        this.pointerGesture = undefined;
        this.surfaceGesture = { x: event.x, y: event.y };

        return { handled: true };
      }

      if (this.surfaceGesture) {
        if (event.type === "drag" || event.x !== this.surfaceGesture.x || event.y !== this.surfaceGesture.y) {
          this.surfaceGesture.cancelled = true;

          return { handled: true };
        }

        if (event.type === "release") return { handled: true, render: false };

        if (event.type === "click") {
          const cancelled = this.surfaceGesture.cancelled;
          this.surfaceGesture = undefined;

          if (onToggle && !cancelled) this.options.onToggleExpanded();

          return { handled: true, render: true };
        }
      } else if (event.type === "click" && onToggle) {
        this.options.onToggleExpanded();

        return { handled: true, render: true };
      }
    }

    if (event.type === "press") this.surfaceGesture = undefined;
    const inside = event.x >= 0 && event.x < this.renderedWidth && event.y >= 0 && event.y < this.renderedHeight;
    const hit = inside ? this.mouseHits.find(region => event.x >= region.x && event.x < region.x + region.width && event.y >= region.top && event.y < region.bottom) : undefined;

    if (event.type === "wheel") {
      if (!inside || !Number.isFinite(event.wheelDelta) || !event.wheelDelta) return;
      const control = hit && this.cache.get(hit.key);

      if (control && this.model.valid && !this.model.streaming && !this.model.isDisabled(control.node)) {
        if (hit.part === "page") { this.changePage(control, Math.sign(event.wheelDelta));

 return { handled: true, render: true }; }

        if (hit.part === "widget" && control.widget) {
          const result = control.widget.handleMouse({ ...event, x: event.x - hit.x, y: event.y - hit.y, width: hit.width, height: hit.height });

          if (result?.handled) { this.actionError = undefined; this.refresh();

 return result; }
        }
      }

      this.scroll(Math.trunc(event.wheelDelta) || Math.sign(event.wheelDelta));

      return { handled: true, render: true };
    }

    if (this.model.streaming || !this.model.valid || event.button !== "left" || event.shift || event.alt || event.ctrl) return;

    if (event.type === "drag") { if (this.pointerGesture?.kind === "control") { this.pointerGesture.dragged = true;

 return { handled: true }; }

 return; }

    if (event.type === "release") {
      if (this.pointerGesture?.kind !== "control") return;

      if (event.x !== this.pointerGesture.x || event.y !== this.pointerGesture.y) this.pointerGesture.dragged = true;

      return { handled: true, render: false };
    }

    if (event.type !== "press" && event.type !== "click") return;
    const gesture = event.type === "click" && this.pointerGesture?.kind === "control" ? this.pointerGesture : undefined;

    if (event.type === "click") this.pointerGesture = undefined;
    const target = gesture?.hit ?? hit;

    if (!target || gesture?.dragged || (gesture && (event.x !== gesture.x || event.y !== gesture.y))) return;
    const control = this.cache.get(target.key);
    const index = this.controls.findIndex(item => item.key === target.key);

    if (!control || index < 0 || this.model.isDisabled(control.node)) return;

    if (event.type === "press") this.pointerGesture = { kind: "control", hit: { ...target }, dragged: false, x: event.x, y: event.y };
    this.focusIndex = index;
    this.followFocus = false;

    if (target.part === "button" && event.type === "click") {
      this.activateButton(control);

      return this.closed ? { handled: true, render: true } : { handled: true, render: true, focus: true };
    }

    if (target.part === "page" && event.type === "click" && target.value !== undefined) {
      this.model.setField(control.node, target.value);
      this.actionError = undefined;
      this.refresh();
    } else if (target.part === "widget" && control.widget) {
      const local = { ...event, x: event.x - target.x, y: event.y - target.y, width: target.width, height: target.height };

      if (event.type === "click" && !gesture && control.widget.native instanceof Input) local.type = "press";
      control.widget.handleMouse(local);
      this.actionError = undefined;
      this.refresh();
    }

    this.options.requestRender();

    return { handled: true, focus: true, render: true };
  }

  private append(destination: Block, source: Block, x = 0, y = destination.lines.length): void {
    source.hits.forEach(hit => destination.hits.push({ ...hit, x: hit.x + x, y: hit.y + y }));
    source.positions.forEach((row, key) => destination.positions.set(key, row + y));
    source.labels.forEach((row, key) => destination.labels.set(key, row + y));
  }
  private text(value: RenderedNode["props"][string], width: number, color: ThemeColor = "text", bold = false): string[] {
    return new Text(safeText(value), 0, 0).render(Math.max(1, width)).map(line => this.style.fg(color, bold ? this.style.bold(line) : line));
  }
  private vertical(children: Array<{ node: RenderedNode; path: string }>, width: number, gap = 1): Block {
    const result = block();

    for (const [index, child] of children.entries()) {
      if (index) for (let n = 0; n < gap; n++) result.lines.push("");
      const rendered = this.renderNode(child.node, child.path, width);
      this.append(result, rendered);
      result.lines.push(...rendered.lines);
    }

    return result;
  }
  private renderNode(node: RenderedNode, path: string, width: number): Block {
    const result = block();
    const display = renderDisplay(node, width, this.style);

    if (display) { result.lines = display;

 return result; }

    const p = node.props;
    const children = childNodes(node).map((child, i) => ({ node: child, path: `${path}.${i}` }));

    if (node.typeName === "Stack") return this.vertical(children, width);

    if (node.typeName === "Row") {
      const gap = componentSpecs.Row.shape.settings.parse(p.settings ?? undefined)?.gap ?? 2;

      if (children.length <= 1 || width < children.length * 20 + Math.max(0, children.length - 1) * gap) return this.vertical(children, width);
      const columnWidth = Math.max(1, Math.floor((width - (children.length - 1) * gap) / children.length));
      const columns = children.map(child => this.renderNode(child.node, child.path, columnWidth));
      const height = Math.max(0, ...columns.map(column => column.lines.length));
      columns.forEach((column, i) => this.append(result, column, i * (columnWidth + gap), 0));

      for (let row = 0; row < height; row++) result.lines.push(columns.map(column => pad(column.lines[row] ?? "", columnWidth)).join(" ".repeat(gap)));

      return result;
    }

    if (node.typeName === "Section" || node.typeName === "Card") {
      const settings = componentSpecs.Section.shape.settings.parse(p.settings ?? undefined);
      const color = tone(settings?.tone);
      const framed = node.typeName === "Card" && width >= 12;
      const inset = width >= 12 ? 2 : 0;
      const innerWidth = Math.max(1, width - (framed ? 4 : inset));
      const title = safeText(p.title).replace(/\n/g, " ");

      if (framed) {
        const heading = truncateToWidth(` ${title} `, width - 2, "");
        result.lines.push(this.style.fg(color, "╭" + this.style.bold(heading) + "─".repeat(Math.max(0, width - 2 - visibleWidth(heading))) + "╮"));
      } else result.lines.push(...this.text(title, width, color, true));
      const body = this.vertical(children, innerWidth);

      if (settings?.description) {
        const description = this.text(settings.description, innerWidth, "muted");
        const extra = block(); extra.lines = [...description, "", ...body.lines];
        this.append(extra, body, 0, description.length + 1);
        body.lines = extra.lines; body.hits = extra.hits; body.positions = extra.positions; body.labels = extra.labels;
      }

      this.append(result, body, inset, result.lines.length);

      for (const line of body.lines) result.lines.push(framed ? this.style.fg("borderMuted", "│ ") + pad(line, innerWidth) + this.style.fg("borderMuted", " │") : " ".repeat(inset) + line);

      if (framed) result.lines.push(this.style.fg("borderMuted", "╰" + "─".repeat(width - 2) + "╯"));

      return result;
    }

    const key = keyOf(node, path);
    const control = this.cache.get(key);

    if (node.typeName === "Callout") {
      if (this.dismissedCallouts.has(key)) return result;
      const settings = componentSpecs.Callout.shape.settings.parse(p.settings ?? undefined);
      const color = tone(settings?.tone, "accent");
      const labels = new Map(Object.entries({ default: "Notice", muted: "Note", accent: "Notice", success: "Success", warning: "Warning", error: "Error" }));
      const heading = `${labels.get(settings?.tone ?? "default")} · ${safeText(p.title)}`;
      const framed = width >= 4;
      const inset = width >= 6 ? 1 : 0;
      const inner = Math.max(1, width - (framed ? 2 : 0));
      const content = Math.max(1, inner - inset * 2);
      const x = (framed ? 1 : 0) + inset;
      const body = block();
      body.lines.push(...this.text(heading, content, color, true), "", ...this.text(p.text, content));

      if (settings?.dismissible && control) {
        const active = this.controls[this.focusIndex]?.key === key && this.focused;
        body.lines.push("");
        body.positions.set(key, body.lines.length); body.labels.set(key, 0);
        const dismiss = this.text(`${active ? "> " : "  "}[ Dismiss notice ]`, content, active ? "accent" : color);
        dismiss.forEach(line => {
          const label = safeText(line).replace(/^>/, " ").trimEnd();
          const left = visibleWidth(label) - visibleWidth(label.trimStart());
          const width = visibleWidth(label.trimStart());

          if (width) body.hits.push({ key, part: "button", x: left, y: body.lines.length, width, height: 1 });
          body.lines.push(line);
        });
      }

      if (framed) result.lines.push(this.style.fg(color, "┌" + "─".repeat(inner) + "┐"));
      this.append(result, body, x, result.lines.length + 1);

      for (const line of ["", ...body.lines, ""]) result.lines.push((framed ? this.style.fg(color, "│") : "") + " ".repeat(inset) + pad(line, content) + " ".repeat(inset) + (framed ? this.style.fg(color, "│") : ""));

      if (framed) result.lines.push(this.style.fg(color, "└" + "─".repeat(inner) + "┘"));

      return result;
    }

    if (!control) return result;
    const active = this.controls[this.focusIndex]?.key === key && this.focused && !this.model.streaming && this.model.valid && !this.model.isDisabled(node);
    const enabled = !this.model.streaming && this.model.valid && !this.model.isDisabled(node);
    result.positions.set(key, 0); result.labels.set(key, 0);

    if (node.typeName === "Accordion") {
      const open = this.model.fieldValue(node) === true;
      const heading = this.text(`${active ? "> " : "  "}${open ? "▾" : "▸"} ${safeText(p.label)}`, width, !enabled ? "dim" : active ? "accent" : "text", true);
      result.lines.push(...heading);
      result.hits.push({ key, part: "button", x: 0, y: 0, width, height: heading.length });

      if (fieldOptions(node).description) result.lines.push(...this.text(fieldOptions(node).description, width, "muted"));
      const error = this.model.fieldError(node);

      if (error) result.lines.push(...this.text(error, width, "error"));

      if (open) {
        const inset = Math.min(5, Math.max(0, width - 1));

        if (children.length && inset) result.lines.push(this.style.fg("borderMuted", inset >= 3 ? "  │" : "│"));

        for (const [index, child] of children.entries()) {
          const last = index === children.length - 1;
          const body = this.renderNode(child.node, child.path, Math.max(1, width - inset));
          const branch = inset >= 3 ? (last ? "  └─ " : "  ├─ ") : inset ? (last ? "└" : "├") + "─".repeat(inset - 1) : "";
          const rail = inset >= 3 ? (last ? "     " : "  │  ") : inset ? (last ? " " : "│") + " ".repeat(inset - 1) : "";
          this.append(result, body, inset);
          result.lines.push(...body.lines.map((line, row) => this.style.fg("borderMuted", truncateToWidth(row ? rail : branch, inset, "")) + line));

          if (!last) result.lines.push(this.style.fg("borderMuted", inset >= 3 ? "  │" : inset ? "│" : ""));
        }
      }

      return result;
    }

    if (navigation(node)) {
      let line = "", currentY = 0;

      for (const [index, page] of componentSpecs.Tabs.shape.items.parse(p.items).entries()) {
        const selected = page.value === this.model.fieldValue(node);
        const label = safeText(page.label).replace(/\n/g, " ");
        const content = node.typeName === "Steps" ? `${index + 1}. ${label}` : label;
        const raw = truncateToWidth(`[ ${content} ]`, width, "");
        const size = visibleWidth(raw);
        const gap = line ? 2 : 0;

        if (line && visibleWidth(line) + gap + size > width) { result.lines.push(line); line = ""; currentY++; }

        const x = visibleWidth(line) + (line ? 2 : 0);

        if (line) line += "  ";
        const styled = this.style.fg(!enabled ? "dim" : selected ? "accent" : "muted", selected ? this.style.bold(raw) : raw);
        line += selected && active ? this.style.bg("selectedBg", styled) : styled;
        result.hits.push({ key, part: "page", value: page.value, x, y: currentY, width: size, height: 1 });

        if (selected) result.positions.set(key, currentY);
      }

      if (line) result.lines.push(line);

      if (fieldOptions(node).description) result.lines.push(...this.text(fieldOptions(node).description, width, "muted"));
      const error = this.model.fieldError(node);

      if (error) result.lines.push(...this.text(error, width, "error"));
      result.lines.push("");
      let index = 0;
      const visible: Array<{ node: RenderedNode; path: string }> = [];

      for (const page of componentSpecs.Tabs.shape.items.parse(p.items)) {
        for (const child of page.children.filter(isElement)) {
          const childPath = `${path}.${index++}`;

          if (page.value === this.model.fieldValue(node)) visible.push({ node: child, path: childPath });
        }
      }

      const body = this.vertical(visible, width);
      this.append(result, body); result.lines.push(...body.lines);

      return result;
    }

    if (node.typeName === "Button") {
      const variant = componentSpecs.Button.shape.settings.parse(p.settings ?? undefined)?.variant;
      const color = !enabled ? "dim" : variant === "danger" ? "error" : variant === "secondary" ? "text" : "accent";

      for (const raw of this.text(`${active ? "> " : "  "}[ ${safeText(p.label)} ]`, width).map(line => safeText(line).trimEnd())) {
        const styled = this.style.fg(color, active || variant === "primary" ? this.style.bold(raw) : raw);
        result.hits.push({ key, part: "button", x: 0, y: result.lines.length, width: visibleWidth(raw), height: 1 });
        result.lines.push(active ? this.style.bg("selectedBg", styled) : styled);
      }

      if (fieldOptions(node).description) result.lines.push(...this.text(fieldOptions(node).description, width, "muted"));

      if (this.actionError?.key === key) result.lines.push(...this.text(`Action error: ${this.actionError.message}`, width, "error"));

      return result;
    }

    if (control.widget) {
      const settings = fieldOptions(node);
      const label = `${active ? "> " : "  "}${safeText(p.label)}${settings.required ? " *" : ""}`;

      for (const raw of new Text(label, 0, 0).render(width)) {
        result.hits.push({ key, part: "label", x: 0, y: result.lines.length, width: visibleWidth(raw.trimEnd()), height: 1 });
        result.lines.push(this.style.fg(!enabled ? "dim" : active ? "accent" : "text", this.style.bold(raw)));
      }

      if (settings.description) result.lines.push(...this.text(settings.description, width, "muted"));
      const widget = control.widget.render(width, active);
      result.positions.set(key, result.lines.length + control.widget.focusRow());
      result.hits.push({ key, part: "widget", x: 0, y: result.lines.length, width, height: widget.length });
      result.lines.push(...widget);
      const error = control.widget.error ?? this.model.fieldError(node);

      if (error) result.lines.push(...this.text(error, width, "error"));
    }

    return result;
  }

  private documentBlock(width: number): Block {
    const rendered = this.model.root ? this.renderNode(this.model.root, "root", width) : block();

    if (!rendered.lines.length) rendered.lines.push(this.style.fg("muted", this.model.streaming ? "Waiting for OpenUI document…" : "No UI to display."));

    if (this.model.diagnostics.length) rendered.lines.push(...this.text(`Document error: ${this.model.diagnostics.join("; ")}`, width, "error"));

    return rendered;
  }

  /** Render a persistent transcript snapshot with no focus, viewport, or dialog chrome. */
  renderStatic(width: number, maxLines?: number): string[] {
    if (this.closed || width <= 0) return [];
    width = Math.max(1, Math.floor(width));
    const focused = this.focused;
    this.focused = false;

    try {
      const lines = this.documentBlock(width).lines.map(line => truncateToWidth(line, width, ""));

      return maxLines === undefined ? lines : lines.slice(0, Math.max(0, Math.floor(maxLines)));
    } finally { this.focused = focused; }
  }

  render(width: number, edge: ViewEdge = "none"): string[] {
    this.mouseHits = [];
    this.surfaceToggle = undefined;
    this.renderedWidth = this.renderedHeight = 0;

    if (this.closed || !Number.isFinite(width) || width <= 0) {
      this.cancelPointerGesture();
      this.installScrollbarGeometry(undefined);

      return [];
    }

    width = Math.max(1, Math.floor(width));
    const height = Math.max(1, Math.floor(this.options.getHeight()));

    if (this.viewportSize?.width !== width || this.viewportSize?.height !== height) {
      this.cancelPointerGesture();
    }

    this.viewportSize = { width, height };
    const local = this.options.interaction === "local";
    const rightEdge = edge === "right";
    const headingRows = height >= 3 && this.options.showHeading !== false ? 1 : 0;
    const footerRows = height >= 3 ? 1 : 0;
    const bottomCap = rightEdge && height >= 4;
    // The host owns the local title. A blank spacer keeps the boundary's top
    // and bottom gaps symmetric without reintroducing an inner heading.
    const spacerRows = bottomCap && !headingRows ? 1 : 0;
    const top = headingRows + spacerRows;
    this.pageSize = height - top - footerRows - (bottomCap ? 1 : 0);
    let contentWidth = width >= 40 ? width - 4 : width - (rightEdge ? 1 : 0);
    const contentLeft = this.surface === "inline" ? (width >= 40 ? 2 : 0) : Math.floor((width - contentWidth) / 2);
    let rendered = this.documentBlock(contentWidth);
    // Use the existing right margin when possible. On smaller surfaces reserve
    // a gutter only for overflowing local content; never widen the widget.
    const scrollbar = local && rendered.lines.length > this.pageSize && (width >= 20 || (height < 3 && width >= 2));
    const gutter = width >= 20 ? 2 : 1;

    if (scrollbar && contentLeft + contentWidth + gutter > width) {
      contentWidth = width - contentLeft - gutter;
      rendered = this.documentBlock(contentWidth);
    }

    this.bodyLength = rendered.lines.length;
    const overflow = this.bodyLength > this.pageSize;

    if (this.followFocus) {
      const key = this.controls[this.focusIndex]?.key;
      const row = key ? rendered.positions.get(key) : undefined;

      if (row !== undefined) {
        const label = rendered.labels.get(key!) ?? row;

        if (label < this.offset) this.offset = row - label < this.pageSize ? label : row;

        if (row >= this.offset + this.pageSize) this.offset = row + 1 - this.pageSize;
      }
    }

    this.offset = Math.max(0, Math.min(this.offset, Math.max(0, this.bodyLength - this.pageSize)));
    const toggleLabel = this.options.onToggleExpanded && contentWidth >= 28 ? `[ ${this.surface === "fullscreen" ? "Collapse" : "Expand"} F2 ]` : "";
    const titleWidth = Math.max(1, contentWidth - (toggleLabel ? visibleWidth(toggleLabel) + 2 : 0));
    const title = this.style.fg("accent", this.style.bold(truncateToWidth(safeText(this.options.title ?? "OpenUI").replace(/\n/g, " "), titleWidth, ""))) + (this.model.streaming ? this.style.fg("warning", " · receiving…") : "");
    const clippedTitle = truncateToWidth(title, titleWidth, "");
    const rule = Math.max(0, contentWidth - visibleWidth(clippedTitle) - (toggleLabel ? visibleWidth(toggleLabel) + 3 : 2));
    const heading = clippedTitle + (rule ? "  " + this.style.fg("borderMuted", "─".repeat(rule)) : "") + (toggleLabel ? " " + this.style.fg("muted", toggleLabel) : "");

    if (toggleLabel && headingRows) this.surfaceToggle = { x: contentLeft + visibleWidth(heading) - visibleWidth(toggleLabel), y: 0, width: visibleWidth(toggleLabel) };
    const kind = this.controls[this.focusIndex]?.node.typeName;
    const actions = new Map(Object.entries({ Accordion: "Enter/Space toggle · ← close · → open", Callout: "Enter/Space dismiss", EditableTable: "arrows · Enter edit/exit · edits apply locally", Input: "type to edit", NumberInput: "type or ↑↓", Select: "↑↓ choose · Enter next", MultiSelect: "↑↓ move · Space toggle", Checkbox: "Space toggle", Toggle: "Space toggle", TextArea: "Enter newline · Ctrl+Enter next", Slider: "←→ adjust", DatePicker: "arrows choose · PgUp/PgDn month", Tree: "↑↓ move · ←→ expand · Enter select", Tabs: "←→ page · Enter next", Steps: "←→ step · Enter next", Button: "Enter/Space activate" }));
    const actionHint = kind ? actions.get(kind) ?? "Enter activate" : "PgUp/PgDn scroll";
    const expandHint = this.options.onToggleExpanded ? ` · F2 ${this.surface === "fullscreen" ? "collapse" : "expand"}` : "";
    const fullHint = `Tab/Shift+Tab focus · ${actionHint}${expandHint} · Esc cancel${overflow && kind ? " · PgUp/PgDn scroll" : ""}`;
    const scrollHint = overflow ? " · Ctrl+PgUp/PgDn scroll" : "";
    const localActionHint = kind === "DatePicker" ? "arrows choose" : kind ? actionHint : "Ctrl+PgUp/PgDn scroll";

    const localHints = this.focused
      ? [`Tab focus · ${localActionHint}${kind ? scrollHint : ""} · Esc/F6 chat`, `Tab next${scrollHint} · Esc/F6 chat`, `${overflow ? "Ctrl+PgUp/PgDn · " : ""}Esc/F6 chat`, "Esc/F6 chat", "Esc chat", "Esc"]
      : [`Local exploration · F6 focus${scrollHint}`, `F6 focus${scrollHint}`, "F6 focus", "F6"];

    const hints = local ? (this.actionError ? ["Action failed · Esc/F6 chat", "Esc chat"] : localHints)
      : this.actionError ? ["Action failed · edit or retry · Esc cancel", "Action failed · Esc cancel"]
      : this.model.streaming ? ["Receiving… · waiting for complete document · Esc cancel", "Receiving… · Esc cancel"]
      : !this.model.valid ? ["Check document · Esc cancel"]
      : this.options.dismissOnEnter && !this.controls.length ? [`Enter close${expandHint} · PgUp/PgDn scroll · Esc cancel`, `Enter close${expandHint} · Esc cancel`, "Enter close · Esc cancel"]
      : [fullHint, `Tab focus · ${actionHint}${expandHint} · Esc cancel`, `Tab next${expandHint} · Esc cancel`, "Tab next · Enter activate · Esc cancel", "Tab next · Esc cancel"];

    let hint = [...hints, local ? (this.focused ? "Esc chat" : "F6 focus") : "Esc cancel"].find(value => visibleWidth(value) <= contentWidth) ?? (local && !this.focused ? "F6" : "Esc");

    if (local && overflow && (!scrollbar || this.pageSize === 1)) {
      // Keep overflow discoverable when a rail cannot show position, including
      // local views whose title is supplied by the host rather than a heading.
      const above = this.offset > 0;
      const below = this.offset + this.pageSize < this.bodyLength;
      const range = `${above ? "↑ " : ""}${this.offset + 1}–${Math.min(this.bodyLength, this.offset + this.pageSize)}/${this.bodyLength}${below ? " ↓" : ""}`;
      const indicator = visibleWidth(range) <= contentWidth ? range : above && below && contentWidth > 1 ? "↑↓" : below ? "↓" : "↑";
      const remaining = contentWidth - visibleWidth(indicator) - 3;
      const suffix = hints.find(value => visibleWidth(value) <= remaining);
      hint = indicator + (suffix ? ` · ${suffix}` : "");
    }

    const body = rendered.lines.slice(this.offset, this.offset + this.pageSize);
    const visibleLength = body.length;

    if (this.surface === "fullscreen" || (this.surface === undefined && this.options.fillHeight)) while (body.length < this.pageSize) body.push("");

    const result = [...(headingRows ? [heading] : spacerRows ? [""] : []), ...body,
      ...(footerRows ? [this.style.fg(this.actionError ? "error" : "muted", hint)] : []), ...(bottomCap ? [""] : [])];

    this.mouseHits = rendered.hits.map(hit => {
      const y = hit.y - this.offset + top;

      return { ...hit, x: hit.x + contentLeft, y, width: Math.min(contentWidth - hit.x, hit.width), top: Math.max(top, y), bottom: Math.min(top + visibleLength, y + hit.height) };
    }).filter(hit => hit.top < hit.bottom && hit.width > 0);
    this.renderedWidth = width; this.renderedHeight = result.length;

    const geometry = scrollbar && overflow ? makeScrollbarGeometry({
      x: rightEdge ? width - 1 : contentLeft + contentWidth + gutter - 1, top, rows: this.pageSize, bodyLength: this.bodyLength,
    }, this.offset) : undefined;

    this.installScrollbarGeometry(geometry);

    return result.map((line, row) => {
      const bodyRow = row - top;
      const inBody = bodyRow >= 0 && bodyRow < visibleLength;
      const onThumb = geometry && row >= geometry.thumbTop && row < geometry.thumbTop + geometry.thumbRows;

      if (rightEdge) {
        const glyph = geometry && inBody
          ? this.style.fg(onThumb ? "accent" : "muted", onThumb ? "┃" : "│")
          : this.style.fg("borderMuted", height >= 3 && row === result.length - 1 ? "┘" : "│");

        return " ".repeat(contentLeft) + pad(line, width - contentLeft - 1) + glyph;
      }

      const rail = geometry && inBody
        ? (gutter === 2 ? " " : "") + this.style.fg(
          onThumb ? "accent" : "muted",
          onThumb ? "┃" : "│")
        : "";

      return " ".repeat(contentLeft) + (rail ? pad(line, contentWidth) : truncateToWidth(line, contentWidth, "")) + rail;
    });
  }
}
