// The Sketching panel's words (docs/sketch-studio-hand-drawing.md §8.0 item
// 3, HD-4): what is in hand now — a tool, an action on the selection, a
// selection, or nothing — as a title and at most four short lines, and the
// three sections under it (Keys, read from the sketcher's own key tables so
// it cannot go stale; Points and numbers; Selecting and changing). Pure: no
// imports, no three, no DOM; it reads the reducer's state (or the summary of
// it the sketcher hands up: the same keys).

// The longest line the panel shows (characters).
export const HELP_LINE_MAX = 110;

const TOOLS = {
  line: [
    'Line',
    [
      'Click the start, then each next point; or type X, Y, then Length and Angle, and press Enter.',
      'Click the start again to close it; Enter or a double-click ends the line.',
      'Esc ends the tool.',
    ],
  ],
  rect: [
    'Rectangle',
    [
      'Click two opposite corners; or type X, Y, then Width and Height.',
      'A Corner radius in the row under the bar rounds the corners.',
      'Esc ends the tool.',
    ],
  ],
  'rect-center': [
    'Center rectangle',
    [
      'Click the centre, then a corner; or type X, Y, then the full Width and Height.',
      'A Corner radius in the row under the bar rounds the corners.',
      'Esc ends the tool.',
    ],
  ],
  circle: [
    'Circle',
    ['Click the centre, then a point on the circle; or type X, Y, then Radius or Diameter.', 'Esc ends the tool.'],
  ],
  arc: ['3-point arc', ['Click the start, the end, then a point on the arc; or type each X, Y.', 'Esc ends the tool.']],
  slot: [
    'Slot',
    [
      'Click the centre (or one end, set in the row), then the far end’s centre.',
      'Or type its Length and Angle; its Width is in the row under the bar.',
      'Esc ends the tool.',
    ],
  ],
  polygon: [
    'Polygon',
    [
      'Click the centre, then the middle of a side (or a corner, set in the row).',
      'Or type its size and Angle; Sides are in the row under the bar.',
      'Esc ends the tool.',
    ],
  ],
  trim: [
    'Trim',
    [
      'Move over a line, arc or circle: the part between its nearest crossings shows red.',
      'Click to remove it; the tool stays on for the next one.',
      'A rectangle, slot or polygon becomes its lines and arcs first.',
      'Esc ends the tool.',
    ],
  ],
  extend: [
    'Extend',
    [
      'Move near the end of a line or arc: the run to the next line, arc or circle shows.',
      'Click to extend it; the tool stays on for the next one.',
      'Esc ends the tool.',
    ],
  ],
  fillet: [
    'Fillet',
    [
      'Click a corner where two lines meet to round it; the Radius is in the row under the bar.',
      'The tool stays on for the next corner.',
      'All four corners of a rectangle at once: its own Corner radius.',
      'Esc ends the tool.',
    ],
  ],
  chamfer: [
    'Chamfer',
    [
      'Click a corner where two lines meet to cut it; the Distance is in the row under the bar.',
      'The tool stays on for the next corner.',
      'Esc ends the tool.',
    ],
  ],
  offset: [
    'Offset',
    [
      'Click a line, arc, circle or shape, then the side the copy goes on.',
      'The Distance is in the row under the bar; the copy shows before the second click.',
      'Esc ends the tool.',
    ],
  ],
  dimension: [
    'Dimension',
    [
      'Click two points, or a line, circle or arc, then where the dimension goes.',
      'Esc before the last click only measures.',
      'Dimensions are kept with the sketch and never change the part.',
    ],
  ],
  relief: [
    'Relief',
    [
      'Move to an inside corner and click: the bend relief is cut, and the tool stays on.',
      'Obround and Rectangular also go on a straight edge, beside a tab.',
      'Shape and sizes are in the row under the bar (empty: automatic for the sheet).',
      'Esc ends the tool.',
    ],
  ],
  zero: [
    'Zero',
    [
      'Click a point, or type X, Y, to measure every X and Y from it.',
      'Reset zero in the row puts it back on the sketch origin.',
      'Esc ends the tool with the zero unchanged.',
    ],
  ],
};
// Offset with its entity chosen: the second step.
const OFFSET_SIDE = [
  'Click the side the copy goes on: it shows by the cursor first.',
  'The Distance is in the row under the bar.',
  'Esc lets go of the chosen one; Esc again ends the tool.',
];
const ACTIONS = {
  move: [
    'Move',
    [
      'Click a base point, then where it goes; or type ΔX, ΔY and press Enter.',
      'Shift locks horizontal or vertical.',
      'Esc ends it; the selection stays.',
    ],
  ],
  copy: [
    'Copy',
    [
      'Like Move, and the original stays: a base point, then each copy’s place.',
      'It stays on for more copies until Esc; the copies are then selected.',
    ],
  ],
  rotate: [
    'Rotate',
    [
      'Click the centre, then the angle; or type the Angle and press Enter.',
      'Whole degrees with Snap on, 15° steps with Shift; Keep the original is in the row.',
      'Esc ends it.',
    ],
  ],
  mirror: [
    'Mirror',
    [
      'Click a line to mirror about it, or two points of the axis.',
      'Or Left ↔ right, Top ↔ bottom about the zero in the row.',
      'Esc ends it.',
    ],
  ],
  pattern: [
    'Pattern',
    [
      'Choose Row, Grid or Circle in the row and set its numbers: a ghost shows every copy.',
      'Apply (or Enter) adds them as one Undo step.',
      'Esc ends it.',
    ],
  ],
};
const IDLE = {
  title: 'Nothing in hand',
  lines: [
    'Pick a tool in the bar, or press its key (the list is under Keys).',
    'Click a shape to select it; Shift or Ctrl + click adds it or takes it out.',
    'Drag a box to the right for what lies inside it, to the left for what it touches.',
    'Esc finishes the sketch.',
  ],
};
const DIMENSION_SELECTED = {
  title: 'A dimension selected',
  lines: ['Delete removes it; a dimension never changes the part.', 'Esc clears the selection.'],
};

// The keys a tool's or an action's title names (the sketcher's tables, else none).
const titled = (label, key) => (key ? `${label} (${key})` : label);

/**
 * What is in hand, in words: { title, lines }. `state` holds `tool`, `op`
 * ({ kind, step }), `selectedIds`, `selectedDimensionId` and `offsetFrom`
 * (the reducer's state, or the sketcher's summary of it); `keys` and
 * `commands` the key tables the titles read (SKETCH_KEYS, SKETCH_COMMAND_KEYS).
 */
export function sketchHelp(state = {}, { keys = {}, commands = {} } = {}) {
  if (state.op?.kind && ACTIONS[state.op.kind]) {
    const [label, lines] = ACTIONS[state.op.kind];
    return { title: titled(label, commands[state.op.kind]?.[0]), lines };
  }
  if (state.tool && TOOLS[state.tool]) {
    const [label, lines] = TOOLS[state.tool];
    const key = state.tool === 'zero' ? commands.zero?.[0] : keys[state.tool];
    return { title: titled(label, key), lines: state.tool === 'offset' && state.offsetFrom ? OFFSET_SIDE : lines };
  }
  const count = state.selectedIds?.length || 0;
  if (count)
    return {
      title: `${count} selected`,
      lines: [
        count === 1
          ? 'Its numbers are in the row under the bar: type one and press Enter to change it.'
          : 'The row under the bar acts on all of them.',
        'M Move, K Copy, Q Rotate, I Mirror, G Pattern; or drag a selected shape to move it.',
        'X makes it construction (dashed, never part of the outline); Delete removes it.',
        'Esc clears the selection.',
      ],
    };
  if (state.selectedDimensionId) return DIMENSION_SELECTED;
  return IDLE;
}
/** Every tool and action that has words (for the test that none is missing). */
export const HELP_TOOLS = Object.keys(TOOLS);
export const HELP_ACTIONS = Object.keys(ACTIONS);

// The command keys' words (each command of SKETCH_COMMAND_KEYS has some: a test checks).
export const COMMAND_WORDS = {
  redo: 'Redo',
  'select-all': 'Select all',
  construction: 'Construction on or off',
  zero: 'Zero',
  move: 'Move the selection',
  copy: 'Copy the selection',
  rotate: 'Rotate the selection',
  mirror: 'Mirror the selection',
  pattern: 'Pattern the selection',
};
const FIXED_KEYS = [
  ['Esc', 'End the tool, then clear the selection, then finish'],
  ['Enter', 'Apply the typed numbers'],
  ['Tab', 'The next box by the cursor'],
  ['Delete', 'Remove the selection'],
];
/**
 * The Keys list: [[key, what it does]] from the sketcher's own tables — each
 * tool of `tools` ([tool, label]) with its key in `keys`, Undo last, then
 * every command of `commands` — and Esc, Enter, Tab, Delete.
 */
export function helpKeys({ tools = [], keys = {}, commands = {} } = {}) {
  const rows = tools.filter(([tool]) => keys[tool]).map(([tool, label]) => [keys[tool], label]);
  if (keys.undo) rows.push([keys.undo, 'Undo last']);
  for (const [command, list] of Object.entries(commands))
    rows.push([list.join(' · '), COMMAND_WORDS[command] || command.replace(/-/g, ' ')]);
  return [...rows, ...FIXED_KEYS];
}

/** The panel's two sections of words beside Keys: [{ id, title, lines }]. */
export const HELP_SECTIONS = [
  {
    id: 'points',
    title: 'Points and numbers',
    lines: [
      'Points snap to the grid, ends, midpoints, centres, crossings and the model edges in this plane (orange).',
      'After the first click, type in the box by the cursor: Tab switches box, Enter applies.',
      'Type in one pair (Length, Angle or X, Y) and the other shows, greyed, what it gives.',
      'X and Y are measured from the zero: Zero (Z) moves it, and it is kept with the sketch.',
      '@ before a number in X or Y measures from the last point (@25); = takes an expression (=w-2*t).',
      'Hold Shift to lock horizontal or vertical.',
    ],
  },
  {
    id: 'selecting',
    title: 'Selecting and changing',
    lines: [
      'With no tool, click to select; Shift or Ctrl + click adds or takes out; Ctrl+A selects all.',
      'Drag a box to the right for what lies wholly inside it, to the left for all it touches.',
      'One selected item shows its numbers under the bar: type one and press Enter to change it.',
      'Delete removes the selection. Every change is one Undo step: Ctrl+Z undoes, Ctrl+Y redoes.',
      'X makes a selection construction, or with nothing selected what you draw next.',
      'Lines and arcs join end to end to close the outline; closed shapes inside it become holes.',
      'Check lists what keeps the drawing from a clean blank; a click on a row shows where it is.',
    ],
  },
];
