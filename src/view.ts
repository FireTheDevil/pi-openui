import {
  Input, SelectList, Text, matchesKey, stripTerminalSequences,
  truncateToWidth, visibleWidth, type Component, type Focusable,
  type TuiMouseEvent, type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import type { ElementNode } from "@openuidev/lang-core";
import type { DocumentModel } from "./model.js";

export type UIResult =
  | { status: "submitted"; action: string; state: Record<string, unknown>; values: Record<string, string> }
  | { status: "cancelled" };

export interface ViewOptions {
  requestRender(): void;
  getHeight(): number;
  onDone(result: UIResult): void;
  title?: string;
  /** Fill a host fullscreen overlay without making blank rows interactive. */
  fillHeight?: boolean;
}

// Model-provided text is data, never terminal control sequences.
export function safeText(value: unknown): string {
  return stripTerminalSequences(String(value ?? ""))
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "")
    .replace(/\t/g, "    ");
}
const identity = (text: string) => text;
const selectTheme = {
  selectedPrefix: identity, selectedText: identity, description: identity,
  scrollInfo: identity, noMatch: identity,
};
type Control = { key: string; node: ElementNode; widget?: Input | SelectList; signature: string };
type BodyHit = { key: string; part: "label" | "widget" | "button"; y: number; width: number; height: number };
type MouseHit = BodyHit & { top: number; bottom: number };

/** Pi owns terminal input, rendering, resizing and teardown. This is only a Component. */
export class OpenUIView implements Component, Focusable {
  focused = true;
  private controls: Control[] = [];
  private focusIndex = 0;
  private offset = 0;
  private followFocus = true;
  private closed = false;
  private positions = new Map<string, number>();
  private labelPositions = new Map<string, number>();
  private bodyLength = 0;
  private pageSize = 1;
  // Coordinates describe the last rendered screen, including scrolling and chrome.
  private mouseHits: MouseHit[] = [];
  private renderedWidth = 0;
  private renderedHeight = 0;
  private mouseGesture?: { hit: MouseHit; dragged: boolean; x: number; y: number };

  constructor(readonly model: DocumentModel, private readonly options: ViewOptions) {
    this.refresh();
  }

  /** Reconcile widgets so cursor and focus survive streamed updates and re-evaluation. */
  refresh(): void {
    if (this.closed) return;
    const old = new Map(this.controls.map(c => [c.key, c]));
    const focusedKey = this.controls[this.focusIndex]?.key;
    const next: Control[] = [];
    const walk = (node: ElementNode, path: string) => {
      if (node.typeName === "Stack") {
        (node.props.children as ElementNode[]).forEach((child, i) => walk(child, `${path}.${i}`));
        return;
      }
      if (!["Input", "Select", "Button"].includes(node.typeName)) return;
      const key = `${path}:${node.typeName}:${node.props.name ?? ""}`;
      const signature = JSON.stringify([node.props.options, node.props.placeholder]);
      let control = old.get(key);
      if (!control || control.signature !== signature) {
        control = { key, node, signature };
        if (node.typeName === "Input") {
          control.widget = new Input({ prompt: "  ", placeholder: safeText(node.props.placeholder) });
        } else if (node.typeName === "Select") {
          control.widget = new SelectList(
            (node.props.options as string[]).map(value => ({ value, label: safeText(value).replace(/\n/g, " ") })),
            5, selectTheme,
          );
        }
      }
      control.node = node;
      if (control.widget instanceof Input) {
        const value = safeText(this.model.fieldValue(node)).replace(/\n/g, " ");
        if (control.widget.getValue() !== value) control.widget.setValue(value);
      } else if (control.widget instanceof SelectList) {
        const index = (node.props.options as string[]).indexOf(this.model.fieldValue(node));
        control.widget.setSelectedIndex(Math.max(0, index));
      }
      next.push(control);
    };
    if (this.model.root) walk(this.model.root, "root");
    this.controls = next;
    const restored = next.findIndex(c => c.key === focusedKey);
    this.focusIndex = restored >= 0 ? restored : Math.min(this.focusIndex, Math.max(0, next.length - 1));
    this.invalidate();
    this.options.requestRender();
  }

  invalidate(): void {
    for (const control of this.controls) control.widget?.invalidate();
  }

  dispose(): void { this.closed = true; this.controls = []; this.mouseHits = []; this.mouseGesture = undefined; }

  private finish(result: UIResult): void {
    if (this.closed) return;
    this.closed = true;
    this.options.onDone(result);
  }

  handleInput(data: string): void {
    if (this.closed) return;
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
      this.finish({ status: "cancelled" });
      return;
    }
    if (matchesKey(data, "pageUp") || matchesKey(data, "pageDown")) {
      this.followFocus = false;
      this.offset += matchesKey(data, "pageUp") ? -this.pageSize : this.pageSize;
      this.options.requestRender();
      return;
    }
    if (this.model.streaming || !this.model.valid) return;
    if (matchesKey(data, "tab") || matchesKey(data, "shift+tab")) {
      this.moveFocus(matchesKey(data, "tab") ? 1 : -1);
      return;
    }
    const control = this.controls[this.focusIndex];
    if (!control) return;
    this.followFocus = true;
    if (control.node.typeName === "Button") {
      if (matchesKey(data, "enter") || matchesKey(data, "space")) {
        this.finish({ status: "submitted", action: String(control.node.props.action), state: this.model.state, values: this.model.formValues });
      } else if (matchesKey(data, "down") || matchesKey(data, "up")) {
        this.moveFocus(matchesKey(data, "down") ? 1 : -1);
      }
      return;
    }
    if (matchesKey(data, "enter")) {
      if (control.widget instanceof SelectList) {
        const item = control.widget.getSelectedItem();
        if (item) this.model.setField(control.node, item.value);
      }
      this.moveFocus(1);
    } else {
      control.widget?.handleInput(data);
      if (control.widget instanceof Input) {
        const value = safeText(control.widget.getValue()).replace(/\n/g, " ").slice(0, 4000);
        if (value !== control.widget.getValue()) control.widget.setValue(value);
        this.model.setField(control.node, value);
      } else if (control.widget instanceof SelectList) {
        const item = control.widget.getSelectedItem();
        if (item) this.model.setField(control.node, item.value);
      }
    }
    this.refresh();
  }

  private moveFocus(delta: number): void {
    const length = this.controls.length;
    this.focusIndex = length ? (this.focusIndex + delta + length) % length : 0;
    this.followFocus = true;
    this.options.requestRender();
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (this.closed) return undefined;
    const inside = event.x >= 0 && event.x < this.renderedWidth && event.y >= 0 && event.y < this.renderedHeight;
    const hit = inside ? this.mouseHits.find(region => event.x < region.width && event.y >= region.top && event.y < region.bottom) : undefined;
    if (event.type === "wheel") {
      if (!inside || !Number.isFinite(event.wheelDelta) || !event.wheelDelta) return undefined;
      this.mouseGesture = undefined;
      this.followFocus = false;
      const control = hit && this.controls.find(c => c.key === hit.key);
      if (hit?.part === "widget" && control?.widget instanceof SelectList && this.model.valid && !this.model.streaming) {
        const result = control.widget.handleMouse({ ...event, y: event.y - hit.y, width: hit.width, height: hit.height });
        if (result?.handled) {
          const item = control.widget.getSelectedItem();
          if (item) this.model.setField(control.node, item.value);
          this.refresh();
          return { handled: true, render: result.render };
        }
      }
      const before = this.offset;
      this.offset = Math.max(0, Math.min(this.offset + (Math.trunc(event.wheelDelta) || Math.sign(event.wheelDelta)), Math.max(0, this.bodyLength - this.pageSize)));
      if (this.offset !== before) this.options.requestRender();
      // Keep wheel events within this viewport instead of scrolling the host transcript.
      return { handled: true, render: this.offset !== before };
    }
    if (this.model.streaming || !this.model.valid || event.button !== "left" || event.shift || event.alt || event.ctrl) return undefined;
    if (event.type === "drag") {
      if (!this.mouseGesture) return undefined;
      this.mouseGesture.dragged = true;
      return { handled: true, render: false };
    }
    if (event.type === "release") {
      if (!this.mouseGesture) return undefined;
      if (event.x !== this.mouseGesture.x || event.y !== this.mouseGesture.y) this.mouseGesture.dragged = true;
      // Pi emits click after release. Preserve the press target until that click.
      return { handled: true, render: false };
    }
    if (event.type !== "press" && event.type !== "click") return undefined;
    if (event.type === "press") this.mouseGesture = undefined;
    const gesture = event.type === "click" ? this.mouseGesture : undefined;
    if (event.type === "click") this.mouseGesture = undefined;
    const target = gesture?.hit ?? hit;
    if (!target || gesture?.dragged || (gesture && (event.x !== gesture.x || event.y !== gesture.y))) return undefined;
    const index = this.controls.findIndex(c => c.key === target.key);
    const control = this.controls[index];
    if (!control) return undefined;
    if (event.type === "press") this.mouseGesture = { hit: { ...target }, dragged: false, x: event.x, y: event.y };
    this.focusIndex = index;
    // Mouse clicks operate on the displayed content; do not jump the viewport under the pointer.
    this.followFocus = false;
    if (target.part === "button" && event.type === "click") {
      this.finish({ status: "submitted", action: String(control.node.props.action), state: this.model.state, values: this.model.formValues });
      // done() may have removed this overlay; do not ask Pi to refocus a disposed view.
      return { handled: true, render: true };
    } else if (target.part === "widget" && control.widget) {
      const local = { ...event, y: event.y - target.y, width: target.width, height: target.height };
      // Native Input places its cursor on press. A standalone normalized click also works.
      if (control.widget instanceof Input && event.type === "click" && !gesture) local.type = "press";
      control.widget.handleMouse(local);
      if (control.widget instanceof SelectList) {
        const item = control.widget.getSelectedItem();
        if (item) this.model.setField(control.node, item.value);
        this.refresh();
      }
    }
    this.options.requestRender();
    return { handled: true, focus: true };
  }

  render(width: number): string[] {
    this.mouseHits = [];
    this.renderedWidth = this.renderedHeight = 0;
    if (this.closed || width <= 0) return [];
    width = Math.max(1, Math.floor(width));
    const height = Math.max(1, Math.floor(this.options.getHeight()));
    const lines: string[] = [];
    const hits: BodyHit[] = [];
    const text = (value: unknown, atWidth = width) => new Text(safeText(value), 0, 0).render(atWidth);
    this.positions.clear();
    this.labelPositions.clear();
    const walk = (node: ElementNode, path: string) => {
      const p = node.props;
      switch (node.typeName) {
        case "Stack":
          (p.children as ElementNode[]).forEach((child, i) => {
            if (i) lines.push("");
            walk(child, `${path}.${i}`);
          });
          break;
        case "Text": lines.push(...text(p.text)); break;
        case "Table": lines.push(...this.renderTable(p.columns as string[], p.rows as unknown[][], width)); break;
        default: {
          const key = `${path}:${node.typeName}:${p.name ?? ""}`;
          const index = this.controls.findIndex(c => c.key === key);
          const control = this.controls[index];
          if (!control) break;
          this.positions.set(key, lines.length);
          this.labelPositions.set(key, lines.length);
          const active = index === this.focusIndex && this.focused && !this.model.streaming && this.model.valid;
          const prefix = active ? "> " : "  ";
          if (node.typeName === "Button") {
            for (const line of text(`${prefix}[ ${safeText(p.label)} ]`)) {
              hits.push({ key, part: "button", y: lines.length, width: visibleWidth(line.trimEnd()), height: 1 });
              lines.push(line);
            }
          }
          else {
            for (const line of text(`${prefix}${safeText(p.label)}`)) {
              hits.push({ key, part: "label", y: lines.length, width: visibleWidth(line.trimEnd()), height: 1 });
              lines.push(line);
            }
            if (control.widget instanceof Input) {
              control.widget.focused = active;
              this.positions.set(key, lines.length);
              const rendered = control.widget.render(width);
              hits.push({ key, part: "widget", y: lines.length, width, height: rendered.length });
              lines.push(...rendered);
            } else if (control.widget instanceof SelectList) {
              const selectedIndex = (p.options as string[]).indexOf(control.widget.getSelectedItem()?.value ?? "");
              const startIndex = Math.max(0, Math.min(selectedIndex - 2, (p.options as string[]).length - 5));
              this.positions.set(key, lines.length + Math.max(0, selectedIndex - startIndex));
              const rendered = control.widget.render(width);
              hits.push({ key, part: "widget", y: lines.length, width, height: rendered.length });
              lines.push(...rendered);
            }
          }
        }
      }
    };
    if (this.model.root) walk(this.model.root, "root");
    if (!lines.length) lines.push(this.model.streaming ? "Waiting for OpenUI document…" : "No UI to display.");
    if (this.model.diagnostics.length) {
      lines.push(...text(`Document error: ${this.model.diagnostics.join("; ")}`));
    }
    this.bodyLength = lines.length;
    this.pageSize = height < 3 ? height : height - 2;
    if (this.followFocus) {
      const key = this.controls[this.focusIndex]?.key;
      const row = key ? this.positions.get(key) : undefined;
      if (row !== undefined) {
        // Follow the input cursor or selected option, even in a one-line viewport.
        const labelRow = this.labelPositions.get(key!) ?? row;
        if (labelRow < this.offset) this.offset = row - labelRow < this.pageSize ? labelRow : row;
        if (row >= this.offset + this.pageSize) this.offset = row + 1 - this.pageSize;
      }
    }
    this.offset = Math.max(0, Math.min(this.offset, Math.max(0, this.bodyLength - this.pageSize)));
    const title = `${safeText(this.options.title ?? "OpenUI")}${this.model.streaming ? " · receiving…" : ""}`;
    const hint = this.model.streaming ? "Esc: cancel · waiting for complete document" : "Tab/Shift+Tab: focus · ↑↓: select · Enter: activate · PgUp/PgDn: scroll · Esc: cancel";
    const body = lines.slice(this.offset, this.offset + this.pageSize);
    const visibleBodyLength = body.length;
    if (this.options.fillHeight) while (body.length < this.pageSize) body.push("");
    const result = height < 3 ? body : [title, ...body, hint];
    const bodyTop = height < 3 ? 0 : 1;
    const bodyBottom = bodyTop + visibleBodyLength;
    this.mouseHits = hits.map(hit => {
      const y = hit.y - this.offset + bodyTop;
      return { ...hit, y, width: Math.min(width, hit.width), top: Math.max(bodyTop, y), bottom: Math.min(bodyBottom, y + hit.height) };
    }).filter(hit => hit.top < hit.bottom && hit.width > 0);
    this.renderedWidth = width;
    this.renderedHeight = result.length;
    return result.map(line => truncateToWidth(line, width, ""));
  }

  private renderTable(columns: string[], rows: unknown[][], width: number): string[] {
    const lines: string[] = [];
    const n = columns.length;
    if (!n) return lines;
    // Narrow terminals use records to retain every column, rather than silently dropping data.
    if (width < n * 8) {
      rows.forEach((row, index) => {
        if (index) lines.push("");
        columns.forEach((column, col) => lines.push(...new Text(`${safeText(column)}: ${safeText(row[col])}`, 0, 0).render(width)));
      });
      if (!rows.length) lines.push(...new Text(columns.map(safeText).join(" · "), 0, 0).render(width));
      return lines;
    }
    const cellWidth = Math.max(1, Math.floor((width - (n - 1) * 3) / n));
    const rowLines = (cells: unknown[]) => {
      const wrapped = columns.map((_, i) => new Text(safeText(cells[i]), 0, 0).render(cellWidth));
      const count = Math.max(1, ...wrapped.map(c => c.length));
      for (let line = 0; line < count; line++) {
        lines.push(wrapped.map(cell => {
          const value = truncateToWidth(cell[line] ?? "", cellWidth, "");
          return value + " ".repeat(Math.max(0, cellWidth - visibleWidth(value)));
        }).join(" | "));
      }
    };
    rowLines(columns);
    lines.push(columns.map(() => "─".repeat(cellWidth)).join("─┼─"));
    rows.forEach(rowLines);
    if (!rows.length) lines.push("(no rows)");
    return lines;
  }
}
