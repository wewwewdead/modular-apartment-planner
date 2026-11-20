// The sketch bar's keys SK-1 (docs/sketch-studio-sketch-shortcuts.md §3): the
// one table the key handlers and the button titles read, and what a key press
// is.
import { describe, expect, it } from 'vitest';
import { SKETCH_KEYS, SKETCH_TOOLS, sketchKey } from './sketchTools.js';

describe('the sketch bar keys', () => {
  it('give every tool of the bar a key, and Undo last Ctrl+Z', () => {
    expect(SKETCH_KEYS).toEqual({
      line: 'L',
      rect: 'R',
      'rect-center': 'Shift+R',
      circle: 'C',
      arc: 'A',
      // HD-3 (docs/sketch-studio-hand-drawing.md §7.2): Slot and Polygon join Draw.
      slot: 'S',
      polygon: 'P',
      // HD-4 (§8.1): the Edit tools.
      trim: 'T',
      extend: 'E',
      fillet: 'F',
      chamfer: 'H',
      offset: 'O',
      dimension: 'D',
      relief: 'B',
      undo: 'Ctrl+Z',
    });
    expect(SKETCH_TOOLS.map(([tool]) => tool)).toEqual(Object.keys(SKETCH_KEYS).slice(0, -1));
  });

  it('reads a press as its tool, either case, Shift only where the key names it', () => {
    expect(['l', 'L', 'r', 'c', 'a', 'd', 'D', 'b'].map((key) => sketchKey({ key }))).toEqual([
      'line',
      'line',
      'rect',
      'circle',
      'arc',
      'dimension',
      'dimension',
      'relief',
    ]);
    expect(sketchKey({ key: 'R', shiftKey: true })).toBe('rect-center');
    expect(sketchKey({ key: 'L', shiftKey: true })).toBe(null);
    // E is Extend since HD-4; J is no key.
    expect(sketchKey({ key: 'e' })).toBe('extend');
    expect(sketchKey({ key: 'j' })).toBe(null);
    expect(sketchKey({ key: '1' })).toBe(null);
    expect(sketchKey({ key: 'Escape' })).toBe(null);
  });

  it('never takes Ctrl, Meta or Alt with a tool key, nor a held one', () => {
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey'])
      expect(sketchKey({ key: 'l', [modifier]: true })).toBe(null);
    expect(sketchKey({ key: 'l', repeat: true })).toBe(null);
  });

  it('reads Ctrl+Z and Meta+Z as Undo last, held too; not with Shift or Alt', () => {
    expect(sketchKey({ key: 'z', ctrlKey: true })).toBe('undo');
    expect(sketchKey({ key: 'Z', metaKey: true })).toBe('undo');
    expect(sketchKey({ key: 'z', ctrlKey: true, repeat: true })).toBe('undo');
    expect(sketchKey({ key: 'z', ctrlKey: true, shiftKey: true })).toBe(null);
    expect(sketchKey({ key: 'z', ctrlKey: true, altKey: true })).toBe(null);
    expect(sketchKey({ key: 'z' })).toBe(null);
  });
});
