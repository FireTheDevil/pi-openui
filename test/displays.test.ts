import assert from "node:assert/strict";
import test from "node:test";
import type { ElementNode } from "@openuidev/lang-core";
import { getCapabilities, setCapabilities, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { renderDisplay } from "../src/displays.js";
import type { PresentationStyle } from "../src/presentation.js";

const styled: PresentationStyle = {
  fg: (_tone, text) => `\x1b[36m${text}\x1b[39m`,
  bg: (_tone, text) => `\x1b[44m${text}\x1b[49m`,
  bold: text => `\x1b[1m${text}\x1b[22m`,
  italic: text => `\x1b[3m${text}\x1b[23m`,
  underline: text => `\x1b[4m${text}\x1b[24m`,
  strikethrough: text => `\x1b[9m${text}\x1b[29m`,
};
const element = (typeName: string, props: Record<string, unknown>): ElementNode => ({ type: "element", typeName, props, partial: false });
const render = (type: string, props: Record<string, unknown>, width = 60, style = styled) => renderDisplay(element(type, props), width, style)!;
const plain = (lines: string[]) => lines.map(stripTerminalSequences).join("\n");

test("enhanced Text applies semantic tone and trusted bold/italic after sanitization", () => {
  const calls: string[] = [];
  const style: PresentationStyle = { ...styled, fg: (token, text) => { calls.push(token); return styled.fg(token, text); } };
  const lines = render("Text", { text: "Status\x1b[31m ready", settings: { tone: "success", bold: true, italic: true } }, 30, style);
  assert.match(plain(lines), /Status ready/);
  assert.ok(calls.includes("success"));
  assert.ok(lines.join("").includes("\x1b[1m"));
  assert.ok(lines.join("").includes("\x1b[3m"));
  assert.equal(lines.join("").includes("\x1b[31m"), false);
});

test("native Markdown renders headings, emphasis, lists and literal HTML without browser actions", () => {
  const source = "# Heading\n\n**bold** and *italic*\n\n- first\n- second\n\n<script>alert('literal')</script>";
  const lines = render("Markdown", { text: source });
  const text = plain(lines);
  assert.match(text, /Heading/);
  assert.match(text, /bold and italic/);
  assert.match(text, /first/);
  assert.match(text, /second/);
  assert.match(text, /<script>alert\('literal'\)<\/script>/);
  assert.ok(lines.join("").includes("\x1b[1m"));
});

test("Markdown links never retain OSC 8 activation targets in either terminal capability mode", () => {
  const original = getCapabilities();
  try {
    for (const hyperlinks of [false, true]) {
      setCapabilities({ ...original, hyperlinks });
      const output = render("Markdown", { text: "[Reference](https://example.com) and [unsafe](javascript:alert%281%29)" }).join("\n");
      assert.match(stripTerminalSequences(output), /Reference/);
      assert.match(stripTerminalSequences(output), /unsafe/);
      assert.equal(output.includes("\x1b]8;"), false);
    }
  } finally { setCapabilities(original); }
});

test("CodeBlock preserves source, labels the language and safely falls back for unknown languages", () => {
  for (const language of ["typescript", "not-a-real-language", undefined]) {
    const lines = render("CodeBlock", { code: "const answer = 42;\n  return answer;", language });
    const text = plain(lines);
    assert.match(text, /const answer = 42;/);
    assert.match(text, /  return answer;/);
    if (language) assert.match(text, new RegExp(language));
    assert.ok(lines.every(line => visibleWidth(line) <= 60));
  }
});

test("long Unicode code wraps inside the viewport without evaluating Markdown or losing source", () => {
  const source = "abc界def🙂ghi";
  const lines = render("CodeBlock", { code: source, language: "text" }, 8);
  const body = lines.slice(1, -1).map(stripTerminalSequences).join("");
  assert.equal(body, source);
  assert.ok(lines.every(line => visibleWidth(line) <= 8));
});

test("ordered and unordered List align wrapped items and preserve numbering", () => {
  const items = ["First item wraps onto another line", "Second"];
  const ordered = plain(render("List", { items, ordered: true }, 16));
  assert.match(ordered, /^1\. First item/m);
  assert.match(ordered, /^   wraps onto/m);
  assert.match(ordered, /^2\. Second/m);
  assert.match(plain(render("List", { items: ["One"] })), /• One/);
  assert.match(plain(render("List", { items: [] })), /no items/);
});

test("Badge and Progress use semantic status colors with an explicit progress fraction", () => {
  const calls: string[] = [];
  const style: PresentationStyle = { ...styled, fg: (token, text) => { calls.push(token); return styled.fg(token, text); } };
  assert.match(plain(render("Badge", { text: "Ready", tone: "success" }, 30, style)), /\[ Ready \]/);
  assert.ok(calls.includes("success"));
  const progress = render("Progress", { value: 3, max: 4, label: "Build tasks" }, 30, style);
  assert.match(plain(progress), /Build tasks/);
  assert.match(plain(progress), /75%/);
  assert.match(plain(render("Progress", { value: 100 }, 30, style)), /100%/);
  assert.match(plain(render("Progress", { value: 0 })), /0%/);
});

test("Divider has a bounded optional caption and empty tables retain their headers", () => {
  assert.match(plain(render("Divider", { label: "Details" }, 24)), /Details/);
  assert.equal(visibleWidth(render("Divider", {}, 24)[0]), 24);
  assert.match(plain(render("Table", { columns: ["Name", "Value"], rows: [] })), /Name.*Value/);
  assert.match(plain(render("Table", { columns: ["Name", "Value"], rows: [] })), /no rows/);
});

test("Table preserves content-fit columns and changes to labeled records on narrow terminals", () => {
  const props = { columns: ["Name", "Value"], rows: [["One", 1], ["Two", true]] };
  const wide = plain(render("Table", props, 80));
  assert.match(wide, /Name\s+│ Value/);
  assert.match(wide, /One\s+│ 1/);
  const narrow = plain(render("Table", props, 12));
  assert.match(narrow, /Name: One/);
  assert.match(narrow, /Value: true/);
});

test("all display families sanitize model escapes and fit narrow or zero-width viewports", () => {
  const hostile = "界🙂 text\x1b[2J\x1b]52;c;ZXZpbA==\x07\x1b_pi:c\x07";
  const cases: Array<[string, Record<string, unknown>]> = [
    ["Text", { text: hostile, settings: { tone: "accent", bold: true } }],
    ["Markdown", { text: `# ${hostile}\n\n**strong** [label](https://example.com)` }],
    ["CodeBlock", { code: hostile, language: "unknown" }],
    ["List", { items: [hostile, hostile], ordered: true }],
    ["Badge", { text: hostile, tone: "warning" }],
    ["Progress", { value: 75, label: hostile }],
    ["Divider", { label: hostile }],
    ["Table", { columns: [hostile], rows: [[hostile]] }],
  ];
  for (const [type, props] of cases) {
    for (const width of [0, 1, 2, 3, 8, 16, 40, 80]) {
      const lines = render(type, props, width);
      assert.ok(lines.every(line => visibleWidth(line) <= width), `${type} must fit ${width} columns`);
      const output = lines.join("\n");
      assert.equal(output.includes("\x1b[2J"), false, type);
      assert.equal(output.includes("\x1b]52"), false, type);
      assert.equal(output.includes("\x1b_pi:c"), false, type);
    }
  }
  assert.equal(renderDisplay(element("Input", {}), 80, styled), undefined);
});
