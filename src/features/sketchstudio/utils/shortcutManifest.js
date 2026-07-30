import { TOOL_DEFINITIONS, TOOL_SHORTCUT_MAP } from '../hooks/sketchConstants';

/**
 * Single source of truth for the Sketch Studio shortcut reference overlay.
 *
 * Tool rows are derived from `TOOL_SHORTCUT_MAP` (the same map `useSketchKeyboard`
 * dispatches from) and labelled through `TOOL_DEFINITIONS`, so adding, renaming, or
 * re-keying a tool updates the overlay automatically — the list can never drift.
 * Everything else is a static entry that mirrors the bindings implemented in
 * `useSketchKeyboard`, `useSketchPersistence`, `useSketchPointer`, and `useSketchViewport`.
 *
 * Entry shape:
 *   { id, label, detail, combos }
 * `combos` is a list of alternative key combinations; each combination is a list of
 * chips rendered as `<kbd>` elements joined by `+` (alternatives are joined by "or").
 */

export const SHORTCUT_OVERLAY_TOGGLE_KEY = '?';

export const SHORTCUT_OVERLAY_TITLE = 'Keyboard shortcuts';

export const SHORTCUT_OVERLAY_FOOTNOTE =
  'Ctrl acts as Cmd on macOS. Shortcuts are ignored while typing in a field, and Esc or ? closes this panel.';

const TOOLS_BY_ID = new Map(TOOL_DEFINITIONS.map((tool) => [tool.id, tool]));

function buildToolEntries() {
  return Array.from(TOOL_SHORTCUT_MAP, ([shortcutKey, toolId]) => {
    const tool = TOOLS_BY_ID.get(toolId);

    return {
      id: `tool-${toolId}`,
      label: tool?.label ?? toolId,
      detail: tool?.description ?? null,
      combos: [[shortcutKey.toUpperCase()]],
      toolId,
      shortcutKey,
    };
  });
}

const STATIC_SECTIONS = [
  {
    id: 'editing',
    title: 'Editing',
    entries: [
      { id: 'undo', label: 'Undo', detail: null, combos: [['Ctrl', 'Z']] },
      {
        id: 'redo',
        label: 'Redo',
        detail: null,
        combos: [
          ['Ctrl', 'Shift', 'Z'],
          ['Ctrl', 'Y'],
        ],
      },
      { id: 'group', label: 'Group selection', detail: 'Needs two or more selected entities', combos: [['Ctrl', 'G']] },
      {
        id: 'ungroup',
        label: 'Ungroup selection',
        detail: 'Needs a grouped selection',
        combos: [['Ctrl', 'Shift', 'G']],
      },
      { id: 'save', label: 'Save sketch', detail: null, combos: [['Ctrl', 'S']] },
      { id: 'delete', label: 'Delete selection', detail: null, combos: [['Delete'], ['Backspace']] },
    ],
  },
  {
    id: 'selection',
    title: 'Selection',
    entries: [
      { id: 'extend-selection', label: 'Add to selection', detail: null, combos: [['Shift', 'Click']] },
      { id: 'marquee', label: 'Marquee select', detail: 'Drag from empty canvas with Select', combos: [['Drag']] },
      { id: 'nudge', label: 'Nudge selection by 1', detail: null, combos: [['Arrow keys']] },
      { id: 'nudge-large', label: 'Nudge selection by 10', detail: null, combos: [['Shift', 'Arrow keys']] },
    ],
  },
  {
    id: 'drafting',
    title: 'Drafting',
    entries: [
      {
        id: 'commit-draft',
        label: 'Commit the current draft',
        detail: 'Fillet, angle, polyline, and exact-input shapes',
        combos: [['Enter']],
      },
      { id: 'cancel-draft', label: 'Cancel draft or exit transform', detail: null, combos: [['Esc']] },
      { id: 'polyline-undo-vertex', label: 'Remove last polyline vertex', detail: null, combos: [['Backspace']] },
      {
        id: 'fillet-radius-up',
        label: 'Increase fillet radius',
        detail: 'While a fillet draft is active',
        combos: [[']']],
      },
      {
        id: 'fillet-radius-down',
        label: 'Decrease fillet radius',
        detail: 'While a fillet draft is active',
        combos: [['[']],
      },
    ],
  },
  {
    id: 'view',
    title: 'View',
    entries: [
      { id: 'space-pan', label: 'Pan while held', detail: null, combos: [['Space']] },
      { id: 'middle-pan', label: 'Pan the viewport', detail: null, combos: [['Middle-drag']] },
      { id: 'wheel-zoom', label: 'Zoom at the cursor', detail: null, combos: [['Wheel']] },
      {
        id: 'toggle-overlay',
        label: 'Toggle this shortcut list',
        detail: null,
        combos: [[SHORTCUT_OVERLAY_TOGGLE_KEY]],
      },
    ],
  },
];

export function buildShortcutSections() {
  return [{ id: 'tools', title: 'Tools', entries: buildToolEntries() }, ...STATIC_SECTIONS];
}

export const SHORTCUT_SECTIONS = buildShortcutSections();
