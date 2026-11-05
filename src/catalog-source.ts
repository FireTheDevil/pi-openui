import { action, createLibrary, defineComponent, markReactive, type ElementNode } from "@openuidev/lang-core";
import { z } from "zod";
import { predicateParseContext } from "./predicate-validation.js";

export const limits = {
  source: 65_536, nodes: 256, depth: 32, text: 4_000, rows: 200,
  columns: 20, options: 200, actionSteps: 32, treeNodes: 200, treeDepth: 16,
} as const;

export type TableRow = Record<string, string | number | boolean>;

export type FieldValue = string | boolean | number | string[] | TableRow[];

export type Tone = "default" | "muted" | "accent" | "success" | "warning" | "error";

export interface FieldOptions {
  description?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  rows?: number;
  min?: number;
  max?: number;
  step?: number;
  minDate?: string;
  maxDate?: string;
}

export interface NormalizedOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  depth?: number;
}

export interface TreeNode extends Omit<NormalizedOption, "depth"> { children?: TreeNode[]; }

export interface TabItem { value: string; label: string; children: unknown[]; }

const fieldNameMax = 64;

const fieldNamePattern = new RegExp(`^[A-Za-z_][A-Za-z0-9_-]{0,${fieldNameMax - 1}}$`);

const collectionMin = 1;

const rowGap = { min: 0, max: 8 };

const textAreaRows = { min: 5, max: 12 };

const text = z.string().max(limits.text);

const name = z.string().regex(fieldNamePattern);

const tone = z.enum(["default", "muted", "accent", "success", "warning", "error"]);

const finite = z.number().finite();

const children = z.array(z.any()).max(limits.nodes).describe("Child component calls or references; nested layouts are supported");

const settings = z.object({ description: text.optional(), required: z.boolean().optional(), disabled: z.boolean().optional(), error: text.optional() });

const numberSettings = settings.extend({ min: finite.optional(), max: finite.optional(), step: finite.positive().optional() });

const dateSettings = settings.extend({ minDate: text.optional(), maxDate: text.optional() });

const option = z.object({ value: text, label: text, description: text.optional(), disabled: z.boolean().optional() });

const options = z.array(z.union([text, option])).min(collectionMin).max(limits.options);

const scalar = z.union([text, finite, z.boolean(), z.null()]);

const stringBinding = z.string().max(limits.text);

const booleanBinding = z.boolean();

const numberBinding = z.number().finite();

const multipleBinding = z.array(text).max(limits.options);

export const tableRowsSchema = z.array(z.record(name, z.union([text, finite, z.boolean()]))).max(limits.rows);

export const tableColumnsSchema = z.array(z.object({ key: name, label: text, type: z.enum(["string", "number", "boolean"]) })).min(collectionMin).max(limits.columns);

export type TableColumn = z.infer<typeof tableColumnsSchema>[number];

for (const schema of [stringBinding, booleanBinding, numberBinding, multipleBinding, tableRowsSchema]) markReactive(schema);

// Zod's lazy schema exports as a recursive JSON Schema reference. The model
// applies total-node and depth limits before accepting the tree for rendering.
const treeNodeSchema: z.ZodType<TreeNode> = z.lazy(() => z.object({
  value: text,
  label: text,
  description: text.optional(),
  disabled: z.boolean().optional(),
  children: z.array(treeNodeSchema).max(limits.treeNodes).optional(),
}));

const pages = z.array(z.object({ value: text, label: text, children })).min(collectionMin).max(limits.options);

/** Property order is the public positional OpenUI Lang signature. */
export const componentSpecs = {
  Accordion: z.object({ name, label: text, children, value: booleanBinding, settings: settings.optional() }),
  Callout: z.object({ title: text, text, settings: z.object({ tone: tone.optional(), dismissible: z.boolean().optional() }).optional() }),
  EditableTable: z.object({ name, label: text, columns: tableColumnsSchema, value: tableRowsSchema, settings: settings.optional() }),
  Text: z.object({ text, settings: z.object({ tone: tone.optional(), bold: z.boolean().optional(), italic: z.boolean().optional() }).optional() }),
  Stack: z.object({ children }),
  Select: z.object({ name, label: text, options, value: stringBinding, settings: settings.optional() }),
  Input: z.object({ name, label: text, value: stringBinding, placeholder: text.optional(), settings: settings.optional() }),
  Button: z.object({ label: text, action: z.union([name, action()]), settings: z.object({ variant: z.enum(["primary", "secondary", "danger"]).optional(), disabled: z.boolean().optional(), description: text.optional() }).optional() }),
  Table: z.object({ columns: z.array(text).min(collectionMin).max(limits.columns), rows: z.array(z.array(scalar).max(limits.columns)).max(limits.rows) }),
  Checkbox: z.object({ name, label: text, value: booleanBinding, settings: settings.optional() }),
  MultiSelect: z.object({ name, label: text, options, value: multipleBinding, settings: settings.optional() }),
  TextArea: z.object({ name, label: text, value: stringBinding, placeholder: text.optional(), settings: settings.extend({ rows: z.number().int().min(textAreaRows.min).max(textAreaRows.max).optional() }).optional() }),
  Row: z.object({ children, settings: z.object({ gap: z.number().int().min(rowGap.min).max(rowGap.max).optional() }).optional() }),
  Section: z.object({ title: text, children, settings: z.object({ description: text.optional(), tone: tone.optional() }).optional() }),
  Card: z.object({ title: text, children, settings: z.object({ description: text.optional(), tone: tone.optional() }).optional() }),
  Divider: z.object({ label: text.optional() }),
  Tabs: z.object({ name, items: pages, value: stringBinding, settings: settings.optional() }),
  Steps: z.object({ name, items: pages, value: stringBinding, settings: settings.optional() }),
  Markdown: z.object({ text }),
  CodeBlock: z.object({ code: text, language: text.optional() }),
  List: z.object({ items: z.array(text).max(limits.rows), ordered: z.boolean().optional() }),
  Badge: z.object({ text, tone: tone.optional() }),
  Progress: z.object({ value: finite.min(0), max: finite.positive().optional(), label: text.optional() }),
  NumberInput: z.object({ name, label: text, value: numberBinding, settings: numberSettings.optional() }),
  Toggle: z.object({ name, label: text, value: booleanBinding, settings: settings.optional() }),
  Slider: z.object({ name, label: text, value: numberBinding, min: finite, max: finite, step: finite.positive().optional(), settings: settings.optional() }),
  DatePicker: z.object({ name, label: text, value: stringBinding, settings: dateSettings.optional() }),
  Tree: z.object({ name, label: text, nodes: z.array(treeNodeSchema).min(collectionMin).max(limits.treeNodes), value: stringBinding, settings: settings.optional() }),
};

export type ComponentName = keyof typeof componentSpecs;

export const descriptions: Record<ComponentName, string> = {
  Accordion: "Boolean disclosure with component children. Enter/Space toggles, Left closes, Right opens. Hidden children retain values and validate; errors reveal them. Disabled disclosure disables descendants.",
  Callout: "Semantic notice with title and text. Optional settings.tone and dismissible. Dismissal is explicit, local to this view, and never submits or sets state.",
  EditableTable: "Edit up to 200 plain records using 1–20 columns {key,label,type}, where type is string, number or boolean. Keys are unique and rows have exactly those typed keys. Bind value to a record-array $variable. Enter edits a selected cell. Valid text and number edits apply locally on each keystroke; booleans toggle immediately. Invalid numeric text stays visible, preserves the last typed value and blocks collection only. Other controls and pages remain usable. Enter exits a valid edit, not a delayed commit. No row insertion/deletion, null cells, helpers or external persistence.",
  Text: "Plain terminal text with optional semantic tone, bold, and italic styling. Reactive expressions are evaluated before rendering.",
  Stack: "Vertical component layout. Children can use any supplied component or nested layout.",
  Select: `Single-choice list. Provide ${collectionMin} through ${limits.options} options, as strings or {value,label,description?,disabled?}. Bind value to a declared string $variable.`,
  Input: "Single-line string input. Name uniquely identifies the field; value can bind to a $variable. Optional placeholder precedes settings.",
  Button: "Run local @Set/@Reset actions without closing. In collect mode, @ToAssistant or a legacy action identifier submits. Local mode forbids submission paths; Action([...]) may sequence only Set/Reset there.",
  Table: `Read-only table with ${collectionMin} through ${limits.columns} columns and at most ${limits.rows} rows. Every row has exactly as many scalar cells as columns.`,
  Checkbox: "Boolean check box. A required checkbox must be checked before submission.",
  MultiSelect: `Multiple-choice list. Provide ${collectionMin} through ${limits.options} options, as strings or {value,label,description?,disabled?}; value is an array of selected option values. Use [] for an empty selection, not an empty options list.`,
  TextArea: `Multiline string input. Optional settings.rows is an integer from ${textAreaRows.min} through ${textAreaRows.max}, setting the maximum visible viewport height; placeholder precedes settings.`,
  Row: `Horizontal component layout that adapts to narrow terminals. Optional settings.gap is an integer from ${rowGap.min} through ${rowGap.max} columns.`,
  Section: "Titled group of components with optional description and semantic tone.",
  Card: "Visually enclosed titled group of components with optional description and semantic tone.",
  Divider: "Horizontal divider with an optional short label.",
  Tabs: `Tabbed component pages. Provide ${collectionMin} through ${limits.options} items shaped {value,label,children}; the bound string value selects the visible page. All pages participate in validation and submission.`,
  Steps: `Sequential component pages. Provide ${collectionMin} through ${limits.options} items shaped {value,label,children}; the bound string value selects the visible step. All steps participate in validation and submission.`,
  Markdown: "Terminal-rendered Markdown text; no HTML or browser is used.",
  CodeBlock: "Monospaced source code with an optional language label.",
  List: `List of at most ${limits.rows} strings. Set ordered to true for numbered items.`,
  Badge: "Compact text label with an optional semantic tone; the default tone is accent.",
  Progress: "Numeric progress indicator. max must be strictly positive when supplied and defaults to 100; value ranges from zero through max. Optional label describes the measurement.",
  NumberInput: "Finite numeric input. Optional settings.min/max constrain range and settings.step controls increment size.",
  Toggle: "Boolean on/off control. Its value can bind to a declared boolean $variable.",
  Slider: "Finite numeric control with explicit min/max, optional positive step, and optional common field settings.",
  DatePicker: "Date input using a YYYY-MM-DD string; empty string is allowed when optional. Optional minDate/maxDate use the same format and must satisfy minDate <= maxDate when both are supplied.",
  Tree: `Single selection from recursive nodes {value,label,children?,description?,disabled?}. Provide ${collectionMin} through ${limits.treeNodes} root nodes, at most ${limits.treeNodes} total nodes and depth ${limits.treeDepth}; child arrays may be empty. All values must be unique; disabled parent nodes disable descendants.`,
};

// SAFETY: Object.entries enumerates only componentSpecs keys, each of which has a corresponding description.
export const library = createLibrary({
  root: "Stack",
  components: Object.entries(componentSpecs).map(([componentName, props]) => defineComponent({
    name: componentName, props, description: descriptions[componentName as ComponentName], component: componentName,
  })),
});

export function buildSystemPrompt(): string {
  return library.prompt({
    bindings: true, builtinFunctions: true, toolCalls: false, editMode: false,
    preamble: "Present responses with OpenUI components alongside Markdown and natural language when they materially help the user understand, explore, compare, or act on information. Use show_ui for static displays, nonblocking local explanations and exploration, or answer-collecting decisions in Pi's native terminal. Choose the interaction contract, then put a complete OpenUI Lang document in source.",
    additionalRules: [
      "Use UI proactively when it provides a clear advantage, even without an explicit visualization request. Do not ask permission merely to display an appropriate component; still respect the user's preferred medium and approvals for external actions. Choose by user intent, not novelty. Prefer the simplest representation and avoid decorative or redundant widgets. Explain essential conclusions in natural language without hiding the main answer behind interaction. Use prose for reasoning and simple answers. Display-only documents render inline without waiting; do not add acknowledgement buttons merely to show content.",
      "Use Table for structured or multidimensional comparisons, Card for distinct items with related attributes, Slider for numeric exploration, and Select/MultiSelect for discrete alternatives. Use Accordion for optional explanatory detail, Tabs for related perspectives, Steps for process stages, and Tree for hierarchies. Use a form for multiple required inputs only when a conversational question would not suffice. Every control must perform a meaningful action and keep displayed values consistent with state. Charts, geographic maps and interactive diagrams are not supplied components; use an accurate supported representation or another appropriate available tool rather than inventing components.",
      "Choose among three contracts: a display-only document returns status displayed immediately; interaction: local mounts an interactive transcript widget and returns status mounted plus widgetId immediately without values; default interaction or interaction: collect waits for a submitted/cancelled answer when controls are present. Removing Submit does not make a collect-mode document nonblocking. Use local for optional calculators, comparisons, tabs, trees and expandable explanations when no answer must reach the agent; the worker-cost example below uses interaction: local.",
      "show_ui accepts presentation: auto (default), inline, or fullscreen. Local mode requires auto/inline and rejects fullscreen; its composer stays available and widgets remain interactive across later chat/turns. Local widgets start compact; F2 while focused or the header control expands/collapses their height within the transcript without sending values. In collect mode prefer auto/inline; reserve fullscreen for requested or dense inspection and use F2 to expand/collapse without losing edits. Displayed and mounted are neither a user choice nor approval.",
      "Choose the interaction pattern first, then the smallest supported component composition: purpose, essential controls, visible consequences or comparison, and a final action only when collecting an answer. Reuse known answers and sensible defaults. Read the openui skill, when available, for design recipes; these schemas remain the authoritative signatures.",
      "Ground displayed facts in user context or tool results; label illustrative numbers and assumptions, preserve units, and never fabricate measured progress or completed work. For scenario exploration, bind controls to derived Text/Table/Progress expressions so consequences update locally. Local widgets never forward edited values or invoke tools. Use a separate collect-mode workflow when the agent needs an answer before fetching new data or performing external work.",
      "The show_ui tool accepts optional summary: {title, fields}. Use a short neutral title and an ordered array of field names for the human-readable receipt. Summary hints do not filter a submitted structured result; for local mode summary.title supplies the single widget header and summary.fields does not export local edits. Start a local document with useful context or controls instead of repeating its header title as the first Text/Markdown heading; retain headings for distinct internal sections. Pi chooses status and theme automatically. A submitted form confirms receipt of user input, not execution of the requested work.",
      "Always declare root = Stack([...]). Use only supplied components. Layout children and each Tabs/Steps item's children must be component calls or references.",
      `Field names are data keys, not display labels. They match ${fieldNamePattern.source} and contain at most ${fieldNameMax} characters, for example deployment_region. Legacy action identifiers use the same name schema.`,
      `Text-bearing strings contain at most ${limits.text} characters, including labels, text, code, placeholders, descriptions, errors, option/page/tree values, string field values, list items and table string cells. Field names have their separate restriction.`,
      "All field names, including Tabs and Steps, must be unique across the entire document. Bind values to declared $variables of the right type: strings for text, dates and single selection; booleans for Checkbox/Toggle; numbers for NumberInput/Slider; string arrays for MultiSelect.",
      "Select/MultiSelect option values, Tree node values, and Tabs/Steps item values must be unique. Single selections must identify an existing option. MultiSelect values must be a unique subset of option values. Disabled options cannot be selected by the user.",
      "Common optional field settings are {description, required, disabled, error}. Required or explicit-error fields remain editable, but enabled fields with validation errors block submission even on hidden pages. Input/TextArea placeholder precedes settings; use null for an omitted placeholder when supplying settings.",
      "Use optional styling settings sparingly: Text tone/bold/italic; Button variant primary/secondary/danger; Section/Card tone/description; Row gap. Tones are default, muted, accent, success, warning, or error. Badge defaults to accent.",
      "Button actions support @Set($variable, value), @Reset($variable, ...), @ToAssistant(message, context?), and ordered Action([...]) with at most 32 steps. Set/Reset are local updates. In collect mode, @ToAssistant submits current fields/state and closes the form; use at most one, last in the plan. Local mode rejects ToAssistant and legacy string submissions even on hidden/conditional paths; Action may contain only Set/Reset, and dynamic unprovable action sources are rejected.",
      "Declare every @Set/@Reset target with $variable = default before using it. Reset requires at least one target. All steps commit together only if the resulting UI remains valid; otherwise state is unchanged. Legacy Button(label, \"submit\") is supported only in collect mode. Query, Mutation, @Run, @OpenUrl, custom actions, URLs, scripts and external tools are unsupported.",
      "Accordion(name,label,children,value,settings?) binds a boolean disclosure; all hidden children still validate and submit. Callout(title,text,settings?) is a semantic notice; only dismissible:true adds a local dismissal control. EditableTable(name,label,columns,value,settings?) binds an array of plain records with exactly the unique column keys and matching string/number/boolean types. Valid cell edits apply locally immediately, without submission or persistence. Invalid numeric text remains editable and blocks collection, not other controls or navigation. There are no Save/Discard controls. Use no helper components. Existing Table remains read-only.",
      "Table rows contain strings, numbers, booleans or null and match the column count. Numeric ranges must have min <= max and positive steps. Dates and date bounds use valid YYYY-MM-DD calendar dates. Keep documents compact for a terminal.",
      "In collect mode Escape/Ctrl+C closes the form and returns status cancelled normally; the caller resumes without notebook restart. Only submitted contains user choices. Do not treat defaults as answers or reopen a cancelled form. Local mode returns mounted once and never forwards edits on blur, close or later chat; continue independently authorized work without waiting for a later result. F6 transfers focus between chat and a local widget, Shift+F6 cycles widgets, F2 expands/collapses its inline height, and Escape/Ctrl+C returns to chat. /openui-focus [id] selects a widget; /openui-close [id] dismisses it without sending values. Local widgets mount from completed source only; explicit collect streaming previews remain read-only until valid.",
      "Hide/Restore are host presentation controls, not generated OpenUI actions. Hide retains live values, drafts, tabs/steps, scroll and expanded height in a one-line placeholder; Restore resumes and focuses the same widget. Hidden widgets leave the status hint and F6/Shift+F6 cycle. /openui-hide [id] hides a visible widget; /openui-restore [id] restores the most recently hidden widget when no id is supplied. Close permanently disposes a visible or hidden widget. Hide/Restore sends no values and invokes no tool/model call.",
      "Each local widget owns independent live state across turns. Session navigation/shutdown disposes it; reopening/replaying a branch reconstructs original source/defaults, visible and compact, not edited values, cursor state, expansion or hidden state. Compaction disposes widgets whose transcript rows are removed; up to 16 widgets may remain live, including hidden widgets. Local exploration is not durable answer storage. Use a collect-mode form when a saved user choice is required.",
    ],
    examples: [
      '$choice = "One"\n$note = ""\nroot = Stack([Text("Choose an option"), Select("choice", "Choice", ["One", "Two"], $choice), Input("note", "Note", $note, "Optional"), Button("Reset", @Reset($choice, $note)), Button("Submit", @ToAssistant("Use my choices", {choice: $choice, note: $note}))])',
      '$workers = 4\nroot = Stack([Text("Illustrative worker cost at $15/month each"), NumberInput("workers", "Workers", $workers, {min: 1, max: 20, step: 1}), Table(["Workers", "Monthly cost ($)"], [[$workers, 15 * $workers]]), Button("Reset", @Reset($workers))])',
      '$tab = "details"\n$agree = false\n$tags = []\n$quantity = 1\nroot = Stack([Tabs("page", [{value: "details", label: "Details", children: [NumberInput("quantity", "Quantity", $quantity, {min: 1, max: 10}), MultiSelect("tags", "Tags", ["Urgent", "Reviewed"], $tags)]}, {value: "confirm", label: "Confirm", children: [Checkbox("agree", "I confirm", $agree, {required: true})]}], $tab), Button("Submit", @ToAssistant("Use these values"))])',
    ],
  });
}

/** Rendered object literals may omit parser-owned streaming metadata. */
export type RenderedNode = Omit<ElementNode, "partial"> & { partial?: boolean };

const elementSchema = z.object({
  type: z.literal("element"),
  typeName: z.string(),
  props: z.record(z.string(), z.unknown()),
  partial: z.boolean().optional(),
  statementId: z.string().optional(),
  hasDynamicProps: z.boolean().optional(),
});

/** Validate the upstream header only. Streaming props can still be incomplete. */
export function isElement(value: unknown): value is RenderedNode {
  return elementSchema.safeParse(value, predicateParseContext).success;
}

const fieldNames = new Set<string>(["Input", "Select", "Checkbox", "MultiSelect", "TextArea", "Tabs", "Steps", "NumberInput", "Toggle", "Slider", "DatePicker", "Tree", "Accordion", "EditableTable"]);

export function isField(node: RenderedNode): boolean { return fieldNames.has(node.typeName); }

export function fieldOptions(node: RenderedNode): FieldOptions {
  const schema = node.typeName === "NumberInput" || node.typeName === "Slider" ? numberSettings
    : node.typeName === "DatePicker" ? dateSettings
    : node.typeName === "TextArea" ? componentSpecs.TextArea.shape.settings.unwrap() : settings;

  const checked = schema.safeParse(node.props.settings, predicateParseContext);

  return checked.success ? checked.data : {};
}

export function valueSchemaFor(node: RenderedNode): z.ZodType | undefined {
  if (!Object.hasOwn(componentSpecs, node.typeName)) return;

  // SAFETY: The own-key check limits this lookup to the component schema registry.
  const spec = componentSpecs[node.typeName as ComponentName];

  return "value" in spec.shape ? spec.shape.value : undefined;
}

/** All direct children, including inactive pages; validation must cover every page. */
export function childNodes(node: RenderedNode): RenderedNode[] {
  if (["Stack", "Row", "Section", "Card", "Accordion"].includes(node.typeName)) {
    return Array.isArray(node.props.children) ? node.props.children.filter(isElement) : [];
  }

  if (node.typeName === "Tabs" || node.typeName === "Steps") {
    const checked = pages.safeParse(node.props.items, predicateParseContext);

    return checked.success ? checked.data.flatMap(item => item.children.filter(isElement)) : [];
  }

  return [];
}

interface OptionCandidate {
  value?: unknown;
  label?: unknown;
  description?: unknown;
  disabled?: unknown;
  children?: unknown;
}

type OptionHeader = OptionCandidate & Pick<NormalizedOption, "value" | "label">;

const optionObjectSchema = z.object({});

const optionCandidateSchema = z.custom<OptionCandidate>(value => optionObjectSchema.safeParse(value, predicateParseContext).success || Array.isArray(value));

const optionTextSchema = z.string();

const isOptionText = (value: unknown): value is string => optionTextSchema.safeParse(value, predicateParseContext).success;

function isOptionHeader(value: unknown): value is OptionHeader {
  const candidate = optionCandidateSchema.safeParse(value, predicateParseContext);

  return candidate.success && isOptionText(candidate.data.value) && isOptionText(candidate.data.label);
}

/** Normalize labels and values without changing what is stored or submitted. */
export function optionItems(node: RenderedNode): NormalizedOption[] {
  if (node.typeName === "Tree") {
    const output: NormalizedOption[] = [];

    const visit = (items: RenderedNode["props"][string], depth: number, parentDisabled: boolean): void => {
      if (!Array.isArray(items) || depth >= limits.treeDepth || output.length >= limits.treeNodes) return;

      for (const item of items) {
        if (!isOptionHeader(item)) continue;
        const disabled = parentDisabled || item.disabled === true;
        const normalized: NormalizedOption = { value: item.value, label: item.label, depth };

        if (isOptionText(item.description)) normalized.description = item.description;

        if (disabled) normalized.disabled = true;
        output.push(normalized);

        if (output.length >= limits.treeNodes) return;
        visit(item.children, depth + 1, disabled);
      }
    };

    visit(node.props.nodes, 0, false);

    return output;
  }

  const items = node.typeName === "Tabs" || node.typeName === "Steps" ? node.props.items : node.props.options;

  if (!Array.isArray(items)) return [];

  return items.flatMap((item): NormalizedOption[] => {
    if (isOptionText(item)) return [{ value: item, label: item }];

    if (!isOptionHeader(item)) return [];
    const normalized: NormalizedOption = { value: item.value, label: item.label };

    if (isOptionText(item.description)) normalized.description = item.description;

    if (item.disabled === true) normalized.disabled = true;

    return [normalized];
  });
}
