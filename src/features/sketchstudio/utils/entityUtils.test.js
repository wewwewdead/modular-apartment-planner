import { describe, expect, it } from 'vitest';
import {
  applyLineStyleToEntities,
  createArcEntity,
  createDimensionEntity,
  createEllipseEntity,
  createLineEntity,
  createPolylineEntity,
  createRectEntity,
  createTextEntity,
  duplicateEntitiesByIds,
  getEntityMeasurementRows,
  getTextMetrics,
  normalizeRectFromPoints,
  toggleBrokenLineForEntities,
  updateEntityFromNumericField,
} from './entityUtils';

describe('entityUtils', () => {
  it('normalizes rectangles drawn in any direction', () => {
    expect(normalizeRectFromPoints({ x: 300, y: 220 }, { x: 100, y: 120 })).toEqual({
      x: 100,
      y: 120,
      width: 200,
      height: 100,
    });
  });

  it('creates line and rect entities with incrementing ids', () => {
    const entities = [{ id: 'line-2', type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }];

    expect(createLineEntity({ x: 10, y: 10 }, { x: 30, y: 30 }, entities)?.id).toBe('line-3');
    expect(
      createRectEntity({ x: 20, y: 30 }, { x: 60, y: 90 }, [
        { id: 'rect-4', type: 'rect', x: 0, y: 0, width: 10, height: 10 },
      ])?.id,
    ).toBe('rect-5');
  });

  it('returns measurement rows for rectangles', () => {
    expect(getEntityMeasurementRows({ id: 'rect-1', type: 'rect', x: 10, y: 20, width: 30, height: 40 })).toEqual([
      ['Width', 30],
      ['Height', 40],
      ['Area', 1200],
      ['Rotation', 0],
    ]);
  });

  it('creates polyline and arc entities', () => {
    expect(
      createPolylineEntity(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        [],
        'default',
      )?.type,
    ).toBe('polyline');
    expect(createArcEntity({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 50 }, [], 'default')?.type).toBe('arc');
  });

  it('creates ellipse entities for isometric circles', () => {
    const ellipse = createEllipseEntity({ x: 0, y: 0 }, { x: 50, y: 0 }, [], 'default', { plane: 'top', radius: 50 });

    expect(ellipse.type).toBe('ellipse');
    expect(ellipse.meta.projectionMode).toBe('isometric');
  });

  it('creates text entities with default label sizing', () => {
    const text = createTextEntity({ x: 100, y: 200 }, []);

    expect(text).toMatchObject({
      type: 'text',
      x: 100,
      y: 200,
      text: 'Label',
      fontSize: 120,
      rotation: 0,
    });
    expect(getTextMetrics(text)).toMatchObject({
      text: 'Label',
      fontSize: 120,
    });
  });

  it('duplicates selected entities with fresh ids', () => {
    const entities = [
      { id: 'line-1', type: 'line', x1: 0, y1: 0, x2: 100, y2: 0, layerId: 'default', meta: {} },
      { id: 'rect-1', type: 'rect', x: 10, y: 20, width: 30, height: 40, rotation: 0, layerId: 'default', meta: {} },
    ];

    const result = duplicateEntitiesByIds(entities, ['line-1', 'rect-1']);

    expect(result.duplicatedIds).toEqual(['line-2', 'rect-2']);
    expect(result.entities).toHaveLength(4);
    expect(result.entities[2]).toMatchObject({ id: 'line-2', x1: 0, y1: 0, x2: 100, y2: 0 });
    expect(result.entities[3]).toMatchObject({ id: 'rect-2', x: 10, y: 20, width: 30, height: 40 });
  });

  it('duplicates circles, arcs, and features with fresh ids', () => {
    const entities = [
      { id: 'circle-1', type: 'circle', cx: 50, cy: 60, r: 24, layerId: 'default', meta: {} },
      {
        id: 'arc-1',
        type: 'arc',
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
        control: { x: 50, y: 40 },
        layerId: 'default',
        meta: {},
      },
      {
        id: 'feature-1',
        type: 'feature',
        shape: 'polygon',
        featureType: 'cutout',
        points: [
          { x: 10, y: 10 },
          { x: 40, y: 10 },
          { x: 40, y: 30 },
          { x: 10, y: 30 },
        ],
        layerId: 'default',
        meta: {},
      },
    ];

    const result = duplicateEntitiesByIds(entities, ['circle-1', 'arc-1', 'feature-1']);

    expect(result.duplicatedIds).toEqual(['circle-2', 'arc-2', 'feature-2']);
    expect(result.duplicatedEntities).toEqual([
      expect.objectContaining({ id: 'circle-2', type: 'circle', cx: 50, cy: 60, r: 24 }),
      expect.objectContaining({
        id: 'arc-2',
        type: 'arc',
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
        control: { x: 50, y: 40 },
      }),
      expect.objectContaining({
        id: 'feature-2',
        type: 'feature',
        shape: 'polygon',
        points: [
          { x: 10, y: 10 },
          { x: 40, y: 10 },
          { x: 40, y: 30 },
          { x: 10, y: 30 },
        ],
      }),
    ]);
  });

  it('duplicates mixed selections without dropping non-rect entity types', () => {
    const entities = [
      { id: 'rect-1', type: 'rect', x: 10, y: 20, width: 30, height: 40, rotation: 0, layerId: 'default', meta: {} },
      { id: 'circle-1', type: 'circle', cx: 80, cy: 50, r: 15, layerId: 'default', meta: {} },
      {
        id: 'arc-1',
        type: 'arc',
        start: { x: 100, y: 20 },
        end: { x: 150, y: 20 },
        control: { x: 125, y: 55 },
        layerId: 'default',
        meta: {},
      },
    ];

    const result = duplicateEntitiesByIds(entities, ['rect-1', 'circle-1', 'arc-1']);

    expect(result.duplicatedIds).toEqual(['rect-2', 'circle-2', 'arc-2']);
    expect(result.entities).toHaveLength(6);
  });

  it('duplicates a full grouped selection into a new independent group', () => {
    const entities = [
      {
        id: 'rect-1',
        type: 'rect',
        x: 10,
        y: 20,
        width: 30,
        height: 40,
        rotation: 0,
        layerId: 'default',
        meta: { groupId: 'group-a' },
      },
      { id: 'circle-1', type: 'circle', cx: 80, cy: 50, r: 15, layerId: 'default', meta: { groupId: 'group-a' } },
    ];

    const result = duplicateEntitiesByIds(entities, ['rect-1', 'circle-1']);
    const duplicatedGroupIds = result.duplicatedEntities.map((entity) => entity.meta.groupId);

    expect(result.duplicatedIds).toEqual(['rect-2', 'circle-2']);
    expect(duplicatedGroupIds[0]).toBeTruthy();
    expect(duplicatedGroupIds[0]).toBe(duplicatedGroupIds[1]);
    expect(duplicatedGroupIds[0]).not.toBe('group-a');
  });

  it('drops group membership when only part of a group is duplicated', () => {
    const entities = [
      {
        id: 'rect-1',
        type: 'rect',
        x: 10,
        y: 20,
        width: 30,
        height: 40,
        rotation: 0,
        layerId: 'default',
        meta: { groupId: 'group-a' },
      },
      { id: 'circle-1', type: 'circle', cx: 80, cy: 50, r: 15, layerId: 'default', meta: { groupId: 'group-a' } },
    ];

    const result = duplicateEntitiesByIds(entities, ['rect-1']);

    expect(result.duplicatedIds).toEqual(['rect-2']);
    expect(result.duplicatedEntities[0].meta.groupId).toBeUndefined();
  });

  it('applies broken-line style to selected entities only', () => {
    const entities = [
      { id: 'line-1', type: 'line', x1: 0, y1: 0, x2: 100, y2: 0, layerId: 'default', meta: {} },
      { id: 'circle-1', type: 'circle', cx: 50, cy: 50, r: 10, layerId: 'default', meta: {} },
    ];

    const result = applyLineStyleToEntities(entities, ['circle-1'], 'broken');

    expect(result[0].meta.lineStyle).toBeUndefined();
    expect(result[1].meta.lineStyle).toBe('broken');
  });

  it('toggles mixed selections to broken lines first, then back to solid', () => {
    const entities = [
      { id: 'line-1', type: 'line', x1: 0, y1: 0, x2: 100, y2: 0, layerId: 'default', meta: {} },
      {
        id: 'arc-1',
        type: 'arc',
        start: { x: 0, y: 0 },
        end: { x: 50, y: 0 },
        control: { x: 25, y: 20 },
        layerId: 'default',
        meta: { lineStyle: 'broken' },
      },
    ];

    const broken = toggleBrokenLineForEntities(entities, ['line-1', 'arc-1']);
    expect(broken[0].meta.lineStyle).toBe('broken');
    expect(broken[1].meta.lineStyle).toBe('broken');

    const solid = toggleBrokenLineForEntities(broken, ['line-1', 'arc-1']);
    expect(solid[0].meta.lineStyle).toBeUndefined();
    expect(solid[1].meta.lineStyle).toBeUndefined();
  });

  it('updates text content and metrics fields from the selection editor', () => {
    const text = {
      id: 'text-1',
      type: 'text',
      x: 10,
      y: 20,
      text: 'Label',
      fontSize: 120,
      rotation: 0,
      layerId: 'default',
      meta: {},
    };

    expect(updateEntityFromNumericField(text, 'text', 'Desk A')).toMatchObject({ text: 'Desk A' });
    expect(updateEntityFromNumericField(text, 'fontSize', '96')).toMatchObject({ fontSize: 96 });
    expect(getEntityMeasurementRows(text)).toEqual([
      ['Text', 'Label'],
      ['Font Size', 120],
      ['Arrow', 'No'],
      ['Rotation', 0],
      ['Position', '10.0, 20.0'],
    ]);
  });

  it('can enable and edit a text leader arrow from the selection editor', () => {
    const text = {
      id: 'text-1',
      type: 'text',
      x: 10,
      y: 20,
      text: 'Label',
      fontSize: 120,
      rotation: 0,
      layerId: 'default',
      meta: {},
    };

    const enabled = updateEntityFromNumericField(text, 'leaderEnabled', 'true');
    const moved = updateEntityFromNumericField(enabled, 'leaderTargetX', '240');

    expect(enabled.leader?.target).toMatchObject({
      x: expect.any(Number),
      y: expect.any(Number),
    });
    expect(moved.leader?.target.x).toBe(240);
  });

  it('scales the full text leader when font size is edited numerically', () => {
    const text = {
      id: 'text-1',
      type: 'text',
      x: 20,
      y: 30,
      text: 'Desk',
      fontSize: 100,
      rotation: 0,
      leader: { target: { x: -40, y: 120 } },
      layerId: 'default',
      meta: {},
    };

    const resized = updateEntityFromNumericField(text, 'fontSize', '150');

    expect(resized.fontSize).toBe(150);
    expect(resized.leader?.target).toEqual({ x: -70, y: 165 });
  });

  it('remaps dimension source refs when the referenced geometry is duplicated', () => {
    const line = { id: 'line-1', type: 'line', x1: 0, y1: 0, x2: 120, y2: 0, layerId: 'default', meta: {} };
    const dimension = createDimensionEntity({
      p1: { x: 0, y: 0 },
      p2: { x: 120, y: 0 },
      placementPoint: { x: 0, y: 30 },
      units: 'mm',
      entities: [line],
      sourceRefs: [
        { entityId: 'line-1', sourceType: 'endpoint', sourceKey: 'start' },
        { entityId: 'line-1', sourceType: 'endpoint', sourceKey: 'end' },
      ],
    });
    const entities = [line, dimension];

    const result = duplicateEntitiesByIds(entities, ['line-1', dimension.id]);
    const copiedDimension = result.duplicatedEntities.find((entity) => entity.type === 'dimension');

    expect(copiedDimension.id).toBe('dim-2');
    expect(copiedDimension.meta.sourceRefs).toEqual([
      { entityId: 'line-2', sourceType: 'endpoint', sourceKey: 'start' },
      { entityId: 'line-2', sourceType: 'endpoint', sourceKey: 'end' },
    ]);
  });

  it('skips source-bound dimensions when referenced geometry is not duplicated', () => {
    const line = { id: 'line-1', type: 'line', x1: 0, y1: 0, x2: 120, y2: 0, layerId: 'default', meta: {} };
    const dimension = createDimensionEntity({
      p1: { x: 0, y: 0 },
      p2: { x: 120, y: 0 },
      placementPoint: { x: 0, y: 30 },
      units: 'mm',
      entities: [line],
      sourceRefs: [
        { entityId: 'line-1', sourceType: 'endpoint', sourceKey: 'start' },
        { entityId: 'line-1', sourceType: 'endpoint', sourceKey: 'end' },
      ],
    });

    const result = duplicateEntitiesByIds([line, dimension], [dimension.id]);

    expect(result.duplicatedIds).toEqual([]);
    expect(result.skippedIds).toEqual([dimension.id]);
  });
});
