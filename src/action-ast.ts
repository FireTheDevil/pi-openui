import type { ASTNode } from "@openuidev/lang-core";
import { z } from "zod";
import { predicateParseContext } from "./predicate-validation.js";

const astNumberSchema = z.union([z.number(), z.nan(), z.literal(Infinity), z.literal(-Infinity)]);

const astNodeHeaderSchema = z.discriminatedUnion("k", [
  z.object({ k: z.literal("Comp"), name: z.string(), args: z.array(z.unknown()), mappedProps: z.looseObject({}).optional(), fn: z.literal(true).optional() }),
  z.object({ k: z.literal("Str"), v: z.string() }),
  z.object({ k: z.literal("Num"), v: astNumberSchema }),
  z.object({ k: z.literal("Bool"), v: z.boolean() }),
  z.object({ k: z.literal("Null") }),
  z.object({ k: z.literal("Arr"), els: z.array(z.unknown()) }),
  z.object({ k: z.literal("Obj"), entries: z.array(z.tuple([z.string(), z.unknown()])) }),
  z.object({ k: z.literal("Ref"), n: z.string() }),
  z.object({ k: z.literal("Ph"), n: z.string() }),
  z.object({ k: z.literal("StateRef"), n: z.string() }),
  z.object({ k: z.literal("RuntimeRef"), n: z.string(), refType: z.enum(["query", "mutation"]) }),
  z.looseObject({ k: z.literal("BinOp"), op: z.string() }),
  z.looseObject({ k: z.literal("UnaryOp"), op: z.string() }),
  z.looseObject({ k: z.literal("Ternary") }),
  z.looseObject({ k: z.literal("Member"), field: z.string() }),
  z.looseObject({ k: z.literal("Index") }),
  z.looseObject({ k: z.literal("Assign"), target: z.string() }),
]);

function isASTNodeHeader(value: unknown): value is z.infer<typeof astNodeHeaderSchema> {
  return astNodeHeaderSchema.safeParse(value, predicateParseContext).success;
}

const actionASTSchema = z.custom<ASTNode>(value => {
  const pending = [value];
  const visited = new WeakSet();

  while (pending.length) {
    const node = pending.pop();

    if (!isASTNodeHeader(node)) return false;

    if (visited.has(node)) continue;
    visited.add(node);

    switch (node.k) {
      case "Comp":
        for (const child of node.args) pending.push(child);

        if (node.mappedProps) for (const child of Object.values(node.mappedProps)) pending.push(child);
        break;
      case "Arr":
        for (const child of node.els) pending.push(child);
        break;
      case "Obj":
        for (const [, child] of node.entries) pending.push(child);
        break;
      case "BinOp": pending.push(node.left, node.right); break;
      case "UnaryOp": pending.push(node.operand); break;
      case "Ternary": pending.push(node.cond, node.then, node.else); break;
      case "Member": pending.push(node.obj); break;
      case "Index": pending.push(node.obj, node.index); break;
      case "Assign": pending.push(node.value); break;
    }
  }

  return true;
});

export function isActionAST(value: unknown): value is ASTNode {
  return actionASTSchema.safeParse(value, predicateParseContext).success;
}
