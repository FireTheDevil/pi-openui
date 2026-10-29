import {
  CURSOR_MARKER, Editor, Input, SelectList, Text, matchesKey, stripTerminalSequences,
  truncateToWidth, visibleWidth, type TUI, type TuiMouseEvent, type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import type { ThemeBg, ThemeColor } from "@earendil-works/pi-coding-agent";
import type { ElementNode } from "@openuidev/lang-core";
import { fieldOptions, limits, optionItems, type FieldValue, type NormalizedOption, type TreeNode } from "./catalog.js";
import type { DocumentModel } from "./model.js";
import { safeText } from "./presentation.js";

export interface ControlStyle {
  fg(color: ThemeColor, text: string): string;
  bg(color: ThemeBg, text: string): string;
  bold(text: string): string;
  requestRender?(): void;
  getHeight?(): number;
}
export interface ControlInputResult { handled: boolean; changed?: boolean; advance?: boolean; }
export interface FieldControl {
  node: ElementNode;
  readonly native?: Input | SelectList | Editor;
  readonly error?: string;
  update(node: ElementNode, resetDraft?: boolean): void;
  render(width: number, focused: boolean): string[];
  handleInput(data: string): ControlInputResult;
  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined;
  invalidate(): void;
  focusRow(): number;
}
const single = (value: unknown) => safeText(value).replace(/\n/g, " ");
const label = (value: unknown) => single(value) || "(empty)";
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round = (value: number) => Number(value.toPrecision(14));
const primaryClick = (event: TuiMouseEvent) => event.button === "left" && !event.shift && !event.alt && !event.ctrl && event.type === "click";
const navigation = (data: string) => matchesKey(data, "pageUp") || matchesKey(data, "pageDown");

abstract class BaseControl implements FieldControl {
  native?: Input | SelectList | Editor;
  error?: string;
  protected width = 0;
  protected focused = false;
  protected row = 0;
  constructor(public node: ElementNode, protected model: DocumentModel, protected style: ControlStyle) {}
  protected get enabled() { return this.model.valid && !this.model.streaming && !this.model.isDisabled(this.node); }
  protected get value(): FieldValue { return this.model.fieldValue(this.node); }
  protected commit(value: FieldValue): boolean {
    const before = JSON.stringify(this.value);
    this.model.setField(this.node, value);
    return JSON.stringify(this.value) !== before;
  }
  update(node: ElementNode, _resetDraft = false): void { this.node = node; }
  protected start(width: number, focused: boolean): boolean {
    this.width = Math.max(0, Math.floor(width));
    this.focused = focused && this.enabled;
    return this.width > 0;
  }
  protected fit(lines: string[]): string[] { return lines.map(line => truncateToWidth(line, this.width, "")); }
  protected color(text: string, active = false): string { return this.style.fg(!this.enabled ? "dim" : active ? "accent" : "text", text); }
  protected selected(text: string, active: boolean): string {
    const line = this.color(active ? this.style.bold(text) : text, active);
    return active && this.focused ? this.style.bg("selectedBg", line) : line;
  }
  abstract render(width: number, focused: boolean): string[];
  abstract handleInput(data: string): ControlInputResult;
  handleMouse(_event: TuiMouseEvent): TuiMouseEventResult | undefined { return undefined; }
  invalidate(): void { this.native?.invalidate(); }
  focusRow(): number { return this.row; }
}

class StringControl extends BaseControl {
  declare native: Input;
  protected last = "";
  private placeholder = "";
  private inputWidth = 0;
  private pressed?: { x: number; y: number };
  constructor(node: ElementNode, model: DocumentModel, style: ControlStyle) {
    super(node, model, style);
    this.native = this.makeInput();
    this.sync(true);
  }
  private makeInput(): Input {
    this.placeholder = single(this.node.props.placeholder);
    return new Input({ prompt: "  ", placeholder: this.placeholder, placeholderStyle: value => this.style.fg("muted", value) });
  }
  protected sync(force = false): void {
    const value = String(this.value ?? "");
    if (force || value !== this.last) {
      this.last = value;
      this.native.setValue(single(value));
      this.error = undefined;
    }
  }
  update(node: ElementNode, resetDraft = false): void {
    super.update(node);
    if (this.placeholder !== single(node.props.placeholder)) { this.native = this.makeInput(); resetDraft = true; }
    this.sync(resetDraft);
  }
  render(width: number, focused: boolean): string[] {
    if (!this.start(width, focused)) return [];
    this.sync();
    this.native.focused = this.focused;
    const framed = this.width >= 20;
    this.inputWidth = this.width - (framed ? 2 : 0);
    this.row = 0;
    const border = this.focused ? "borderAccent" : "borderMuted";
    return this.fit(this.native.render(this.inputWidth).map(line => {
      if (!this.focused) line = stripTerminalSequences(line);
      const value = this.style.fg(!this.enabled ? "dim" : this.native.getValue() ? "text" : "muted", framed ? line.slice(2) : line);
      return framed ? this.style.fg(border, "│ ") + (this.focused ? this.style.bg("selectedBg", value) : value) + this.style.fg(border, " │") : value;
    }));
  }
  protected afterEdit(): boolean {
    const value = single(this.native.getValue()).slice(0, limits.text);
    if (value !== this.native.getValue()) this.native.setValue(value);
    const changed = this.commit(value);
    if (this.value !== value) this.sync(true);
    else this.last = value;
    return changed;
  }
  handleInput(data: string): ControlInputResult {
    if (!this.enabled || navigation(data)) return { handled: false };
    if (matchesKey(data, "enter")) return { handled: true, advance: true };
    this.native.handleInput(data);
    return { handled: true, changed: this.afterEdit() };
  }
  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (!this.enabled || event.x < 0 || event.x >= this.inputWidth || event.y !== 0) return undefined;
    if (event.button !== "left" || event.shift || event.alt || event.ctrl) return undefined;
    if (event.type === "press") this.pressed = { x: event.x, y: event.y };
    if (event.type === "click") {
      const pressed = this.pressed;
      this.pressed = undefined;
      // A redraw after press may recenter the native input scroll window.
      // Applying the same screen coordinates again would move its cursor twice.
      if (pressed?.x === event.x && pressed.y === event.y) return { handled: true, focus: true };
    }
    return this.native.handleMouse({ ...event, type: event.type === "click" ? "press" : event.type, width: this.inputWidth, height: 1 });
  }
}

class NumberControl extends StringControl {
  protected afterEdit(): boolean {
    const draft = single(this.native.getValue()).slice(0, 100);
    if (draft !== this.native.getValue()) this.native.setValue(draft);
    const number = Number(draft);
    if (!draft.trim() || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(draft.trim()) || !Number.isFinite(number)) {
      this.error = "Enter a finite number.";
      return false;
    }
    this.error = undefined;
    const changed = this.commit(number);
    if (this.value !== number) this.sync(true);
    else this.last = String(number);
    return changed;
  }
  handleInput(data: string): ControlInputResult {
    if (!this.enabled || navigation(data)) return { handled: false };
    if (matchesKey(data, "up") || matchesKey(data, "down")) {
      const settings = fieldOptions(this.node);
      const delta = matchesKey(data, "up") ? 1 : -1;
      const value = round(clamp(Number(this.value) + delta * (settings.step ?? 1), settings.min ?? -Number.MAX_VALUE, settings.max ?? Number.MAX_VALUE));
      const changed = this.commit(value);
      this.sync(true);
      return { handled: true, changed };
    }
    if (matchesKey(data, "enter")) return { handled: true, advance: !this.error };
    return super.handleInput(data);
  }
}

class SelectControl extends BaseControl {
  declare native: SelectList;
  private options: NormalizedOption[] = [];
  private signature = "";
  private selectedIndex = 0;
  private startIndex = 0;
  private pressed?: { x: number; y: number; native: SelectList };
  constructor(node: ElementNode, model: DocumentModel, style: ControlStyle) {
    super(node, model, style);
    this.native = this.makeList();
    this.sync();
  }
  private makeList(): SelectList {
    this.options = optionItems(this.node);
    this.signature = JSON.stringify(this.options);
    return new SelectList(this.options.map(item => ({ value: item.value, label: label(item.label), description: item.description ? single(item.description) : undefined })), 5, {
      selectedPrefix: text => this.style.fg(this.enabled ? "accent" : "dim", text),
      selectedText: text => this.style.fg(this.enabled ? "accent" : "dim", this.style.bold(text)),
      description: text => this.style.fg("muted", text), scrollInfo: text => this.style.fg("dim", text), noMatch: text => this.style.fg("warning", text),
    });
  }
  private sync(): void {
    const options = optionItems(this.node);
    if (JSON.stringify(options) !== this.signature) this.native = this.makeList();
    this.selectedIndex = Math.max(0, this.options.findIndex(item => item.value === this.value));
    this.native.setSelectedIndex(this.selectedIndex);
  }
  update(node: ElementNode): void { super.update(node); this.sync(); }
  render(width: number, focused: boolean): string[] {
    if (!this.start(width, focused)) return [];
    this.sync();
    this.startIndex = Math.max(0, Math.min(this.selectedIndex - 2, this.options.length - 5));
    this.row = this.selectedIndex - this.startIndex;
    const selectionWidth = Math.min(this.width, Math.max(16, ...this.options.map(item => visibleWidth(label(item.label)) + 4)));
    const lines = this.native.render(this.width).map((line, row) => {
      if (this.options[this.startIndex + row]?.disabled) return this.style.fg("dim", stripTerminalSequences(line));
      if (this.focused && row === this.row) return this.style.bg("selectedBg", line + " ".repeat(Math.max(0, selectionWidth - visibleWidth(line))));
      return this.color(line);
    });
    const description = this.options[this.selectedIndex]?.description;
    if (description && this.width <= 40) lines.push(...new Text(this.style.fg("muted", safeText(description)), 0, 0).render(this.width));
    return this.fit(lines);
  }
  handleInput(data: string): ControlInputResult {
    if (!this.enabled || navigation(data)) return { handled: false };
    if (matchesKey(data, "enter")) return { handled: true, advance: true };
    const delta = matchesKey(data, "up") ? -1 : matchesKey(data, "down") ? 1 : 0;
    if (!delta) return { handled: false };
    for (let distance = 1; distance <= this.options.length; distance++) {
      const index = (this.selectedIndex + delta * distance + this.options.length) % this.options.length;
      if (!this.options[index].disabled) {
        const changed = this.commit(this.options[index].value);
        this.sync();
        return { handled: true, changed };
      }
    }
    return { handled: true };
  }
  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (!this.enabled) return undefined;
    if (event.type === "wheel") {
      const result = this.handleInput(event.wheelDelta && event.wheelDelta < 0 ? "\x1b[A" : "\x1b[B");
      return { handled: true, render: !!result.changed };
    }
    if (event.button !== "left" || event.shift || event.alt || event.ctrl) return undefined;
    if (event.type === "click") {
      const pressed = this.pressed;
      this.pressed = undefined;
      if (pressed?.x === event.x && pressed.y === event.y) {
        // Press already selected the value. Reactive labels can rebuild the
        // list before click, and its recentered row may now be another item.
        if (pressed.native === this.native) this.native.handleMouse({ ...event, width: this.width, height: Math.min(5, this.options.length) });
        this.sync();
        return { handled: true, focus: true };
      }
    }
    const index = this.startIndex + event.y;
    if (index < 0 || index >= this.options.length || event.y >= 5 || this.options[index].disabled) return undefined;
    if (event.type === "press") this.pressed = { x: event.x, y: event.y, native: this.native };
    const result = this.native.handleMouse({ ...event, width: this.width, height: Math.min(5, this.options.length) });
    if (result?.handled) {
      const selected = this.native.getSelectedItem();
      if (selected && !this.options.find(item => item.value === selected.value)?.disabled) this.commit(selected.value);
      this.sync();
    }
    return result;
  }
}

class BooleanControl extends BaseControl {
  render(width: number, focused: boolean): string[] {
    if (!this.start(width, focused)) return [];
    const checked = this.value === true;
    const value = this.node.typeName === "Toggle" ? (checked ? "● ON" : "○ OFF") : (checked ? "[x] Checked" : "[ ] Unchecked");
    return this.fit([this.selected(`  ${value}`, this.focused)]);
  }
  handleInput(data: string): ControlInputResult {
    if (!this.enabled || !(matchesKey(data, "space") || matchesKey(data, "enter"))) return { handled: false };
    return { handled: true, changed: this.commit(this.value !== true) };
  }
  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (!this.enabled || !primaryClick(event) || event.y !== 0) return undefined;
    this.commit(this.value !== true);
    return { handled: true, render: true, focus: true };
  }
}

class MultiControl extends BaseControl {
  private cursor = 0;
  private startIndex = 0;
  private items: NormalizedOption[] = [];
  constructor(node: ElementNode, model: DocumentModel, style: ControlStyle) {
    super(node, model, style);
    this.items = optionItems(node);
    this.cursor = Math.max(0, this.items.findIndex(item => Array.isArray(this.value) && this.value.includes(item.value)));
  }
  update(node: ElementNode): void { super.update(node); this.items = optionItems(node); this.cursor = clamp(this.cursor, 0, Math.max(0, this.items.length - 1)); }
  private toggle(index: number): boolean {
    const item = this.items[index];
    if (!item || item.disabled) return false;
    const selected = Array.isArray(this.value) ? [...this.value] : [];
    return this.commit(selected.includes(item.value) ? selected.filter(value => value !== item.value) : [...selected, item.value]);
  }
  render(width: number, focused: boolean): string[] {
    if (!this.start(width, focused)) return [];
    this.startIndex = clamp(this.cursor - 3, 0, Math.max(0, this.items.length - 7));
    this.row = this.cursor - this.startIndex;
    const selected = Array.isArray(this.value) ? this.value : [];
    const lines = this.items.slice(this.startIndex, this.startIndex + 7).map((item, index) => {
      const active = this.cursor === index + this.startIndex;
      const line = `${active && this.focused ? "> " : "  "}[${selected.includes(item.value) ? "x" : " "}] ${label(item.label)}`;
      return item.disabled ? this.style.fg("dim", line) : this.selected(line, active);
    });
    if (this.items.length > 7) lines.push(this.style.fg("dim", `  ${this.cursor + 1}/${this.items.length} · ${selected.length} selected`));
    const description = this.items[this.cursor]?.description;
    if (description) lines.push(...new Text(this.style.fg("muted", safeText(description)), 0, 0).render(this.width));
    return this.fit(lines);
  }
  handleInput(data: string): ControlInputResult {
    if (!this.enabled || navigation(data)) return { handled: false };
    if (matchesKey(data, "enter")) return { handled: true, advance: true };
    if (matchesKey(data, "space")) return { handled: true, changed: this.toggle(this.cursor) };
    const delta = matchesKey(data, "up") ? -1 : matchesKey(data, "down") ? 1 : 0;
    if (!delta) return { handled: false };
    for (let index = this.cursor + delta; index >= 0 && index < this.items.length; index += delta) {
      if (!this.items[index].disabled) { this.cursor = index; break; }
    }
    return { handled: true };
  }
  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (!this.enabled) return undefined;
    if (event.type === "wheel") { this.handleInput(event.wheelDelta && event.wheelDelta < 0 ? "\x1b[A" : "\x1b[B"); return { handled: true, render: true }; }
    if (!primaryClick(event) || event.y < 0 || event.y >= 7) return undefined;
    const index = this.startIndex + event.y;
    if (!this.items[index] || this.items[index].disabled) return undefined;
    this.cursor = index;
    this.toggle(index);
    return { handled: true, render: true, focus: true };
  }
}

class MultilineControl extends BaseControl {
  declare native: Editor;
  private last = "";
  constructor(node: ElementNode, model: DocumentModel, style: ControlStyle) {
    super(node, model, style);
    const owner = this;
    // Native Editor needs only a viewport size and the host's redraw callback.
    // This port shares Pi's rendering loop; it does not construct a TUI.
    const port = { terminal: { get rows() { return Math.ceil((fieldOptions(owner.node).rows ?? 5) / 0.3); } }, requestRender: () => style.requestRender?.() } as unknown as TUI;
    this.native = new Editor(port, {
      borderColor: text => this.style.fg(this.focused ? "borderAccent" : "borderMuted", text),
      selectList: { selectedPrefix: text => this.style.fg("accent", text), selectedText: text => this.style.fg("accent", text), description: text => this.style.fg("muted", text), scrollInfo: text => this.style.fg("dim", text), noMatch: text => this.style.fg("warning", text) },
    }, { paddingX: 2 });
    this.native.disableSubmit = true;
    this.sync(true);
  }
  private sync(force = false): void {
    const value = typeof this.value === "string" ? this.value : "";
    if (force || value !== this.last) { this.last = value; this.native.setText(safeText(value)); }
  }
  update(node: ElementNode, resetDraft = false): void { super.update(node); this.sync(resetDraft); }
  render(width: number, focused: boolean): string[] {
    if (!this.start(width, focused)) return [];
    this.sync();
    this.native.focused = this.focused;
    const lines = this.native.render(this.width);
    this.row = Math.max(1, lines.findIndex(line => line.includes(CURSOR_MARKER)));
    if (!this.focused && !this.native.getText() && this.node.props.placeholder) {
      const inset = Math.min(2, Math.max(0, Math.floor((this.width - 1) / 2)));
      lines[1] = " ".repeat(inset) + this.style.fg("muted", single(this.node.props.placeholder));
    }
    return this.fit(lines.map((line, index) => {
      if (!this.focused) {
        if (index !== 0 && index !== lines.length - 1) {
          const placeholder = !this.native.getText() && this.node.props.placeholder && index === 1;
          line = this.style.fg(!this.enabled ? "dim" : placeholder ? "muted" : "text", stripTerminalSequences(line));
        }
      }
      return line;
    }));
  }
  handleInput(data: string): ControlInputResult {
    if (!this.enabled) return { handled: false };
    if (matchesKey(data, "ctrl+enter")) return { handled: true, advance: true };
    this.native.handleInput(matchesKey(data, "enter") ? "\n" : data);
    const raw = this.native.getExpandedText();
    const value = safeText(raw).slice(0, limits.text);
    // Expand Pi's large-paste markers inside a form: the stored value and the
    // editable multiline contents must remain the same document.
    if (raw !== value || this.native.getText() !== value) this.native.setText(value);
    const changed = this.commit(value);
    if (this.value !== value) this.sync(true);
    else this.last = value;
    return { handled: true, changed };
  }
  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (!this.enabled || event.shift || event.alt || event.ctrl) return undefined;
    return this.native.handleMouse({ ...event, width: this.width });
  }
}

class SliderControl extends BaseControl {
  private barWidth = 0;
  private get min() { return Number(this.node.props.min); }
  private get max() { return Number(this.node.props.max); }
  private get step() { return Number(this.node.props.step ?? 1); }
  private choose(value: number): boolean { return this.commit(round(clamp(value, this.min, this.max))); }
  render(width: number, focused: boolean): string[] {
    if (!this.start(width, focused)) return [];
    this.barWidth = Math.max(1, this.width - 4);
    const span = this.max - this.min;
    const position = Math.round(clamp(span ? (Number(this.value) - this.min) / span : 0, 0, 1) * (this.barWidth - 1));
    const bar = "━".repeat(position) + "●" + "─".repeat(Math.max(0, this.barWidth - position - 1));
    this.row = 1;
    return this.fit([this.color(`  ${this.value}  (${this.min} – ${this.max})`, this.focused), this.color(`  ${bar}  `, this.focused)]);
  }
  handleInput(data: string): ControlInputResult {
    if (!this.enabled || navigation(data)) return { handled: false };
    if (matchesKey(data, "enter")) return { handled: true, advance: true };
    const delta = matchesKey(data, "left") || matchesKey(data, "down") ? -1 : matchesKey(data, "right") || matchesKey(data, "up") ? 1 : 0;
    if (delta) return { handled: true, changed: this.choose(Number(this.value) + delta * this.step) };
    if (matchesKey(data, "home")) return { handled: true, changed: this.choose(this.min) };
    if (matchesKey(data, "end")) return { handled: true, changed: this.choose(this.max) };
    return { handled: false };
  }
  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (!this.enabled || !primaryClick(event) || event.y !== 1) return undefined;
    const portion = this.barWidth <= 1 ? 0 : clamp((event.x - 2) / (this.barWidth - 1), 0, 1);
    this.choose(portion === 1 ? this.max : this.min + Math.round((portion * (this.max - this.min)) / this.step) * this.step);
    return { handled: true, render: true, focus: true };
  }
}

const iso = (date: Date) => date.toISOString().slice(0, 10);
function parseDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && iso(date) === value ? date : undefined;
}
class DateControl extends BaseControl {
  private date = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  private last = "";
  private cells: Array<{ x: number; y: number; width: number; value: string }> = [];
  private monthNextX = 0;
  constructor(node: ElementNode, model: DocumentModel, style: ControlStyle) { super(node, model, style); this.sync(); }
  private sync(): void {
    const value = String(this.value);
    if (value !== this.last) { this.last = value; this.date = parseDate(value) ?? this.date; }
    if (!parseDate(value)) {
      const options = fieldOptions(this.node);
      if (options.minDate && iso(this.date) < options.minDate) this.date = parseDate(options.minDate) ?? this.date;
      if (options.maxDate && iso(this.date) > options.maxDate) this.date = parseDate(options.maxDate) ?? this.date;
    }
  }
  update(node: ElementNode): void { super.update(node); this.sync(); }
  private permitted(value: string): boolean {
    const options = fieldOptions(this.node);
    return (!options.minDate || value >= options.minDate) && (!options.maxDate || value <= options.maxDate);
  }
  private choose(date: Date): boolean {
    if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) return false;
    let value = iso(date);
    const settings = fieldOptions(this.node);
    if (settings.minDate && value < settings.minDate) value = settings.minDate;
    if (settings.maxDate && value > settings.maxDate) value = settings.maxDate;
    const bounded = parseDate(value);
    if (!bounded) return false;
    this.date = bounded;
    const changed = this.commit(value);
    this.last = String(this.value);
    return changed;
  }
  private shiftMonth(delta: number): boolean {
    const date = new Date(this.date);
    const day = date.getUTCDate();
    date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + delta);
    const last = new Date(date); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
    date.setUTCDate(Math.min(day, last.getUTCDate()));
    return this.choose(date);
  }
  render(width: number, focused: boolean): string[] {
    if (!this.start(width, focused)) return [];
    this.sync(); this.cells = [];
    const month = this.date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    if (this.width < 21) {
      this.row = 1;
      return this.fit([this.color(month, this.focused), this.selected(`  ${single(this.value) || "Choose a date"}`, this.focused), this.style.fg("dim", "←→ day · PgUp/PgDn month")]);
    }
    const cellWidth = Math.min(5, Math.floor(this.width / 7));
    const title = `‹ ${month} ›`;
    this.monthNextX = visibleWidth(title) - 1;
    const lines = [this.color(title, this.focused), this.style.fg("muted", ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(day => day.padStart(cellWidth - 1).padEnd(cellWidth)).join(""))];
    const first = new Date(this.date); first.setUTCDate(1);
    const last = new Date(first); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
    const offset = first.getUTCDay();
    const count = Math.ceil((offset + last.getUTCDate()) / 7);
    this.row = 2;
    for (let week = 0; week < count; week++) {
      let line = "";
      for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
        const day = week * 7 + dayOfWeek - offset + 1;
        if (day < 1 || day > last.getUTCDate()) { line += " ".repeat(cellWidth); continue; }
        const date = new Date(first); date.setUTCDate(day);
        const value = iso(date);
        const active = value === this.value;
        const text = String(day).padStart(cellWidth - 1).padEnd(cellWidth);
        this.cells.push({ x: dayOfWeek * cellWidth, y: week + 2, width: cellWidth, value });
        if (active) this.row = week + 2;
        line += !this.permitted(value) ? this.style.fg("dim", text) : this.selected(text, active);
      }
      lines.push(line);
    }
    lines.push(this.style.fg("dim", "←→ day · ↑↓ week · PgUp/PgDn month"));
    return this.fit(lines);
  }
  handleInput(data: string): ControlInputResult {
    if (!this.enabled) return { handled: false };
    if (matchesKey(data, "enter")) return { handled: true, changed: this.value ? false : this.choose(this.date), advance: true };
    if (matchesKey(data, "pageUp") || matchesKey(data, "pageDown")) return { handled: true, changed: this.shiftMonth(matchesKey(data, "pageUp") ? -1 : 1) };
    const delta = matchesKey(data, "left") ? -1 : matchesKey(data, "right") ? 1 : matchesKey(data, "up") ? -7 : matchesKey(data, "down") ? 7 : 0;
    if (delta) { const date = new Date(this.date); date.setUTCDate(date.getUTCDate() + delta); return { handled: true, changed: this.choose(date) }; }
    if (matchesKey(data, "home") || matchesKey(data, "end")) {
      const date = new Date(this.date); date.setUTCDate(1);
      if (matchesKey(data, "end")) { date.setUTCMonth(date.getUTCMonth() + 1); date.setUTCDate(0); }
      return { handled: true, changed: this.choose(date) };
    }
    if (matchesKey(data, "backspace") || matchesKey(data, "delete")) return { handled: true, changed: this.commit("") };
    return { handled: false };
  }
  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (!this.enabled || !primaryClick(event)) return undefined;
    if (event.y === 0 && this.width >= 21 && (event.x === 0 || event.x === this.monthNextX)) {
      this.shiftMonth(event.x === 0 ? -1 : 1);
      return { handled: true, render: true, focus: true };
    }
    const cell = this.cells.find(cell => cell.y === event.y && event.x >= cell.x && event.x < cell.x + cell.width);
    if (!cell || !this.permitted(cell.value)) return undefined;
    this.choose(parseDate(cell.value)!);
    return { handled: true, render: true, focus: true };
  }
}

type VisibleTreeItem = { node: TreeNode; depth: number; parent?: string; disabled: boolean };
class TreeControl extends BaseControl {
  private expanded = new Set<string>();
  private cursor = "";
  private visible: VisibleTreeItem[] = [];
  private startIndex = 0;
  private last = "";
  constructor(node: ElementNode, model: DocumentModel, style: ControlStyle) {
    super(node, model, style); this.sync(true);
  }
  private sync(force = false): void {
    const value = String(this.value);
    if (force || value !== this.last) {
      this.last = value; this.cursor = value;
      const reveal = (nodes: TreeNode[], parents: string[]): boolean => nodes.some(node => {
        if (node.value === value) { parents.forEach(parent => this.expanded.add(parent)); return true; }
        return node.children ? reveal(node.children, [...parents, node.value]) : false;
      });
      reveal((this.node.props.nodes ?? []) as TreeNode[], []);
    }
    const visible: VisibleTreeItem[] = [];
    const walk = (nodes: TreeNode[], depth: number, parent?: string, inheritedDisabled = false) => {
      for (const node of nodes) {
        const disabled = inheritedDisabled || !!node.disabled;
        visible.push({ node, depth, parent, disabled });
        if (this.expanded.has(node.value) && node.children) walk(node.children, depth + 1, node.value, disabled);
      }
    };
    walk((this.node.props.nodes ?? []) as TreeNode[], 0);
    this.visible = visible;
    if (!visible.some(item => item.node.value === this.cursor)) this.cursor = visible.find(item => !item.disabled)?.node.value ?? visible[0]?.node.value ?? "";
  }
  update(node: ElementNode, resetDraft = false): void { super.update(node); this.sync(resetDraft); }
  private current() { return this.visible.find(item => item.node.value === this.cursor); }
  render(width: number, focused: boolean): string[] {
    if (!this.start(width, focused)) return [];
    this.sync();
    const index = Math.max(0, this.visible.findIndex(item => item.node.value === this.cursor));
    this.startIndex = clamp(index - 4, 0, Math.max(0, this.visible.length - 9));
    this.row = index - this.startIndex;
    const lines = this.visible.slice(this.startIndex, this.startIndex + 9).map(item => {
      const branch = !!item.node.children?.length;
      const disclosure = branch ? this.expanded.has(item.node.value) ? "▾" : "▸" : "·";
      const active = item.node.value === this.cursor;
      const selected = item.node.value === this.value;
      const line = `${active && this.focused ? "> " : "  "}${"  ".repeat(item.depth)}${disclosure} ${selected ? "●" : "○"} ${label(item.node.label)}`;
      return item.disabled ? this.style.fg("dim", line) : this.selected(line, active);
    });
    if (this.visible.length > 9) lines.push(this.style.fg("dim", `  ${index + 1}/${this.visible.length}`));
    const description = this.current()?.node.description;
    if (description) lines.push(...new Text(this.style.fg("muted", safeText(description)), 0, 0).render(this.width));
    return this.fit(lines);
  }
  handleInput(data: string): ControlInputResult {
    if (!this.enabled || navigation(data)) return { handled: false };
    const item = this.current();
    if (!item) return { handled: false };
    if (matchesKey(data, "space") || matchesKey(data, "enter")) return { handled: true, changed: item.disabled ? false : this.commit(item.node.value) };
    const delta = matchesKey(data, "up") ? -1 : matchesKey(data, "down") ? 1 : 0;
    if (delta) {
      const index = this.visible.indexOf(item);
      for (let next = index + delta; next >= 0 && next < this.visible.length; next += delta) {
        if (!this.visible[next].disabled) { this.cursor = this.visible[next].node.value; break; }
      }
      return { handled: true };
    }
    if (matchesKey(data, "right") && !item.disabled) {
      if (this.expanded.has(item.node.value) && item.node.children?.length) this.cursor = item.node.children.find(child => !child.disabled)?.value ?? this.cursor;
      else this.expanded.add(item.node.value);
      this.sync(); return { handled: true };
    }
    if (matchesKey(data, "left")) {
      if (this.expanded.has(item.node.value)) this.expanded.delete(item.node.value);
      else if (item.parent) this.cursor = item.parent;
      this.sync(); return { handled: true };
    }
    return { handled: false };
  }
  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (!this.enabled) return undefined;
    if (event.type === "wheel") { this.handleInput(event.wheelDelta && event.wheelDelta < 0 ? "\x1b[A" : "\x1b[B"); return { handled: true, render: true }; }
    if (!primaryClick(event) || event.y < 0 || event.y >= 9) return undefined;
    const item = this.visible[this.startIndex + event.y];
    if (!item || item.disabled) return undefined;
    this.cursor = item.node.value;
    if (item.node.children?.length && event.x < 4 + item.depth * 2) {
      if (this.expanded.has(item.node.value)) this.expanded.delete(item.node.value); else this.expanded.add(item.node.value);
      this.sync();
    } else this.commit(item.node.value);
    return { handled: true, render: true, focus: true };
  }
}

export function createFieldControl(node: ElementNode, model: DocumentModel, style: ControlStyle): FieldControl {
  switch (node.typeName) {
    case "Input": return new StringControl(node, model, style);
    case "NumberInput": return new NumberControl(node, model, style);
    case "Select": return new SelectControl(node, model, style);
    case "Checkbox": case "Toggle": return new BooleanControl(node, model, style);
    case "MultiSelect": return new MultiControl(node, model, style);
    case "TextArea": return new MultilineControl(node, model, style);
    case "Slider": return new SliderControl(node, model, style);
    case "DatePicker": return new DateControl(node, model, style);
    case "Tree": return new TreeControl(node, model, style);
    default: throw new Error(`No field control for ${node.typeName}`);
  }
}
