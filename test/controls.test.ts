import assert from "node:assert/strict";
import test from "node:test";
import { CURSOR_MARKER, Editor, Input, SelectList, stripTerminalSequences, visibleWidth, type TuiMouseEvent } from "@earendil-works/pi-tui";
import type { ElementNode } from "@openuidev/lang-core";
import { DocumentModel } from "../src/model.js";
import { createFieldControl, type ControlStyle } from "../src/controls.js";

const style: ControlStyle = { fg: (_color, text) => text, bg: (_color, text) => text, bold: text => text };
function fixture(declarations: string, component: string, width = 60) {
  const source = `${declarations}\nroot = Stack([${component}, Button("Send", @ToAssistant("Use my input"))]);`;
  const model = new DocumentModel(source);
  assert.equal(model.valid, true, model.diagnostics.join("; "));
  const node = () => (model.root!.props.children as ElementNode[])[0];
  const control = createFieldControl(node(), model, style);
  const render = (focused = true, nextWidth = width) => control.render(nextWidth, focused);
  const plain = () => render().map(stripTerminalSequences);
  const key = (data: string) => { render(); const result = control.handleInput(data); control.update(node()); return result; };
  const mouse = (x: number, y: number, type: TuiMouseEvent["type"] = "click") => {
    render(); const result = control.handleMouse({ type, button: "left", x, y, screenX: x, screenY: y, width, height: 30, shift: false, alt: false, ctrl: false });
    control.update(node()); return result;
  };
  return { model, control, render, plain, key, mouse, node };
}

test("native Input remains the host widget and translates framed Unicode clicks correctly", () => {
  const f = fixture('$value = "ab界cd";', 'Input("value", "Value", $value, "Type here")');
  assert.ok(f.control.native instanceof Input);
  f.mouse(4, 0);
  f.key("X");
  assert.equal(f.model.formValues.value, "abX界cd");
  assert.ok(f.render().some(line => line.includes(CURSOR_MARKER)));
  assert.ok(f.render(false).every(line => !line.includes(CURSOR_MARKER) && !line.includes("\x1b_pi:fc")));
});

test("Select displays rich labels, stores values and skips disabled options", () => {
  const f = fixture('$value = "one";', 'Select("value", "Choice", [{value:"one",label:"First",description:"First description"},{value:"blocked",label:"Blocked",disabled:true},{value:"three",label:"Third"}], $value)');
  assert.ok(f.control.native instanceof SelectList);
  assert.match(f.plain().join("\n"), /First/);
  f.key("\x1b[B");
  assert.equal(f.model.formValues.value, "three");
  f.key("\x1b[A");
  assert.equal(f.model.formValues.value, "one");
  f.mouse(3, 1);
  assert.equal(f.model.formValues.value, "one");
  f.key("\x1b[A");
  assert.equal(f.model.formValues.value, "three", "selection wraps as in the native SelectList");
});

test("Select commits a press once even when reactive labels rebuild its native list before click", () => {
  const f = fixture('$value = "A";', 'Select("value", "Choice", [{value:"A",label:"A " + $value},{value:"B",label:"B"},{value:"C",label:"C"},{value:"D",label:"D"},{value:"E",label:"E"},{value:"F",label:"F"},{value:"G",label:"G"}], $value)');
  f.mouse(3, 3, "press");
  assert.equal(f.model.formValues.value, "D");
  f.mouse(3, 3, "release");
  f.mouse(3, 3, "click");
  assert.equal(f.model.formValues.value, "D");
});

test("Checkbox and Toggle use typed booleans with keyboard and mouse", () => {
  for (const type of ["Checkbox", "Toggle"]) {
    const f = fixture('$value = false;', `${type}("value", "Enabled", $value)`);
    f.key(" "); assert.equal(f.model.formValues.value, true);
    f.mouse(3, 0); assert.equal(f.model.formValues.value, false);
    f.key("\r"); assert.equal(f.model.formValues.value, true);
  }
});

test("MultiSelect toggles typed arrays and preserves disabled preselected choices", () => {
  const f = fixture('$value = ["locked"];', 'MultiSelect("value", "Choices", [{value:"locked",label:"Locked",disabled:true},"One","Two"], $value)');
  f.key(" "); assert.deepEqual(f.model.formValues.value, ["locked"]);
  f.key("\x1b[B"); f.key(" "); f.key("\x1b[B"); f.key(" ");
  assert.deepEqual(f.model.formValues.value, ["locked", "One", "Two"]);
  f.mouse(4, 1);
  assert.deepEqual(f.model.formValues.value, ["locked", "Two"]);
  assert.equal(f.key("\r").advance, true);
});

test("NumberInput retains invalid drafts without corrupting numeric state and supports reset", () => {
  const f = fixture('$value = 2;', 'NumberInput("value", "Quantity", $value, {min:0,max:10,step:2})');
  f.key("\x05"); f.key("\x15"); f.key("-");
  assert.match(f.control.error ?? "", /number/);
  assert.equal(f.model.formValues.value, 2);
  assert.match(f.plain().join("\n"), /-/);
  assert.equal(f.key("\r").advance, false);
  f.key("\x15"); f.key("5");
  assert.equal(f.control.error, undefined);
  assert.equal(f.model.formValues.value, 5);
  f.key("\x1b[A"); assert.equal(f.model.formValues.value, 7);
  f.key("\x05"); f.key("\x15"); f.key("-");
  f.control.update(f.node(), true);
  assert.equal(f.control.error, undefined);
  assert.match(f.plain().join("\n"), /7/);
});

test("rejected dependent edits restore accepted text and numeric values before submission", () => {
  for (const type of ["Input", "TextArea", "NumberInput"]) {
    const numeric = type === "NumberInput";
    const initial = numeric ? 10 : "A";
    const dependency = numeric ? 'Progress(5, $value)' : 'Select("choice", "Choice", [$value], "A")';
    const f = fixture(`$value = ${JSON.stringify(initial)};`, `${type}("value", "Value", $value), ${dependency}`);
    if (numeric) { f.key("\x05"); f.key("\x15"); }
    f.key(numeric ? "2" : "B");
    assert.equal(f.model.valid, true);
    assert.equal(f.model.formValues.value, initial);
    assert.equal(f.control.error, undefined);
    const native = f.control.native!;
    assert.equal(native instanceof Editor ? native.getText() : (native as Input).getValue(), String(initial), `${type} displays the accepted value`);
    const children = f.model.root!.props.children as ElementNode[];
    const result = f.model.activate(children[children.length - 1]);
    assert.equal(result.status, "submitted");
    if (result.status === "submitted") assert.equal(result.values.value, initial, `${type} submits the displayed value`);
  }
});

test("native TextArea supports newlines, multiline paste, mouse cursor positioning and bounded rendering", () => {
  const f = fixture('$value = "";', 'TextArea("value", "Details", $value, "Optional", {rows:5})', 30);
  assert.ok(f.control.native instanceof Editor);
  f.key("first"); f.key("\r"); f.key("second");
  assert.equal(f.model.formValues.value, "first\nsecond");
  f.mouse(2, 1); f.key("start: ");
  assert.equal(f.model.formValues.value, "start: first\nsecond");
  f.key("\x1b[200~paste\nblock\x1b[2J\x1b[201~");
  assert.match(String(f.model.formValues.value), /paste\nblock/);
  assert.equal(String(f.model.formValues.value).includes("\x1b"), false);
  f.key("\x1b[200~" + Array.from({ length: 15 }, (_, index) => `line ${index}`).join("\n") + "\x1b[201~");
  assert.equal((f.control.native as Editor).getText(), f.model.formValues.value, "large pasted text stays directly editable instead of a collapsed chat paste marker");
  for (const width of [1, 2, 10, 30]) assert.ok(f.render(true, width).every(line => visibleWidth(line) <= width));
  assert.ok(f.render(false).every(line => !line.includes(CURSOR_MARKER) && !line.includes("\x1b_pi:fc")));
});

test("Slider keyboard and pointer selection quantize to step and stay bounded", () => {
  const f = fixture('$value = 4;', 'Slider("value", "Amount", $value, 0, 10, 2)', 24);
  f.key("\x1b[C"); assert.equal(f.model.formValues.value, 6);
  f.key("\x1b[H"); assert.equal(f.model.formValues.value, 0);
  f.mouse(21, 1); assert.equal(f.model.formValues.value, 10);
  f.key("\x1b[C"); assert.equal(f.model.formValues.value, 10);
  f.mouse(2, 1); assert.equal(f.model.formValues.value, 0);
});

test("DatePicker renders a real calendar, handles month ends and mouse date selection", () => {
  const f = fixture('$value = "2026-01-31";', 'DatePicker("value", "Date", $value)', 35);
  assert.match(f.plain().join("\n"), /January 2026/);
  f.key("\x1b[6~"); assert.equal(f.model.formValues.value, "2026-02-28");
  assert.match(f.plain().join("\n"), /February 2026/);
  f.mouse(1, 2); assert.equal(f.model.formValues.value, "2026-02-01");
  f.mouse(34, 0); assert.equal(f.model.formValues.value, "2026-02-01", "blank header padding does not change months");
  f.key("\x1b[D"); assert.equal(f.model.formValues.value, "2026-01-31");
});

test("DatePicker min/max prevent out-of-range pointer and keyboard choices", () => {
  const f = fixture('$value = "2026-02-10";', 'DatePicker("value", "Date", $value, {minDate:"2026-02-10",maxDate:"2026-02-12"})', 35);
  f.mouse(1, 2); assert.equal(f.model.formValues.value, "2026-02-10");
  f.key("\x1b[A"); assert.equal(f.model.formValues.value, "2026-02-10");
  f.key("\x1b[B"); assert.equal(f.model.formValues.value, "2026-02-12");
});

test("DatePicker sanitizes invalid values in its narrow view without changing editable state", () => {
  const value = "bad\x1b[2J\x1b]52;c;c2VjcmV0\x07\x1b]8;;https://example.com\x1b\\date\x1b]8;;\x1b\\\x1b_pi:fc;1\x1b\\\nvalue";
  const f = fixture(`$value = ${JSON.stringify(value)};`, 'DatePicker("value", "Date", $value)', 16);
  assert.match(f.model.fieldErrors.value, /valid YYYY-MM-DD/);
  assert.match(f.plain().join("\n"), /baddate value/);
  for (const width of [1, 2, 16, 20, 21, 35]) {
    for (const focused of [false, true]) {
      const lines = f.render(focused, width);
      assert.ok(lines.every(line => visibleWidth(line) <= width));
      const output = lines.join("\n").replace(/\x1b\[[0-9;]*m/g, "");
      assert.doesNotMatch(output, /[\x00-\x08\x0b-\x1f\x7f-\x9f]/);
    }
  }
  assert.equal(f.model.formValues.value, value, "rendering preserves the original invalid field value");
  f.key("\x1b[C");
  assert.equal(f.model.fieldErrors.value, undefined, "calendar editing still corrects an invalid value");
});

test("Tree expands and collapses branches and selects enabled descendants", () => {
  const f = fixture('$value = "root";', 'Tree("value", "Files", [{value:"root",label:"Source",children:[{value:"blocked",label:"Blocked",disabled:true},{value:"file",label:"index.ts"}]}], $value)');
  assert.doesNotMatch(f.plain().join("\n"), /index\.ts/);
  f.key("\x1b[C"); assert.match(f.plain().join("\n"), /index\.ts/);
  f.key("\x1b[B"); f.key(" "); assert.equal(f.model.formValues.value, "file");
  f.key("\x1b[D"); f.key("\x1b[D");
  assert.doesNotMatch(f.plain().join("\n"), /index\.ts/);
  f.mouse(2, 0); assert.match(f.plain().join("\n"), /index\.ts/);
  f.mouse(8, 1); assert.equal(f.model.formValues.value, "file", "disabled node cannot become selected");
  f.mouse(8, 0); assert.equal(f.model.formValues.value, "root");
});

test("typed controls reject editing while disabled", () => {
  const controls = [
    ['$value = false;', 'Checkbox("value", "Flag", $value, {disabled:true})'],
    ['$value = "A";', 'Select("value", "Choice", ["A","B"], $value, {disabled:true})'],
    ['$value = 1;', 'Slider("value", "Count", $value, 0, 10, 1, {disabled:true})'],
    ['$value = "2026-01-01";', 'DatePicker("value", "Date", $value, {disabled:true})'],
  ];
  for (const [declaration, component] of controls) {
    const f = fixture(declaration, component);
    const before = f.model.formValues;
    f.key(" "); f.key("\x1b[C"); f.mouse(3, 0);
    assert.deepEqual(f.model.formValues, before);
  }
});

test("Tabs and Steps disable native and typed descendants until a local action enables the group", () => {
  for (const layout of ["Tabs", "Steps"]) {
    const model = new DocumentModel(`$locked = true\nroot = Stack([${layout}("page", [{value:"one",label:"One",children:[Input("text","Text","hello"),TextArea("notes","Notes","hello"),Checkbox("flag","Flag",false)]}], "one", {disabled:$locked}), Button("Unlock", @Set($locked, false))])`);
    assert.equal(model.valid, true, model.diagnostics.join("; "));
    const children = () => {
      const group = (model.root!.props.children as ElementNode[])[0];
      return (group.props.items as Array<{ children: ElementNode[] }>)[0].children;
    };
    const controls = children().map(node => createFieldControl(node, model, style));
    const before = model.formValues;
    for (const control of controls) {
      control.render(40, true);
      assert.equal(control.handleInput(" ").handled, false);
      assert.equal(control.handleMouse({ type: "click", button: "left", x: 3, y: 0, screenX: 3, screenY: 0, width: 40, height: 20, shift: false, alt: false, ctrl: false }), undefined);
    }
    assert.deepEqual(model.formValues, before);
    assert.deepEqual(model.activate((model.root!.props.children as ElementNode[])[1]), { status: "updated" });
    controls.forEach((control, index) => {
      control.update(children()[index]);
      control.render(40, true);
      assert.equal(control.handleInput(" ").handled, true);
    });
    assert.equal(model.formValues.flag, true);
    assert.notEqual(model.formValues.text, before.text);
    assert.notEqual(model.formValues.notes, before.notes);
  }
});

test("streaming typed controls ignore keyboard and mouse changes", () => {
  const source = '$value = false;\nroot = Stack([Checkbox("value", "Flag", $value)])';
  const model = new DocumentModel();
  model.update(source, true);
  const node = (model.root!.props.children as ElementNode[])[0];
  const control = createFieldControl(node, model, style);
  control.render(30, true);
  assert.equal(control.handleInput(" ").handled, false);
  control.handleMouse({ type: "click", button: "left", x: 3, y: 0, screenX: 3, screenY: 0, width: 30, height: 20, shift: false, alt: false, ctrl: false });
  assert.equal(model.formValues.value, false);
});
