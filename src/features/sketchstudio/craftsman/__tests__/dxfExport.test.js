import { describe, expect, it } from 'vitest';
import { exportEntitiesToDxf } from '../export/dxfExport';
import { createSketchJoint, resolveSketchJoinery } from '../../utils/sketchJoineryUtils';

function splitDxfLines(dxf) {
  return dxf.trimEnd().split(/\r?\n/);
}

function findEntityPairs(lines, type) {
  const entityStart = lines.findIndex((line, index) => line === '0' && lines[index + 1] === type);
  if (entityStart < 0) {
    return null;
  }

  const pairs = new Map();
  for (let index = entityStart + 2; index < lines.length; index += 2) {
    if (lines[index] === '0') {
      break;
    }

    pairs.set(lines[index], lines[index + 1]);
  }

  return pairs;
}

describe('DXF export', () => {
  it('produces a well-formed DXF document with ordered sections', () => {
    const dxf = exportEntitiesToDxf([{ id: 'r1', type: 'rect', x: 0, y: 0, width: 600, height: 400 }]);
    const lines = splitDxfLines(dxf);

    expect(lines.length % 2).toBe(0);
    expect(lines.slice(-2)).toEqual(['0', 'EOF']);

    const headerIndex = lines.findIndex((line, index) => line === '2' && lines[index + 1] === 'HEADER');
    const tablesIndex = lines.findIndex((line, index) => line === '2' && lines[index + 1] === 'TABLES');
    const entitiesIndex = lines.findIndex((line, index) => line === '2' && lines[index + 1] === 'ENTITIES');

    expect(headerIndex).toBeGreaterThan(-1);
    expect(tablesIndex).toBeGreaterThan(headerIndex);
    expect(entitiesIndex).toBeGreaterThan(tablesIndex);
    expect(dxf.endsWith('\n')).toBe(true);
  });

  it('exports quadratic arc entities as DXF ARC geometry derived from the actual curve', () => {
    const dxf = exportEntitiesToDxf([{
      id: 'a1',
      type: 'arc',
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
      control: { x: 50, y: 50 },
    }]);
    const lines = splitDxfLines(dxf);
    const arc = findEntityPairs(lines, 'ARC');

    expect(arc).not.toBeNull();
    expect(Number(arc.get('40'))).toBeCloseTo(62.5, 5);
    expect(Number(arc.get('10'))).toBeCloseTo(50, 5);
    expect(Number(arc.get('20'))).toBeCloseTo(37.5, 5);
  });

  it('applies kerf compensation to rectangles', () => {
    const entities = [{ id: 'r1', type: 'rect', x: 100, y: 100, width: 200, height: 100 }];

    const withoutKerf = exportEntitiesToDxf(entities);
    const withKerf = exportEntitiesToDxf(entities, { kerf: 0.4 });

    expect(withKerf).not.toEqual(withoutKerf);
    expect(withKerf).toContain('LWPOLYLINE');
  });

  it('expands a closed polyline outward when kerf is applied (winding: joinery profile convention)', () => {
    // Regression: joinery profiles walk topLeft -> topRight -> bottomRight -> bottomLeft
    // which is CW-in-screen-coords. The kerf normal formula must produce OUTWARD
    // normals for this winding so that CNC parts come out the right size, not
    // undersized by the kerf amount.
    // Square centered at (50, 50), 100mm per side.
    const entity = {
      id: 'poly1',
      type: 'polyline',
      closed: true,
      points: [
        { x: 0, y: 0 },     // topLeft
        { x: 100, y: 0 },   // topRight
        { x: 100, y: 100 }, // bottomRight
        { x: 0, y: 100 },   // bottomLeft
      ],
    };
    const kerf = 1.0; // 1mm kerf, halfKerf = 0.5
    const withKerf = exportEntitiesToDxf([entity], { kerf });

    // LWPOLYLINE vertices in DXF appear as pairs: group 10 = x, group 20 = y.
    // Parse every (10, 20) pair from the output.
    const lines = withKerf.split('\n').map((l) => l.trim());
    const vertices = [];
    for (let i = 0; i < lines.length - 3; i += 1) {
      if (lines[i] === '10' && lines[i + 2] === '20') {
        vertices.push({ x: Number(lines[i + 1]), y: Number(lines[i + 3]) });
      }
    }
    // Only include the 4 polyline vertices (filter out other DXF x/y pairs).
    const polylineVerts = vertices.filter((v) =>
      Math.abs(v.x - 0) < 10 || Math.abs(v.x - 100) < 10,
    ).slice(0, 4);

    expect(polylineVerts).toHaveLength(4);

    // Computed bounds (min x/y vs max x/y) across the expanded polyline.
    const minX = Math.min(...polylineVerts.map((v) => v.x));
    const maxX = Math.max(...polylineVerts.map((v) => v.x));
    // DXF Y is negated (screen-down -> DXF-up), but relative bounds are what matters.
    const ys = polylineVerts.map((v) => v.y);
    const rangeY = Math.max(...ys) - Math.min(...ys);
    const rangeX = maxX - minX;

    // After applying kerf to a 100x100 square, the outer bounds MUST be
    // larger than 100 (expansion, not contraction). Prior to the winding fix
    // the signed-area-aware normal flip, bounds shrank to ~99x99, producing
    // undersized CNC parts. Algorithm approximates true polygon offset by
    // displacing each vertex by halfKerf along the bisector diagonal, so 90-deg
    // corners see ~halfKerf * sqrt(2) total range expansion rather than
    // kerf (proper polygon-edge offset would require intersecting offset lines).
    expect(rangeX).toBeGreaterThan(100);
    expect(rangeY).toBeGreaterThan(100);
    // The vertex-bisector approximation for a right-angle corner produces
    // roughly halfKerf * cos(45) = 0.354 per axis end -> 0.707 total.
    expect(rangeX).toBeCloseTo(100 + Math.SQRT1_2 * kerf, 1);
    expect(rangeY).toBeCloseTo(100 + Math.SQRT1_2 * kerf, 1);
  });

  it('filters to the selected entities when requested', () => {
    const dxf = exportEntitiesToDxf([
      { id: 'r1', type: 'rect', x: 0, y: 0, width: 100, height: 100 },
      { id: 'r2', type: 'rect', x: 200, y: 0, width: 100, height: 100 },
    ], {
      selectedOnly: true,
      selectedIds: ['r1'],
    });

    expect((dxf.match(/LWPOLYLINE/g) || []).length).toBe(1);
  });

  it('includes generated joinery profiles for selected parts and omits hidden base outlines', () => {
    const baseEntities = [
      { id: 'panel', type: 'rect', x: 0, y: 0, width: 200, height: 120, rotation: 0, thickness: 18, layerId: 'default', meta: {} },
      { id: 'back', type: 'rect', x: 50, y: -18, width: 100, height: 18, rotation: 0, thickness: 6, layerId: 'default', meta: {} },
    ];
    const joint = createSketchJoint({
      id: 'joint-rabbet',
      type: 'rabbet',
      sourcePartId: 'back',
      targetPartId: 'panel',
      sourceEdgeRef: { entityId: 'back', sourceType: 'segment', sourceKey: 'bottom' },
      targetEdgeRef: { entityId: 'panel', sourceType: 'segment', sourceKey: 'top' },
      parameters: {
        width: 100,
        depth: 9,
      },
    });
    const resolution = resolveSketchJoinery(baseEntities, [joint]);

    const dxf = exportEntitiesToDxf(resolution.exportEntities, {
      selectedOnly: true,
      selectedIds: ['panel'],
      referenceEntities: baseEntities,
    });

    expect((dxf.match(/LWPOLYLINE/g) || []).length).toBe(1);
  });

  it('preserves circle and line export support', () => {
    const dxf = exportEntitiesToDxf([
      { id: 'c1', type: 'circle', cx: 50, cy: 50, radius: 25 },
      { id: 'l1', type: 'line', x1: 0, y1: 0, x2: 100, y2: 200 },
    ]);

    expect(dxf).toContain('CIRCLE');
    expect(dxf).toContain('LINE');
  });

  it('exports text leader arrows alongside text labels', () => {
    const dxf = exportEntitiesToDxf([
      {
        id: 't1',
        type: 'text',
        x: 100,
        y: 20,
        text: 'Label',
        fontSize: 12,
        leader: { target: { x: 40, y: 80 } },
      },
    ]);

    expect((dxf.match(/LINE/g) || []).length).toBeGreaterThanOrEqual(1);
    expect((dxf.match(/LWPOLYLINE/g) || []).length).toBeGreaterThanOrEqual(1);
    expect(dxf).toContain('TEXT');
  });
});
