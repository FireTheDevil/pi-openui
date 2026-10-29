import { stripTerminalSequences } from "@earendil-works/pi-tui";
import type { Theme, ThemeBg, ThemeColor } from "@earendil-works/pi-coding-agent";

export type HostTheme = Partial<Pick<Theme, "fg" | "bg" | "bold" | "italic" | "underline" | "strikethrough">>;
export interface PresentationStyle {
  fg(color: ThemeColor, text: string): string;
  bg(color: ThemeBg, text: string): string;
  bold(text: string): string;
  italic(text: string): string;
  underline(text: string): string;
  strikethrough(text: string): string;
  requestRender?(): void;
  getHeight?(): number;
}

/** Model text is data; trusted theme styling is applied only after this step. */
export function safeText(value: unknown): string {
  return stripTerminalSequences(String(value ?? ""))
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "")
    .replace(/\t/g, "    ");
}

export function presentation(getTheme: () => HostTheme | undefined, host: Pick<PresentationStyle, "requestRender" | "getHeight"> = {}): PresentationStyle {
  return {
    fg: (color, text) => getTheme()?.fg?.(color, text) ?? text,
    bg: (color, text) => getTheme()?.bg?.(color, text) ?? text,
    bold: text => getTheme()?.bold?.(text) ?? text,
    italic: text => getTheme()?.italic?.(text) ?? text,
    underline: text => getTheme()?.underline?.(text) ?? text,
    strikethrough: text => getTheme()?.strikethrough?.(text) ?? text,
    ...host,
  };
}
