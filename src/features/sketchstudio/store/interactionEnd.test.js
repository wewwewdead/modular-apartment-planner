import { describe, expect, it } from 'vitest';
import { INTERACTION_END, getInteractionEnd, interactionEndAction, isInteractionInFlight } from './interactionEnd';
import { SKETCH_STUDIO_ACTIONS } from './sketchStudioActions';
import sketchStudioInitialState from './sketchStudioInitialState';

describe('how a canvas interaction ends', () => {
  it('has one outcome per mode and cause', () => {
    expect(INTERACTION_END).toEqual({
      panning: { release: 'end', abort: 'end', escape: 'end', undo: 'end' },
      'selection-box': { release: 'end', abort: 'end', escape: 'end', undo: 'end' },
      'handle-drag': { release: 'commit', abort: 'commit', escape: 'cancel', undo: 'cancel' },
      transform: { release: 'commit', abort: 'commit', escape: 'cancel', undo: 'cancel' },
    });
    expect(Object.isFrozen(INTERACTION_END)).toBe(true);
    expect(Object.isFrozen(INTERACTION_END.transform)).toBe(true);
  });

  it('names the action each outcome dispatches', () => {
    const typeOf = (mode, cause) => interactionEndAction(mode, cause)?.type ?? null;

    for (const cause of ['release', 'abort', 'escape', 'undo']) {
      expect(typeOf('panning', cause)).toBe(SKETCH_STUDIO_ACTIONS.END_PAN);
      expect(typeOf('selection-box', cause)).toBe(SKETCH_STUDIO_ACTIONS.END_SELECTION_BOX);
    }
    for (const cause of ['release', 'abort']) {
      expect(typeOf('handle-drag', cause)).toBe(SKETCH_STUDIO_ACTIONS.END_HANDLE_DRAG);
      expect(typeOf('transform', cause)).toBe(SKETCH_STUDIO_ACTIONS.END_TRANSFORM);
    }
    for (const cause of ['escape', 'undo']) {
      expect(typeOf('handle-drag', cause)).toBe(SKETCH_STUDIO_ACTIONS.CANCEL_HANDLE_DRAG);
      expect(typeOf('transform', cause)).toBe(SKETCH_STUDIO_ACTIONS.CANCEL_TRANSFORM);
    }
  });

  it('keeps no state nothing reads', () => {
    // Nothing ever started an anchor drag, and nothing read whether the
    // pointer was down: both were written on every gesture and kept in sync
    // by hand for no reader.
    expect(sketchStudioInitialState.interaction).not.toHaveProperty('anchorDrag');
    expect(sketchStudioInitialState.interaction).not.toHaveProperty('isPointerDown');
    expect(Object.keys(SKETCH_STUDIO_ACTIONS).filter((type) => /ANCHOR_DRAG|POINTER_DOWN/.test(type))).toEqual([]);
    expect(isInteractionInFlight('anchor-drag')).toBe(false);
  });

  it('has nothing to end while idle or drawing', () => {
    for (const mode of ['idle', 'drawing', undefined]) {
      expect(isInteractionInFlight(mode)).toBe(false);
      expect(getInteractionEnd(mode, 'escape')).toBeNull();
      expect(interactionEndAction(mode, 'escape')).toBeNull();
    }
    for (const mode of Object.keys(INTERACTION_END)) {
      expect(isInteractionInFlight(mode)).toBe(true);
    }
    // Inherited object keys are not modes.
    expect(isInteractionInFlight('toString')).toBe(false);
  });
});
