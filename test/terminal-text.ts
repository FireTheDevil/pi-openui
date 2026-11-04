export function withoutSgr(text: string): string {
  let output = "";

  for (let index = 0; index < text.length;) {
    if (text.startsWith("\x1b[", index)) {
      let end = index + 2;

      while (end < text.length && (text[end] >= "0" && text[end] <= "9" || text[end] === ";")) end++;

      if (text[end] === "m") {
        index = end + 1;
        continue;
      }
    }

    output += text[index++];
  }

  return output;
}

export function hasUnsafeControls(text: string): boolean {
  for (const character of text) {
    const code = character.charCodeAt(0);

    if (code <= 8 || code >= 11 && code <= 31 || code >= 127 && code <= 159) return true;
  }

  return false;
}
