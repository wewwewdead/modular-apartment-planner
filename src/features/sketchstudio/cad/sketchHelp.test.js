// The Sketching panel's words (docs/sketch-studio-hand-drawing.md §8.0 item 3):
// every tool, every action and the two idle states have words, at most four
// lines, none over 110 characters; the Keys list is read from the sketcher's
// own tables.
import { describe, expect, it } from 'vitest';
import { COMMAND_WORDS, HELP_LINE_MAX, HELP_SECTIONS, helpKeys, sketchHelp } from './sketchHelp.js';
import { SELECTION_ACTIONS, SKETCH_COMMAND_KEYS, SKETCH_KEYS, SKETCH_TOOLS, createSketchState } from './sketchTools.js';

const tables = { keys: SKETCH_KEYS, commands: SKETCH_COMMAND_KEYS };
const fits = ({ title, lines }) => {
  expect(title.length).toBeLessThanOrEqual(HELP_LINE_MAX);
  expect(lines.length).toBeGreaterThan(0);
  expect(lines.length).toBeLessThanOrEqual(4);
  for (const line of lines) expect(line.length, line).toBeLessThanOrEqual(HELP_LINE_MAX);
};

describe('the Sketching panel’s Now block', () => {
  it('has words for every tool of the bar and Zero, titled with its key', () => {
    for (const [tool, label] of [...SKETCH_TOOLS, ['zero', 'Zero']]) {
      const help = sketchHelp({ tool }, tables);
      fits(help);
      const key = tool === 'zero' ? SKETCH_COMMAND_KEYS.zero[0] : SKETCH_KEYS[tool];
      expect(help.title).toBe(`${label} (${key})`);
    }
    // Offset's second step, its entity chosen.
    const side = sketchHelp({ tool: 'offset', offsetFrom: 'e1' }, tables);
    fits(side);
    expect(side.lines[0]).toMatch(/^Click the side the copy goes on/);
  });

  it('has words for every action on a selection, titled with its key', () => {
    for (const [kind, label] of SELECTION_ACTIONS) {
      const help = sketchHelp({ op: { kind, step: 'base' }, selectedIds: ['e1'] }, tables);
      fits(help);
      expect(help.title).toBe(`${label} (${SKETCH_COMMAND_KEYS[kind][0]})`);
    }
  });

  it('has words for the two idle states (nothing in hand, a selection) and a selected dimension', () => {
    const idle = sketchHelp(createSketchState(), tables);
    fits(idle);
    expect(idle.title).toBe('Nothing in hand');
    const one = sketchHelp({ selectedIds: ['e1'] });
    fits(one);
    expect(one.title).toBe('1 selected');
    expect(sketchHelp({ selectedIds: ['e1', 'e2', 'e3'] }).title).toBe('3 selected');
    fits(sketchHelp({ selectedIds: [], selectedDimensionId: 'd1' }));
  });

  it('lists every key of the sketcher’s tables, and its sections stay short', () => {
    const rows = helpKeys({ tools: SKETCH_TOOLS, keys: SKETCH_KEYS, commands: SKETCH_COMMAND_KEYS });
    for (const [tool] of SKETCH_TOOLS) expect(rows.map(([key]) => key)).toContain(SKETCH_KEYS[tool]);
    expect(rows).toContainEqual(['Ctrl+Z', 'Undo last']);
    expect(rows).toContainEqual(['T', 'Trim']);
    expect(rows).toContainEqual(['Ctrl+Y · Ctrl+Shift+Z', 'Redo']);
    for (const command of Object.keys(SKETCH_COMMAND_KEYS)) expect(COMMAND_WORDS[command], command).toBeTruthy();
    for (const [key, words] of rows) expect(`${key} ${words}`.length).toBeLessThanOrEqual(HELP_LINE_MAX);
    expect(HELP_SECTIONS.map((s) => s.title)).toEqual(['Points and numbers', 'Selecting and changing']);
    for (const section of HELP_SECTIONS)
      for (const line of section.lines) expect(line.length, line).toBeLessThanOrEqual(HELP_LINE_MAX);
  });
});
