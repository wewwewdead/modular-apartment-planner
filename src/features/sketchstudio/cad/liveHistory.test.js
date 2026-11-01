// Phase L (docs/sketch-studio-live-fields.md §5): SET_CAD_MODEL's meta folds a
// field's typing session into one undo step. (Kept in cad/: the phase's
// files stay in this folder.)
import { expect, it } from 'vitest';
import sketchStudioInitialState from '../store/sketchStudioInitialState';
import sketchStudioReducer from '../store/sketchStudioReducer';
import { undo } from '../store/sketchStudioActions';
import { emptyModel } from './model.js';

const withPitch = (pitch) => ({ ...emptyModel(), parameters: [{ id: 'p', name: 'pitch', value: pitch }] });
const start = () => ({
  ...sketchStudioInitialState,
  document: { ...sketchStudioInitialState.document, model: withPitch(50) },
  history: { past: [], future: [] },
});
const set = (state, model, meta) => sketchStudioReducer(state, { type: 'SET_CAD_MODEL', payload: model, meta });
const pitch = (state) => state.document.model.parameters[0].value;

it('pushes one entry without meta (as before) and none with meta.skipHistory', () => {
  let state = set(start(), withPitch(1));
  expect(state.history.past).toHaveLength(1);
  state = set(state, withPitch(15), { skipHistory: true });
  state = set(state, withPitch(150), { skipHistory: true });
  expect(state.history.past).toHaveLength(1);
  expect(pitch(state)).toBe(150);
  state = sketchStudioReducer(state, undo());
  expect(pitch(state)).toBe(50);
  expect(state.history.past).toHaveLength(0);
});

it('a skipHistory commit leaves the redo stack and the entries before it alone', () => {
  let state = set(start(), withPitch(60));
  state = set(state, withPitch(70));
  state = set(state, withPitch(75), { skipHistory: true });
  expect(state.history.past.map((s) => s.document.model.parameters[0].value)).toEqual([50, 60]);
});

it('meta.revertSession restores the value and drops the session entry', () => {
  let state = set(start(), withPitch(60));
  const before = state.history.past.length;
  state = set(state, withPitch(70));
  state = set(state, withPitch(80), { skipHistory: true });
  state = set(state, withPitch(60), { skipHistory: true, revertSession: true });
  expect(pitch(state)).toBe(60);
  expect(state.history.past).toHaveLength(before);
  // Undo now undoes the edit before the session.
  state = sketchStudioReducer(state, undo());
  expect(pitch(state)).toBe(50);
});
