import { describe, expect, it } from 'vitest';
import { applyWallDragPreview } from './wallDragPreview';

const floor = {
  walls: [
    { id: 'w1', start: { x: 0, y: 0 }, end: { x: 4000, y: 0 }, thickness: 100 },
    { id: 'w2', start: { x: 0, y: 0 }, end: { x: 0, y: 3000 }, thickness: 100 },
  ],
  sectionCuts: [{ id: 's1', startPoint: { x: 0, y: 1000 }, endPoint: { x: 5000, y: 1000 }, depth: 2000 }],
};

describe('applyWallDragPreview', () => {
  it('returns the same floor when there is no preview', () => {
    expect(applyWallDragPreview(floor, null)).toBe(floor);
    expect(applyWallDragPreview(floor, { edits: [], sectionCutEdits: [] })).toBe(floor);
  });

  it('overlays wall edits without touching unlisted walls', () => {
    const next = applyWallDragPreview(floor, {
      edits: [{ id: 'w1', start: { x: 0, y: 300 }, end: { x: 4000, y: 300 } }],
    });
    expect(next.walls.find((w) => w.id === 'w1').start).toEqual({ x: 0, y: 300 });
    expect(next.walls.find((w) => w.id === 'w2')).toBe(floor.walls[1]);
    // Committed floor object is never mutated.
    expect(floor.walls[0].start).toEqual({ x: 0, y: 0 });
  });

  it('overlays sectionCut edits preserving other properties', () => {
    const next = applyWallDragPreview(floor, {
      sectionCutEdits: [{ id: 's1', startPoint: { x: 0, y: 1900 }, endPoint: { x: 5000, y: 1900 } }],
    });
    const cut = next.sectionCuts[0];
    expect(cut.startPoint.y).toBe(1900);
    expect(cut.depth).toBe(2000);
    expect(floor.sectionCuts[0].startPoint.y).toBe(1000);
  });

  it('applies wall and sectionCut edits together', () => {
    const next = applyWallDragPreview(floor, {
      edits: [{ id: 'w1', start: { x: 0, y: 300 }, end: { x: 4000, y: 300 } }],
      sectionCutEdits: [{ id: 's1', startPoint: { x: 0, y: 1900 }, endPoint: { x: 5000, y: 1900 } }],
    });
    expect(next.walls[0].start.y).toBe(300);
    expect(next.sectionCuts[0].endPoint.y).toBe(1900);
  });
});
