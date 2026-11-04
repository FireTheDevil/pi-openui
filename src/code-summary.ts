import { z } from "zod";
import { predicateParseContext } from "./predicate-validation.js";
import { Container, Spacer, Text, type Component } from "@earendil-works/pi-tui";
import type { ExtensionAPI, ExtensionContext, ToolExecutionEndEvent, ToolRenderers } from "@earendil-works/pi-coding-agent";
import { isReceipt, renderReceipt, type Receipt } from "./summary.js";
import { isInlineDocument, renderInlineDocument, type InlineDocument } from "./inline-document.js";

/** Custom entries persist presentation metadata without adding model messages. */
export const CODE_RECEIPT_ENTRY = "openui-code-receipt";

type RenderContext = Parameters<NonNullable<ToolRenderers["renderCall"]>>[2];

type RenderResult = Parameters<NonNullable<ToolRenderers["renderResult"]>>[0];

const storedOutcomeSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("cancelled") }),
  z.object({ status: z.literal("displayed") }),
  z.object({ status: z.literal("mounted"), widgetId: z.string().min(1) }),
  z.object({ status: z.literal("error"), error: z.string() }),
  z.object({ status: z.literal("submitted"), action: z.string(), values: z.object({}), state: z.object({}) }),
]);

type StoredOutcome = z.infer<typeof storedOutcomeSchema>;

const receiptRecordSchema = z.object({
  version: z.literal(1),
  parentToolCallId: z.string(),
  toolCallId: z.string(),
  receipt: z.custom<Receipt>(isReceipt),
  outcome: z.custom<StoredOutcome>(value => storedOutcomeSchema.safeParse(value, predicateParseContext).success),
  document: z.custom<InlineDocument>(isInlineDocument).optional(),
}).refine(value => value.receipt.status === value.outcome.status
  && (value.document === undefined || value.outcome.status === "displayed"));

type ReceiptRecord = z.infer<typeof receiptRecordSchema>;

type RowState = { generation: number; originalCall?: Component; originalResult?: Component; compact?: boolean; queued?: boolean };

const rowKey = Symbol("openuiCodeSummary");

const scriptHeader = /^Script (completed|failed)\nWall time [\d.]+ seconds\nOutput:\n$/;

const storedObjectSchema = z.object({});

const storedOutcomeCandidateSchema = z.custom<{
  status?: unknown;
  widgetId?: unknown;
  error?: unknown;
  action?: unknown;
  values?: unknown;
  state?: unknown;
}>(value => storedObjectSchema.safeParse(value, predicateParseContext).success);

const storedTextSchema = z.string();

const isStoredText = (value: unknown): value is string => storedTextSchema.safeParse(value, predicateParseContext).success;

function validOutcome(value: unknown): value is StoredOutcome {
  const candidate = storedOutcomeCandidateSchema.safeParse(value, predicateParseContext);

  if (!candidate.success) return false;
  const item = candidate.data;

  return item.status === "cancelled" || item.status === "displayed"
    || item.status === "mounted" && isStoredText(item.widgetId) && item.widgetId.length > 0
    || item.status === "error" && isStoredText(item.error)
    || item.status === "submitted" && isStoredText(item.action)
      && storedObjectSchema.safeParse(item.values, predicateParseContext).success
      && storedObjectSchema.safeParse(item.state, predicateParseContext).success;
}

const receiptRecordCandidateSchema = z.custom<{
  version?: unknown;
  parentToolCallId?: unknown;
  toolCallId?: unknown;
  receipt?: unknown;
  outcome?: unknown;
  document?: unknown;
}>(
  value => storedObjectSchema.safeParse(value, predicateParseContext).success,
);

function validRecord(value: unknown): value is ReceiptRecord {
  const candidate = receiptRecordCandidateSchema.safeParse(value, predicateParseContext);

  if (!candidate.success) return false;
  const item = candidate.data;

  return item.version === 1 && isStoredText(item.parentToolCallId) && isStoredText(item.toolCallId)
    && isReceipt(item.receipt) && validOutcome(item.outcome)
    && item.receipt.status === item.outcome.status
    && (item.document === undefined || item.outcome.status === "displayed" && isInlineDocument(item.document));
}

const relatedCallSchema = z.object({ name: z.literal("show_ui"), id: z.string() });

const relatedCallCandidateSchema = z.custom<{ name?: unknown; id?: unknown }>(
  value => storedObjectSchema.safeParse(value, predicateParseContext).success,
);

function isRelatedCall(value: unknown): value is z.infer<typeof relatedCallSchema> {
  const candidate = relatedCallCandidateSchema.safeParse(value, predicateParseContext);

  return candidate.success && candidate.data.name === "show_ui" && isStoredText(candidate.data.id);
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
export function registerCodeSummaries(pi: Pick<ExtensionAPI, "registerToolRenderer" | "appendEntry"> & {
  registerEntryRenderer(...args: Parameters<ExtensionAPI["registerEntryRenderer"]>): void;
}) {
  let generation = 0;
  const records = new Map<string, ReceiptRecord>();
  const completed = new Map<string, boolean>();

  function clear(): void { generation++; records.clear(); completed.clear(); }

  function row(context: RenderContext): RowState {
    // SAFETY: This module exclusively owns rowKey and writes only RowState values under it.
    let state = context.state[rowKey] as RowState | undefined;

    if (!state || state.generation !== generation) context.state[rowKey] = state = { generation };

    return state;
  }

  function related(parentId: string, result: RenderResult): ReceiptRecord[] {
    const calls: unknown = result.details?.calls;

    if (!Array.isArray(calls)) return [];

    return calls.flatMap(call => {
      if (!isRelatedCall(call)) return [];
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

    const document = validOutcome(outcome) && outcome.status === "displayed" && isInlineDocument(event.result?.details?.openuiDocument)
      ? event.result.details.openuiDocument : undefined;

    if (!isReceipt(receipt) || !validOutcome(outcome) || receipt.status !== outcome.status || records.has(event.toolCallId)) return;

    // Snapshot the result before a script can modify its returned object.
    const snapshot: ReceiptRecord = { version: 1, parentToolCallId: event.parentToolCallId,
      toolCallId: event.toolCallId, receipt, outcome };

    if (document) snapshot.document = document;
    const entry: ReceiptRecord = JSON.parse(JSON.stringify(snapshot));

    pi.appendEntry(CODE_RECEIPT_ENTRY, entry);
    records.set(event.toolCallId, entry);
  }

  function rehydrate(ctx: { sessionManager: Pick<ExtensionContext["sessionManager"], "getBranch"> }): void {
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

    // The independent local-widget entry is already present in the transcript.
    if (entry.data.outcome.status === "mounted") return undefined;

    if (entry.data.document) return renderInlineDocument(entry.data.document, theme, { expanded: options.expanded });

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
        const documentsOnly = parts.receipts.every(item => item.outcome.status === "displayed" || item.outcome.status === "mounted");
        const label = documentsOnly ? (count === 1 ? "document" : "documents") : (count === 1 ? "response" : "responses");
        component.addChild(new Text(theme.fg("muted", `${count} OpenUI ${label} · ${documentsOnly ? "rendered" : "summary"} below · Ctrl+O execution details`), 0, 0));

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
