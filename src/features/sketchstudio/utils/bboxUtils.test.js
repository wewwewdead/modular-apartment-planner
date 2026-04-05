import { describe, expect, it } from 'vitest';
import { computeDocumentBoundingBox, computeEntityBoundingBox, computeFootprintFromEntities } from './bboxUtils';
import { deserializeDocument, serializeDocument, validateBasicDocumentShape } from './serializationUtils';

describe('bboxUtils and serializationUtils', () => {
  const document = {
    version: 1,
    id: 'doc-1',
    name: 'Test',
    units: 'mm',
    layers: [{ id: 'default', name: 'Default', visible: true, locked: false }],
    constraints: [],
    metadata: {},
    objectDefinition: {},
    entities: [
      { id: 'line-1', type: 'line', x1: 0, y1: 0, x2: 100, y2: 0 },
      { id: 'circle-1', type: 'circle', cx: 50, cy: 50, r: 10 },
    ],
  };

  it('computes entity and document bounding boxes', () => {
    expect(computeEntityBoundingBox(document.entities[1])).toMatchObject({
      minX: 40,
      minY: 40,
      maxX: 60,
      maxY: 60,
    });
    expect(computeDocumentBoundingBox(document)).toMatchObject({
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 60,
    });
  });

  it('computes ellipse bounds', () => {
    expect(computeEntityBoundingBox({ id: 'ellipse-1', type: 'ellipse', cx: 0, cy: 0, rx: 40, ry: 20, rotation: 30 })).toMatchObject({
      minX: expect.any(Number),
      minY: expect.any(Number),
      maxX: expect.any(Number),
      maxY: expect.any(Number),
    });
  });

  it('computes text bounds and excludes text from non-annotation document bounds and footprint', () => {
    const textEntity = { id: 'text-1', type: 'text', x: 200, y: 100, text: 'Desk A', fontSize: 120, rotation: 0 };
    const textDocument = {
      ...document,
      entities: [...document.entities, textEntity],
    };

    expect(computeEntityBoundingBox(textEntity)).toMatchObject({
      minX: 200,
      minY: 100,
      maxX: expect.any(Number),
      maxY: expect.any(Number),
    });
    expect(computeDocumentBoundingBox(textDocument)).toMatchObject({
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 60,
    });
    expect(computeFootprintFromEntities(textDocument.entities)).toMatchObject({
      width: 100,
      height: 60,
    });
  });

  it('includes text leader arrows in text bounding boxes', () => {
    const textEntity = {
      id: 'text-1',
      type: 'text',
      x: 200,
      y: 100,
      text: 'Desk A',
      fontSize: 120,
      rotation: 0,
      leader: { target: { x: 120, y: 220 } },
    };

    expect(computeEntityBoundingBox(textEntity)).toMatchObject({
      minX: 120,
      maxX: expect.any(Number),
      maxY: 244,
    });
  });

  it('computes a footprint polygon', () => {
    expect(computeFootprintFromEntities(document.entities)).toMatchObject({
      width: 100,
      height: 60,
    });
  });

  it('serializes and deserializes the document shape', () => {
    const serialized = serializeDocument(document);
    expect(validateBasicDocumentShape(document)).toBe(true);
    expect(deserializeDocument(serialized).id).toBe('doc-1');
  });
});
