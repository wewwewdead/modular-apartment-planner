import { describe, expect, it } from 'vitest';
import { createLinearDimensionAnnotation } from '@/domain/models';
import { buildAnnotationScene } from './scene';

function wallFloor(annotationSettings = {}) {
  return {
    id: 'floor-1',
    walls: [{ id: 'wall_1', start: { x: 0, y: 0 }, end: { x: 4000, y: 0 }, thickness: 200, height: 3000 }],
    rooms: [],
    columns: [],
    annotations: [],
    annotationSettings,
  };
}

describe('buildAnnotationScene settings overrides', () => {
  it('draws derived wall dimensions by default (the sheets take this path)', () => {
    const scene = buildAnnotationScene(wallFloor());
    expect(scene.dimensions.some((figure) => figure.sourceType === 'wall')).toBe(true);
  });

  it('suppresses wall dimensions under an override without touching the floor settings', () => {
    const floor = wallFloor({ showWallDimensions: true });
    const scene = buildAnnotationScene(floor, { showWallDimensions: false });

    expect(scene.dimensions.some((figure) => figure.sourceType === 'wall')).toBe(false);
    // The override is a view concern: the floor's own settings are not written.
    expect(floor.annotationSettings.showWallDimensions).toBe(true);
  });

  it('keeps manual dimensions when derived wall dimensions are overridden away — those were placed on purpose', () => {
    const floor = wallFloor();
    floor.annotations = [createLinearDimensionAnnotation({ x: 0, y: 0 }, { x: 4000, y: 0 }, { offset: 300 })];

    const scene = buildAnnotationScene(floor, { showWallDimensions: false });

    expect(scene.manualDimensions).toHaveLength(1);
    expect(scene.dimensions).toContain(scene.manualDimensions[0]);
  });

  it('leaves the other derived classes governed by the floor settings when only wall dimensions are overridden', () => {
    // Two walls, because the overall chain declines to dimension a single one.
    const floor = wallFloor({ showOverallDimensions: true, showWallDimensions: true });
    floor.walls.push({ id: 'wall_2', start: { x: 0, y: 0 }, end: { x: 0, y: 3000 }, thickness: 200, height: 3000 });

    const scene = buildAnnotationScene(floor, { showWallDimensions: false });

    expect(scene.dimensions.some((figure) => figure.sourceType === 'wall')).toBe(false);
    expect(scene.dimensions.length).toBeGreaterThan(0);
  });
});
