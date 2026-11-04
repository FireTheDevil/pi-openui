import { Text, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { z } from "zod";
import { predicateParseContext } from "./predicate-validation.js";
import { childNodes, componentSpecs, isField, limits } from "./catalog.js";
import { DocumentModel } from "./model.js";
import { presentation, safeText, type HostTheme } from "./presentation.js";
import { OpenUIView } from "./view.js";

/** Persist source only for display-only documents; it never replaces the tool outcome. */
const inlineDocumentSchema = z.object({
  version: z.literal(1),
  source: z.string().min(1).max(limits.source),
  title: z.string().max(160),
});

export type InlineDocument = z.infer<typeof inlineDocumentSchema>;

export function createInlineDocument(source: string, title = "OpenUI"): InlineDocument {
  return { version: 1, source, title: safeText(title).replace(/\n/g, " ").trim().slice(0, 160) || "OpenUI" };
}

const inlineObjectSchema = z.object({});

const inlineDocumentCandidateSchema = z.custom<{ version?: unknown; source?: unknown; title?: unknown }>(
  value => inlineObjectSchema.safeParse(value, predicateParseContext).success,
);

const inlineTextSchema = z.string();

const isInlineText = (value: unknown): value is string => inlineTextSchema.safeParse(value, predicateParseContext).success;

export function isInlineDocument(value: unknown): value is InlineDocument {
  const candidate = inlineDocumentCandidateSchema.safeParse(value, predicateParseContext);

  if (!candidate.success) return false;
  const item = candidate.data;

  return item.version === 1 && isInlineText(item.source) && item.source.length > 0 && item.source.length <= limits.source
    && isInlineText(item.title) && item.title.length <= 160;
}

/** Even hidden/disabled fields and page navigation need an interactive surface. */
export function hasInteractiveContent(model: DocumentModel): boolean {
  const visit = (node: NonNullable<DocumentModel["root"]>): boolean => isField(node) || node.typeName === "Button" || node.typeName === "Callout" && componentSpecs.Callout.shape.settings.parse(node.props.settings ?? undefined)?.dismissible === true || childNodes(node).some(visit);

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
