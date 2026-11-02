import type { ExtensionAPI, ExtensionToolContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";

// Public PCC v1 extension-tool protocol, also used by its exported
// registerCodeModeExtensionTools helper. Keeping this small structural adapter
// avoids making the optional conversion package a production dependency.
const TOOLS_CHANNEL = "@howaboua/pi-codex-conversion.extension-code-mode-tools/v1";
const REFRESH_CHANNEL = "@howaboua/pi-codex-conversion.extension-code-mode-tools-refresh/v1";
type NativeResult = Awaited<ReturnType<ExtensionToolContext["executeTool"]>>["result"];
interface InvocationContext {
  executeTool?: ExtensionToolContext["executeTool"];
  onUpdate?: (result: NativeResult) => void;
  captureResult?: (result: NativeResult) => void;
}

/** Register once in Pi; optionally mark the same callable as blocking in PCC. */
export function registerToolWithConversion<TParams extends TSchema, TDetails, TState>(
  pi: ExtensionAPI,
  tool: ToolDefinition<TParams, TDetails, TState>,
): void {
  pi.registerTool(tool);
  if (!pi.events?.on || !pi.events?.emit) return;
  const adapted = {
    name: tool.name,
    topLevelName: tool.name,
    usage: `await tools.${tool.name}(args)`,
    description: tool.description,
    promptSnippet: tool.promptSnippet,
    promptGuidelines: tool.promptGuidelines,
    translatePromptMetadata: true,
    kind: "function" as const,
    deferLoading: true,
    discoverWhenDeferred: true,
    executionPipeline: "pi" as const,
    executionMode: tool.executionMode,
    // A normal Pi-tool bridge drains pending calls after the runtime has already
    // yielded. Blocking keeps the runtime's observer and abort handler attached
    // throughout user interaction, including exec/wait yield deadlines.
    blocking: true,
    propagateTermination: true,
    inputSchema: tool.parameters,
    output: tool.outputSchema ? JSON.stringify(tool.outputSchema) : undefined,
    async invoke(input: unknown, context: InvocationContext, signal: AbortSignal): Promise<unknown> {
      signal.throwIfAborted();
      if (!context.executeTool) throw new Error("Pi nested tool execution is unavailable");
      const outcome = await context.executeTool(tool.name, input, {
        signal, ...(context.onUpdate ? { onUpdate: context.onUpdate } : {}),
      });
      const result = outcome.result;
      context.captureResult?.(result);
      signal.throwIfAborted();
      const structured = result.structuredContent;
      if (structured && typeof structured === "object" && "status" in structured && structured.status === "cancelled") {
        const error = new Error("OpenUI interaction cancelled");
        error.name = "AbortError";
        throw error;
      }
      // Preserve the same declared-output contract as Pi and PCC's standard
      // bridge. Structured diagnostics are returned for agent repair.
      if (tool.outputSchema && structured !== undefined) return structured;
      const text = result.content.filter(item => item.type === "text").map(item => item.text).join("\n");
      if (outcome.isError) throw new Error(text || `Tool ${tool.name} failed`);
      return text;
    },
  };
  const provider = () => [adapted];
  const stop = pi.events.on(TOOLS_CHANNEL, value => {
    if (!value || typeof value !== "object" || !("add" in value) || typeof value.add !== "function"
      || !("refreshGates" in value) || typeof value.refreshGates !== "boolean") return;
    value.add(provider, true);
  });
  let active = true;
  try { pi.events.emit(REFRESH_CHANNEL, undefined); }
  catch (error) { active = false; stop(); throw error; }
  pi.on("session_shutdown", () => {
    if (!active) return;
    active = false;
    stop();
    pi.events.emit(REFRESH_CHANNEL, undefined);
  });
}
