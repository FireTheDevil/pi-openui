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
export function safeText(value: Parameters<StringConstructor>[0]): string {
  const text = stripTerminalSequences(String(value ?? ""));
  let result = "";

  for (const character of text) {
    const code = character.charCodeAt(0);

    if (code === 9) result += "    ";
    else if (code === 10 || code >= 32 && (code < 127 || code > 159)) result += character;
  }

  return result;
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
