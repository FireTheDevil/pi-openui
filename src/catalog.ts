// Keep the public catalog surface stable; generation imports the source directly.
export {
  limits, tableRowsSchema, tableColumnsSchema, componentSpecs, descriptions, library,
  isElement, isField, fieldOptions, valueSchemaFor, childNodes, optionItems,
  type TableRow, type FieldValue, type Tone, type FieldOptions, type NormalizedOption,
  type TreeNode, type TabItem, type TableColumn, type ComponentName, type RenderedNode,
} from "./catalog-source.js";

export { systemPrompt, modelPrompt } from "./generated/prompt.js";
