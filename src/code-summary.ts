import { Container, Spacer, Text, type Component } from "@earendil-works/pi-tui";
import type { ExtensionAPI, ExtensionContext, ToolExecutionEndEvent, ToolRenderers } from "@earendil-works/pi-coding-agent";
import { renderReceipt, type Receipt, type SummaryOutcome } from "./summary.js";

/** Custom entries persist presentation metadata without adding model messages. */
export const CODE_RECEIPT_ENTRY = "openui-code-receipt";
type RenderContext = Parameters<NonNullable<ToolRenderers["renderCall"]>>[2];
type RenderResult = Parameters<NonNullable<ToolRenderers["renderResult"]>>[0];
type ReceiptRecord = {
  version: 1;
  parentToolCallId: string;
  toolCallId: string;
  receipt: Receipt;
  outcome: SummaryOutcome;
};
type RowState = { generation: number; originalCall?: Component; originalResult?: Component; compact?: boolean; queued?: boolean };
const rowKey = Symbol("openuiCodeSummary");
const scriptHeader = /^Script (completed|failed)\nWall time [\d.]+ seconds\nOutput:\n$/;
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);

function validReceipt(value: unknown): value is Receipt {
  return object(value) && value.version === 1 && ["submitted", "cancelled", "error"].includes(value.status)
    && typeof value.title === "string" && Array.isArray(value.fields) && value.fields.length <= 256
    && value.fields.every(field => object(field) && [field.name, field.label, field.value].every(item => typeof item === "string"))
    && (value.message === undefined || typeof value.message === "string")
    && (value.error === undefined || typeof value.error === "string");
}
function validOutcome(value: unknown): value is SummaryOutcome {
  return object(value) && (value.status === "cancelled"
    || value.status === "error" && typeof value.error === "string"
    || value.status === "submitted" && typeof value.action === "string" && object(value.values) && object(value.state));
}
function validRecord(value: unknown): value is ReceiptRecord {
  return object(value) && value.version === 1 && typeof value.parentToolCallId === "string"
    && typeof value.toolCallId === "string" && validReceipt(value.receipt) && validOutcome(value.outcome)
    && value.receipt.status === value.outcome.status;
}

/** Only a complete known JSON value (or Pi's exact multiple-text framing) is redundant. */
function knownOutput(text: string, known: Set<string>): boolean {
  if (known.has(text)) return true;
  const sections = text.split(/(?=^==> text \d+\/\d+ <==\n)/m);
  if (sections.length < 2) return false;
  return sections.every((section, index) => {
    const marker = /^==> text (\d+)\/(\d+) <==\n/.exec(section);
    if (!marker || Number(marker[1]) !== index + 1 || Number(marker[2]) !== sections.length) return false;
    const body = section.slice(marker[0].length);
    return known.has(body) || index < sections.length - 1 && body.endsWith("\n") && known.has(body.slice(0, -1));
  });
}

/** Root owns event registration, so fake hosts and other lifecycle handlers compose cleanly. */
export function registerCodeSummaries(pi: ExtensionAPI) {
  let generation = 0;
  const records = new Map<string, ReceiptRecord>();
  const completed = new Map<string, boolean>();

  function clear(): void { generation++; records.clear(); completed.clear(); }
  function row(context: RenderContext): RowState {
    let state = context.state[rowKey] as RowState | undefined;
    if (!state || state.generation !== generation) context.state[rowKey] = state = { generation };
    return state;
  }
  function related(parentId: string, result: RenderResult): ReceiptRecord[] {
    const calls: unknown = result.details?.calls;
    if (!Array.isArray(calls)) return [];
    return calls.flatMap(call => {
      if (!object(call) || call.name !== "show_ui" || typeof call.id !== "string") return [];
      const entry = records.get(call.id);
      return entry?.parentToolCallId === parentId ? [entry] : [];
    });
  }
  function filtered(parentId: string, result: RenderResult) {
    const receipts = related(parentId, result);
    const known = new Set(receipts.map(item => JSON.stringify(item.outcome)));
    const content = result.content.filter(item => item.type !== "text" || !knownOutput(item.text, known));
    const ids = new Set(receipts.map(item => item.toolCallId));
    const calls = Array.isArray(result.details?.calls) ? result.details.calls : [];
    const remainingCalls = calls.filter((call: any) => !ids.has(call?.id));
    const onlyReceipts = receipts.length > 0 && calls.length === receipts.length
      && remainingCalls.length === 0 && !result.details?.fullOutputPath
      && content.every(item => item.type === "text" && scriptHeader.test(item.text));
    return { receipts, content, remainingCalls, onlyReceipts };
  }
  function onToolEnd(event: ToolExecutionEndEvent, _ctx?: ExtensionContext): void {
    if (event.toolName === "codemode") {
      if (Array.isArray(event.result?.content)) {
        completed.set(event.toolCallId, !event.isError && filtered(event.toolCallId, event.result).onlyReceipts);
      }
      return;
    }
    if (event.toolName !== "show_ui" || !event.parentToolCallId) return;
    const receipt: unknown = event.result?.details?.openuiReceipt;
    const outcome: unknown = event.result?.structuredContent;
    if (!validReceipt(receipt) || !validOutcome(outcome) || receipt.status !== outcome.status || records.has(event.toolCallId)) return;
    // Snapshot the result before a script can modify its returned object.
    const entry: ReceiptRecord = JSON.parse(JSON.stringify({ version: 1, parentToolCallId: event.parentToolCallId,
      toolCallId: event.toolCallId, receipt, outcome }));
    pi.appendEntry(CODE_RECEIPT_ENTRY, entry);
    records.set(event.toolCallId, entry);
  }
  function rehydrate(ctx: Pick<ExtensionContext, "sessionManager">): void {
    clear();
    // getEntries() includes sibling branches; receipts must follow the active path only.
    const entries = ctx.sessionManager.getBranch();
    for (const entry of entries) {
      if (entry.type === "custom" && entry.customType === CODE_RECEIPT_ENTRY && validRecord(entry.data)) {
        records.set(entry.data.toolCallId, entry.data);
      }
    }
    for (const entry of entries) {
      if (entry.type === "message" && entry.message.role === "toolResult" && entry.message.toolName === "codemode") {
        completed.set(entry.message.toolCallId, !entry.message.isError && filtered(entry.message.toolCallId, { ...entry.message, details: entry.message.details }).onlyReceipts);
      }
    }
  }

  // A custom entry is a persistent transcript row and never enters LLM context.
  // Pi emits entry_appended immediately, so the receipt appears as soon as the
  // nested form finishes, independently of the remaining script execution.
  pi.registerEntryRenderer(CODE_RECEIPT_ENTRY, (entry, options, theme) => {
    if (!validRecord(entry.data)) return undefined;
    return renderReceipt(entry.data.receipt, theme, { expanded: options.expanded, outcome: entry.data.outcome });
  });
  pi.registerToolRenderer((name, next) => {
    const original = next();
    if (name !== "codemode" || !original?.renderCall || !original.renderResult) return original;
    const callRenderer = original.renderCall;
    const resultRenderer = original.renderResult;
    return {
      ...original,
      renderCall(args, theme, context) {
        const state = row(context);
        if (!context.expanded && (completed.get(context.toolCallId) ?? state.compact)) {
          return new Text(theme.fg("toolTitle", theme.bold("OpenUI · code mode")), 0, 0);
        }
        const component = callRenderer(args, theme, { ...context, lastComponent: state.originalCall });
        state.originalCall = component;
        return component;
      },
      renderResult(result, options, theme, context) {
        const state = row(context);
        const parts = filtered(context.toolCallId, result);
        const compact = !options.isPartial && !context.isError && parts.onlyReceipts;
        if (state.compact !== compact) {
          state.compact = compact;
          // Call rendering precedes result rendering; update the call title on the next frame.
          if (!state.queued) {
            state.queued = true;
            queueMicrotask(() => {
              state.queued = false;
              if (state.generation === generation) context.invalidate();
            });
          }
        }
        if (options.expanded || !parts.receipts.length) {
          const component = resultRenderer(result, options, theme, { ...context, lastComponent: state.originalResult });
          state.originalResult = component;
          return component;
        }
        const component = new Container();
        component.addChild(new Spacer(1));
        const count = parts.receipts.length;
        component.addChild(new Text(theme.fg("muted", `${count} OpenUI ${count === 1 ? "response" : "responses"} · summary below · Ctrl+O execution details`), 0, 0));
        // The result sent to Pi is never changed. This copy affects terminal presentation only.
        // Mixed output is preserved verbatim unless an entire block is an exact known result.
        const displayResult = { ...result, content: parts.content,
          details: { ...result.details, calls: parts.remainingCalls } };
        const trailing = resultRenderer(displayResult, options, theme, { ...context, lastComponent: state.originalResult });
        state.originalResult = trailing;
        component.addChild(trailing);
        return component;
      },
    };
  });
  return { onToolEnd, rehydrate, clear };
}
