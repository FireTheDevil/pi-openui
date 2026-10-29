import {
  Input, Text, matchesKey, truncateToWidth, visibleWidth,
  type Component, type Focusable, type TuiMouseEvent, type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import { isReactiveAssign, type ElementNode } from "@openuidev/lang-core";
import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import type { ActionSubmission, DocumentModel } from "./model.js";
import { childNodes, fieldOptions, isField, isElement, optionItems, type TabItem } from "./catalog.js";
import { createFieldControl, type FieldControl } from "./controls.js";
import { renderDisplay } from "./displays.js";
import { presentation, safeText, type HostTheme, type PresentationStyle } from "./presentation.js";
export { safeText } from "./presentation.js";

export type UIResult = ActionSubmission | { status: "cancelled" };
export interface ViewOptions {
  requestRender(): void;
  getHeight(): number;
  onDone(result: UIResult): void;
  title?: string;
  theme?: HostTheme;
  fillHeight?: boolean;
}
type PageAncestor = { key: string; value: string };
type Control = { key: string; node: ElementNode; widget?: FieldControl; pages: PageAncestor[] };
type Hit = { key: string; part: "label" | "widget" | "button" | "page"; x: number; y: number; width: number; height: number; value?: string };
type MouseHit = Hit & { top: number; bottom: number };
type Block = { lines: string[]; hits: Hit[]; positions: Map<string, number>; labels: Map<string, number> };
const block = (): Block => ({ lines: [], hits: [], positions: new Map(), labels: new Map() });
const navigation = (node: ElementNode) => node.typeName === "Tabs" || node.typeName === "Steps";
const keyOf = (node: ElementNode, path: string) => `${path}:${node.typeName}:${node.props.name ?? ""}`;
const tone = (value: unknown, fallback: ThemeColor = "accent"): ThemeColor => {
  return value === "default" ? "text" : ["muted", "accent", "success", "warning", "error"].includes(String(value)) ? value as ThemeColor : fallback;
};
const pad = (line: string, width: number) => truncateToWidth(line, width, "") + " ".repeat(Math.max(0, width - visibleWidth(line)));

/** Pi owns the terminal. This component composes native controls and terminal layouts. */
export class OpenUIView implements Component, Focusable {
  focused = true;
  private controls: Control[] = [];
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
  private mouseGesture?: { hit: MouseHit; dragged: boolean; x: number; y: number };
  private style: PresentationStyle;

  constructor(readonly model: DocumentModel, private readonly options: ViewOptions) {
    this.style = presentation(() => this.options.theme, { requestRender: () => this.options.requestRender(), getHeight: () => this.options.getHeight() });
    this.refresh();
  }

  /** Retain hidden-page widgets too, so draft text/cursors survive page navigation. */
  refresh(resetTargets = new Set<string>()): void {
    if (this.closed) return;
    const focusedKey = this.controls[this.focusIndex]?.key;
    const next: Control[] = [];
    const seen = new Set<string>();
    const visit = (node: ElementNode, path: string, visible: boolean, pages: PageAncestor[]) => {
      const key = keyOf(node, path);
      if (isField(node) || node.typeName === "Button") {
        let control = this.cache.get(key);
        if (!control) {
          control = { key, node, pages };
          if (isField(node) && !navigation(node)) control.widget = createFieldControl(node, this.model, this.style);
          this.cache.set(key, control);
        }
        control.node = node;
        control.pages = pages;
        const binding = node.props.value;
        control.widget?.update(node, isReactiveAssign(binding) && resetTargets.has(binding.target));
        seen.add(key);
        if (visible && !this.model.isDisabled(node)) next.push(control);
      }
      if (navigation(node)) {
        let index = 0;
        for (const page of (node.props.items as TabItem[] ?? [])) {
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
  dispose(): void { this.closed = true; this.controls = []; this.cache.clear(); this.mouseHits = []; this.mouseGesture = undefined; }
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
    const index = this.controls.findIndex(item => item.key === control.key);
    if (index >= 0) this.focusIndex = index;
    this.followFocus = true;
  }
  private activateButton(control: Control): void {
    if (this.closed || this.activating || this.model.streaming || !this.model.valid || this.model.isDisabled(control.node)) return;
    this.activating = true;
    this.actionError = undefined;
    try {
      const action = control.node.props.action as string | { steps?: Array<{ type: string; target?: string; targets?: string[] }> };
      const submits = typeof action === "string" || action?.steps?.some(step => step.type === "continue_conversation");
      const draftError = submits && [...this.cache.values()].find(item => !this.model.isDisabled(item.node) && item.widget?.error);
      if (draftError) {
        this.actionError = { key: draftError.key, message: draftError.widget!.error! };
        this.reveal(draftError);
        return;
      }
      const result = this.model.activate(control.node);
      if (result.status === "submitted") { this.finish(result); return; }
      if (result.status === "error") {
        // Action rollback re-evaluates the model tree. Refresh node identities
        // before navigating to an invalid field on another page.
        this.refresh();
        this.actionError = { key: control.key, message: result.error };
        const invalid = [...this.cache.values()].find(item => isField(item.node) && this.model.fieldError(item.node));
        if (invalid) this.reveal(invalid);
      }
      const targets = new Set<string>();
      if (result.status === "updated" && typeof action !== "string") {
        for (const step of action?.steps ?? []) {
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
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) { this.finish({ status: "cancelled" }); return; }
    const paging = matchesKey(data, "pageUp") || matchesKey(data, "pageDown");
    if (this.model.streaming || !this.model.valid) {
      if (paging) this.scroll(matchesKey(data, "pageUp") ? -this.pageSize : this.pageSize);
      return;
    }
    if (matchesKey(data, "tab") || matchesKey(data, "shift+tab")) { this.moveFocus(matchesKey(data, "tab") ? 1 : -1); return; }
    const control = this.controls[this.focusIndex];
    if (paging && (!control?.widget || !["DatePicker", "TextArea"].includes(control.node.typeName))) {
      this.scroll(matchesKey(data, "pageUp") ? -this.pageSize : this.pageSize); return;
    }
    if (!control || this.model.isDisabled(control.node)) return;
    this.followFocus = true;
    if (control.node.typeName === "Button") {
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
      if (result.handled) { this.actionError = undefined; this.refresh(); if (result.advance) this.moveFocus(1); }
    }
  }
  private scroll(delta: number): void {
    this.followFocus = false;
    this.offset = Math.max(0, Math.min(this.offset + delta, Math.max(0, this.bodyLength - this.pageSize)));
    this.options.requestRender();
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (this.closed) return;
    const inside = event.x >= 0 && event.x < this.renderedWidth && event.y >= 0 && event.y < this.renderedHeight;
    const hit = inside ? this.mouseHits.find(region => event.x >= region.x && event.x < region.x + region.width && event.y >= region.top && event.y < region.bottom) : undefined;
    if (event.type === "wheel") {
      if (!inside || !Number.isFinite(event.wheelDelta) || !event.wheelDelta) return;
      this.mouseGesture = undefined;
      const control = hit && this.cache.get(hit.key);
      if (control && this.model.valid && !this.model.streaming && !this.model.isDisabled(control.node)) {
        if (hit.part === "page") { this.changePage(control, Math.sign(event.wheelDelta)); return { handled: true, render: true }; }
        if (hit.part === "widget" && control.widget) {
          const result = control.widget.handleMouse({ ...event, x: event.x - hit.x, y: event.y - hit.y, width: hit.width, height: hit.height });
          if (result?.handled) { this.actionError = undefined; this.refresh(); return result; }
        }
      }
      this.scroll(Math.trunc(event.wheelDelta) || Math.sign(event.wheelDelta));
      return { handled: true, render: true };
    }
    if (this.model.streaming || !this.model.valid || event.button !== "left" || event.shift || event.alt || event.ctrl) return;
    if (event.type === "drag") { if (this.mouseGesture) { this.mouseGesture.dragged = true; return { handled: true }; } return; }
    if (event.type === "release") {
      if (!this.mouseGesture) return;
      if (event.x !== this.mouseGesture.x || event.y !== this.mouseGesture.y) this.mouseGesture.dragged = true;
      return { handled: true, render: false };
    }
    if (event.type !== "press" && event.type !== "click") return;
    if (event.type === "press") this.mouseGesture = undefined;
    const gesture = event.type === "click" ? this.mouseGesture : undefined;
    if (event.type === "click") this.mouseGesture = undefined;
    const target = gesture?.hit ?? hit;
    if (!target || gesture?.dragged || (gesture && (event.x !== gesture.x || event.y !== gesture.y))) return;
    const control = this.cache.get(target.key);
    const index = this.controls.findIndex(item => item.key === target.key);
    if (!control || index < 0 || this.model.isDisabled(control.node)) return;
    if (event.type === "press") this.mouseGesture = { hit: { ...target }, dragged: false, x: event.x, y: event.y };
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
  private text(value: unknown, width: number, color: ThemeColor = "text", bold = false): string[] {
    return new Text(safeText(value), 0, 0).render(Math.max(1, width)).map(line => this.style.fg(color, bold ? this.style.bold(line) : line));
  }
  private vertical(children: Array<{ node: ElementNode; path: string }>, width: number, gap = 1): Block {
    const result = block();
    for (const [index, child] of children.entries()) {
      if (index) for (let n = 0; n < gap; n++) result.lines.push("");
      const rendered = this.renderNode(child.node, child.path, width);
      this.append(result, rendered);
      result.lines.push(...rendered.lines);
    }
    return result;
  }
  private renderNode(node: ElementNode, path: string, width: number): Block {
    const result = block();
    const display = renderDisplay(node, width, this.style);
    if (display) { result.lines = display; return result; }
    const p = node.props;
    const children = childNodes(node).map((child, i) => ({ node: child, path: `${path}.${i}` }));
    if (node.typeName === "Stack") return this.vertical(children, width);
    if (node.typeName === "Row") {
      const gap = Number((p.settings as { gap?: number } | undefined)?.gap ?? 2);
      if (children.length <= 1 || width < children.length * 20 + Math.max(0, children.length - 1) * gap) return this.vertical(children, width);
      const columnWidth = Math.max(1, Math.floor((width - (children.length - 1) * gap) / children.length));
      const columns = children.map(child => this.renderNode(child.node, child.path, columnWidth));
      const height = Math.max(0, ...columns.map(column => column.lines.length));
      columns.forEach((column, i) => this.append(result, column, i * (columnWidth + gap), 0));
      for (let row = 0; row < height; row++) result.lines.push(columns.map(column => pad(column.lines[row] ?? "", columnWidth)).join(" ".repeat(gap)));
      return result;
    }
    if (node.typeName === "Section" || node.typeName === "Card") {
      const settings = p.settings as { description?: string; tone?: string } | undefined;
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
    if (!control) return result;
    const active = this.controls[this.focusIndex]?.key === key && this.focused && !this.model.streaming && this.model.valid && !this.model.isDisabled(node);
    const enabled = !this.model.streaming && this.model.valid && !this.model.isDisabled(node);
    result.positions.set(key, 0); result.labels.set(key, 0);
    if (navigation(node)) {
      let line = "", currentY = 0;
      for (const [index, page] of (p.items as TabItem[]).entries()) {
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
      const visible: Array<{ node: ElementNode; path: string }> = [];
      for (const page of p.items as TabItem[]) {
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
      const variant = (p.settings as { variant?: string } | undefined)?.variant;
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

  render(width: number): string[] {
    this.mouseHits = [];
    this.renderedWidth = this.renderedHeight = 0;
    if (this.closed || width <= 0) { if (this.mouseGesture) this.mouseGesture.dragged = true; return []; }
    width = Math.max(1, Math.floor(width));
    const height = Math.max(1, Math.floor(this.options.getHeight()));
    if (this.mouseGesture && (this.viewportSize?.width !== width || this.viewportSize?.height !== height)) this.mouseGesture.dragged = true;
    this.viewportSize = { width, height };
    const contentWidth = width >= 40 ? Math.min(96, width - 4) : width;
    const contentLeft = Math.floor((width - contentWidth) / 2);
    const rendered = this.model.root ? this.renderNode(this.model.root, "root", contentWidth) : block();
    if (!rendered.lines.length) rendered.lines.push(this.style.fg("muted", this.model.streaming ? "Waiting for OpenUI document…" : "No UI to display."));
    if (this.model.diagnostics.length) rendered.lines.push(...this.text(`Document error: ${this.model.diagnostics.join("; ")}`, contentWidth, "error"));
    this.bodyLength = rendered.lines.length;
    this.pageSize = height < 3 ? height : height - 2;
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
    const title = this.style.fg("accent", this.style.bold(truncateToWidth(safeText(this.options.title ?? "OpenUI").replace(/\n/g, " "), contentWidth, ""))) + (this.model.streaming ? this.style.fg("warning", " · receiving…") : "");
    const rule = Math.max(0, contentWidth - visibleWidth(title) - 2);
    const heading = title + (rule ? "  " + this.style.fg("borderMuted", "─".repeat(rule)) : "");
    const kind = this.controls[this.focusIndex]?.node.typeName;
    const actions: Record<string, string> = { Input: "type to edit", NumberInput: "type or ↑↓", Select: "↑↓ choose · Enter next", MultiSelect: "↑↓ move · Space toggle", Checkbox: "Space toggle", Toggle: "Space toggle", TextArea: "Enter newline · Ctrl+Enter next", Slider: "←→ adjust", DatePicker: "arrows choose · PgUp/PgDn month", Tree: "↑↓ move · ←→ expand · Enter select", Tabs: "←→ page · Enter next", Steps: "←→ step · Enter next", Button: "Enter/Space activate" };
    const actionHint = kind ? actions[kind] ?? "Enter activate" : "PgUp/PgDn scroll";
    const fullHint = `Tab/Shift+Tab focus · ${actionHint} · Esc cancel${this.bodyLength > this.pageSize && kind ? " · PgUp/PgDn scroll" : ""}`;
    const hints = this.actionError ? ["Action failed · edit or retry · Esc cancel", "Action failed · Esc cancel"]
      : this.model.streaming ? ["Receiving… · waiting for complete document · Esc cancel", "Receiving… · Esc cancel"]
      : !this.model.valid ? ["Check document · Esc cancel"]
      : [fullHint, `Tab focus · ${actionHint} · Esc cancel`, "Tab next · Enter activate · Esc cancel", "Tab next · Esc cancel"];
    const hint = [...hints, "Esc cancel"].find(value => visibleWidth(value) <= contentWidth) ?? "Esc";
    const body = rendered.lines.slice(this.offset, this.offset + this.pageSize);
    const visibleLength = body.length;
    if (this.options.fillHeight) while (body.length < this.pageSize) body.push("");
    const result = height < 3 ? body : [heading, ...body, this.style.fg(this.actionError ? "error" : "muted", hint)];
    const top = height < 3 ? 0 : 1;
    this.mouseHits = rendered.hits.map(hit => {
      const y = hit.y - this.offset + top;
      return { ...hit, x: hit.x + contentLeft, y, width: Math.min(contentWidth - hit.x, hit.width), top: Math.max(top, y), bottom: Math.min(top + visibleLength, y + hit.height) };
    }).filter(hit => hit.top < hit.bottom && hit.width > 0);
    this.renderedWidth = width; this.renderedHeight = result.length;
    return result.map(line => " ".repeat(contentLeft) + truncateToWidth(line, contentWidth, ""));
  }
}
