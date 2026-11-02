import { Text, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { childNodes, isField, limits } from "./catalog.js";
import { DocumentModel } from "./model.js";
import { presentation, safeText, type HostTheme } from "./presentation.js";
import { OpenUIView } from "./view.js";

/** Persist source only for display-only documents; it never replaces the tool outcome. */
export interface InlineDocument { version: 1; source: string; title: string; }

export function createInlineDocument(source: string, title = "OpenUI"): InlineDocument {
  return { version: 1, source, title: safeText(title).replace(/\n/g, " ").trim().slice(0, 160) || "OpenUI" };
}

export function isInlineDocument(value: unknown): value is InlineDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<InlineDocument>;
  return item.version === 1 && typeof item.source === "string" && item.source.length > 0 && item.source.length <= limits.source
    && typeof item.title === "string" && item.title.length <= 160;
}

/** Even hidden/disabled fields and page navigation need an interactive surface. */
export function hasInteractiveContent(model: DocumentModel): boolean {
  const visit = (node: NonNullable<DocumentModel["root"]>): boolean => isField(node) || node.typeName === "Button" || childNodes(node).some(visit);
  return !!model.root && visit(model.root);
}

class InlineDocumentComponent implements Component {
  private readonly model: DocumentModel;
  private readonly view: OpenUIView;
  constructor(private readonly document: InlineDocument, private readonly theme: HostTheme, private readonly expanded: boolean) {
    this.model = new DocumentModel(document.source);
    this.view = new OpenUIView(this.model, { theme, getHeight: () => 24, requestRender() {}, onDone() {} });
  }
  invalidate(): void { this.view.invalidate(); }
  dispose(): void { this.view.dispose(); this.model.dispose(); }
  render(width: number): string[] {
    if (!Number.isFinite(width) || width < 1) return [];
    width = Math.floor(width);
    const style = presentation(() => this.theme);
    const lines = new Text(safeText(this.document.title), 0, 0).render(width)
      .map(line => style.fg("accent", style.bold(line.trimEnd())));
    lines.push("");
    if (!this.model.valid || hasInteractiveContent(this.model)) {
      const error = !this.model.valid ? this.model.diagnostics.join("; ") : "Interactive documents require an active OpenUI panel.";
      lines.push(...new Text(`OpenUI document unavailable: ${safeText(error)}`, 0, 0).render(width).map(line => style.fg("error", line)));
    } else {
      const limit = 18;
      const body = this.view.renderStatic(width, this.expanded ? undefined : limit + 1);
      const clipped = !this.expanded && body.length > limit;
      lines.push(...(clipped ? body.slice(0, limit) : body));
      if (clipped) lines.push("", ...new Text("Expand to see the full document", 0, 0).render(width).map(line => style.fg("dim", line)));
    }
    return lines.map(line => truncateToWidth(line, width, ""));
  }
}

/** Actual component content stays in the transcript; no custom UI or acknowledgement. */
export function renderInlineDocument(document: InlineDocument, theme: HostTheme, options: { expanded?: boolean } = {}): Component {
  return new InlineDocumentComponent(document, theme, options.expanded === true);
}
