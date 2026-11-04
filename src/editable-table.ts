import { Input, Text, matchesKey, stripTerminalSequences, truncateToWidth, visibleWidth, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { isReactiveAssign, type ElementNode } from "@openuidev/lang-core";
import { componentSpecs, limits, type TableRow, type TableColumn } from "./catalog.js";
import type { DocumentModel } from "./model.js";
import type { ControlStyle, FieldControl, ControlInputResult } from "./controls.js";
import { safeText } from "./presentation.js";

type Cell = { row: number; key: string };
type CellEditor = { input: Input; error?: string };
type CellHit = { row: number; column: number; x: number; y: number; width: number; height: number };
const single = (value: unknown) => safeText(value).replace(/\n/g, " ");

export class EditableTableControl implements FieldControl {
  private editors = new Map<number, Map<string, CellEditor>>();
  private active?: Cell;
  private baseline = "";
  private definition = "";
  private selectedRow = 0;
  private selectedColumn = 0;
  private hits: CellHit[] = [];
  private row = 0;
  private editor?: { x: number; y: number; width: number };
  private width = 1;
  constructor(public node: ElementNode, private model: DocumentModel, private style: ControlStyle) { this.update(node); }
  get error(): string | undefined {
    const cell = this.invalidCell();
    return cell ? `Row ${cell.row + 1}, ${single(this.columns.find(column => column.key === cell.key)?.label)}: Enter a finite number.` : undefined;
  }
  private get columns(): TableColumn[] { return componentSpecs.EditableTable.shape.columns.parse(this.node.props.columns); }
  private get rows(): TableRow[] { return componentSpecs.EditableTable.shape.value.parse(this.model.fieldValue(this.node)); }
  private get enabled(): boolean { return this.model.valid && !this.model.streaming && !this.model.isDisabled(this.node); }
  private cellEditor(row: number, key: string): CellEditor | undefined { return this.editors.get(row)?.get(key); }
  private get activeEditor(): CellEditor | undefined { return this.active && this.cellEditor(this.active.row, this.active.key); }
  private invalidCell(): Cell | undefined {
    const rows = this.rows, columns = this.columns;
    for (let row = 0; row < rows.length; row++) {
      for (const column of columns) if (this.cellEditor(row, column.key)?.error) return { row, key: column.key };
    }
    return undefined;
  }
  focusInvalidCell(): void {
    const cell = this.invalidCell();
    if (!cell) return;
    this.active = cell;
    this.selectedRow = cell.row;
    this.selectedColumn = this.columns.findIndex(column => column.key === cell.key);
  }
  update(node: ElementNode, resetDraft = false): void {
    this.node = node;
    const rows = JSON.stringify(this.rows);
    const binding = isReactiveAssign(node.props.value) ? node.props.value : null;
    const definition = JSON.stringify([node.props.name, binding, this.columns]);
    if (resetDraft || !this.enabled || rows !== this.baseline || definition !== this.definition) {
      this.editors.clear();
      this.active = undefined;
      this.editor = undefined;
    }
    this.baseline = rows;
    this.definition = definition;
    this.selectedRow = Math.min(this.selectedRow, Math.max(0, this.rows.length - 1));
    this.selectedColumn = Math.min(this.selectedColumn, Math.max(0, this.columns.length - 1));
  }
  invalidate(): void { for (const row of this.editors.values()) for (const editor of row.values()) editor.input.invalidate(); }
  focusRow(): number { return this.row; }
  private writeCell(cell: Cell, value: string | number | boolean): boolean {
    const rows = this.rows;
    if (!rows[cell.row] || !this.columns.some(column => column.key === cell.key)) return false;
    const requested = rows.map((row, index) => index === cell.row ? { ...row, [cell.key]: value } : row);
    const before = JSON.stringify(rows);
    this.model.setField(this.node, requested);
    const actual = this.rows;
    const after = JSON.stringify(actual);
    const editor = this.cellEditor(cell.row, cell.key);
    if (after !== JSON.stringify(requested) && editor) {
      editor.input.setValue(single(actual[cell.row]?.[cell.key]));
      editor.error = undefined;
    }
    this.baseline = after;
    return before !== after;
  }
  private afterEdit(): boolean {
    const cell = this.active, editor = this.activeEditor;
    if (!cell || !editor) return false;
    const column = this.columns.find(column => column.key === cell.key);
    if (!column) return false;
    const text = single(editor.input.getValue()).slice(0, column.type === "number" ? 100 : limits.text);
    if (text !== editor.input.getValue()) editor.input.setValue(text);
    if (column.type === "number" && (!text.trim() || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim()) || !Number.isFinite(Number(text)))) {
      editor.error = "Enter a finite number.";
      return false;
    }
    editor.error = undefined;
    return this.writeCell(cell, column.type === "number" ? Number(text) : text);
  }
  private edit(): boolean {
    const row = this.rows[this.selectedRow], column = this.columns[this.selectedColumn];
    if (!row || !column) return false;
    const cell = { row: this.selectedRow, key: column.key };
    this.active = undefined;
    if (column.type === "boolean") return this.writeCell(cell, !row[column.key]);
    let editors = this.editors.get(cell.row);
    if (!editors) { editors = new Map(); this.editors.set(cell.row, editors); }
    if (!editors.has(cell.key)) {
      const input = new Input({ prompt: "  " });
      input.setValue(single(row[cell.key]));
      editors.set(cell.key, { input });
    }
    this.active = cell;
    return false;
  }
  handleInput(data: string): ControlInputResult {
    if (!this.enabled || matchesKey(data, "pageUp") || matchesKey(data, "pageDown")) return { handled: false };
    if (matchesKey(data, "enter") || (matchesKey(data, "space") && !this.active)) {
      if (this.active) {
        if (!this.activeEditor?.error) this.active = undefined;
        return { handled: true };
      }
      return { handled: true, changed: this.edit() };
    }
    if (matchesKey(data, "up") || matchesKey(data, "down")) {
      this.active = undefined;
      this.selectedRow = Math.max(0, Math.min(Math.max(0, this.rows.length - 1), this.selectedRow + (matchesKey(data, "up") ? -1 : 1)));
    } else if (this.activeEditor) {
      this.activeEditor.input.handleInput(data);
      return { handled: true, changed: this.afterEdit() };
    } else if (matchesKey(data, "left")) this.selectedColumn = Math.max(0, this.selectedColumn - 1);
    else if (matchesKey(data, "right")) this.selectedColumn = Math.min(this.columns.length - 1, this.selectedColumn + 1);
    else return { handled: false };
    return { handled: true };
  }
  handleMouse(event: TuiMouseEvent) {
    if (!this.enabled || event.type !== "click" || event.button !== "left" || event.shift || event.alt || event.ctrl) return;
    if (this.active && this.editor && event.y === this.editor.y && event.x >= this.editor.x && event.x < this.editor.x + this.editor.width) {
      this.placeCursor(event);
    } else {
      const cell = this.hits.find(hit => event.x >= hit.x && event.x < hit.x + hit.width && event.y >= hit.y && event.y < hit.y + hit.height);
      if (!cell) return { handled: true, render: true };
      this.selectedRow = cell.row;
      this.selectedColumn = cell.column;
      this.edit();
      this.render(this.width, true);
      this.placeCursor(event);
    }
    return { handled: true, render: true, focus: true };
  }
  private placeCursor(event: TuiMouseEvent): void {
    if (!this.activeEditor || !this.editor || event.y !== this.editor.y) return;
    this.activeEditor.input.handleMouse({ ...event, type: "press", x: Math.max(0, Math.min(this.editor.width - 1, event.x - this.editor.x)) + 2, y: 0, width: this.editor.width + 2, height: 1 });
  }
  render(width: number, focused: boolean): string[] {
    this.width = Math.max(1, width);
    this.hits = [];
    this.editor = undefined;
    this.row = 0;
    const columns = this.columns, rows = this.rows;
    const lines: string[] = [];
    const border = (text: string) => this.style.fg("borderMuted", text);
    const wrap = (text: string, size: number) => new Text(text, 0, 0).render(size);
    const selected = (row: number, column: number) => row === this.selectedRow && column === this.selectedColumn;
    const editing = (row: number, column: number) => focused && this.active?.row === row && this.active.key === columns[column].key;
    const cellText = (row: number, column: number) => {
      const editor = this.cellEditor(row, columns[column].key);
      return (editor?.error ? "! " : focused && selected(row, column) ? "› " : "") + (editor ? editor.input.getValue() : safeText(rows[row][columns[column].key]));
    };
    const inputLine = (x: number, y: number, size: number) => {
      const editor = this.activeEditor;
      if (!editor) return "";
      this.editor = { x, y, width: size };
      this.row = y;
      editor.input.focused = focused && this.enabled;
      const line = editor.input.render(size + 2)[0].slice(2);
      return focused ? line : stripTerminalSequences(line);
    };
    const pad = (text: string, size: number) => truncateToWidth(text, size, "") + " ".repeat(Math.max(0, size - visibleWidth(text)));
    if (width >= columns.length * 12 + 1) {
      const available = width - columns.length - 1;
      const sizes = columns.map((_, index) => Math.floor(available / columns.length) + (index < available % columns.length ? 1 : 0));
      const rule = (left: string, middle: string, right: string) => border(left + sizes.map(size => "─".repeat(size)).join(middle) + right);
      const cells = (values: string[], header: boolean, row = -1) => {
        let contentX = 2;
        const wrapped = values.map((value, index) => {
          const size = Math.max(1, sizes[index] - 2);
          const linesForCell = !header && editing(row, index) ? [inputLine(contentX, lines.length, size)] : wrap(value, size);
          contentX += sizes[index] + 1;
          return linesForCell;
        });
        const height = Math.max(1, ...wrapped.map(value => value.length));
        let x = 1;
        if (!header && row >= 0) sizes.forEach((size, column) => {
          this.hits.push({ row, column, x, y: lines.length, width: size, height });
          if (row === this.selectedRow && column === this.selectedColumn) this.row = lines.length;
          x += size + 1;
        });
        for (let line = 0; line < height; line++) {
          lines.push(border("│") + wrapped.map((value, index) => {
            const text = pad(" " + (value[line] ?? ""), sizes[index]);
            const selected = !header && focused && this.enabled && row === this.selectedRow && index === this.selectedColumn;
            const styled = this.style.fg(header || selected ? "accent" : this.enabled ? "text" : "dim", header || (selected && !editing(row, index)) ? this.style.bold(text) : text);
            return selected ? this.style.bg("selectedBg", styled) : styled;
          }).join(border("│")) + border("│"));
        }
      };
      lines.push(rule("┌", "┬", "┐"));
      cells(columns.map(column => single(column.label)), true);
      lines.push(rule("├", "┼", "┤"));
      rows.forEach((_, row) => {
        cells(columns.map((_, column) => cellText(row, column)), false, row);
        lines.push(rule(row === rows.length - 1 ? "└" : "├", row === rows.length - 1 ? "┴" : "┼", row === rows.length - 1 ? "┘" : "┤"));
      });
      if (!rows.length) {
        cells(columns.map((_, index) => index ? "" : "(no rows)"), false);
        lines.push(rule("└", "┴", "┘"));
      }
    } else {
      const framed = width >= 4;
      const inner = Math.max(1, width - (framed ? 2 : 0));
      const inset = width >= 6 ? 1 : 0;
      const content = Math.max(1, inner - inset * 2);
      const rule = (left: string, right: string) => border(framed ? left + "─".repeat(inner) + right : "─".repeat(width));
      lines.push(rule("┌", "┐"));
      const append = (text: string, header = false) => {
        for (const line of wrap(text, content)) lines.push((framed ? border("│") : "") + this.style.fg(header ? "accent" : "text", pad(" ".repeat(inset) + line, inner)) + (framed ? border("│") : ""));
      };
      append(columns.map(column => single(column.label)).join(" · "), true);
      lines.push(rule("├", "┤"));
      rows.forEach((_, row) => {
        append("Row " + (row + 1), true);
        columns.forEach((column, col) => {
          append(single(column.label), true);
          const y = lines.length;
          const x = (framed ? 1 : 0) + inset;
          if (editing(row, col)) {
            const line = inputLine(x, y, content);
            const value = this.style.fg(this.enabled ? "text" : "dim", line);
            lines.push((framed ? border("│") : "") + " ".repeat(inset) + (focused && this.enabled ? this.style.bg("selectedBg", value) : value) + " ".repeat(inset) + (framed ? border("│") : ""));
          } else append(cellText(row, col));
          this.hits.push({ row, column: col, x: framed ? 1 : 0, y, width: inner, height: lines.length - y });
          if (selected(row, col)) this.row = y;
        });
        lines.push(rule(row === rows.length - 1 ? "└" : "├", row === rows.length - 1 ? "┘" : "┤"));
      });
      if (!rows.length) { append("(no rows)"); lines.push(rule("└", "┘")); }
    }
    return lines.map(line => truncateToWidth(line, width, ""));
  }
}
