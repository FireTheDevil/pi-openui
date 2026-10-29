import {
  Input, SelectList, Text, matchesKey, stripTerminalSequences,
  truncateToWidth, visibleWidth, type Component, type Focusable,
  type TuiMouseEvent, type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import type { ElementNode } from "@openuidev/lang-core";
import type { Theme, ThemeBg, ThemeColor } from "@earendil-works/pi-coding-agent";
import type { ActionSubmission, DocumentModel } from "./model.js";

export type UIResult =
  | ActionSubmission
  | { status: "cancelled" };

export interface ViewOptions {
  requestRender(): void;
  getHeight(): number;
  onDone(result: UIResult): void;
  title?: string;
  /** The host's live theme; presentation never supplies its own color palette. */
  theme?: Pick<Theme, "fg" | "bg" | "bold">;
  /** Fill a host fullscreen overlay without making blank rows interactive. */
  fillHeight?: boolean;
}

// Model-provided text is data, never terminal control sequences.
export function safeText(value: unknown): string {
  return stripTerminalSequences(String(value ?? ""))
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "")
    .replace(/\t/g, "    ");
}
type Control = { key: string; node: ElementNode; widget?: Input | SelectList; signature: string };
type BodyHit = { key: string; part: "label" | "widget" | "button"; x: number; y: number; width: number; height: number };
type MouseHit = BodyHit & { top: number; bottom: number };

/** Pi owns terminal input, rendering, resizing and teardown. This is only a Component. */
export class OpenUIView implements Component, Focusable {
  focused = true;
  private controls: Control[] = [];
  private focusIndex = 0;
  private offset = 0;
  private followFocus = true;
  private closed = false;
  private activating = false;
  private actionError?: { key: string; message: string };
  private positions = new Map<string, number>();
  private labelPositions = new Map<string, number>();
  private bodyLength = 0;
  private pageSize = 1;
  // Coordinates describe the last rendered screen, including scrolling and chrome.
  private mouseHits: MouseHit[] = [];
  private renderedWidth = 0;
  private renderedHeight = 0;
  private viewportSize?: { width: number; height: number };
  private mouseGesture?: { hit: MouseHit; dragged: boolean; x: number; y: number };

  constructor(readonly model: DocumentModel, private readonly options: ViewOptions) {
    this.refresh();
  }

  // Keep the host theme live, including inside retained native widgets. Model text
  // is sanitized before these trusted styling methods are applied.
  private fg(color: ThemeColor, text: string): string { return this.options.theme?.fg?.(color, text) ?? text; }
  private bg(color: ThemeBg, text: string): string { return this.options.theme?.bg?.(color, text) ?? text; }
  private bold(text: string): string { return this.options.theme?.bold?.(text) ?? text; }

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
          control.widget = new Input({
            // Pi 1.4 Input mouse positioning assumes its native two-column prompt.
            prompt: "  ", placeholder: safeText(node.props.placeholder).replace(/\n/g, " "),
            placeholderStyle: text => this.fg("muted", text),
          });
        } else if (node.typeName === "Select") {
          control.widget = new SelectList(
            // Native SelectList falls back to raw value when label is empty.
            // Keep even a control-only option's display label nonempty and safe.
            (node.props.options as string[]).map(value => ({ value, label: safeText(value).replace(/\n/g, " ") || "(empty)" })),
            5, {
              selectedPrefix: text => this.fg(this.model.streaming ? "dim" : "accent", text),
              selectedText: text => this.fg(this.model.streaming ? "dim" : "accent", this.bold(text)),
              description: text => this.fg("muted", text),
              scrollInfo: text => this.fg("dim", text),
              noMatch: text => this.fg("warning", text),
            },
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

  /** Keyboard and mouse share one action path; local actions keep this view open. */
  private activateButton(control: Control): void {
    if (this.closed || this.activating || this.model.streaming || !this.model.valid) return;
    this.activating = true;
    this.actionError = undefined;
    try {
      const result = this.model.activate(control.node);
      if (result.status === "submitted") {
        this.finish(result);
        return;
      }
      if (result.status === "error") this.actionError = { key: control.key, message: result.error };
    } catch (error) {
      this.actionError = { key: control.key, message: error instanceof Error ? error.message : String(error) };
    } finally {
      this.activating = false;
    }
    this.refresh();
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
        this.activateButton(control);
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
        this.actionError = undefined;
      } else if (control.widget instanceof SelectList) {
        const item = control.widget.getSelectedItem();
        if (item) this.model.setField(control.node, item.value);
        this.actionError = undefined;
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
    const hit = inside ? this.mouseHits.find(region => event.x >= region.x && event.x < region.x + region.width && event.y >= region.top && event.y < region.bottom) : undefined;
    if (event.type === "wheel") {
      if (!inside || !Number.isFinite(event.wheelDelta) || !event.wheelDelta) return undefined;
      this.mouseGesture = undefined;
      this.followFocus = false;
      const control = hit && this.controls.find(c => c.key === hit.key);
      if (hit?.part === "widget" && control?.widget instanceof SelectList && this.model.valid && !this.model.streaming) {
        const result = control.widget.handleMouse({ ...event, x: event.x - hit.x, y: event.y - hit.y, width: hit.width, height: hit.height });
        if (result?.handled) {
          const item = control.widget.getSelectedItem();
          if (item) this.model.setField(control.node, item.value);
          this.actionError = undefined;
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
      this.activateButton(control);
      // done() may have removed this overlay; do not ask Pi to refocus a disposed view.
      return this.closed ? { handled: true, render: true } : { handled: true, render: true, focus: true };
    } else if (target.part === "widget" && control.widget) {
      const local = { ...event, x: event.x - target.x, y: event.y - target.y, width: target.width, height: target.height };
      // Native Input places its cursor on press. A standalone normalized click also works.
      if (control.widget instanceof Input && event.type === "click" && !gesture) local.type = "press";
      control.widget.handleMouse(local);
      if (control.widget instanceof SelectList) {
        const item = control.widget.getSelectedItem();
        if (item) this.model.setField(control.node, item.value);
        this.actionError = undefined;
        this.refresh();
      }
    }
    this.options.requestRender();
    return { handled: true, focus: true };
  }

  render(width: number): string[] {
    this.mouseHits = [];
    this.renderedWidth = this.renderedHeight = 0;
    if (this.closed || width <= 0) {
      if (this.mouseGesture) this.mouseGesture.dragged = true;
      return [];
    }
    width = Math.max(1, Math.floor(width));
    const height = Math.max(1, Math.floor(this.options.getHeight()));
    if (this.mouseGesture && (this.viewportSize?.width !== width || this.viewportSize?.height !== height)) {
      // A release at the old coordinates must not activate a moved control.
      this.mouseGesture.dragged = true;
    }
    this.viewportSize = { width, height };
    // Keep full-screen ownership, but give the content a comfortable reading width.
    const contentWidth = width >= 40 ? Math.min(96, width - 4) : width;
    const contentLeft = Math.floor((width - contentWidth) / 2);
    const lines: string[] = [];
    const hits: BodyHit[] = [];
    const text = (value: unknown, atWidth = contentWidth) => new Text(safeText(value), 0, 0).render(atWidth);
    const pad = (line: string, atWidth: number) => line + " ".repeat(Math.max(0, atWidth - visibleWidth(line)));
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
        case "Text": lines.push(...text(p.text).map(line => this.fg("text", line))); break;
        case "Table": lines.push(...this.renderTable(p.columns as string[], p.rows as unknown[][], contentWidth)); break;
        default: {
          const key = `${path}:${node.typeName}:${p.name ?? ""}`;
          const index = this.controls.findIndex(c => c.key === key);
          const control = this.controls[index];
          if (!control) break;
          this.positions.set(key, lines.length);
          this.labelPositions.set(key, lines.length);
          const enabled = !this.model.streaming && this.model.valid;
          const active = index === this.focusIndex && this.focused && enabled;
          const prefix = active ? "> " : "  ";
          if (node.typeName === "Button") {
            for (const line of text(`${prefix}[ ${safeText(p.label)} ]`)) {
              hits.push({ key, part: "button", x: 0, y: lines.length, width: visibleWidth(line.trimEnd()), height: 1 });
              const button = line.trimEnd();
              const styled = this.fg(enabled ? "accent" : "dim", active ? this.bold(button) : button);
              lines.push(active ? this.bg("selectedBg", styled) : styled);
            }
            if (this.actionError?.key === key) lines.push(...text(`Action error: ${this.actionError.message}`).map(line => this.fg("error", line)));
          } else {
            for (const line of text(`${prefix}${safeText(p.label)}`)) {
              hits.push({ key, part: "label", x: 0, y: lines.length, width: visibleWidth(line.trimEnd()), height: 1 });
              lines.push(this.fg(!enabled ? "dim" : active ? "accent" : "text", this.bold(line)));
            }
            if (control.widget instanceof Input) {
              control.widget.focused = active;
              this.positions.set(key, lines.length);
              const framed = contentWidth >= 20;
              const inputWidth = contentWidth - (framed ? 2 : 0);
              const rendered = control.widget.render(inputWidth);
              hits.push({ key, part: "widget", x: 0, y: lines.length, width: inputWidth, height: rendered.length });
              for (let line of rendered) {
                // Native Input draws a fake cursor even when unfocused. Preserve
                // its scroll window, but only the active input shows that cursor.
                if (!active) line = stripTerminalSequences(line);
                // The frame decorates the native prompt; its two columns remain
                // inside the widget's coordinate system for cursor placement.
                const value = this.fg(!enabled ? "dim" : control.widget.getValue() ? "text" : "muted", framed ? line.slice(2) : line);
                if (framed) {
                  const border = active ? "borderAccent" : "borderMuted";
                  lines.push(this.fg(border, "│ ") + (active ? this.bg("selectedBg", value) : value) + this.fg(border, " │"));
                } else lines.push(value);
              }
            } else if (control.widget instanceof SelectList) {
              const selectedIndex = (p.options as string[]).indexOf(control.widget.getSelectedItem()?.value ?? "");
              const startIndex = Math.max(0, Math.min(selectedIndex - 2, (p.options as string[]).length - 5));
              const selectedRow = Math.max(0, selectedIndex - startIndex);
              this.positions.set(key, lines.length + selectedRow);
              const rendered = control.widget.render(contentWidth);
              hits.push({ key, part: "widget", x: 0, y: lines.length, width: contentWidth, height: rendered.length });
              const selectionWidth = Math.min(contentWidth, Math.max(16, ...(p.options as string[]).map(option => visibleWidth(safeText(option).replace(/\n/g, " ")) + 4)));
              lines.push(...rendered.map((line, row) => active && row === selectedRow
                ? this.bg("selectedBg", pad(line, selectionWidth))
                : this.fg(enabled ? "text" : "dim", line)));
            }
          }
        }
      }
    };
    if (this.model.root) walk(this.model.root, "root");
    if (!lines.length) lines.push(this.fg("muted", this.model.streaming ? "Waiting for OpenUI document…" : "No UI to display."));
    if (this.model.diagnostics.length) {
      lines.push(...text(`Document error: ${this.model.diagnostics.join("; ")}`).map(line => this.fg("error", line)));
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
    const titleText = safeText(this.options.title ?? "OpenUI").replace(/\n/g, " ");
    const status = this.model.streaming ? " · receiving…" : "";
    const title = this.fg("accent", this.bold(truncateToWidth(titleText, contentWidth, ""))) + this.fg("warning", status);
    const ruleWidth = Math.max(0, contentWidth - visibleWidth(title) - 2);
    const heading = title + (ruleWidth ? "  " + this.fg("borderMuted", "─".repeat(ruleWidth)) : "");
    const current = this.controls[this.focusIndex]?.node.typeName;
    const actionHint = current === "Input" ? "type to edit" : current === "Select" ? "↑↓ choose · Enter next" : current === "Button" ? "Enter/Space activate" : "PgUp/PgDn scroll";
    const fullHint = `Tab/Shift+Tab focus · ${actionHint} · Esc cancel${this.bodyLength > this.pageSize && current ? " · PgUp/PgDn scroll" : ""}`;
    const hints = this.actionError ? ["Action failed · edit or retry · Esc cancel", "Action failed · Esc cancel"]
      : this.model.streaming ? ["Receiving… · waiting for complete document · Esc cancel", "Receiving… · Esc cancel"]
      : !this.model.valid ? ["Check document · Esc cancel"]
      : [fullHint, `Tab focus · ${actionHint} · Esc cancel`, "Tab next · Enter activate · Esc cancel", "Tab next · Esc cancel"];
    const hint = [...hints, "Esc cancel"].find(value => visibleWidth(value) <= contentWidth) ?? "Esc";
    const footer = this.fg(this.actionError ? "error" : "muted", hint);
    const body = lines.slice(this.offset, this.offset + this.pageSize);
    const visibleBodyLength = body.length;
    if (this.options.fillHeight) while (body.length < this.pageSize) body.push("");
    const result = height < 3 ? body : [heading, ...body, footer];
    const bodyTop = height < 3 ? 0 : 1;
    const bodyBottom = bodyTop + visibleBodyLength;
    this.mouseHits = hits.map(hit => {
      const y = hit.y - this.offset + bodyTop;
      return { ...hit, x: hit.x + contentLeft, y, width: Math.min(contentWidth - hit.x, hit.width), top: Math.max(bodyTop, y), bottom: Math.min(bodyBottom, y + hit.height) };
    }).filter(hit => hit.top < hit.bottom && hit.width > 0);
    this.renderedWidth = width;
    this.renderedHeight = result.length;
    return result.map(line => " ".repeat(contentLeft) + truncateToWidth(line, contentWidth, ""));
  }

  private renderTable(columns: string[], rows: unknown[][], width: number): string[] {
    const lines: string[] = [];
    const n = columns.length;
    if (!n) return lines;
    // Narrow terminals use records to retain every column, rather than silently dropping data.
    if (width < n * 8) {
      rows.forEach((row, index) => {
        if (index) lines.push("");
        columns.forEach((column, col) => {
          const label = this.fg("accent", this.bold(safeText(column) + ":"));
          const value = this.fg("text", safeText(row[col]));
          lines.push(...new Text(`${label} ${value}`, 0, 0).render(width));
        });
      });
      if (!rows.length) lines.push(...new Text(this.fg("accent", this.bold(columns.map(safeText).join(" · "))), 0, 0).render(width));
      return lines;
    }
    // Fit columns to their content, shrinking the widest ones when necessary.
    // Short labels no longer consume half of a wide terminal.
    const available = width - (n - 1) * 3;
    const widths = columns.map((column, i) => {
      let widest = 4;
      for (const value of [column, ...rows.map(row => row[i])]) {
        for (const line of safeText(value).split("\n")) widest = Math.max(widest, Math.min(48, visibleWidth(line)));
      }
      return widest;
    });
    while (widths.reduce((sum, value) => sum + value, 0) > available) {
      const widest = widths.indexOf(Math.max(...widths));
      widths[widest]--;
    }
    const rowLines = (cells: unknown[], header = false) => {
      const wrapped = columns.map((_, i) => new Text(safeText(cells[i]), 0, 0).render(widths[i]));
      const count = Math.max(1, ...wrapped.map(c => c.length));
      for (let line = 0; line < count; line++) {
        lines.push(wrapped.map((cell, i) => {
          const value = truncateToWidth(cell[line] ?? "", widths[i], "");
          const padded = value + " ".repeat(Math.max(0, widths[i] - visibleWidth(value)));
          return this.fg(header ? "accent" : "text", header ? this.bold(padded) : padded);
        }).join(this.fg("borderMuted", " │ ")));
      }
    };
    rowLines(columns, true);
    lines.push(this.fg("borderMuted", widths.map(cellWidth => "─".repeat(cellWidth)).join("─┼─")));
    rows.forEach(row => rowLines(row));
    if (!rows.length) lines.push(this.fg("muted", "(no rows)"));
    return lines;
  }
}
