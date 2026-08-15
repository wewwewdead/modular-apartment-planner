import { describe, expect, it } from 'vitest';
import {
  buildMirrorPreviewEntities,
  getMirrorAxisAngleDegrees,
  isAxisOrthogonal,
  mirrorEntitiesAcrossLine,
  reflectPointAcrossLine,
} from './mirrorUtils';

const VERTICAL_AXIS = [
  { x: 0, y: 0 },
  { x: 0, y: 100 },
];
const HORIZONTAL_AXIS = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
];
const DIAGONAL_AXIS = [
  { x: 0, y: 0 },
  { x: 100, y: 100 },
];

function base(id, type, extra) {
  return { id, type, layerId: 'default', locked: false, visible: true, meta: {}, ...extra };
}

function mirrorOne(entity, axis = VERTICAL_AXIS, others = []) {
  const result = mirrorEntitiesAcrossLine([entity, ...others], [entity.id], axis[0], axis[1]);
  return { result, copy: result.createdEntities[0] };
}

describe('mirrorUtils geometry helpers', () => {
  it('reflects a point across an arbitrary line', () => {
    expect(reflectPointAcrossLine({ x: 40, y: 10 }, ...VERTICAL_AXIS)).toEqual({ x: -40, y: 10 });
    expect(reflectPointAcrossLine({ x: 40, y: 10 }, ...HORIZONTAL_AXIS)).toEqual({ x: 40, y: -10 });

    const diagonal = reflectPointAcrossLine({ x: 40, y: 10 }, ...DIAGONAL_AXIS);
    expect(diagonal.x).toBeCloseTo(10, 9);
    expect(diagonal.y).toBeCloseTo(40, 9);
  });

  it('classifies axis orientation', () => {
    expect(isAxisOrthogonal(...VERTICAL_AXIS)).toBe(true);
    expect(isAxisOrthogonal(...HORIZONTAL_AXIS)).toBe(true);
    expect(isAxisOrthogonal(...DIAGONAL_AXIS)).toBe(false);
    expect(getMirrorAxisAngleDegrees(...VERTICAL_AXIS)).toBeCloseTo(90, 9);
  });

  it('rejects a degenerate axis', () => {
    const entity = base('line-1', 'line', { x1: 0, y1: 0, x2: 10, y2: 0 });
    expect(mirrorEntitiesAcrossLine([entity], ['line-1'], { x: 5, y: 5 }, { x: 5, y: 5 })).toBeNull();
    expect(mirrorEntitiesAcrossLine([entity], ['line-1'], null, { x: 5, y: 5 })).toBeNull();
  });
});

describe('mirrorUtils per entity type', () => {
  it('mirrors a line', () => {
    const { copy } = mirrorOne(base('line-1', 'line', { x1: 10, y1: 20, x2: 40, y2: 60 }));

    expect(copy.type).toBe('line');
    expect(copy).toMatchObject({ x1: -10, y1: 20, x2: -40, y2: 60 });
  });

  it('mirrors a polyline point by point and keeps it closed', () => {
    const { copy } = mirrorOne(
      base('polyline-1', 'polyline', {
        points: [
          { x: 10, y: 0 },
          { x: 30, y: 0 },
          { x: 30, y: 20 },
        ],
        closed: true,
      }),
    );

    expect(copy.closed).toBe(true);
    expect(copy.points).toEqual([
      { x: -10, y: 0 },
      { x: -30, y: 0 },
      { x: -30, y: 20 },
    ]);
  });

  it('mirrors an arc through its three control points', () => {
    const { copy } = mirrorOne(
      base('arc-1', 'arc', { start: { x: 10, y: 0 }, control: { x: 20, y: 40 }, end: { x: 30, y: 0 } }),
    );

    expect(copy.type).toBe('arc');
    expect(copy.start).toEqual({ x: -10, y: 0 });
    expect(copy.control).toEqual({ x: -20, y: 40 });
    expect(copy.end).toEqual({ x: -30, y: 0 });
  });

  it('mirrors a circle by its centre', () => {
    const { copy } = mirrorOne(base('circle-1', 'circle', { cx: 50, cy: 30, r: 12 }));

    expect(copy).toMatchObject({ type: 'circle', cx: -50, cy: 30, r: 12 });
  });

  it('mirrors an ellipse through its rotation field, never a polyline', () => {
    const { copy } = mirrorOne(base('ellipse-1', 'ellipse', { cx: 50, cy: 30, rx: 40, ry: 10, rotation: 30 }));

    expect(copy.type).toBe('ellipse');
    expect(copy.rx).toBe(40);
    expect(copy.ry).toBe(10);
    // rotation' = 2 * axisAngle - rotation = 2 * 90 - 30 = 150.
    expect(copy.rotation).toBeCloseTo(150, 9);
    expect(copy.cx).toBe(-50);
  });

  it('mirrors an ellipse across an oblique axis exactly', () => {
    const { copy } = mirrorOne(
      base('ellipse-1', 'ellipse', { cx: 40, cy: 10, rx: 40, ry: 10, rotation: 30 }),
      DIAGONAL_AXIS,
    );

    expect(copy.type).toBe('ellipse');
    // rotation' = 2 * 45 - 30 = 60.
    expect(copy.rotation).toBeCloseTo(60, 9);
    expect(copy.cx).toBeCloseTo(10, 9);
    expect(copy.cy).toBeCloseTo(40, 9);
  });

  it('keeps a rect a rect across a vertical axis', () => {
    const { copy } = mirrorOne(base('rect-1', 'rect', { x: 10, y: 0, width: 20, height: 10, rotation: 0 }));

    expect(copy.type).toBe('rect');
    expect(copy).toMatchObject({ x: -30, y: 0, width: 20, height: 10, rotation: 0 });
  });

  it('negates rect rotation across an orthogonal axis', () => {
    const { copy } = mirrorOne(
      base('rect-1', 'rect', { x: 10, y: 0, width: 20, height: 10, rotation: 25 }),
      HORIZONTAL_AXIS,
    );

    expect(copy.type).toBe('rect');
    expect(copy.rotation).toBeCloseTo(-25, 9);
    expect(copy.width).toBe(20);
    expect(copy.height).toBe(10);
  });

  it('converts a rect to a closed polyline across an oblique axis', () => {
    const { copy } = mirrorOne(base('rect-1', 'rect', { x: 10, y: 0, width: 20, height: 10 }), DIAGONAL_AXIS);

    expect(copy.type).toBe('polyline');
    expect(copy.closed).toBe(true);
    expect(copy.points).toHaveLength(4);
    expect(copy.width).toBeUndefined();
    expect(copy.height).toBeUndefined();
    expect(copy.rotation).toBeUndefined();
    copy.points.forEach((point, index) => {
      const expected = [
        { x: 0, y: 10 },
        { x: 0, y: 30 },
        { x: 10, y: 30 },
        { x: 10, y: 10 },
      ][index];
      expect(point.x).toBeCloseTo(expected.x, 9);
      expect(point.y).toBeCloseTo(expected.y, 9);
    });
  });

  it('mirrors feature holes, cutouts, and polygons', () => {
    const hole = base('feature-1', 'feature', {
      featureType: 'hole',
      shape: 'circle',
      cx: 60,
      cy: 20,
      diameter: 8,
      hardwareId: 'screw-4x30',
      through: true,
      depth: null,
    });
    const cutout = base('feature-2', 'feature', {
      featureType: 'cutout',
      shape: 'rect',
      x: 10,
      y: 0,
      width: 20,
      height: 10,
    });
    const polygon = base('feature-3', 'feature', {
      featureType: 'cutout',
      shape: 'polygon',
      points: [
        { x: 10, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 20 },
      ],
    });
    const result = mirrorEntitiesAcrossLine(
      [hole, cutout, polygon],
      ['feature-1', 'feature-2', 'feature-3'],
      ...VERTICAL_AXIS,
    );
    const [holeCopy, cutoutCopy, polygonCopy] = result.createdEntities;

    expect(holeCopy).toMatchObject({ type: 'feature', shape: 'circle', cx: -60, cy: 20, hardwareId: 'screw-4x30' });
    expect(cutoutCopy).toMatchObject({ shape: 'rect', x: -30, y: 0, width: 20, height: 10 });
    expect(polygonCopy.points).toEqual([
      { x: -10, y: 0 },
      { x: -30, y: 0 },
      { x: -30, y: 20 },
    ]);
  });

  it('converts a feature rect to a polygon feature across an oblique axis', () => {
    const { copy } = mirrorOne(
      base('feature-1', 'feature', { featureType: 'cutout', shape: 'rect', x: 10, y: 0, width: 20, height: 10 }),
      DIAGONAL_AXIS,
    );

    expect(copy.type).toBe('feature');
    expect(copy.shape).toBe('polygon');
    expect(copy.points).toHaveLength(4);
    expect(copy.width).toBeUndefined();
  });
});

describe('mirrorUtils copy rules', () => {
  it('keeps the originals and adds copies with fresh ids', () => {
    const original = base('line-1', 'line', { x1: 10, y1: 0, x2: 40, y2: 0 });
    const result = mirrorEntitiesAcrossLine([original], ['line-1'], ...VERTICAL_AXIS);

    expect(result.entities).toHaveLength(2);
    expect(result.entities[0]).toBe(original);
    expect(result.createdIds).toHaveLength(1);
    expect(result.createdIds[0]).not.toBe('line-1');
    expect(result.createdIds[0].startsWith('line-')).toBe(true);
  });

  it('never reuses an id inside one operation', () => {
    const entities = [
      base('line-1', 'line', { x1: 10, y1: 0, x2: 40, y2: 0 }),
      base('line-2', 'line', { x1: 10, y1: 10, x2: 40, y2: 10 }),
      base('line-3', 'line', { x1: 10, y1: 20, x2: 40, y2: 20 }),
    ];
    const result = mirrorEntitiesAcrossLine(entities, ['line-1', 'line-2', 'line-3'], ...VERTICAL_AXIS);
    const ids = result.entities.map((entity) => entity.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('preserves layer, material, thickness, and custom meta', () => {
    const original = {
      ...base('line-1', 'line', { x1: 10, y1: 0, x2: 40, y2: 0 }),
      layerId: 'walls',
      materialId: 'ply-18',
      thickness: 18,
      locked: false,
      meta: { lineStyle: 'broken', objectDraftId: 'draft-9' },
    };
    const { copy } = mirrorOne(original);

    expect(copy.layerId).toBe('walls');
    expect(copy.materialId).toBe('ply-18');
    expect(copy.thickness).toBe(18);
    expect(copy.meta.lineStyle).toBe('broken');
    expect(copy.meta.objectDraftId).toBe('draft-9');
  });

  it('strips stale sourceRefs from the copy', () => {
    const original = {
      ...base('line-1', 'line', { x1: 10, y1: 0, x2: 40, y2: 0 }),
      meta: { sourceRefs: [{ entityId: 'line-9', sourceType: 'endpoint', sourceKey: 'start' }, null], keep: true },
    };
    const { copy } = mirrorOne(original);

    expect(copy.meta.sourceRefs).toBeUndefined();
    expect(copy.meta.keep).toBe(true);
  });

  it('gives a fully copied group a brand new group id', () => {
    const entities = [
      { ...base('line-1', 'line', { x1: 10, y1: 0, x2: 40, y2: 0 }), meta: { groupId: 'group-a' } },
      { ...base('line-2', 'line', { x1: 10, y1: 10, x2: 40, y2: 10 }), meta: { groupId: 'group-a' } },
    ];
    const result = mirrorEntitiesAcrossLine(entities, ['line-1', 'line-2'], ...VERTICAL_AXIS);
    const groupIds = result.createdEntities.map((entity) => entity.meta.groupId);

    expect(groupIds[0]).toBe(groupIds[1]);
    expect(groupIds[0]).not.toBe('group-a');
  });

  it('skips text, dimensions, and angle dimensions and reports them', () => {
    const entities = [
      base('line-1', 'line', { x1: 10, y1: 0, x2: 40, y2: 0 }),
      base('text-1', 'text', { x: 10, y: 10, text: 'Label', fontSize: 100 }),
      base('dim-1', 'dimension', { p1: { x: 0, y: 0 }, p2: { x: 40, y: 0 }, offset: 30, subtype: 'horizontal' }),
      base('ang-1', 'angle-dimension', {
        vertex: { x: 0, y: 0 },
        p1: { x: 10, y: 0 },
        p2: { x: 0, y: 10 },
        arcRadius: 20,
      }),
    ];
    const result = mirrorEntitiesAcrossLine(entities, ['line-1', 'text-1', 'dim-1', 'ang-1'], ...VERTICAL_AXIS);

    expect(result.createdEntities).toHaveLength(1);
    expect(result.createdEntities[0].type).toBe('line');
    expect(result.skippedEntities.map((entity) => entity.id)).toEqual(['text-1', 'dim-1', 'ang-1']);
  });

  it('copies no joints (it only ever returns entities)', () => {
    const result = mirrorEntitiesAcrossLine(
      [base('line-1', 'line', { x1: 10, y1: 0, x2: 40, y2: 0 })],
      ['line-1'],
      ...VERTICAL_AXIS,
    );

    expect(Object.keys(result).sort()).toEqual(
      ['createdEntities', 'createdIds', 'entities', 'idMap', 'skippedEntities'].sort(),
    );
  });
});

describe('mirrorUtils preview', () => {
  it('builds throwaway ghosts without touching the document', () => {
    const entities = [
      base('line-1', 'line', { x1: 10, y1: 0, x2: 40, y2: 0 }),
      base('text-1', 'text', { x: 10, y: 10, text: 'Label' }),
    ];
    const ghosts = buildMirrorPreviewEntities(entities, ['line-1', 'text-1'], ...VERTICAL_AXIS);

    expect(ghosts).toHaveLength(1);
    expect(ghosts[0].id).toBe('mirror-ghost-0');
    expect(ghosts[0]).toMatchObject({ x1: -10, x2: -40 });
  });

  it('returns nothing without a selection or a real axis', () => {
    const entities = [base('line-1', 'line', { x1: 10, y1: 0, x2: 40, y2: 0 })];

    expect(buildMirrorPreviewEntities(entities, [], ...VERTICAL_AXIS)).toEqual([]);
    expect(buildMirrorPreviewEntities(entities, ['line-1'], { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([]);
  });
});
