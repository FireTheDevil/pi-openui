import { Text, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import type { ElementNode } from "@openuidev/lang-core";
import { childNodes, isField, optionItems, type FieldValue } from "./catalog.js";
import type { DocumentModel } from "./model.js";
import { presentation, safeText, type HostTheme, type PresentationStyle } from "./presentation.js";
import type { UIResult } from "./view.js";

export interface SummaryOptions { title?: string; fields?: string[]; }
export type SummaryOutcome = UIResult | { status: "error"; error: string };
export interface Receipt {
  version: 1;
  status: "submitted" | "cancelled" | "error";
  title: string;
  fields: Array<{ name: string; label: string; value: string }>;
  message?: string;
  error?: string;
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export function isSummaryOutcome(value: unknown): value is SummaryOutcome {
  if (!record(value)) return false;
  if (value.status === "cancelled") return true;
  if (value.status === "error") return typeof value.error === "string";
  if (value.status !== "submitted" || typeof value.action !== "string" || !record(value.state) || !record(value.values)
    || value.message !== undefined && typeof value.message !== "string") return false;
  return Object.values(value.values).every(item => typeof item === "string" || typeof item === "boolean"
    || typeof item === "number" && Number.isFinite(item) || Array.isArray(item) && item.every(part => typeof part === "string"));
}

export function isReceipt(value: unknown): value is Receipt {
  return record(value) && value.version === 1 && ["submitted", "cancelled", "error"].includes(String(value.status))
    && typeof value.title === "string" && Array.isArray(value.fields) && value.fields.length <= 256
    && value.fields.every(field => record(field) && [field.name, field.label, field.value].every(item => typeof item === "string"))
    && (value.message === undefined || typeof value.message === "string")
    && (value.error === undefined || typeof value.error === "string");
}

const COMPACT_FIELDS = 6;
const COMPACT_VALUE_LINES = 2;
const single = (value: unknown) => safeText(value).replace(/\n/g, " ").trim();
const titleOf = (options?: SummaryOptions) => single(options?.title) || "OpenUI";
const owns = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);

function fieldLabel(name: string, node?: ElementNode): string {
  const explicit = single(node?.props.label);
  if (explicit) return explicit;
  const words = single(name).replace(/([a-z\d])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return words ? words[0].toUpperCase() + words.slice(1) : "Field";
}

function fieldText(value: FieldValue, node?: ElementNode): string {
  const labels = new Map(node ? optionItems(node).map(option => [option.value, option.label]) : []);
  const optionLabel = (item: string) => safeText(labels.get(item) ?? item);
  if (Array.isArray(value)) return value.length ? value.map(optionLabel).join(", ") : "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return typeof value === "string" ? optionLabel(value) : String(value);
}

/** Snapshot only display metadata; the structured outcome remains untouched. */
export function createReceipt(outcome: SummaryOutcome, model?: DocumentModel, options?: SummaryOptions): Receipt {
  const receipt: Receipt = { version: 1, status: outcome.status, title: titleOf(options), fields: [] };
  if (outcome.status === "cancelled") return receipt;
  if (outcome.status === "error") { receipt.error = safeText(outcome.error); return receipt; }
  if (outcome.message) receipt.message = safeText(outcome.message);

  const fields = new Map<string, ElementNode>();
  const navigation = new Set<string>();
  const visit = (node: ElementNode): void => {
    if (isField(node)) {
      const name = String(node.props.name);
      if (node.typeName === "Tabs" || node.typeName === "Steps") navigation.add(name);
      else fields.set(name, node);
    }
    for (const child of childNodes(node)) visit(child);
  };
  if (model?.root) visit(model.root);
  // Prefer document order, then retain values whose original component is unavailable.
  const names = options?.fields ?? [...fields.keys(), ...Object.keys(outcome.values)];
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name) || navigation.has(name) || !owns(outcome.values, name)) continue;
    seen.add(name);
    const node = fields.get(name);
    receipt.fields.push({ name: single(name), label: fieldLabel(name, node), value: fieldText(outcome.values[name], node) });
  }
  return receipt;
}

function wrap(value: unknown, width: number): string[] {
  return new Text(safeText(value), 0, 0).render(width).map(line => truncateToWidth(line, width, ""));
}

function preview(lines: string[], count: number, width: number): { lines: string[]; clipped: boolean } {
  if (lines.length <= count) return { lines, clipped: false };
  const result = lines.slice(0, count);
  result[count - 1] = truncateToWidth(result[count - 1].trimEnd(), Math.max(0, width - 1), "") + "…";
  return { lines: result, clipped: true };
}

function rawOutcome(outcome: SummaryOutcome): string {
  try { return JSON.stringify(outcome, null, 2); }
  catch { return "The structured result could not be displayed."; }
}

class ReceiptComponent implements Component {
  constructor(private receipt: Receipt, private theme: HostTheme, private options: { expanded?: boolean; outcome?: SummaryOutcome }) {}
  invalidate(): void {}
  render(width: number): string[] {
    if (!Number.isFinite(width) || width < 1) return [];
    width = Math.floor(width);
    const style = presentation(() => this.theme);
    const { receipt, options } = this;
    const expanded = options.expanded === true;
    const lines: string[] = [];
    const status: Record<Receipt["status"], { icon: string; label: string; tone: ThemeColor }> = {
      submitted: { icon: "✓", label: "Submitted", tone: "success" },
      cancelled: { icon: "⊘", label: "Cancelled", tone: "muted" },
      error: { icon: "✗", label: "Error", tone: "error" },
    };
    const state = status[receipt.status];
    let clipped = false;
    const add = (value: unknown, tone: ThemeColor = "text", maxLines = Infinity, bold = false) => {
      const rendered = wrap(value, width);
      const part = preview(rendered, maxLines, width);
      clipped ||= part.clipped;
      for (const line of part.lines) lines.push(style.fg(tone, bold ? style.bold(line.trimEnd()) : line));
    };
    add(`${state.icon} ${state.label} · ${single(receipt.title) || "OpenUI"}`, state.tone, expanded ? Infinity : 2, true);

    if (receipt.status === "cancelled") {
      add("No response was submitted.", "muted", expanded ? Infinity : 2);
    } else if (receipt.status === "error") {
      add(receipt.error || "The form could not be completed.", "error", expanded ? Infinity : 3);
    } else {
      if (receipt.message) add(receipt.message, "muted", expanded ? Infinity : 2);
      const shown = expanded ? receipt.fields : receipt.fields.slice(0, COMPACT_FIELDS);
      if (shown.length) lines.push("");
      const labelWidth = Math.min(24, Math.floor(width / 3), Math.max(1, ...shown.map(field => visibleWidth(single(field.label)))));
      for (const field of shown) {
        const label = single(field.label) || single(field.name) || "Field";
        const value = safeText(field.value) || "—";
        if (width >= 28) {
          const valueWidth = Math.max(1, width - labelWidth - 2);
          const labels = expanded ? wrap(label, labelWidth) : [truncateToWidth(label, labelWidth, "…")];
          if (!expanded && visibleWidth(label) > labelWidth) clipped = true;
          const values = preview(wrap(value, valueWidth), expanded ? Infinity : COMPACT_VALUE_LINES, valueWidth);
          clipped ||= values.clipped;
          for (let index = 0; index < Math.max(labels.length, values.lines.length); index++) {
            const left = labels[index]?.trimEnd() ?? "";
            const gap = " ".repeat(Math.max(0, labelWidth - visibleWidth(left)) + 2);
            lines.push(style.fg("accent", style.bold(left)) + gap + style.fg("text", values.lines[index] ?? ""));
          }
        } else {
          const labels = preview(wrap(label, width), expanded ? Infinity : 1, width);
          clipped ||= labels.clipped;
          for (const line of labels.lines) lines.push(style.fg("accent", style.bold(line.trimEnd())));
          const inset = width >= 4 ? 2 : 0;
          const values = preview(wrap(value, width - inset), expanded ? Infinity : COMPACT_VALUE_LINES, width - inset);
          clipped ||= values.clipped;
          for (const line of values.lines) lines.push(" ".repeat(inset) + style.fg("text", line));
        }
      }
      if (!receipt.fields.length && !receipt.message) add("Your response was submitted.", "muted", expanded ? Infinity : 2);
      if (shown.length < receipt.fields.length) {
        const remaining = receipt.fields.length - shown.length;
        add(`+ ${remaining} more ${remaining === 1 ? "field" : "fields"}`, "muted", 1);
        clipped = true;
      }
    }
    if (expanded && options.outcome) {
      lines.push("");
      add("Full structured result", "muted", Infinity, true);
      add(rawOutcome(options.outcome), "dim");
    } else if (!expanded && (options.outcome || clipped)) {
      lines.push("");
      add(options.outcome ? "Expand for full result" : "Expand for all details", "dim", 1);
    }
    return lines.map(line => truncateToWidth(line, width, ""));
  }
}

/** The human-facing transcript renderer never replaces the model-facing result. */
export function renderReceipt(receipt: Receipt, theme: HostTheme, options: { expanded?: boolean; outcome?: SummaryOutcome } = {}): Component {
  return new ReceiptComponent(receipt, theme, options);
}

class CallComponent implements Component {
  constructor(private source: string | undefined, private summary: SummaryOptions | undefined, private theme: HostTheme, private expanded: boolean) {}
  invalidate(): void {}
  render(width: number): string[] {
    if (!Number.isFinite(width) || width < 1) return [];
    width = Math.floor(width);
    const style: PresentationStyle = presentation(() => this.theme);
    const title = titleOf(this.summary);
    const label = title === "OpenUI" ? "OpenUI" : `OpenUI · ${title}`;
    const heading = preview(wrap(label, width), this.expanded ? Infinity : 2, width).lines;
    const lines = heading.map(line => style.fg("toolTitle", style.bold(line.trimEnd())));
    if (this.expanded && this.source) {
      lines.push("");
      lines.push(...wrap("OpenUI Lang source", width).map(line => style.fg("muted", line)));
      lines.push(...wrap(this.source, width).map(line => style.fg("dim", line)));
    }
    return lines.map(line => truncateToWidth(line, width, ""));
  }
}

export function renderOpenUICall(source: string | undefined, summary: SummaryOptions | undefined, theme: HostTheme, expanded: boolean): Component {
  return new CallComponent(source, summary, theme, expanded);
}
