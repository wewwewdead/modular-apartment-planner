import { describe, expect, it } from 'vitest';
import { computeIsometricAngle } from '../utils/angleUtils';
import {
  buildAngleDimensionEntityFromDraft,
  constrainAnglePoint,
  getDraftPreviewEntity,
  getSourceRefEntities,
  resolveAngleIsometricPlane,
  TOOL_DEFINITIONS,
  TOOL_SHORTCUT_MAP,
} from './sketchConstants';

const ISO_AXES = {
  right: { x: Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6) },
  left: { x: -Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6) },
  vertical: { x: 0, y: 1 },
};
const ORIGIN = { x: 0, y: 0 };

function pointAlongAxis(family, distance, tiltDeg = 0) {
  const axis = ISO_AXES[family];
  const radians = (tiltDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: (axis.x * cos - axis.y * sin) * distance,
    y: (axis.x * sin + axis.y * cos) * distance,
  };
}

function directionFromOrigin(point) {
  const length = Math.hypot(point.x, point.y) || 1;
  return { x: point.x / length, y: point.y / length };
}

function screenAngleDeg(point) {
  return (Math.atan2(point.y, point.x) * 180) / Math.PI;
}

describe('sketchConstants', () => {
  it('builds a leader-label preview for text drafts', () => {
    const draftPreview = getDraftPreviewEntity(
      {
        type: 'text',
        points: [{ x: 40, y: 80 }],
        currentPoint: { x: 160, y: 120 },
      },
      {
        units: 'mm',
      },
      null,
      {
        viewMode: 'plan',
      },
    );

    expect(draftPreview).toEqual({
      type: 'text-leader',
      x: 160,
      y: 120,
      text: 'Label',
      fontSize: 120,
      rotation: 0,
      target: { x: 40, y: 80 },
    });
  });

  it('describes the text tool as leader-label placement', () => {
    expect(TOOL_DEFINITIONS.find((tool) => tool.id === 'text')).toMatchObject({
      description: 'Place leader labels with a target point and offset',
    });
  });

  it('declares the fastener tool without colliding with another shortcut', () => {
    expect(TOOL_DEFINITIONS.find((tool) => tool.id === 'fastener')).toMatchObject({
      label: 'Fastener',
      shortLabel: 'FAS',
      shortcut: 'K',
      description: 'Place screws, bolts, and other catalog hardware',
    });

    // Every tool keeps its own key, so the derived shortcut map (and the overlay
    // built from it) can never silently drop a tool.
    const shortcuts = TOOL_DEFINITIONS.map((tool) => tool.shortcut.toLowerCase());
    expect(new Set(shortcuts).size).toBe(TOOL_DEFINITIONS.length);
    expect(TOOL_SHORTCUT_MAP.size).toBe(TOOL_DEFINITIONS.length);
    expect(TOOL_SHORTCUT_MAP.get('k')).toBe('fastener');
  });

  it('previews the active fastener as a pilot circle with its head outline', () => {
    const draftPreview = getDraftPreviewEntity(
      {
        type: 'fastener',
        step: 'place',
        startPoint: { x: 200, y: 140 },
        currentPoint: { x: 200, y: 140 },
        points: [{ x: 200, y: 140 }],
      },
      { units: 'mm' },
      null,
      { viewMode: 'plan', activeHardwareId: 'hw-screw-8-32' },
    );

    expect(draftPreview).toEqual({
      type: 'fastener-preview',
      cx: 200,
      cy: 140,
      diameter: 3,
      headDiameter: 8,
      hardwareId: 'hw-screw-8-32',
    });
  });

  it('falls back to the default fastener when the ui carries no active hardware', () => {
    const draftPreview = getDraftPreviewEntity(
      { type: 'fastener', step: 'place', currentPoint: { x: 10, y: 20 }, points: [] },
      { units: 'mm' },
      null,
      { viewMode: 'plan' },
    );

    expect(draftPreview).toMatchObject({ hardwareId: 'hw-screw-8-32', diameter: 3 });
  });

  it.each([
    { plane: 'top', anchor: 'right', target: 'left' },
    { plane: 'left', anchor: 'vertical', target: 'left' },
    { plane: 'right', anchor: 'vertical', target: 'right' },
  ])('lands a typed 90° on the $plane plane other axis', ({ plane, anchor, target }) => {
    const p1 = pointAlongAxis(anchor, 1000);
    const cursor = pointAlongAxis(target, 800, 8);
    const inferredPlane = resolveAngleIsometricPlane(ORIGIN, p1, cursor, 'isometric', 'top');
    const p2 = constrainAnglePoint(ORIGIN, p1, cursor, 90, inferredPlane);
    const direction = directionFromOrigin(p2);

    expect(inferredPlane).toBe(plane);
    expect(direction.x).toBeCloseTo(ISO_AXES[target].x, 6);
    expect(direction.y).toBeCloseTo(ISO_AXES[target].y, 6);
    expect(computeIsometricAngle(p1, p2, inferredPlane)).toBeCloseTo(90, 6);
  });

  it('dimensions a vertical iso edge without drawing a screen-space L', () => {
    const p1 = { x: 0, y: 1000 };
    const cursor = { x: 500, y: 0 };
    const inferredPlane = resolveAngleIsometricPlane(ORIGIN, p1, cursor, 'isometric', 'top');
    const p2 = constrainAnglePoint(ORIGIN, p1, cursor, 90, inferredPlane);

    expect(inferredPlane).toBe('right');
    expect(Math.abs(screenAngleDeg(p2) - screenAngleDeg(p1))).toBeCloseTo(60, 6);
    expect(computeIsometricAngle(p1, p2, inferredPlane)).toBeCloseTo(90, 6);

    // The ui plane selector sits at 'top' by default, which is exactly the
    // basis that used to project the 90° into a literal screen-space corner.
    const uiPlanePoint = constrainAnglePoint(ORIGIN, p1, cursor, 90, 'top');
    expect(Math.abs(screenAngleDeg(uiPlanePoint) - screenAngleDeg(p1))).toBeCloseTo(90, 6);
  });

  it('stamps the inferred plane on the angle preview instead of the ui plane', () => {
    const draft = {
      type: 'angle',
      step: 'pickSecond',
      points: [
        { x: 0, y: 1000 },
        { x: 0, y: 0 },
      ],
      currentPoint: { x: 500, y: 0 },
      precisionInput: { angle: '90' },
    };
    const draftPreview = getDraftPreviewEntity(draft, { units: 'mm' }, null, {
      viewMode: 'isometric',
      isometricPlane: 'top',
    });

    expect(draftPreview.isometricPlane).toBe('right');
    expect(computeIsometricAngle(draft.points[0], draftPreview.p2, draftPreview.isometricPlane)).toBeCloseTo(90, 6);
    expect(getDraftPreviewEntity(draft, { units: 'mm' }, null, { viewMode: 'plan' }).isometricPlane).toBeNull();
  });
});

describe('angle plane provenance', () => {
  // The 45° in-face diagonal of a right-plane face and a top-plane face are the
  // same screen direction, so only the line's own stamped plane can tell them
  // apart. The toolbar selector is deliberately set to the wrong face here.
  const legLine = {
    id: 'line-1',
    type: 'line',
    x1: 449,
    y1: 409,
    x2: 199,
    y2: 299,
    meta: { isometricPlane: 'right' },
  };
  const unstampedLine = { id: 'line-2', type: 'line', x1: 0, y1: 0, x2: 100, y2: 100, meta: {} };
  const vertex = { x: 449, y: 409 };
  const p1 = { x: 199, y: 299 };
  const p2 = { x: 520, y: 560 };

  it('prefers the source entity plane over the toolbar selector', () => {
    const sources = getSourceRefEntities([{ entityId: 'line-1' }, { entityId: 'line-1' }], [legLine]);

    expect(resolveAngleIsometricPlane(vertex, p1, p2, 'isometric', 'top', sources)).toBe('right');
  });

  it('uses a lone stamped source when the other slot is empty', () => {
    const sources = getSourceRefEntities([null, { entityId: 'line-1' }, null], [legLine]);

    expect(resolveAngleIsometricPlane(vertex, p1, p2, 'isometric', 'top', sources)).toBe('right');
  });

  it('ignores source planes that disagree and falls back to ray inference', () => {
    const conflicting = [legLine, { ...unstampedLine, meta: { isometricPlane: 'left' } }];

    expect(
      resolveAngleIsometricPlane({ x: 0, y: 0 }, { x: 0, y: 1000 }, { x: 500, y: 0 }, 'isometric', 'top', conflicting),
    ).toBe('right');
  });

  it('falls back to ray inference when no source carries a plane', () => {
    const sources = getSourceRefEntities([{ entityId: 'line-2' }, null], [unstampedLine]);

    expect(
      resolveAngleIsometricPlane({ x: 0, y: 0 }, { x: 0, y: 1000 }, { x: 500, y: 0 }, 'isometric', 'top', sources),
    ).toBe('right');
  });

  it('still falls back to the toolbar selector when nothing else resolves', () => {
    expect(
      resolveAngleIsometricPlane({ x: 0, y: 0 }, { x: 1, y: 0.02 }, { x: 0.9, y: 0.05 }, 'isometric', 'left', []),
    ).toBe('left');
  });

  it('stays null outside isometric mode even with stamped sources', () => {
    expect(resolveAngleIsometricPlane(vertex, p1, p2, 'plan', 'top', [legLine])).toBeNull();
  });

  it('maps only ref-bearing slots to entities', () => {
    expect(getSourceRefEntities([null, { entityId: 'line-1' }, { entityId: 'missing' }], [legLine])).toEqual([
      null,
      legLine,
      null,
    ]);
    expect(getSourceRefEntities(undefined, [legLine])).toEqual([]);
  });

  it('commits an angle draft on the source plane with slots preserved', () => {
    const vertexRef = { entityId: 'line-1', sourceType: 'endpoint', sourceKey: 'start' };
    const entity = buildAngleDimensionEntityFromDraft({
      draft: { type: 'angle', step: 'pickSecond', points: [p1, vertex], precisionInput: {} },
      referencePoint: p2,
      document: { entities: [legLine], layers: [{ id: 'dimensions' }] },
      targetLayerId: 'default',
      sourceRefs: [null, vertexRef, null],
      viewMode: 'isometric',
      isometricPlane: 'top',
    });

    expect(entity.isometricPlane).toBe('right');
    expect(entity.meta.sourceRefs).toEqual([null, vertexRef, null]);
  });
});
