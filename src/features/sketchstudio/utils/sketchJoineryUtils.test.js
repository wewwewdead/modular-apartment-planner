import { describe, expect, it } from 'vitest';
import {
  computeSketchJointDefaults,
  createSketchJoint,
  resolveSketchJoinery,
} from './sketchJoineryUtils';

function createRectEntity(id, x, y, width, height, thickness = 18) {
  return {
    id,
    type: 'rect',
    x,
    y,
    width,
    height,
    rotation: 0,
    thickness,
    layerId: 'default',
    meta: {},
  };
}

function createEdgeRef(entityId, sourceKey) {
  return {
    entityId,
    sourceType: 'segment',
    sourceKey,
  };
}

describe('sketchJoineryUtils', () => {
  it('computes stable default finger parameters from thickness and edge length', () => {
    const entities = [
      createRectEntity('side-a', 0, 0, 100, 120, 18),
      createRectEntity('side-b', 100, 0, 100, 120, 18),
    ];
    const joint = createSketchJoint({
      type: 'finger',
      primaryEntityId: 'side-a',
      secondaryEntityId: 'side-b',
      primaryEdgeRef: createEdgeRef('side-a', 'right'),
      secondaryEdgeRef: createEdgeRef('side-b', 'left'),
    });

    const defaults = computeSketchJointDefaults(joint, entities);

    expect(defaults.fingerCount).toBeGreaterThanOrEqual(3);
    expect(defaults.fingerCount % 2).toBe(1);
    expect(defaults.fingerWidth * defaults.fingerCount).toBeCloseTo(120, 1);
    expect(defaults.depth).toBe(18);
  });

  it('generates dado slot geometry as a subtractive feature', () => {
    const entities = [
      createRectEntity('panel', 0, 0, 200, 120, 18),
      createRectEntity('shelf', 40, -18, 60, 18, 18),
    ];
    const joint = createSketchJoint({
      id: 'joint-dado',
      type: 'dado',
      primaryEntityId: 'panel',
      secondaryEntityId: 'shelf',
      primaryEdgeRef: createEdgeRef('panel', 'top'),
      secondaryEdgeRef: createEdgeRef('shelf', 'bottom'),
      parameters: {
        width: 60,
        depth: 6,
      },
    });

    const resolution = resolveSketchJoinery(entities, [joint]);
    const feature = resolution.previewEntities[0];

    expect(resolution.diagnostics[0]).toMatchObject({ jointId: 'joint-dado', status: 'applied' });
    expect(feature).toMatchObject({
      type: 'feature',
      shape: 'rect',
      x: 40,
      y: 0,
      width: 60,
      height: 6,
      depth: 6,
      targetPartId: 'panel',
    });
    expect(resolution.exportEntities).toHaveLength(3);
    expect(resolution.exportEntities.find((entity) => entity.id === 'panel').meta?.manufacturingHidden).not.toBe(
      true,
    );
  });

  it('generates rabbet replacement profiles and hides the base manufacturing outline', () => {
    const entities = [
      createRectEntity('panel', 0, 0, 200, 120, 18),
      createRectEntity('back', 50, -18, 100, 18, 6),
    ];
    const joint = createSketchJoint({
      id: 'joint-rabbet',
      type: 'rabbet',
      primaryEntityId: 'panel',
      secondaryEntityId: 'back',
      primaryEdgeRef: createEdgeRef('panel', 'top'),
      secondaryEdgeRef: createEdgeRef('back', 'bottom'),
      parameters: {
        width: 100,
        depth: 9,
      },
    });

    const resolution = resolveSketchJoinery(entities, [joint]);
    const profile = resolution.previewEntities[0];

    expect(resolution.diagnostics[0]).toMatchObject({ jointId: 'joint-rabbet', status: 'applied' });
    expect(profile.type).toBe('polyline');
    expect(profile.closed).toBe(true);
    expect(profile.points).toEqual(
      expect.arrayContaining([
        { x: 50, y: 9 },
        { x: 150, y: 9 },
      ]),
    );
    expect(resolution.exportEntities.find((entity) => entity.id === 'panel').meta?.manufacturingHidden).toBe(true);
    expect(resolution.exportEntities.find((entity) => entity.id === 'back').meta?.manufacturingHidden).not.toBe(
      true,
    );
  });

  it('derives finger-joint geometry from finger width when count is not provided', () => {
    const entities = [
      createRectEntity('box-a', 0, 0, 100, 120, 18),
      createRectEntity('box-b', 100, 0, 100, 120, 18),
    ];
    const joint = createSketchJoint({
      id: 'joint-finger',
      type: 'finger',
      primaryEntityId: 'box-a',
      secondaryEntityId: 'box-b',
      primaryEdgeRef: createEdgeRef('box-a', 'right'),
      secondaryEdgeRef: createEdgeRef('box-b', 'left'),
      parameters: {
        fingerWidth: 20,
        depth: 18,
      },
    });

    const resolution = resolveSketchJoinery(entities, [joint]);
    const generatedProfiles = resolution.previewEntities.filter((entity) => entity.type === 'polyline');
    const hiddenBaseIds = resolution.exportEntities
      .filter((entity) => entity.meta?.manufacturingHidden)
      .map((entity) => entity.id)
      .sort();

    expect(resolution.diagnostics[0]).toMatchObject({ jointId: 'joint-finger', status: 'applied' });
    expect(generatedProfiles).toHaveLength(2);
    expect(generatedProfiles[0].points.some((point) => point.x === 82)).toBe(true);
    expect(generatedProfiles[1].points.some((point) => point.x === 118)).toBe(true);
    expect(hiddenBaseIds).toEqual(['box-a', 'box-b']);
  });

  it('surfaces unsupported geometry and invalid references without emitting manufacturing entities', () => {
    const entities = [
      createRectEntity('panel', 0, 0, 200, 120, 18),
      {
        id: 'line-1',
        type: 'line',
        x1: 0,
        y1: 0,
        x2: 100,
        y2: 0,
        layerId: 'default',
        meta: {},
      },
    ];
    const joint = createSketchJoint({
      id: 'joint-invalid',
      type: 'rabbet',
      primaryEntityId: 'panel',
      secondaryEntityId: 'line-1',
      primaryEdgeRef: createEdgeRef('panel', 'top'),
      secondaryEdgeRef: createEdgeRef('line-1', 'bottom'),
      parameters: {
        width: 100,
        depth: 9,
      },
    });

    const resolution = resolveSketchJoinery(entities, [joint]);

    expect(resolution.diagnostics[0]).toMatchObject({
      jointId: 'joint-invalid',
      status: 'unsupported',
    });
    expect(resolution.previewEntities).toEqual([]);
    expect(resolution.exportEntities).toHaveLength(2);
  });
});
