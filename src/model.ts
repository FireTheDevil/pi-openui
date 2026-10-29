import {
  action, createLibrary, createParser, createStore, createStreamingParser, defineComponent,
  evaluate, evaluateRoot, isReactiveAssign, markReactive, resolveStateField, split, tokenize,
  type ActionPlan, type ActionStep, type ASTNode, type ElementNode, type EvaluationContext, type OpenUIError, type ParseResult,
} from "@openuidev/lang-core";
import { z } from "zod";

export const limits = { source: 65_536, nodes: 256, depth: 32, text: 4_000, rows: 200, columns: 20, options: 200, actionSteps: 32 } as const;
export interface ActionSubmission {
  status: "submitted";
  action: string;
  message?: string;
  context?: unknown;
  state: Record<string, unknown>;
  values: Record<string, string>;
}
export type ActionOutcome = { status: "updated" } | ActionSubmission | { status: "error"; error: string };

// evaluateElementProps copies element metadata while evaluating props. Retain the
// parser's action AST so a later step sees state changed by an earlier step.
const actionSource = Symbol("openui.actionSource");
const actionSourceKey = "__piOpenUIActionSource";
type SourceButton = ElementNode & { [actionSource]?: unknown };
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const isPlan = (value: unknown): value is ActionPlan => isRecord(value) && Array.isArray(value.steps);
const isAST = (value: unknown): value is ASTNode => isRecord(value) && typeof value.k === "string";
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
  Button: z.object({ label: text, action: z.union([name, action()]) }),
  Table: z.object({ columns: z.array(text).min(1).max(limits.columns), rows: z.array(z.array(scalar).max(limits.columns)).max(limits.rows) }),
};
const descriptions: Record<keyof typeof specs, string> = {
  Text: "Plain terminal text. Reactive expressions are evaluated before rendering.",
  Stack: "Vertical layout. Its children must be Text, Stack, Select, Input, Button, or Table components.",
  Select: "Single-choice keyboard list. A unique name identifies the field; value can bind to a $variable.",
  Input: "Single-line text input. A unique name identifies the field; value can bind to a $variable.",
  Button: "Run local @Set/@Reset actions without closing, or submit with @ToAssistant. Action([...]) runs an ordered sequence. A legacy action identifier also submits.",
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
    "Button actions support @Set($variable, value), @Reset($variable, ...), @ToAssistant(message, context?), and ordered Action([...]) with at most 32 steps. Local actions keep the form open; @ToAssistant submits current fields/state and closes it. Use at most one @ToAssistant, as the last step. Its message/context see preceding state changes.",
    "Declare every @Set/@Reset target with $variable = default before using it. Reset requires at least one target. All steps commit together only if the resulting UI remains valid; otherwise state is unchanged. Legacy Button(label, \"submit\") is also supported. Query, Mutation, @Run, @OpenUrl, custom actions, URLs, scripts and external tools are unsupported.",
    "Table rows contain strings, numbers, booleans or null and match the column count. Keep documents compact for a terminal.",
    "Escape and Ctrl+C cancel. Streaming previews cannot submit until the document is complete and valid.",
  ],
  examples: ['$choice = "One"\n$note = ""\nroot = Stack([Text("Choose an option"), Select("choice", "Choice", ["One", "Two"], $choice), Input("note", "Note", $note, "Optional"), Button("Reset", @Reset($choice, $note)), Button("Submit", @ToAssistant("Use my choices", {choice: $choice, note: $note}))])', '$count = 0\nroot = Stack([Text("Count: " + $count), Button("Increment", @Set($count, $count + 1)), Button("Increment and send", Action([@Set($count, $count + 1), @ToAssistant("Count: " + $count, {count: $count})]))])'],
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
  private declaredState = new Set<string>();
  private dynamicActionSources = new Map<string, unknown>();
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
    this.declaredState.clear();
    this.dynamicActionSources.clear();
    this.parseDiagnostics = [];
    if (source.length > limits.source) this.parseDiagnostics.push(`Document exceeds ${limits.source} characters.`);
    else if (!streaming && !source.trim()) this.parseDiagnostics.push("Document is empty.");
    else {
      try {
        this.parseDiagnostics.push(...checkEnvelope(source, streaming));
        if (this.parseDiagnostics.length) { this.refresh(); return; }
        this.result = streaming || wasStreaming ? this.streamParser.set(source, !streaming) : this.parser.parse(source);
        this.declaredState = new Set(split(tokenize(source)).filter(statement => statement.id.startsWith("$")).map(statement => statement.id));
        const retainSources = (value: unknown): void => {
          if (!value || typeof value !== "object") return;
          if (isElement(value) && value.typeName === "Button") (value as SourceButton)[actionSource] = value.props.action;
          if (isAST(value) && value.k === "Comp" && value.name === "Button" && value.mappedProps) {
            // Runtime-selected components are reconstructed by lang-core. Carry
            // an opaque source key through that reconstruction as a literal prop.
            const key = String(this.dynamicActionSources.size);
            this.dynamicActionSources.set(key, value.mappedProps.action);
            value.mappedProps[actionSourceKey] = { k: "Str", v: key };
          }
          for (const child of Object.values(value)) retainSources(child);
        };
        retainSources(this.result.root);
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

  /** Execute a complete button action transaction; the view decides when to close. */
  activate(node: ElementNode): ActionOutcome {
    const fail = (error: string): ActionOutcome => ({ status: "error", error });
    if (this.disposed || this.streaming || !this.valid || !this.result) return fail("Actions require a complete, valid document.");
    const path = this.nodePath(node);
    if (!path || node.typeName !== "Button") return fail("This button is no longer part of the current UI.");
    const initialAction = node.props.action;
    if (typeof initialAction === "string") return { status: "submitted", action: initialAction, state: this.state, values: this.formValues };

    const originalStore = this.store;
    let stagedStore: ReturnType<typeof createStore> | undefined;
    try {
      // Resolve action-level conditionals once, then freeze the step sequence.
      // Each step's expressions are still evaluated against the current staged state.
      const source = (node as SourceButton)[actionSource] ?? this.dynamicActionSources.get(String(node.props[actionSourceKey]));
      // @Each substitutes its local variables before evaluating a Button. The
      // template's unsubstituted Ref nodes must not be evaluated outside that scope.
      const hasRefs = (value: unknown): boolean => Array.isArray(value) ? value.some(hasRefs) : isRecord(value) && (value.k === "Ref" || Object.values(value).some(hasRefs));
      const expressions = source === undefined || hasRefs(source) ? undefined : this.actionExpressions(source);
      const initial = expressions ? expressions.flatMap(expression => this.evaluatePlan(expression).steps) : this.requirePlan(initialAction).steps;
      this.checkSteps(initial);

      stagedStore = createStore();
      stagedStore.initialize(originalStore.getSnapshot(), {});
      this.store = stagedStore;
      const changes = new Map<string, boolean>();
      let submission: { message: string; context?: unknown } | undefined;
      for (let index = 0; index < initial.length; index++) {
        let step = initial[index];
        if (expressions) {
          const current = this.evaluatePlan(expressions[index]).steps;
          if (current.length !== 1 || current[0].type !== step.type) throw new Error("Action step changed while executing.");
          step = current[0];
        } else if (step.type === "continue_conversation" && changes.size) {
          // Dynamically generated Buttons (e.g. @Each) have no static element
          // metadata. Re-evaluate their current plan and require stable identity.
          const evaluated = evaluateRoot(this.result, { ctx: this.context, library, store: this.store });
          const currentNode = this.atPath(evaluated, path);
          const current = this.requirePlan(currentNode?.props.action).steps;
          if (currentNode?.typeName !== "Button" || current.length !== initial.length ||
            JSON.stringify(current.slice(0, index)) !== JSON.stringify(initial.slice(0, index))) {
            throw new Error("The button changed during its action; split local changes and submission into separate buttons.");
          }
          this.checkSteps(current);
          step = current[index];
        }
        switch (step.type) {
          case "set": {
            const value = evaluate(step.valueAST, this.context);
            this.checkData(value, "State value");
            this.store.set(step.target, value);
            changes.set(step.target, false);
            break;
          }
          case "reset":
            for (const target of step.targets) {
              this.store.set(target, this.result.stateDeclarations[target], { pristine: true });
              changes.set(target, true);
            }
            break;
          case "continue_conversation":
            if (typeof step.message !== "string" || step.message.length > limits.text) throw new Error("Assistant message must be a string of at most 4000 characters.");
            if (step.context !== undefined) this.checkData(step.context, "Action context");
            submission = { message: step.message, ...(step.context === undefined ? {} : { context: step.context }) };
            break;
          default: throw new Error(`Unsupported action: ${step.type}`);
        }
      }
      this.refresh();
      if (!this.valid) throw new Error(`Action would make the UI invalid: ${this.diagnostics.join("; ")}`);
      const snapshot = this.store.getSnapshot();
      this.store = originalStore;
      for (const [target, pristine] of changes) this.store.set(target, snapshot[target], { pristine });
      this.refresh();
      return submission ? { status: "submitted", action: "continue_conversation", ...submission, state: this.state, values: this.formValues } : { status: "updated" };
    } catch (error) {
      this.store = originalStore;
      this.refresh();
      return fail(error instanceof Error ? error.message : String(error));
    } finally {
      stagedStore?.dispose();
    }
  }

  private nodePath(target: ElementNode): number[] | undefined {
    const find = (node: ElementNode, path: number[]): number[] | undefined => {
      if (node === target) return path;
      if (node.typeName !== "Stack") return;
      for (const [index, child] of (node.props.children as ElementNode[]).entries()) {
        const found = find(child, [...path, index]);
        if (found) return found;
      }
    };
    return this.root ? find(this.root, []) : undefined;
  }

  private atPath(root: ElementNode | null, path: number[]): ElementNode | undefined {
    let node: ElementNode | undefined = root ?? undefined;
    for (const index of path) node = node?.typeName === "Stack" ? (node.props.children as ElementNode[])[index] : undefined;
    return node;
  }

  private actionExpressions(value: unknown, depth = 0): ASTNode[] {
    if (!isAST(value) || depth > limits.actionSteps) throw new Error("Use native @Set, @Reset, @ToAssistant or Action([...]) expressions.");
    if (value.k === "Ternary") return this.actionExpressions(evaluate(value.cond, this.context) ? value.then : value.else, depth + 1);
    if (value.k !== "Comp") throw new Error("Use native @Set, @Reset, @ToAssistant or Action([...]) expressions.");
    if (value.name === "Action") {
      if (value.args.length !== 1 || value.args[0].k !== "Arr") throw new Error("Action requires an array of action expressions.");
      const expressions = value.args[0].els.flatMap(child => this.actionExpressions(child, depth + 1));
      if (expressions.length > limits.actionSteps) throw new Error(`Actions support at most ${limits.actionSteps} steps.`);
      return expressions;
    }
    if (!["Set", "Reset", "ToAssistant"].includes(value.name)) throw new Error(`Unsupported action: @${value.name}. Use @Set, @Reset or @ToAssistant.`);
    if (value.name === "Set" && (value.args.length !== 2 || value.args[0].k !== "StateRef")) throw new Error("@Set requires a declared $variable and a value.");
    if (value.name === "Reset" && (!value.args.length || value.args.some(arg => arg.k !== "StateRef"))) throw new Error("@Reset requires one or more declared $variables.");
    if (value.name === "ToAssistant" && (value.args.length < 1 || value.args.length > 2)) throw new Error("@ToAssistant requires a message and optional context.");
    return [value];
  }

  private requirePlan(value: unknown): ActionPlan {
    if (!isPlan(value)) throw new Error("Button requires an action identifier or native action expression.");
    return value;
  }

  private evaluatePlan(expression: ASTNode): ActionPlan { return this.requirePlan(evaluate(expression, this.context)); }

  private checkSteps(steps: ActionStep[]): void {
    if (!steps.length || steps.length > limits.actionSteps) throw new Error(`Action must contain 1–${limits.actionSteps} supported steps.`);
    for (const [index, step] of steps.entries()) {
      if (!isRecord(step)) throw new Error("Invalid action step.");
      if (step.type === "set" || step.type === "reset") {
        const targets = step.type === "set" ? [step.target] : step.targets;
        if (!Array.isArray(targets) || !targets.length || targets.some(target => !this.declaredState.has(target))) throw new Error("Action targets must be explicitly declared $variables.");
        if (step.type === "set" && !isAST(step.valueAST)) throw new Error("@Set requires a value expression.");
      } else if (step.type === "continue_conversation") {
        if (index !== steps.length - 1) throw new Error("@ToAssistant must be the last and only submission step.");
      } else throw new Error(`Unsupported action: ${step.type}. Use @Set, @Reset or @ToAssistant.`);
    }
  }

  private checkData(value: unknown, label: string): void {
    let count = 0;
    const visit = (item: unknown, depth: number): void => {
      if (++count > 4096 || depth > limits.depth) throw new Error(`${label} exceeds the size or nesting limit.`);
      if (item === null || typeof item === "boolean") return;
      if (typeof item === "number" && Number.isFinite(item)) return;
      if (typeof item === "string" && item.length <= limits.text) return;
      if (Array.isArray(item)) { for (const child of item) visit(child, depth + 1); return; }
      if (isRecord(item)) { for (const child of Object.values(item)) visit(child, depth + 1); return; }
      throw new Error(`${label} must contain finite JSON values and strings of at most 4000 characters.`);
    };
    visit(value, 0);
    if (JSON.stringify(value).length > limits.source) throw new Error(`${label} exceeds ${limits.source} characters.`);
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
    this.declaredState.clear();
    this.dynamicActionSources.clear();
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
          // action() describes source/legacy data. lang-core evaluates native
          // action expressions into ActionPlan, which the dispatcher validates.
          if (node.typeName === "Button" && isPlan(props.action)) props.action = "action";
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
