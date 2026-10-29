import { action, createLibrary, defineComponent, markReactive, type ElementNode } from "@openuidev/lang-core";
import { z } from "zod";

export const limits = {
  source: 65_536, nodes: 256, depth: 32, text: 4_000, rows: 200,
  columns: 20, options: 200, actionSteps: 32, treeNodes: 200, treeDepth: 16,
} as const;

export type FieldValue = string | boolean | number | string[];
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

const text = z.string().max(limits.text);
const name = z.string().regex(/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/);
const tone = z.enum(["default", "muted", "accent", "success", "warning", "error"]);
const finite = z.number().finite();
const children = z.array(z.any()).max(limits.nodes).describe("Child component calls or references; nested layouts are supported");
const settings = z.object({ description: text.optional(), required: z.boolean().optional(), disabled: z.boolean().optional(), error: text.optional() });
const numberSettings = settings.extend({ min: finite.optional(), max: finite.optional(), step: finite.positive().optional() });
const dateSettings = settings.extend({ minDate: text.optional(), maxDate: text.optional() });
const option = z.object({ value: text, label: text, description: text.optional(), disabled: z.boolean().optional() });
const options = z.array(z.union([text, option])).min(1).max(limits.options);
const scalar = z.union([text, finite, z.boolean(), z.null()]);
const stringBinding = z.string().max(limits.text);
const booleanBinding = z.boolean();
const numberBinding = z.number().finite();
const multipleBinding = z.array(text).max(limits.options);
for (const schema of [stringBinding, booleanBinding, numberBinding, multipleBinding]) markReactive(schema);

// Zod's lazy schema exports as a recursive JSON Schema reference. The model
// applies total-node and depth limits before accepting the tree for rendering.
const treeNodeSchema: z.ZodType<TreeNode> = z.lazy(() => z.object({
  value: text,
  label: text,
  description: text.optional(),
  disabled: z.boolean().optional(),
  children: z.array(treeNodeSchema).max(limits.treeNodes).optional(),
}));
const pages = z.array(z.object({ value: text, label: text, children })).min(1).max(limits.options);

/** Property order is the public positional OpenUI Lang signature. */
export const componentSpecs = {
  Text: z.object({ text, settings: z.object({ tone: tone.optional(), bold: z.boolean().optional(), italic: z.boolean().optional() }).optional() }),
  Stack: z.object({ children }),
  Select: z.object({ name, label: text, options, value: stringBinding, settings: settings.optional() }),
  Input: z.object({ name, label: text, value: stringBinding, placeholder: text.optional(), settings: settings.optional() }),
  Button: z.object({ label: text, action: z.union([name, action()]), settings: z.object({ variant: z.enum(["primary", "secondary", "danger"]).optional(), disabled: z.boolean().optional(), description: text.optional() }).optional() }),
  Table: z.object({ columns: z.array(text).min(1).max(limits.columns), rows: z.array(z.array(scalar).max(limits.columns)).max(limits.rows) }),
  Checkbox: z.object({ name, label: text, value: booleanBinding, settings: settings.optional() }),
  MultiSelect: z.object({ name, label: text, options, value: multipleBinding, settings: settings.optional() }),
  TextArea: z.object({ name, label: text, value: stringBinding, placeholder: text.optional(), settings: settings.extend({ rows: z.number().int().min(5).max(12).optional() }).optional() }),
  Row: z.object({ children, settings: z.object({ gap: z.number().int().min(0).max(8).optional() }).optional() }),
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
  Tree: z.object({ name, label: text, nodes: z.array(treeNodeSchema).min(1).max(limits.treeNodes), value: stringBinding, settings: settings.optional() }),
};
export type ComponentName = keyof typeof componentSpecs;

export const descriptions: Record<ComponentName, string> = {
  Text: "Plain terminal text with optional semantic tone, bold, and italic styling. Reactive expressions are evaluated before rendering.",
  Stack: "Vertical component layout. Children can use any supplied component or nested layout.",
  Select: "Single-choice list. Options are strings or {value,label,description?,disabled?}. Bind value to a declared string $variable.",
  Input: "Single-line string input. Name uniquely identifies the field; value can bind to a $variable. Optional placeholder precedes settings.",
  Button: "Run local @Set/@Reset actions without closing, or submit with @ToAssistant. Action([...]) runs an ordered sequence. A legacy action identifier also submits.",
  Table: "Read-only table. Every row has exactly as many scalar cells as columns.",
  Checkbox: "Boolean check box. A required checkbox must be checked before submission.",
  MultiSelect: "Multiple-choice list. Options are strings or {value,label,description?,disabled?}; value is an array of selected option values.",
  TextArea: "Multiline string input. Optional settings.rows sets its maximum visible viewport height from 5 through 12 rows; placeholder precedes settings.",
  Row: "Horizontal component layout that adapts to narrow terminals. Optional gap is a nonnegative integer number of columns.",
  Section: "Titled group of components with optional description and semantic tone.",
  Card: "Visually enclosed titled group of components with optional description and semantic tone.",
  Divider: "Horizontal divider with an optional short label.",
  Tabs: "Tabbed component pages. Items are {value,label,children}; the bound string value selects the visible page. All pages participate in validation and submission.",
  Steps: "Sequential component pages. Items are {value,label,children}; the bound string value selects the visible step. All steps participate in validation and submission.",
  Markdown: "Terminal-rendered Markdown text; no HTML or browser is used.",
  CodeBlock: "Monospaced source code with an optional language label.",
  List: "List of strings. Set ordered to true for numbered items.",
  Badge: "Compact text label with an optional semantic tone; the default tone is accent.",
  Progress: "Numeric progress indicator. max defaults to 100; value ranges from zero through max. Optional label describes the measurement.",
  NumberInput: "Finite numeric input. Optional settings.min/max constrain range and settings.step controls increment size.",
  Toggle: "Boolean on/off control. Its value can bind to a declared boolean $variable.",
  Slider: "Finite numeric control with explicit min/max, optional positive step, and optional common field settings.",
  DatePicker: "Date input using a YYYY-MM-DD string; empty string is allowed when optional. Optional minDate/maxDate use the same format.",
  Tree: "Single selection from recursive nodes {value,label,children?,description?,disabled?}. All values must be unique; disabled parent nodes disable descendants.",
};

export const library = createLibrary({
  root: "Stack",
  components: Object.entries(componentSpecs).map(([componentName, props]) => defineComponent({
    name: componentName, props, description: descriptions[componentName as ComponentName], component: componentName,
  })),
});

export const systemPrompt = library.prompt({
  bindings: true, builtinFunctions: true, toolCalls: false, editMode: false,
  preamble: "Use show_ui to ask the user for structured input in Pi's native terminal. Put a complete OpenUI Lang document in its source argument.",
  additionalRules: [
    "Choose the smallest UI that fits the user's decision. Use the openui skill, when available, for component selection and layout recipes; these schemas remain the authoritative signatures.",
    "The show_ui tool accepts optional summary: {title, fields}. Use a short neutral title and an ordered array of field names for the human-readable receipt. Summary hints do not filter the structured result. Pi chooses status and theme automatically. A submitted form confirms receipt of user input, not execution of the requested work.",
    "Always declare root = Stack([...]). Use only supplied components. Layout children and each Tabs/Steps item's children must be component calls or references.",
    "All field names, including Tabs and Steps, must be unique across the entire document. Bind values to declared $variables of the right type: strings for text, dates and single selection; booleans for Checkbox/Toggle; numbers for NumberInput/Slider; string arrays for MultiSelect.",
    "Select/MultiSelect option values, Tree node values, and Tabs/Steps item values must be unique. Single selections must identify an existing option. MultiSelect values must be a unique subset of option values. Disabled options cannot be selected by the user.",
    "Common optional field settings are {description, required, disabled, error}. Required or explicit-error fields remain editable, but enabled fields with validation errors block submission even on hidden pages. Input/TextArea placeholder precedes settings; use null for an omitted placeholder when supplying settings.",
    "Use optional styling settings sparingly: Text tone/bold/italic; Button variant primary/secondary/danger; Section/Card tone/description; Row gap. Tones are default, muted, accent, success, warning, or error. Badge defaults to accent.",
    "Button actions support @Set($variable, value), @Reset($variable, ...), @ToAssistant(message, context?), and ordered Action([...]) with at most 32 steps. Local actions keep the form open; @ToAssistant submits current fields/state and closes it. Use at most one @ToAssistant, as the last step. Its message/context see preceding state changes.",
    "Declare every @Set/@Reset target with $variable = default before using it. Reset requires at least one target. All steps commit together only if the resulting UI remains valid; otherwise state is unchanged. Legacy Button(label, \"submit\") is also supported. Query, Mutation, @Run, @OpenUrl, custom actions, URLs, scripts and external tools are unsupported.",
    "Table rows contain strings, numbers, booleans or null and match the column count. Numeric ranges must have min <= max and positive steps. Progress max defaults to 100. Dates and date bounds use valid YYYY-MM-DD calendar dates. Tree supports at most 200 total nodes and depth 16. Keep documents compact for a terminal.",
    "Escape and Ctrl+C cancel. Streaming previews are read-only until the document is complete and valid.",
  ],
  examples: [
    '$choice = "One"\n$note = ""\nroot = Stack([Text("Choose an option"), Select("choice", "Choice", ["One", "Two"], $choice), Input("note", "Note", $note, "Optional"), Button("Reset", @Reset($choice, $note)), Button("Submit", @ToAssistant("Use my choices", {choice: $choice, note: $note}))])',
    '$count = 0\nroot = Stack([Text("Count: " + $count), Button("Increment", @Set($count, $count + 1)), Button("Increment and send", Action([@Set($count, $count + 1), @ToAssistant("Count: " + $count, {count: $count})]))])',
    '$tab = "details"\n$agree = false\n$tags = []\n$quantity = 1\nroot = Stack([Tabs("page", [{value: "details", label: "Details", children: [NumberInput("quantity", "Quantity", $quantity, {min: 1, max: 10}), MultiSelect("tags", "Tags", ["Urgent", "Reviewed"], $tags)]}, {value: "confirm", label: "Confirm", children: [Checkbox("agree", "I confirm", $agree, {required: true})]}], $tab), Button("Submit", @ToAssistant("Use these values"))])',
  ],
});
export const modelPrompt = systemPrompt;

export function isElement(value: unknown): value is ElementNode {
  return !!value && typeof value === "object" && (value as ElementNode).type === "element";
}

const fieldNames = new Set<string>(["Input", "Select", "Checkbox", "MultiSelect", "TextArea", "Tabs", "Steps", "NumberInput", "Toggle", "Slider", "DatePicker", "Tree"]);
export function isField(node: ElementNode): boolean { return fieldNames.has(node.typeName); }

export function fieldOptions(node: ElementNode): FieldOptions {
  const value = node.props.settings;
  return value && typeof value === "object" && !Array.isArray(value) ? value as FieldOptions : {};
}

export function valueSchemaFor(node: ElementNode): z.ZodType | undefined {
  const spec = componentSpecs[node.typeName as ComponentName];
  return spec && "value" in spec.shape ? spec.shape.value as z.ZodType : undefined;
}

/** All direct children, including inactive pages; validation must cover every page. */
export function childNodes(node: ElementNode): ElementNode[] {
  if (["Stack", "Row", "Section", "Card"].includes(node.typeName)) {
    return Array.isArray(node.props.children) ? node.props.children.filter(isElement) : [];
  }
  if (node.typeName === "Tabs" || node.typeName === "Steps") {
    return Array.isArray(node.props.items) ? node.props.items.flatMap(item =>
      item && typeof item === "object" && Array.isArray(item.children) ? item.children.filter(isElement) : []) : [];
  }
  return [];
}

/** Normalize labels and values without changing what is stored or submitted. */
export function optionItems(node: ElementNode): NormalizedOption[] {
  if (node.typeName === "Tree") {
    const output: NormalizedOption[] = [];
    const visit = (items: unknown, depth: number, parentDisabled: boolean): void => {
      if (!Array.isArray(items) || depth >= limits.treeDepth || output.length >= limits.treeNodes) return;
      for (const item of items) {
        if (!item || typeof item !== "object" || typeof item.value !== "string" || typeof item.label !== "string") continue;
        const disabled = parentDisabled || item.disabled === true;
        output.push({ value: item.value, label: item.label, depth, ...(typeof item.description === "string" ? { description: item.description } : {}), ...(disabled ? { disabled: true } : {}) });
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
    if (typeof item === "string") return [{ value: item, label: item }];
    if (!item || typeof item !== "object" || typeof item.value !== "string" || typeof item.label !== "string") return [];
    return [{ value: item.value, label: item.label, ...(typeof item.description === "string" ? { description: item.description } : {}), ...(item.disabled === true ? { disabled: true } : {}) }];
  });
}
