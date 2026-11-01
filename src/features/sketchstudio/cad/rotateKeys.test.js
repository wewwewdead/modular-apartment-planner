// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { DEFAULT_TURN_STEP, placementKeyAction } from './rotateKeys.js';

const ready = { selected: true, busy: false, placeable: true, dragging: false, snap: 15 };
const key = (event, state = {}) => placementKeyAction({ target: null, ...event }, { ...ready, ...state });

it('R and M pick the rotate and move gizmo', () => {
  expect(key({ key: 'r' })).toEqual({ type: 'gizmo', mode: 'rotate' });
  expect(key({ key: 'R', shiftKey: true })).toEqual({ type: 'gizmo', mode: 'rotate' });
  expect(key({ key: 'm' })).toEqual({ type: 'gizmo', mode: 'translate' });
  // Holding the key does not flap the gizmo on and off.
  expect(key({ key: 'r', repeat: true })).toBeNull();
  // Picking a gizmo needs a selection, not a placeable part.
  expect(key({ key: 'm' }, { placeable: false })).toEqual({ type: 'gizmo', mode: 'translate' });
});

it('] and [ turn about Z by the snap step, with Shift about X', () => {
  expect(key({ key: ']', code: 'BracketRight' })).toEqual({ type: 'turn', axis: 'Z', degrees: 15 });
  expect(key({ key: '[', code: 'BracketLeft' })).toEqual({ type: 'turn', axis: 'Z', degrees: -15 });
  // Shift+[ types "{" on a US layout; the code still says which bracket.
  expect(key({ key: '{', code: 'BracketLeft', shiftKey: true })).toEqual({ type: 'turn', axis: 'X', degrees: -15 });
  expect(key({ key: '}', code: 'BracketRight', shiftKey: true })).toEqual({ type: 'turn', axis: 'X', degrees: 15 });
  expect(key({ key: ']', code: 'BracketRight' }, { snap: 45 }).degrees).toBe(45);
  // Free rotation (snap 0) still turns by a useful step.
  expect(key({ key: ']', code: 'BracketRight' }, { snap: 0 }).degrees).toBe(DEFAULT_TURN_STEP);
  expect(DEFAULT_TURN_STEP).toBe(15);
  // Key repeat keeps turning.
  expect(key({ key: ']', code: 'BracketRight', repeat: true }).degrees).toBe(15);
  // Turning needs a placeable part (not attached, not rebuilding into an error...).
  expect(key({ key: ']', code: 'BracketRight' }, { placeable: false })).toBeNull();
});

it('stays out of the way of typing, modifiers, drags and other tools', () => {
  const input = document.createElement('input');
  const select = document.createElement('select');
  const area = document.createElement('textarea');
  const editable = document.createElement('div');
  editable.setAttribute('contenteditable', 'true');
  const inside = document.createElement('span');
  editable.append(inside);
  for (const target of [input, select, area, editable, inside]) expect(key({ key: 'r', target })).toBeNull();
  expect(key({ key: 'r', target: document.createElement('canvas') })).not.toBeNull();
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) expect(key({ key: 'r', [modifier]: true })).toBeNull();
  expect(key({ key: 'r', defaultPrevented: true })).toBeNull();
  expect(key({ key: ']', code: 'BracketRight' }, { dragging: true })).toBeNull();
  expect(key({ key: 'r' }, { dragging: true })).toBeNull();
  expect(key({ key: 'r' }, { selected: false })).toBeNull();
  // A sketch session, hole tool, mate or operation draft owns the keys.
  expect(key({ key: 'r' }, { busy: true })).toBeNull();
  expect(key({ key: ']', code: 'BracketRight' }, { busy: true })).toBeNull();
  expect(key({ key: 'x' })).toBeNull();
});

it('D starts or stops Measure, with or without a selection', () => {
  const measure = { type: 'tool', tool: 'measure' };
  expect(key({ key: 'd' })).toEqual(measure);
  expect(key({ key: 'D', shiftKey: true })).toEqual(measure);
  expect(key({ key: 'd' }, { selected: false, placeable: false })).toEqual(measure);
  // While measuring (busy) D still stops it; other tools keep it out.
  expect(key({ key: 'd' }, { busy: true, measuring: true })).toEqual(measure);
  expect(key({ key: 'd' }, { busy: true })).toBeNull();
  expect(key({ key: 'd', repeat: true })).toBeNull();
  expect(key({ key: 'd' }, { dragging: true })).toBeNull();
  for (const target of [document.createElement('input'), document.createElement('textarea')])
    expect(key({ key: 'd', target })).toBeNull();
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) expect(key({ key: 'd', [modifier]: true })).toBeNull();
  // Measuring does not let R / M / ] through.
  expect(key({ key: 'r' }, { busy: true, measuring: true })).toBeNull();
  expect(key({ key: ']', code: 'BracketRight' }, { busy: true, measuring: true })).toBeNull();
  // R and M are unchanged.
  expect(key({ key: 'r' })).toEqual({ type: 'gizmo', mode: 'rotate' });
  expect(key({ key: 'm' })).toEqual({ type: 'gizmo', mode: 'translate' });
});

it('R / M switch a boolean tool gizmo while the operation draft keeps the other keys out', () => {
  // Direct placement (Phase H): busy with a draft, but the tool gizmo is shown.
  const tool = { busy: true, toolGizmo: true, selected: true, placeable: false };
  expect(key({ key: 'r' }, tool)).toEqual({ type: 'gizmo', mode: 'rotate', toolGizmo: true });
  expect(key({ key: 'M', shiftKey: true }, tool)).toEqual({ type: 'gizmo', mode: 'translate', toolGizmo: true });
  expect(key({ key: 'r', repeat: true }, tool)).toBeNull();
  expect(key({ key: 'r' }, { ...tool, dragging: true })).toBeNull();
  expect(key({ key: ']', code: 'BracketRight' }, tool)).toBeNull();
  expect(key({ key: 'd' }, tool)).toBeNull();
  // Without the gizmo a draft still blocks R / M.
  expect(key({ key: 'r' }, { ...tool, toolGizmo: false })).toBeNull();
});

it('S starts New sketch, but not while a tool runs, while typing or with a modifier', () => {
  const sketch = { type: 'tool', tool: 'sketch' };
  expect(key({ key: 's' })).toEqual(sketch);
  expect(key({ key: 'S', shiftKey: true })).toEqual(sketch);
  // No selection needed: an empty model starts a sketch the same way.
  expect(key({ key: 's' }, { selected: false, placeable: false })).toEqual(sketch);
  // Unlike D it never fires while busy (a sketch, hole tool, mate, draft or Measure).
  expect(key({ key: 's' }, { busy: true })).toBeNull();
  expect(key({ key: 's' }, { busy: true, measuring: true })).toBeNull();
  expect(key({ key: 's' }, { busy: true, toolGizmo: true })).toBeNull();
  expect(key({ key: 's', repeat: true })).toBeNull();
  expect(key({ key: 's' }, { dragging: true })).toBeNull();
  for (const target of [document.createElement('input'), document.createElement('select')])
    expect(key({ key: 's', target })).toBeNull();
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) expect(key({ key: 's', [modifier]: true })).toBeNull();
});
