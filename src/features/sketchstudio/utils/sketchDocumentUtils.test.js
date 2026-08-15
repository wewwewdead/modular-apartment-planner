import { describe, expect, it } from 'vitest';
import {
  SKETCH_DOCUMENT_SCHEMA_VERSION,
  normalizeCommittedSketchName,
  normalizeSketchDocument,
} from './sketchDocumentUtils';

describe('sketchDocumentUtils', () => {
  it('preserves non-empty names after trimming', () => {
    expect(normalizeCommittedSketchName('  Kitchen Island  ')).toBe('Kitchen Island');
  });

  it('falls back to Untitled Sketch for empty names', () => {
    expect(normalizeCommittedSketchName('')).toBe('Untitled Sketch');
    expect(normalizeCommittedSketchName('   ')).toBe('Untitled Sketch');
  });
});

/**
 * A sketch saved by the constraint-era build must still open. The constraints
 * and the driving fields are dropped on load; everything the user actually drew
 * survives untouched.
 */
describe('normalizeSketchDocument on a constraint-era (v2) document', () => {
  const legacyDocument = {
    version: 2,
    id: 'doc-legacy',
    name: 'Legacy Desk',
    units: 'mm',
    metadata: { authoringApp: 'SketchStudio' },
    objectDefinition: {},
    layers: [{ id: 'default', name: 'Default', visible: true, locked: false }],
    variables: [{ id: 'var-width', name: 'width', value: 1200, unit: 'mm' }],
    constraints: [
      {
        id: 'constraint-1',
        type: 'equal_width',
        driverEntityId: 'rect-1',
        drivenEntityId: 'rect-2',
        label: 'Match shelf widths',
        enabled: true,
      },
      {
        id: 'constraint-2',
        type: 'parallel',
        segmentARef: { entityId: 'line-1', sourceType: 'segment', sourceKey: 'segment' },
        segmentBRef: { entityId: 'line-2', sourceType: 'segment', sourceKey: 'segment' },
      },
    ],
    joints: [],
    entities: [
      {
        id: 'rect-1',
        type: 'rect',
        x: 0,
        y: 0,
        width: 600,
        height: 300,
        rotation: 0,
        layerId: 'default',
        visible: true,
        meta: {},
        parametricExpressions: { width: '=width / 2' },
      },
      {
        id: 'rect-2',
        type: 'rect',
        x: 0,
        y: 400,
        width: 400,
        height: 300,
        rotation: 0,
        layerId: 'default',
        visible: true,
        meta: {},
      },
      {
        id: 'dim-1',
        type: 'dimension',
        subtype: 'horizontal',
        p1: { x: 0, y: 0 },
        p2: { x: 600, y: 0 },
        offset: 40,
        text: '600 mm',
        units: 'mm',
        layerId: 'dimensions',
        visible: true,
        driving: true,
        drivingValue: '=width',
        meta: { sourceRefs: [{ entityId: 'rect-1', sourceType: 'corner', sourceKey: 'tl' }, null] },
      },
      {
        id: 'ang-1',
        type: 'angle-dimension',
        vertex: { x: 0, y: 0 },
        p1: { x: 100, y: 0 },
        p2: { x: 0, y: 100 },
        arcRadius: 50,
        layerId: 'dimensions',
        visible: true,
        driving: false,
        drivingValue: 90,
        meta: {},
      },
    ],
  };

  it('opens cleanly and reports the current schema version', () => {
    const normalized = normalizeSketchDocument(legacyDocument);

    expect(normalized.version).toBe(SKETCH_DOCUMENT_SCHEMA_VERSION);
    expect(normalized.name).toBe('Legacy Desk');
  });

  it('drops the stored constraints array entirely', () => {
    const normalized = normalizeSketchDocument(legacyDocument);

    expect(normalized.constraints).toBeUndefined();
    expect(Object.hasOwn(normalized, 'constraints')).toBe(false);
  });

  it('strips driving fields from dimension entities', () => {
    const normalized = normalizeSketchDocument(legacyDocument);
    const dimension = normalized.entities.find((entity) => entity.id === 'dim-1');
    const angle = normalized.entities.find((entity) => entity.id === 'ang-1');

    expect(Object.hasOwn(dimension, 'driving')).toBe(false);
    expect(Object.hasOwn(dimension, 'drivingValue')).toBe(false);
    expect(Object.hasOwn(angle, 'driving')).toBe(false);
    expect(Object.hasOwn(angle, 'drivingValue')).toBe(false);
  });

  it('leaves geometry, variables, layers and dimension source-ref slots intact', () => {
    const normalized = normalizeSketchDocument(legacyDocument);
    const rect = normalized.entities.find((entity) => entity.id === 'rect-1');
    const dimension = normalized.entities.find((entity) => entity.id === 'dim-1');

    expect(normalized.entities).toHaveLength(4);
    expect(rect).toMatchObject({ x: 0, y: 0, width: 600, height: 300 });
    expect(rect.parametricExpressions).toEqual({ width: '=width / 2' });
    expect(normalized.variables).toEqual([{ id: 'var-width', name: 'width', value: 1200, unit: 'mm' }]);
    expect(normalized.layers).toHaveLength(1);
    // Positional slots: never compacted, so a null second slot stays a null
    // second slot.
    expect(dimension.meta.sourceRefs).toEqual([{ entityId: 'rect-1', sourceType: 'corner', sourceKey: 'tl' }, null]);
    expect(dimension.p1).toEqual({ x: 0, y: 0 });
    expect(dimension.p2).toEqual({ x: 600, y: 0 });
  });

  it('returns dimensions that never carried driving fields by identity', () => {
    const plainDimension = {
      id: 'dim-plain',
      type: 'dimension',
      subtype: 'aligned',
      p1: { x: 0, y: 0 },
      p2: { x: 10, y: 10 },
      offset: 5,
      units: 'mm',
      layerId: 'dimensions',
      visible: true,
      meta: {},
    };
    const normalized = normalizeSketchDocument({ ...legacyDocument, entities: [plainDimension] });

    expect(normalized.entities[0]).toBe(plainDimension);
  });
});
