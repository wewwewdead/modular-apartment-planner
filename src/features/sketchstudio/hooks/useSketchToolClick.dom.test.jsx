/* @vitest-environment jsdom */
/**
 * The angle tool stores three source-ref slots — [p1, vertex, p2] — and reads
 * them back by position. Dropping an unsnapped pick instead of holding its slot
 * slides the next ref onto the wrong point, which is how a 116° corner rendered
 * a zero-length ray labelled "90°".
 */

import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { resolveAngleDimensionPoints } from '../utils/entityUtils';
import { getAngleDimensionGeometry } from '../utils/angleUtils';
import useSketchToolClick from './useSketchToolClick';

const LEG_LINE = {
  id: 'line-1',
  type: 'line',
  x1: 199,
  y1: 299,
  x2: 449,
  y2: 409,
  layerId: 'default',
  visible: true,
  meta: { isometricPlane: 'right' },
};

const P1 = { x: 199, y: 299 };
const VERTEX = { x: 449, y: 409 };
const P2 = { x: 520, y: 560 };
const VERTEX_SNAP = {
  point: VERTEX,
  sourceEntityId: 'line-1',
  sourceType: 'endpoint',
  sourceKey: 'end',
};

function buildState(draft, ui = {}) {
  return {
    document: {
      entities: [LEG_LINE],
      layers: [
        { id: 'default', visible: true, locked: false },
        { id: 'dimensions', visible: true, locked: false },
      ],
      units: 'mm',
      groupIndex: {},
    },
    draft: { precisionInput: {}, ...draft },
    selection: { selectedIds: [] },
    interaction: { suppressNextClick: false },
    viewport: { zoom: 1, panX: 0, panY: 0 },
    ui: { activeLayerId: 'default', activeHardwareId: null, viewMode: 'isometric', isometricPlane: 'top', ...ui },
  };
}

function clickAngleTool(draft, { worldPoint, snap = {} }, ui) {
  const state = buildState(draft, ui);
  const dispatch = vi.fn();
  const viewportHook = {
    readCanvasPoint: () => ({ x: 0, y: 0 }),
    getOrthoReferencePoint: () => null,
    resolvePointerState: () => ({ worldPoint, snap, hoveredEntity: null }),
  };
  const options = {
    activeTool: 'angle',
    // Empty so the line-to-line shortcut never fires: this is the manual
    // three-click path the repro used.
    editableEntities: [],
    draftPreview: null,
    commitPrecisionDraft: vi.fn(),
    getConstrainedDraftPoint: (_tool, _draft, point) => point,
  };

  const { result } = renderHook(() => useSketchToolClick(state, dispatch, viewportHook, options));
  result.current.handleCanvasClick({ button: 0, shiftKey: false });

  return dispatch.mock.calls.at(-1)?.[0];
}

describe('useSketchToolClick angle source-ref slots', () => {
  it('holds slot 0 open when the first pick lands in empty space', () => {
    const action = clickAngleTool({}, { worldPoint: P1 });

    expect(action.payload.step).toBe('pickVertex');
    expect(action.payload.sourceRefs).toEqual([null]);
  });

  it('appends the snapped vertex into slot 1 instead of sliding it to slot 0', () => {
    const action = clickAngleTool(
      { type: 'angle', step: 'pickVertex', points: [P1], sourceRefs: [null] },
      { worldPoint: VERTEX, snap: VERTEX_SNAP },
    );

    expect(action.payload.sourceRefs).toEqual([null, { entityId: 'line-1', sourceType: 'endpoint', sourceKey: 'end' }]);
  });

  it('commits the repro with the vertex ref in its own slot', () => {
    const action = clickAngleTool(
      {
        type: 'angle',
        step: 'pickSecond',
        points: [P1, VERTEX],
        sourceRefs: [null, { entityId: 'line-1', sourceType: 'endpoint', sourceKey: 'end' }],
      },
      { worldPoint: P2 },
    );
    const entity = action.payload;

    expect(entity.type).toBe('angle-dimension');
    expect(entity.meta.sourceRefs).toEqual([
      null,
      { entityId: 'line-1', sourceType: 'endpoint', sourceKey: 'end' },
      null,
    ]);
  });

  it('renders the committed repro as the angle the user actually drew', () => {
    const entity = clickAngleTool(
      {
        type: 'angle',
        step: 'pickSecond',
        points: [P1, VERTEX],
        sourceRefs: [null, { entityId: 'line-1', sourceType: 'endpoint', sourceKey: 'end' }],
      },
      { worldPoint: P2 },
    ).payload;

    const resolved = resolveAngleDimensionPoints(entity, [LEG_LINE]);
    const geometry = getAngleDimensionGeometry({
      ...resolved,
      arcRadius: entity.arcRadius,
      isometricPlane: entity.isometricPlane,
    });

    expect(resolved.p1).toEqual(P1);
    expect(resolved.vertex).toEqual(VERTEX);
    // Before the fix p1 resolved onto the vertex, ray1 collapsed to a horizontal
    // artifact, and the label read a flat 90°.
    expect(geometry.ray1.x2).not.toBeCloseTo(VERTEX.x, 3);
    expect(geometry.angleDeg).not.toBeNull();
    expect(geometry.angleDeg).not.toBeCloseTo(90, 0);
    expect(geometry.angleDeg).toBeCloseTo(119.9, 1);
  });

  it('takes the isometric plane from the line the vertex is attached to', () => {
    const entity = clickAngleTool(
      {
        type: 'angle',
        step: 'pickSecond',
        points: [P1, VERTEX],
        sourceRefs: [null, { entityId: 'line-1', sourceType: 'endpoint', sourceKey: 'end' }],
      },
      { worldPoint: P2 },
      { isometricPlane: 'top' },
    ).payload;

    expect(entity.isometricPlane).toBe('right');
  });
});

describe('useSketchToolClick isometric provenance', () => {
  function commitLine(ui) {
    const state = buildState({ type: 'line', startPoint: P1, currentPoint: P2, points: [P1] }, ui);
    const dispatch = vi.fn();
    const viewportHook = {
      readCanvasPoint: () => ({ x: 0, y: 0 }),
      getOrthoReferencePoint: () => null,
      resolvePointerState: () => ({ worldPoint: P2, snap: {}, hoveredEntity: null }),
    };
    const options = {
      activeTool: 'line',
      editableEntities: [],
      draftPreview: null,
      commitPrecisionDraft: vi.fn(),
      getConstrainedDraftPoint: (_tool, _draft, point) => point,
    };

    const { result } = renderHook(() => useSketchToolClick(state, dispatch, viewportHook, options));
    result.current.handleCanvasClick({ button: 0, shiftKey: false });

    return dispatch.mock.calls.at(-1)[0].payload;
  }

  it('stamps the drawing plane on a line drawn in isometric mode', () => {
    expect(commitLine({ viewMode: 'isometric', isometricPlane: 'right' }).meta.isometricPlane).toBe('right');
  });

  it('leaves a plan-mode line unstamped', () => {
    expect(commitLine({ viewMode: 'plan', isometricPlane: 'right' }).meta.isometricPlane).toBeUndefined();
  });

  it('does not mark iso lines as isometric projections', () => {
    // projectionMode drives filterNonIsometricEntities, which would quietly drop
    // these lines from the profile-source count.
    expect(commitLine({ viewMode: 'isometric', isometricPlane: 'right' }).meta.projectionMode).toBeUndefined();
  });
});
