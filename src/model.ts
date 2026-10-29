import {
  createLibrary, createParser, createStore, createStreamingParser, defineComponent,
  evaluateRoot, isReactiveAssign, markReactive, resolveStateField,
  type ElementNode, type EvaluationContext, type OpenUIError, type ParseResult,
} from "@openuidev/lang-core";
import { z } from "zod";

export const limits = { source: 65_536, nodes: 256, depth: 32, text: 4_000, rows: 200, columns: 20, options: 200 } as const;
const text = z.string().max(limits.text);
const name = z.string().regex(/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/);
const binding = z.string().max(limits.text);
markReactive(binding);
const scalar = z.union([text, z.number().finite(), z.boolean(), z.null()]);
const specs = {
  Text: z.object({ text }),
  Stack: z.object({ children: z.array(z.any()).max(limits.nodes).describe("Child components, including nested Stack components") }),
  Select: z.object({ name, label: text, options: z.array(text).min(1).max(limits.options), value: binding }),
  Input: z.object({ name, label: text, value: binding, placeholder: text.optional() }),
  Button: z.object({ label: text, action: name }),
  Table: z.object({ columns: z.array(text).min(1).max(limits.columns), rows: z.array(z.array(scalar).max(limits.columns)).max(limits.rows) }),
};
const descriptions: Record<keyof typeof specs, string> = {
  Text: "Plain terminal text. Reactive expressions are evaluated before rendering.",
  Stack: "Vertical layout. Its children must be Text, Stack, Select, Input, Button, or Table components.",
  Select: "Single-choice keyboard list. A unique name identifies the field; value can bind to a $variable.",
  Input: "Single-line text input. A unique name identifies the field; value can bind to a $variable.",
  Button: "Submit the named action and current form/state values to the active Pi session.",
  Table: "Read-only table. Each row must have exactly as many scalar cells as columns.",
};

export const library = createLibrary({
  root: "Stack",
  components: Object.entries(specs).map(([componentName, props]) => defineComponent({
    name: componentName, props, description: descriptions[componentName as keyof typeof specs], component: componentName,
  })),
});

export const systemPrompt = library.prompt({
  bindings: true, builtinFunctions: true, toolCalls: false, editMode: false,
  preamble: "Use show_ui to ask the user for structured input in Pi's native terminal. Put a complete OpenUI Lang document in its source argument.",
  additionalRules: [
    "Always declare root = Stack([...]). Use only the six supplied components; Stack children are component calls or references.",
    "Input and Select names must be unique identifiers. Bind their value argument to a declared string $variable. Select options are nonempty, unique strings.",
    "Button action is a plain identifier such as submit. Pressing it returns all current fields and state to Pi. No Action(), Query(), Mutation(), URLs, scripts, or external tools are supported.",
    "Table rows contain strings, numbers, booleans or null and match the column count. Keep documents compact for a terminal.",
    "Escape and Ctrl+C cancel. Streaming previews cannot submit until the document is complete and valid.",
  ],
  examples: ['$choice = "One"\n$note = ""\nroot = Stack([Text("Choose an option"), Select("choice", "Choice", ["One", "Two"], $choice), Input("note", "Note", $note, "Optional"), Button("Submit", "submit")])'],
});
export const modelPrompt = systemPrompt;

export function isElement(value: unknown): value is ElementNode {
  return !!value && typeof value === "object" && (value as ElementNode).type === "element";
}

// lang-core deliberately recovers incomplete syntax and skips non-assignment lines.
// Check the document envelope so completed tool calls cannot silently lose bad lines.
// Expression parsing and all evaluation still belong to lang-core.
function checkEnvelope(source: string, streaming: boolean): string[] {
  const stack: string[] = [];
  const closing: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  const statements: string[] = [];
  let quote = "";
  let escaped = false;
  let top = "";
  for (const char of source) {
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) { quote = ""; if (!stack.length) top += '"'; }
      continue;
    }
    if (char === '"' || char === "'") { quote = char; if (!stack.length) top += '"'; continue; }
    if ('([{'.includes(char)) {
      if (!stack.length) top += char;
      stack.push(char);
      if (stack.length > limits.depth * 3) return ["Document exceeds the syntax nesting limit."];
      continue;
    }
    if (char in closing) {
      if (stack.pop() !== closing[char]) return ["Document has mismatched closing brackets."];
      if (!stack.length) top += char;
      continue;
    }
    if (!stack.length) {
      if (char === "\n") { if (top.trim()) statements.push(top.trim()); top = ""; }
      else top += char;
    }
  }
  if (streaming) return [];
  if (quote || stack.length) return ["Document is incomplete; close all strings and brackets."];
  if (top.trim()) statements.push(top.trim());
  for (const statement of statements) {
    if (!/^\$?[A-Za-z_][A-Za-z0-9_]*\s*=\s*(?:[A-Za-z_$@\d!\-([{"'])/.test(statement)) return ["Every statement must be an identifier = expression on its own line."];
    if (/[)\]}"']\s*[A-Za-z_$@]/.test(statement)) return ["Unexpected text after an expression."];
  }
  return [];
}

/** A single UI's parser, state store and evaluated tree. No terminal or host dependencies. */
export class DocumentModel {
  root: ElementNode | null = null;
  diagnostics: string[] = [];
  streaming = false;
  valid = false;
  private result: ParseResult | null = null;
  private parseDiagnostics: string[] = [];
  private store = createStore();
  private fields = new Map<string, unknown>();
  private parser = createParser(library.toJSONSchema(), "Stack");
  private streamParser = createStreamingParser(library.toJSONSchema(), "Stack");
  private disposed = false;
  private context: EvaluationContext = {
    getState: (key) => this.store.get(key),
    // lang-core resolves ordinary declarations during parsing; this adapter has no queries.
    resolveRef: () => undefined,
  };

  constructor(source?: string) { if (source !== undefined) this.update(source); }

  /** Includes lang-core $variables and unbound form fields, without losing their distinct names. */
  get state(): Record<string, unknown> { return { ...this.store.getSnapshot(), ...Object.fromEntries(this.fields) }; }

  /** Full accumulated source, never a delta. Partial parses are for preview only. */
  update(source: string, streaming = false): void {
    if (this.disposed) return;
    const wasStreaming = this.streaming;
    this.streaming = streaming;
    this.result = null;
    this.parseDiagnostics = [];
    if (source.length > limits.source) this.parseDiagnostics.push(`Document exceeds ${limits.source} characters.`);
    else if (!streaming && !source.trim()) this.parseDiagnostics.push("Document is empty.");
    else {
      try {
        this.parseDiagnostics.push(...checkEnvelope(source, streaming));
        if (this.parseDiagnostics.length) { this.refresh(); return; }
        this.result = streaming || wasStreaming ? this.streamParser.set(source, !streaming) : this.parser.parse(source);
        const { meta } = this.result;
        this.parseDiagnostics.push(...meta.errors.map((error) => error.message));
        if (!streaming && meta.incomplete) this.parseDiagnostics.push("Document is incomplete; close all strings and brackets.");
        if (!streaming && meta.unresolved.length) this.parseDiagnostics.push(`Unresolved references: ${meta.unresolved.join(", ")}`);
        if (!streaming && !/\broot\s*=/.test(source)) this.parseDiagnostics.push("Document must declare root.");
        if (this.result.queryStatements.length || this.result.mutationStatements.length) this.parseDiagnostics.push("Query and Mutation are not supported.");
        this.store.initialize(this.result.stateDeclarations, {});
      } catch (error) {
        this.parseDiagnostics.push(`Unable to parse document: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    this.refresh();
  }

  fieldValue(node: ElementNode): string {
    const value = this.field(node).value;
    return typeof value === "string" ? value : "";
  }

  setField(node: ElementNode, value: string): void {
    if (this.disposed || this.streaming || !this.valid || value.length > limits.text) return;
    if (node.typeName !== "Input" && node.typeName !== "Select") return;
    if (node.typeName === "Select" && !(node.props.options as string[]).includes(value)) return;
    this.field(node).setValue(value);
    this.refresh();
  }

  setValue(field: string, value: string): void {
    if (this.disposed || value.length > limits.text || !/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(field)) return;
    this.store.set(field, value);
    this.refresh();
  }

  get formValues(): Record<string, string> {
    const values = new Map<string, string>();
    const visit = (node: ElementNode) => {
      if (node.typeName === "Input" || node.typeName === "Select") values.set(node.props.name as string, this.fieldValue(node));
      if (node.typeName === "Stack") for (const child of node.props.children as unknown[]) if (isElement(child)) visit(child);
    };
    if (this.root) visit(this.root);
    return Object.fromEntries(values);
  }

  dispose(): void {
    this.disposed = true;
    this.store.dispose();
    this.fields.clear();
    this.root = null;
    this.result = null;
    this.valid = false;
    this.streaming = false;
  }

  private field(node: ElementNode) {
    return resolveStateField<string>(String(node.props.name), node.props.value, this.store, this.context,
      (key) => this.fields.get(key), (key, value) => { this.fields.set(key, value); });
  }

  private refresh(): void {
    this.root = null;
    this.diagnostics = [...this.parseDiagnostics];
    this.valid = false;
    if (!this.result) return;
    try {
      const errors: OpenUIError[] = [];
      const evaluated = evaluateRoot(this.result, { ctx: this.context, library, store: this.store, errors });
      this.diagnostics.push(...errors.map((error) => error.message));
      if (evaluated) {
        let count = 0;
        const names = new Set<string>();
        const validate = (node: ElementNode, depth: number): ElementNode | null => {
          if (++count > limits.nodes || depth > limits.depth) throw new Error("Document exceeds the component count or nesting limit.");
          const schema = specs[node.typeName as keyof typeof specs];
          if (!schema) { this.diagnostics.push(`Unsupported component: ${node.typeName}`); return null; }
          const props = { ...node.props };
          if (node.typeName === "Input" || node.typeName === "Select") {
            if (isReactiveAssign(props.value) && !/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(props.value.target)) throw new Error("Invalid state binding.");
            const resolved = this.field(node).value;
            props.value = resolved ?? (this.streaming ? "" : resolved);
            if (names.has(String(props.name))) this.diagnostics.push(`Duplicate field name: ${props.name}`);
            names.add(String(props.name));
          }
          const checked = schema.safeParse(props);
          if (!checked.success) {
            this.diagnostics.push(...checked.error.issues.map((issue) => `${node.typeName}.${issue.path.join(".")}: ${issue.message}`));
            return null;
          }
          if (node.typeName === "Select") {
            const options = props.options as string[];
            if (new Set(options).size !== options.length) this.diagnostics.push("Select options must be unique.");
            if (!this.streaming && !options.includes(props.value as string)) this.diagnostics.push(`Select ${props.name} value must be one of its options.`);
          }
          if (node.typeName === "Table" && (props.rows as unknown[][]).some((row) => row.length !== (props.columns as string[]).length)) this.diagnostics.push("Table rows must match the number of columns.");
          if (node.typeName === "Stack") {
            const children: ElementNode[] = [];
            for (const child of props.children as unknown[]) {
              if (child == null && this.streaming) continue;
              if (!isElement(child)) { this.diagnostics.push("Stack children must be components."); continue; }
              const validChild = validate(child, depth + 1);
              if (validChild) children.push(validChild);
            }
            return { ...node, props: { ...node.props, children } };
          }
          return node;
        };
        this.root = validate(evaluated, 1);
        if (!this.streaming && this.root && this.root.typeName !== "Stack") this.diagnostics.push("root must be a Stack component.");
      }
      if (!this.root && !this.streaming) this.diagnostics.push("Document has no renderable root.");
      this.diagnostics = [...new Set(this.diagnostics)].slice(0, 20);
      this.valid = !this.streaming && !!this.root && this.diagnostics.length === 0;
    } catch (error) {
      this.root = null;
      this.diagnostics.push(`Unable to evaluate document: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
