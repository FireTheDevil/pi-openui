import type { BarChartData, RenderedNode } from "./catalog.js";
import { z } from "zod";
import { predicateParseContext } from "./predicate-validation.js";
import { highlightCode } from "@earendil-works/pi-coding-agent";
import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import { Markdown, Text, truncateToWidth, visibleWidth, wrapTextWithAnsi, type MarkdownTheme } from "@earendil-works/pi-tui";
import { componentSpecs, resolveBarChartDomain } from "./catalog.js";
import { safeText, type PresentationStyle } from "./presentation.js";

const displayNames = new Set(["Text", "Markdown", "CodeBlock", "List", "Badge", "Progress", "BarChart", "Divider", "Table"]);

const tones = new Map<string, ThemeColor>([
  ["default", "text"], ["muted", "muted"], ["accent", "accent"], ["success", "success"], ["warning", "warning"], ["error", "error"],
]);

const displayTextSchema = z.string();

const progressNumberSchema = z.union([z.number(), z.nan(), z.literal(Infinity), z.literal(-Infinity)]);

const isDisplayText = (value: RenderedNode["props"][string]): value is string => displayTextSchema.safeParse(value, predicateParseContext).success;

const isProgressNumber = (value: RenderedNode["props"][string]): value is number => progressNumberSchema.safeParse(value, predicateParseContext).success;

const tone = (value: RenderedNode["props"][string], fallback: ThemeColor = "text"): ThemeColor => isDisplayText(value) ? tones.get(value) ?? fallback : fallback;

const wrap = (text: string, width: number): string[] => new Text(text, 0, 0).render(width);

/** Pi's highlighter uses the active host theme. Unit/headless hosts may not initialize one. */
function codeLines(code: string, language: string | undefined, style: PresentationStyle): string[] {
  try { return highlightCode(code, language); }
  catch { return code.split("\n").map(line => style.fg("mdCodeBlock", line)); }
}

function markdownTheme(style: PresentationStyle): MarkdownTheme {
  return {
    heading: text => style.fg("mdHeading", text),
    link: text => style.fg("mdLink", text),
    linkUrl: text => style.fg("mdLinkUrl", text),
    code: text => style.fg("mdCode", text),
    codeBlock: text => style.fg("mdCodeBlock", text),
    codeBlockBorder: text => style.fg("mdCodeBlockBorder", text),
    quote: text => style.fg("mdQuote", text),
    quoteBorder: text => style.fg("mdQuoteBorder", text),
    hr: text => style.fg("mdHr", text),
    listBullet: text => style.fg("mdListBullet", text),
    bold: text => style.bold(text),
    italic: text => style.italic(text),
    underline: text => style.underline(text),
    strikethrough: text => style.strikethrough(text),
    highlightCode: (code, language) => codeLines(safeText(code), language && safeText(language).replace(/\n/g, " "), style),
  };
}

// Native Markdown can emit terminal hyperlinks when the terminal advertises them.
// Displays are passive: retain the label and styling, never an OSC 8 activation target.
function withoutLinks(line: string): string {
  let result = "";
  let start = 0;

  for (let cursor = 0; cursor < line.length; cursor++) {
    if (!line.startsWith("\x1b]8;", cursor)) continue;
    let end = cursor + 4;

    while (end < line.length && line[end] !== "\x07" && line[end] !== "\x1b") end++;
    const next = line[end] === "\x07" ? end + 1 : line.startsWith("\x1b\\", end) ? end + 2 : undefined;

    if (next === undefined) continue;
    result += line.slice(start, cursor);
    start = next;
    cursor = next - 1;
  }

  return result + line.slice(start);
}

/** Render noninteractive catalog components; callers own viewport placement and scrolling. */
export function renderDisplay(node: RenderedNode, width: number, style: PresentationStyle): string[] | undefined {
  if (!displayNames.has(node.typeName)) return undefined;

  if (!Number.isFinite(width) || width < 1) return [];
  width = Math.floor(width);
  const p = node.props;
  let lines: string[];

  switch (node.typeName) {
    case "Text": {
      const settings = componentSpecs.Text.shape.settings.parse(p.settings ?? undefined);
      lines = wrap(safeText(p.text), width).map(line => {
        if (settings?.bold) line = style.bold(line);

        if (settings?.italic) line = style.italic(line);

        return style.fg(tone(settings?.tone), line);
      });
      break;
    }

    case "Markdown": {
      const source = safeText(p.text);

      try {
        lines = new Markdown(source, 0, 0, markdownTheme(style), { color: text => style.fg("text", text) }).render(width).map(withoutLinks);
      } catch {
        // Malformed Markdown or an unavailable host feature still shows readable text.
        lines = wrap(source, width).map(line => style.fg("text", line));
      }

      break;
    }

    case "CodeBlock": {
      const code = safeText(p.code);
      const language = p.language ? safeText(p.language).replace(/\n/g, " ") : undefined;
      const label = language ? ` code · ${language} ` : " code ";
      const heading = truncateToWidth(label, width, "");
      lines = [style.fg("mdCodeBlockBorder", heading + "─".repeat(Math.max(0, width - visibleWidth(heading))))];

      for (const line of codeLines(code, language, style)) lines.push(...wrapTextWithAnsi(line, width));
      lines.push(style.fg("mdCodeBlockBorder", "─".repeat(width)));
      break;
    }

    case "List": {
      lines = [];
      const items = componentSpecs.List.shape.items.parse(p.items);
      items.forEach((item, index) => {
        const prefix = p.ordered ? `${index + 1}. ` : "• ";
        const styledPrefix = style.fg("mdListBullet", prefix);
        const prefixWidth = visibleWidth(prefix);

        if (prefixWidth >= width) {
          lines.push(...wrap(styledPrefix + style.fg("text", safeText(item)), width));
        } else {
          const body = wrap(safeText(item), width - prefixWidth);
          body.forEach((line, row) => lines.push((row ? " ".repeat(prefixWidth) : styledPrefix) + style.fg("text", line)));
        }
      });

      if (!items.length) lines.push(...wrap(style.fg("muted", "(no items)"), width));
      break;
    }

    case "Badge":
      lines = wrap(`[ ${safeText(p.text)} ]`, width).map(line => style.fg(tone(p.tone, "accent"), style.bold(line.trimEnd())));
      break;
    case "Progress": {
      const value = isProgressNumber(p.value) && Number.isFinite(p.value) ? p.value : 0;
      const max = isProgressNumber(p.max) && Number.isFinite(p.max) && p.max > 0 ? p.max : 100;
      const ratio = Math.max(0, Math.min(1, value / max));
      const percent = `${Math.round(ratio * 100)}%`;
      const barWidth = width - percent.length - 3;
      lines = p.label ? wrap(safeText(p.label), width).map(line => style.fg("text", line)) : [];

      if (barWidth < 3) lines.push(style.fg(ratio === 1 ? "success" : "accent", percent));
      else {
        const filled = Math.round(barWidth * ratio);
        lines.push(style.fg("borderMuted", "[") + style.fg(ratio === 1 ? "success" : "accent", "█".repeat(filled))
          + style.fg("dim", "░".repeat(barWidth - filled)) + style.fg("borderMuted", "] ") + style.fg("text", percent));
      }

      break;
    }

    case "Divider": {
      const label = safeText(p.label).replace(/\n/g, " ");

      if (!label) lines = [style.fg("borderMuted", "─".repeat(width))];
      else {
        const caption = truncateToWidth(` ${label} `, Math.max(1, width - 2), "");
        const lead = width >= 3 ? 2 : 0;
        lines = [style.fg("borderMuted", "─".repeat(lead)) + style.fg("muted", caption)
          + style.fg("borderMuted", "─".repeat(Math.max(0, width - lead - visibleWidth(caption))))];
      }

      break;
    }

    case "BarChart":
      lines = renderBarChart(componentSpecs.BarChart.shape.data.parse(p.data), width, style, componentSpecs.BarChart.shape.settings.parse(p.settings ?? undefined));
      break;
    case "Table":
      lines = renderTable(componentSpecs.Table.shape.columns.parse(p.columns), componentSpecs.Table.shape.rows.parse(p.rows), width, style);
      break;
    default: return undefined;
  }

  return lines.map(line => truncateToWidth(line, width, ""));
}

function barChartCoordinate(value: number, domain: ReturnType<typeof resolveBarChartDomain>, extent: number): number {
  if (domain.min === 0) return domain.max === 0 ? 0 : Math.round(extent * (value / domain.max));

  // Normalize endpoints before adding to avoid overflow across finite extremes.
  const magnitude = Math.max(Math.abs(domain.min), domain.max);
  const below = -domain.min / magnitude;
  const above = domain.max / magnitude;

  return Math.round(extent * ((value / magnitude + below) / (below + above)));
}

function renderBarChart(data: BarChartData, width: number, style: PresentationStyle, settings: z.infer<typeof componentSpecs.BarChart>["settings"]): string[] {
  const domain = resolveBarChartDomain(data, settings);
  const caption = data.length || settings?.min !== undefined || settings?.max !== undefined ? wrap(style.fg("muted", "Scale: " + domain.min + ".." + domain.max), width) : [];
  const numericWidth = Math.max(settings?.min === undefined ? 0 : visibleWidth(String(settings.min)), settings?.max === undefined ? 0 : visibleWidth(String(settings.max)));

  if (!data.length) return [...caption, ...wrap(style.fg("muted", "(no data)"), width)];

  const rows = data.map(({ label, value }) => {
    const sanitized = safeText(label).replace(/\n/g, " ");

    return { label: visibleWidth(sanitized.trim()) ? sanitized : "(unnamed)", value, number: String(value) };
  });

  const widestLabel = Math.max(...rows.map(row => visibleWidth(row.label)));
  const valueWidth = Math.max(3, numericWidth, ...rows.map(row => visibleWidth(row.number)));
  const fraction = Math.min(0.88, 0.48 + 0.12 * Math.log2(rows.length + 1));

  const targetWidth = Math.min(width, Math.max(Math.floor(width * fraction), valueWidth + 8,
    Math.min(widestLabel + valueWidth + 8, Math.floor(width * 0.88))));

  if (settings?.orientation === "vertical") return [...caption, ...renderVerticalBarChart(rows, width, style, domain, valueWidth, targetWidth)];

  const inlineLabels = widestLabel <= Math.floor(targetWidth * 0.28);
  const labelWidth = inlineLabels ? widestLabel : 0;
  const barWidth = targetWidth - labelWidth - valueWidth - (inlineLabels ? 4 : 1);
  const labels = rows.map(row => inlineLabels ? [] : wrap(row.label, targetWidth));

  if (barWidth < 4 || labels.some(parts => parts.length > 2)) {
    return [...caption, ...rows.flatMap(row => wrap(style.fg("text", row.label + ": " + row.number), width))];
  }

  const extent = barWidth - (domain.min < 0 ? 1 : 0);
  const zero = barChartCoordinate(0, domain, extent);

  return [...caption, ...rows.flatMap((row, index) => {
    const coordinate = barChartCoordinate(row.value, domain, extent);
    const start = Math.min(zero, coordinate);
    const end = Math.max(zero, coordinate);
    const negative = domain.min < 0 ? " ".repeat(start) + style.fg("accent", "█".repeat(zero - start)) : "";
    const positive = style.fg("accent", "█".repeat(end - zero)) + " ".repeat(extent - end);

    const lead = inlineLabels ? style.fg("text", row.label + " ".repeat(labelWidth - visibleWidth(row.label)))
      + style.fg("borderMuted", " │ ") : "";

    return [...labels[index].map(line => style.fg("text", line)), lead
      + negative + (domain.min < 0 ? style.fg("borderMuted", "│") : "") + positive
      + " " + style.fg("text", " ".repeat(valueWidth - visibleWidth(row.number)) + row.number)];
  })];
}

function renderVerticalBarChart(rows: (BarChartData[number] & { number: string })[], width: number, style: PresentationStyle, domain: ReturnType<typeof resolveBarChartDomain>, numericWidth: number, targetWidth: number): string[] {
  const gap = Math.max(1, Math.floor(Math.sqrt(targetWidth / rows.length) / 3));
  const slotWidth = Math.floor((targetWidth - 2 - gap * (rows.length - 1)) / rows.length);

  if (slotWidth < Math.max(2, numericWidth) || ["█", "│", "└", "─"].some(glyph => visibleWidth(glyph) !== 1)) {
    return rows.flatMap(row => wrap(style.fg("text", row.label + ": " + row.number), width));
  }

  const labels = rows.map(row => wrap(row.label, slotWidth).map(line => line.trimEnd()));
  const labelRows = Math.max(...labels.map(parts => parts.length));

  if (labelRows > 2) return rows.flatMap(row => wrap(style.fg("text", row.label + ": " + row.number), width));

  const plotWidth = rows.length * slotWidth + gap * (rows.length - 1);
  const plotRows = Math.max(1, Math.round(plotWidth / 5));
  const coordinates = rows.map(row => barChartCoordinate(row.value, domain, plotRows));
  const zero = barChartCoordinate(0, domain, plotRows);
  const barWidth = Math.max(1, Math.min(plotRows, Math.floor(slotWidth * 0.7)));

  const center = (text: string) => {
    const padding = slotWidth - visibleWidth(text);
    const left = Math.floor(padding / 2);

    return " ".repeat(left) + text + " ".repeat(padding - left);
  };

  const lines: string[] = [];

  for (let row = plotRows; row >= 0; row--) {
    if (row === zero) lines.push(style.fg("borderMuted", (zero === 0 ? "└─" : "├─") + "─".repeat(plotWidth)));

    if (row === 0) break;

    lines.push(style.fg("borderMuted", "│ ") + coordinates.map(coordinate => row > Math.min(zero, coordinate) && row <= Math.max(zero, coordinate)
      ? style.fg("accent", center("█".repeat(barWidth))) : " ".repeat(slotWidth)).join(" ".repeat(gap)));
  }

  for (let row = 0; row < labelRows; row++) {
    lines.push("  " + labels.map(parts => style.fg("text", center(parts[row] ?? ""))).join(" ".repeat(gap)));
  }

  lines.push("  " + rows.map(row => style.fg("text", center(row.number))).join(" ".repeat(gap)));

  return lines;
}

/** Existing content-fit terminal table, shared by the display dispatcher. */
function renderTable(columns: string[], rows: unknown[][], width: number, style: PresentationStyle): string[] {
  const lines: string[] = [];
  const n = columns.length;

  if (!n) return lines;

  if (width < n * 8) {
    rows.forEach((row, index) => {
      if (index) lines.push("");
      columns.forEach((column, col) => {
        const label = style.fg("accent", style.bold(safeText(column) + ":"));
        const value = style.fg("text", safeText(row[col]));
        lines.push(...wrap(`${label} ${value}`, width));
      });
    });

    if (!rows.length) lines.push(...wrap(style.fg("accent", style.bold(columns.map(safeText).join(" · "))), width));

    return lines;
  }

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
    const wrapped = columns.map((_, i) => wrap(safeText(cells[i]), widths[i]));
    const count = Math.max(1, ...wrapped.map(c => c.length));

    for (let line = 0; line < count; line++) {
      lines.push(wrapped.map((cell, i) => {
        const value = truncateToWidth(cell[line] ?? "", widths[i], "");
        const padded = value + " ".repeat(Math.max(0, widths[i] - visibleWidth(value)));

        return style.fg(header ? "accent" : "text", header ? style.bold(padded) : padded);
      }).join(style.fg("borderMuted", " │ ")));
    }
  };

  rowLines(columns, true);
  lines.push(style.fg("borderMuted", widths.map(cellWidth => "─".repeat(cellWidth)).join("─┼─")));
  rows.forEach(row => rowLines(row));

  if (!rows.length) lines.push(style.fg("muted", "(no rows)"));

  return lines;
}
