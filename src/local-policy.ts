import { parseExpression, split, tokenize, walkAST, type ASTNode } from "@openuidev/lang-core";
import { limits } from "./catalog.js";

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const declaredTarget = /^\$[A-Za-z_][A-Za-z0-9_]*$/;
const externalCalls = new Set(["ToAssistant", "Run", "OpenUrl", "Query", "Mutation"]);
const localActions = new Set(["Set", "Reset", "Action"]);
const actionHint = "Use @Set, @Reset, or Action([...]) containing only local actions; use answer-collecting interaction for submission.";
const maxExpandedNodes = 16_384;

function astChildren(node: ASTNode): ASTNode[] {
  switch (node.k) {
    case "Comp": return node.args;
    case "Arr": return node.els;
    case "Obj": return node.entries.map(([, value]) => value);
    case "BinOp": return [node.left, node.right];
    case "UnaryOp": return [node.operand];
    case "Ternary": return [node.cond, node.then, node.else];
    case "Member": return [node.obj];
    case "Index": return [node.obj, node.index];
    case "Assign": return [node.value];
    default: return [];
  }
}

/**
 * Additional policy for a complete DocumentModel. This is not a second parser:
 * lang-core owns syntax and evaluation, and DocumentModel still validates the UI.
 * Inspect the source AST as well as the current evaluated tree so a dormant
 * conditional, an inactive page or an @Each template cannot hide a submit path.
 */
export function localDocumentDiagnostics(source: string): string[] {
  if (source.length > limits.source) return [`Local document exceeds ${limits.source} characters.`];
  const errors = new Set<string>();
  const fail = (message: string): void => { if (errors.size < 20) errors.add(message); };
  try {
    const statements = split(tokenize(source)).map(statement => ({
      id: statement.id, expression: parseExpression(statement.tokens),
    }));
    const declarations = new Map(statements.map(statement => [statement.id, statement.expression]));
    const states = new Set(statements.filter(statement => statement.id.startsWith("$")).map(statement => statement.id));
    // lang-core 1.0.2 inlines static references during materialization. A tiny
    // shared declaration graph can therefore expand into an enormous tree.
    // Count that expansion with memoization before creating DocumentModel;
    // cap the count rather than constructing the expanded representation.
    const expansionMemo = new Map<ASTNode, number>();
    const expanding = new Set<ASTNode>();
    const expansionError = () => new Error(`Local document expands beyond ${maxExpandedNodes.toLocaleString("en-US")} syntax nodes. Simplify repeated static references or split it into smaller widgets.`);
    const expandedSize = (node: ASTNode): number => {
      const cached = expansionMemo.get(node);
      if (cached !== undefined) return cached;
      if (expanding.has(node)) throw new Error("Local declaration references must not contain cycles.");
      if (expanding.size > limits.depth * 3) throw new Error("Local declaration references exceed the nesting limit.");
      expanding.add(node);
      try {
        const reference = node.k === "Ref" ? declarations.get(node.n) : undefined;
        let size = 1;
        for (const child of reference ? [reference] : astChildren(node)) {
          size += expandedSize(child);
          if (size > maxExpandedNodes) throw expansionError();
        }
        expansionMemo.set(node, size);
        return size;
      } finally { expanding.delete(node); }
    };
    let initializedSize = 0;
    for (const { id, expression } of statements) {
      const size = expandedSize(expression);
      if (id === "root" || states.has(id)) initializedSize += size;
      if (initializedSize > maxExpandedNodes) throw expansionError();
    }
    type ActionShape = { steps: number; height: number };
    const actionMemo = new Map<ASTNode, ActionShape>();
    const activeActions = new Set<ASTNode>();

    const resolve = (node: ASTNode, seen = new Set<string>()): ASTNode => {
      if (node.k !== "Ref") return node;
      const expression = declarations.get(node.n);
      if (!expression || seen.has(node.n) || seen.size >= limits.depth) {
        throw new Error(`Cannot prove that action reference ${node.n} is local. ${actionHint}`);
      }
      return resolve(expression, new Set([...seen, node.n]));
    };
    const target = (node: ASTNode | undefined): boolean =>
      node?.k === "StateRef" && states.has(node.n);

    const checkAction = (sourceNode: ASTNode | undefined, depth = 0): ActionShape => {
      if (!sourceNode || depth > limits.actionSteps) throw new Error(`Local actions exceed the nesting limit. ${actionHint}`);
      const node = resolve(sourceNode);
      const cached = actionMemo.get(node);
      if (cached) {
        if (depth + cached.height > limits.actionSteps) throw new Error("Local actions exceed the nesting limit.");
        return cached;
      }
      if (activeActions.has(node)) throw new Error("Local action references must not contain cycles.");
      activeActions.add(node);
      try {
        let shape: ActionShape;
        if (node.k === "Ternary") {
          // Both branches must be safe. Cache by resolved AST identity so a
          // shared alias DAG cannot expand into exponentially many checks.
          const then = checkAction(node.then, depth + 1);
          const otherwise = checkAction(node.else, depth + 1);
          shape = { steps: Math.max(then.steps, otherwise.steps), height: 1 + Math.max(then.height, otherwise.height) };
        } else {
          if (node.k !== "Comp" || !localActions.has(node.name)) {
            const label = node.k === "Str" ? "Legacy submission identifiers" : node.k === "Comp" ? `@${node.name}` : "Dynamic or object actions";
            throw new Error(`${label} are not allowed in local interaction. ${actionHint}`);
          }
          if (node.name === "Set") {
            if (node.args.length !== 2 || !target(node.args[0])) throw new Error("Local @Set requires an explicitly declared $variable and a value.");
            shape = { steps: 1, height: 0 };
          } else if (node.name === "Reset") {
            if (!node.args.length || node.args.some(argument => !target(argument))) throw new Error("Local @Reset requires one or more explicitly declared $variables.");
            shape = { steps: 1, height: 0 };
          } else {
            if (node.args.length !== 1) throw new Error("Local Action requires one array of local action expressions.");
            const steps = resolve(node.args[0]);
            if (steps.k !== "Arr" || !steps.els.length) throw new Error("Local Action requires a nonempty array of local action expressions.");
            shape = { steps: 0, height: 0 };
            for (const step of steps.els) {
              const child = checkAction(step, depth + 1);
              shape.steps += child.steps;
              shape.height = Math.max(shape.height, child.height + 1);
              if (shape.steps > limits.actionSteps) throw new Error(`Local actions support at most ${limits.actionSteps} steps.`);
            }
          }
        }
        actionMemo.set(node, shape);
        return shape;
      } finally { activeActions.delete(node); }
    };

    for (const { id, expression } of statements) {
      walkAST(expression, node => {
        if (node.k === "Obj") {
          const keys = new Set(node.entries.map(([key]) => key));
          if (keys.has("typeName") && keys.has("props")) {
            // lang-core's evaluator also recognizes raw ElementNode-shaped
            // objects. Require component calls so their action slots are
            // inspectable, including when such objects hide in state/data.
            fail(`${id}: Raw component objects are not allowed in local interaction. Use catalog component calls such as Button(...), not typeName/props objects.`);
          }
          return;
        }
        if (node.k !== "Comp") return;
        if (externalCalls.has(node.name) || node.fn) {
          fail(`${id}: @${node.name} is not allowed in local interaction. Local widgets cannot submit answers, call tools or perform external actions.`);
          return;
        }
        if (node.name === "Button" || localActions.has(node.name)) {
          try { checkAction(node.name === "Button" ? node.args[1] : node); }
          catch (error) { fail(`${id}: ${error instanceof Error ? error.message : String(error)}`); }
        }
      });
    }
    if (!statements.length) fail("Local interaction requires a complete OpenUI Lang document.");
  } catch (error) {
    fail(`Unable to verify local interaction: ${error instanceof Error ? error.message : String(error)}`);
  }
  return [...errors];
}

/** Check an evaluated Button action immediately before activation as a backstop. */
export function localActionError(action: unknown): string | undefined {
  if (!record(action) || !Array.isArray(action.steps) || !action.steps.length || action.steps.length > limits.actionSteps) {
    return `This local widget cannot submit an answer or run an unverified action. ${actionHint}`;
  }
  for (const step of action.steps) {
    if (!record(step)) return "Invalid local action step.";
    if (step.type === "set") {
      if (typeof step.target !== "string" || !declaredTarget.test(step.target) || !record(step.valueAST) || typeof step.valueAST.k !== "string") {
        return "Invalid local @Set action.";
      }
    } else if (step.type === "reset") {
      if (!Array.isArray(step.targets) || !step.targets.length || step.targets.some(item => typeof item !== "string" || !declaredTarget.test(item))) {
        return "Invalid local @Reset action.";
      }
    } else return `Action ${String(step.type)} is not allowed in local interaction. ${actionHint}`;
  }
}
