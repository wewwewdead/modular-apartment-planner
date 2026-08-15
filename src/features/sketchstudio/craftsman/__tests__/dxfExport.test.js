import { describe, expect, it } from 'vitest';
import { exportEntitiesToDxf } from '../export/dxfExport';
import { DEFAULT_BIT_DIAMETER, DOGBONE_STYLES } from '../export/dogboneUtils';
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
    const dxf = exportEntitiesToDxf([
      {
        id: 'a1',
        type: 'arc',
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
        control: { x: 50, y: 50 },
      },
    ]);
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

  it('expands a closed polyline by true polygon offset when kerf is applied', () => {
    // Joinery profiles walk topLeft -> topRight -> bottomRight -> bottomLeft
    // (CW-in-screen-coords). Kerf compensation must move every EDGE outward by
    // halfKerf via true parallel-edge offsetting, so a 90-deg-cornered part
    // comes out the exact right size. The old bisector displacement only
    // expanded the range by halfKerf*sqrt(2) (~0.707 for kerf=1) instead of the
    // correct kerf (1.0), undersizing parts by ~30% at right angles.
    // Square, 100mm per side, top-left at origin (screen coords).
    const entity = {
      id: 'poly1',
      type: 'polyline',
      closed: true,
      points: [
        { x: 0, y: 0 }, // topLeft
        { x: 100, y: 0 }, // topRight
        { x: 100, y: 100 }, // bottomRight
        { x: 0, y: 100 }, // bottomLeft
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
    const polylineVerts = vertices.slice(0, 4);
    expect(polylineVerts).toHaveLength(4);

    const xs = polylineVerts.map((v) => v.x);
    const ys = polylineVerts.map((v) => v.y);
    const rangeX = Math.max(...xs) - Math.min(...xs);
    const rangeY = Math.max(...ys) - Math.min(...ys);

    // The expanded square must be exactly kerf larger on each axis (halfKerf
    // per side). Under the old bisector code these were 100 + sqrt(2)/2 ~= 100.707,
    // so this assertion would have FAILED. DXF negates Y, but relative range
    // is unaffected.
    expect(rangeX).toBeCloseTo(100 + kerf, 6);
    expect(rangeY).toBeCloseTo(100 + kerf, 6);

    // Exact corner coordinates: outer square from (-0.5,-0.5) to (100.5,100.5).
    // In DXF, y is negated so the outer bounds run from -100.5 to 0.5.
    expect(Math.min(...xs)).toBeCloseTo(-0.5, 6);
    expect(Math.max(...xs)).toBeCloseTo(100.5, 6);
    expect(Math.min(...ys)).toBeCloseTo(-100.5, 6);
    expect(Math.max(...ys)).toBeCloseTo(0.5, 6);
  });

  it('filters to the selected entities when requested', () => {
    const dxf = exportEntitiesToDxf(
      [
        { id: 'r1', type: 'rect', x: 0, y: 0, width: 100, height: 100 },
        { id: 'r2', type: 'rect', x: 200, y: 0, width: 100, height: 100 },
      ],
      {
        selectedOnly: true,
        selectedIds: ['r1'],
      },
    );

    expect((dxf.match(/LWPOLYLINE/g) || []).length).toBe(1);
  });

  it('includes generated joinery profiles for selected parts and omits hidden base outlines', () => {
    const baseEntities = [
      {
        id: 'panel',
        type: 'rect',
        x: 0,
        y: 0,
        width: 200,
        height: 120,
        rotation: 0,
        thickness: 18,
        layerId: 'default',
        meta: {},
      },
      {
        id: 'back',
        type: 'rect',
        x: 50,
        y: -18,
        width: 100,
        height: 18,
        rotation: 0,
        thickness: 6,
        layerId: 'default',
        meta: {},
      },
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

  it('shrinks a circle hole inward by halfKerf so the finished opening lands at design size', () => {
    // Design radius 25 (diameter 50). Cutter removes halfKerf on each wall, so
    // the path must be radius - halfKerf = 24.75 for a 0.5mm kerf.
    const kerf = 0.5;
    const dxf = exportEntitiesToDxf(
      [{ id: 'f1', type: 'feature', shape: 'circle', operation: 'subtract', cx: 100, cy: 100, diameter: 50 }],
      { kerf },
    );
    const lines = splitDxfLines(dxf);
    const circle = findEntityPairs(lines, 'CIRCLE');

    expect(circle).not.toBeNull();
    expect(Number(circle.get('40'))).toBeCloseTo(25 - kerf / 2, 9);
  });

  it('leaves circle features unchanged when kerf is disabled', () => {
    const feature = {
      id: 'f1',
      type: 'feature',
      shape: 'circle',
      operation: 'subtract',
      cx: 100,
      cy: 100,
      diameter: 50,
    };
    const withoutKerf = findEntityPairs(splitDxfLines(exportEntitiesToDxf([feature])), 'CIRCLE');
    const withZeroKerf = findEntityPairs(splitDxfLines(exportEntitiesToDxf([feature], { kerf: 0 })), 'CIRCLE');

    expect(Number(withoutKerf.get('40'))).toBe(25);
    expect(Number(withZeroKerf.get('40'))).toBe(25);
  });

  it('shrinks a polygon hole so every edge moves inward by exactly halfKerf', () => {
    // 20x10 rectangle expressed as a polygon feature (screen coords, CW visually).
    const kerf = 0.4;
    const points = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 0, y: 10 },
    ];
    const dxf = exportEntitiesToDxf([{ id: 'f1', type: 'feature', shape: 'polygon', operation: 'subtract', points }], {
      kerf,
    });

    const lines = dxf.split('\n').map((l) => l.trim());
    const vertices = [];
    for (let i = 0; i < lines.length - 3; i += 1) {
      if (lines[i] === '10' && lines[i + 2] === '20') {
        vertices.push({ x: Number(lines[i + 1]), y: Number(lines[i + 3]) });
      }
    }
    const polyVerts = vertices.slice(0, 4);
    expect(polyVerts).toHaveLength(4);

    // Inward offset of halfKerf (0.2) on every side. DXF negates Y.
    const xs = polyVerts.map((v) => v.x);
    const ys = polyVerts.map((v) => v.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(20 - kerf, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(10 - kerf, 6);
    expect(Math.min(...xs)).toBeCloseTo(0.2, 6);
    expect(Math.max(...xs)).toBeCloseTo(19.8, 6);
  });

  it('shrinks a rect-shape feature inward by halfKerf on every side', () => {
    const kerf = 0.4;
    const dxf = exportEntitiesToDxf(
      [{ id: 'f1', type: 'feature', shape: 'rect', operation: 'subtract', x: 0, y: 0, width: 20, height: 10 }],
      { kerf },
    );

    const lines = dxf.split('\n').map((l) => l.trim());
    const vertices = [];
    for (let i = 0; i < lines.length - 3; i += 1) {
      if (lines[i] === '10' && lines[i + 2] === '20') {
        vertices.push({ x: Number(lines[i + 1]), y: Number(lines[i + 3]) });
      }
    }
    const rectVerts = vertices.slice(0, 4);
    const xs = rectVerts.map((v) => v.x);
    const ys = rectVerts.map((v) => v.y);

    expect(Math.min(...xs)).toBeCloseTo(kerf / 2, 6);
    expect(Math.max(...xs)).toBeCloseTo(20 - kerf / 2, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(10 - kerf, 6);
  });

  it('shrinks an ellipse feature semi-axes by halfKerf', () => {
    const kerf = 0.4;
    const dxf = exportEntitiesToDxf(
      [
        {
          id: 'f1',
          type: 'feature',
          shape: 'ellipse',
          operation: 'subtract',
          cx: 0,
          cy: 0,
          rx: 40,
          ry: 20,
          rotation: 0,
        },
      ],
      { kerf },
    );
    const lines = splitDxfLines(dxf);
    const ellipse = findEntityPairs(lines, 'ELLIPSE');

    expect(ellipse).not.toBeNull();
    // rx' = 40 - 0.2 = 39.8 (major), ry' = 20 - 0.2 = 19.8 (minor).
    // Group 11 = major-axis endpoint x = majorRadius (cos(0)*majorRadius).
    // Group 40 = minorRadius / majorRadius.
    const majorRadius = Number(ellipse.get('11'));
    const ratio = Number(ellipse.get('40'));
    expect(majorRadius).toBeCloseTo(39.8, 6);
    expect(ratio * majorRadius).toBeCloseTo(19.8, 6);
  });

  it('falls back to original geometry for a degenerate hole smaller than the kerf', () => {
    // 1mm circle with a 2mm kerf: radius 0.5 - 1 = -0.5 (inverted). Must NOT emit
    // negative/inverted geometry; export the original design radius instead.
    const kerf = 2;
    const dxf = exportEntitiesToDxf(
      [{ id: 'f1', type: 'feature', shape: 'circle', operation: 'subtract', cx: 0, cy: 0, diameter: 1 }],
      { kerf },
    );
    const circle = findEntityPairs(splitDxfLines(dxf), 'CIRCLE');
    expect(Number(circle.get('40'))).toBe(0.5);
    expect(Number(circle.get('40'))).toBeGreaterThan(0);
  });

  it('falls back to original geometry for a self-inverting polygon hole', () => {
    // 4mm square offset inward by halfKerf 3 mirrors into a valid-signed-area but
    // wrong-orientation 2mm square. The edge-reversal guard must reject it and
    // export the original 4mm square (min/max range unchanged at 4).
    const kerf = 6;
    const points = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ];
    const dxf = exportEntitiesToDxf([{ id: 'f1', type: 'feature', shape: 'polygon', operation: 'subtract', points }], {
      kerf,
    });
    const lines = dxf.split('\n').map((l) => l.trim());
    const vertices = [];
    for (let i = 0; i < lines.length - 3; i += 1) {
      if (lines[i] === '10' && lines[i + 2] === '20') {
        vertices.push({ x: Number(lines[i + 1]), y: Number(lines[i + 3]) });
      }
    }
    const polyVerts = vertices.slice(0, 4);
    const xs = polyVerts.map((v) => v.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(4, 6);
  });

  it('leaves non-subtract features uncompensated', () => {
    const kerf = 0.5;
    const dxf = exportEntitiesToDxf(
      [{ id: 'f1', type: 'feature', shape: 'circle', operation: 'engrave', cx: 0, cy: 0, diameter: 50 }],
      { kerf },
    );
    const circle = findEntityPairs(splitDxfLines(dxf), 'CIRCLE');
    expect(Number(circle.get('40'))).toBe(25);
  });

  describe('no-options invariance', () => {
    // A document that opts into nothing must produce the file it always did -
    // same bytes, not merely equivalent geometry. These are the guards for the
    // three additive changes: LWPOLYLINE bulges, the optional GRAIN layer, and
    // the corner-relief pass.
    const document = [
      { id: 'r1', type: 'rect', x: 0, y: 0, width: 600, height: 400 },
      {
        id: 'poly1',
        type: 'polyline',
        closed: true,
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
      },
      { id: 'f1', type: 'feature', shape: 'rect', operation: 'subtract', x: 10, y: 10, width: 40, height: 30 },
      { id: 'c1', type: 'circle', cx: 50, cy: 50, radius: 25 },
      {
        id: 'h1',
        type: 'feature',
        shape: 'circle',
        operation: 'subtract',
        hardwareId: 'hw-screw-8-32',
        cx: 20,
        cy: 20,
        diameter: 3,
      },
    ];

    it('emits identical bytes for no options, empty options and explicitly-off options', () => {
      const baseline = exportEntitiesToDxf(document);

      expect(exportEntitiesToDxf(document, {})).toBe(baseline);
      expect(exportEntitiesToDxf(document, { dogbone: null })).toBe(baseline);
      expect(exportEntitiesToDxf(document, { dogbone: { style: DOGBONE_STYLES.NONE } })).toBe(baseline);
      expect(exportEntitiesToDxf(document, { dogbone: { style: DOGBONE_STYLES.DOGBONE, bitDiameter: 0 } })).toBe(
        baseline,
      );
    });

    it('never emits a bulge group code without corner relief', () => {
      const lines = splitDxfLines(exportEntitiesToDxf(document, { kerf: 0.4 }));
      const bulgeCodes = lines.filter((line, index) => line === '42' && index % 2 === 0);
      expect(bulgeCodes).toHaveLength(0);
    });

    it('declares the GRAIN layer only when something is actually on it', () => {
      expect(exportEntitiesToDxf(document)).not.toContain('GRAIN');

      const withGrain = exportEntitiesToDxf([
        ...document,
        { id: 'g1', type: 'line', x1: 0, y1: 0, x2: 10, y2: 0, meta: { dxfLayer: 'GRAIN', dxfKerfExempt: true } },
      ]);
      expect(withGrain).toContain('GRAIN');
    });
  });

  describe('corner relief', () => {
    const slot = {
      id: 'slot',
      type: 'feature',
      shape: 'rect',
      operation: 'subtract',
      x: 0,
      y: 0,
      width: 40,
      height: 30,
    };

    function readPolylineVertices(dxf) {
      const allLines = dxf.split('\n').map((line) => line.trim());
      // $EXTMIN / $EXTMAX in the header are also 10/20 pairs, so start at the
      // ENTITIES section or the extents would masquerade as vertices.
      const entitiesStart = allLines.findIndex((line, index) => line === '2' && allLines[index + 1] === 'ENTITIES');
      const lines = allLines.slice(entitiesStart);
      const vertices = [];
      for (let index = 0; index < lines.length - 3; index += 1) {
        if (lines[index] === '10' && lines[index + 2] === '20') {
          const vertex = { x: Number(lines[index + 1]), y: Number(lines[index + 3]) };
          if (lines[index + 4] === '42') {
            vertex.bulge = Number(lines[index + 5]);
          }
          vertices.push(vertex);
        }
      }
      return vertices;
    }

    it('relieves every corner of a rectangular pocket and emits the arcs as bulges', () => {
      const dxf = exportEntitiesToDxf([slot], {
        dogbone: { style: DOGBONE_STYLES.DOGBONE, bitDiameter: DEFAULT_BIT_DIAMETER },
      });
      const vertices = readPolylineVertices(dxf);

      expect(vertices).toHaveLength(8);
      const bulged = vertices.filter((vertex) => vertex.bulge !== undefined);
      expect(bulged).toHaveLength(4);
      // A 90-degree corner relief is a semicircle, so |bulge| = tan(180/4) = 1.
      bulged.forEach((vertex) => expect(Math.abs(vertex.bulge)).toBeCloseTo(1, 9));
    });

    it('negates the bulge on the way out, because DXF mirrors Y', () => {
      const dxf = exportEntitiesToDxf([slot], {
        dogbone: { style: DOGBONE_STYLES.DOGBONE, bitDiameter: DEFAULT_BIT_DIAMETER },
      });
      const bulges = readPolylineVertices(dxf)
        .map((vertex) => vertex.bulge)
        .filter((bulge) => bulge !== undefined);

      // Source-space bulges for this winding are all +1; the mirror flips them.
      expect(new Set(bulges.map((bulge) => Math.sign(bulge)))).toEqual(new Set([-1]));
    });

    it('computes relief on the KERF-COMPENSATED path, not the design path', () => {
      const kerf = 1;
      const bitDiameter = 4;
      const radius = bitDiameter / 2;
      const dogbone = { style: DOGBONE_STYLES.DOGBONE, bitDiameter };

      const relievedOnly = readPolylineVertices(exportEntitiesToDxf([slot], { dogbone }));
      const kerfedAndRelieved = readPolylineVertices(exportEntitiesToDxf([slot], { kerf, dogbone }));

      // The pocket shrinks inward by halfKerf first, so every relief lands
      // halfKerf inside where it would be on the raw design geometry.
      const bite = radius * Math.SQRT2;
      const relievedMinX = Math.min(...relievedOnly.map((vertex) => vertex.x));
      const kerfedMinX = Math.min(...kerfedAndRelieved.map((vertex) => vertex.x));

      expect(relievedMinX).toBeCloseTo(0, 9);
      expect(kerfedMinX).toBeCloseTo(kerf / 2, 9);

      // And the wall bite is still exactly r*sqrt(2) on the compensated path.
      const kerfedXs = kerfedAndRelieved.map((vertex) => vertex.x).sort((a, b) => a - b);
      expect(kerfedXs[2] - kerfedXs[0]).toBeCloseTo(bite, 9);
    });

    it('leaves drilled fastener holes out of the relief pass entirely', () => {
      const fastener = {
        id: 'h1',
        type: 'feature',
        shape: 'rect',
        operation: 'subtract',
        hardwareId: 'hw-screw-8-32',
        x: 0,
        y: 0,
        width: 40,
        height: 30,
      };

      const dxf = exportEntitiesToDxf([fastener], {
        dogbone: { style: DOGBONE_STYLES.DOGBONE, bitDiameter: DEFAULT_BIT_DIAMETER },
      });

      // Untouched: still a plain four-vertex rectangle with no arcs.
      expect(readPolylineVertices(dxf)).toHaveLength(4);
      expect(dxf).not.toContain('\n42\n');
    });

    it('leaves reference geometry (the stock outline) out of the relief pass', () => {
      const outline = {
        id: 'sheet-outline-1',
        type: 'polyline',
        closed: true,
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 60 },
          { x: 60, y: 60 },
          { x: 60, y: 30 },
          { x: 0, y: 30 },
        ],
        meta: { dxfLayer: 'SHEET', dxfKerfExempt: true },
      };

      const dxf = exportEntitiesToDxf([outline], {
        dogbone: { style: DOGBONE_STYLES.DOGBONE, bitDiameter: DEFAULT_BIT_DIAMETER },
      });

      expect(readPolylineVertices(dxf)).toHaveLength(6);
      expect(dxf).not.toContain('\n42\n');
    });

    it('relieves a concave notch in a part perimeter but not its convex corners', () => {
      const notched = {
        id: 'perimeter',
        type: 'polyline',
        closed: true,
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 70, y: 100 },
          { x: 70, y: 70 },
          { x: 30, y: 70 },
          { x: 30, y: 100 },
          { x: 0, y: 100 },
        ],
      };

      const vertices = readPolylineVertices(
        exportEntitiesToDxf([notched], {
          dogbone: { style: DOGBONE_STYLES.DOGBONE, bitDiameter: DEFAULT_BIT_DIAMETER },
        }),
      );

      // 8 original vertices, of which exactly the 2 notch corners expand into
      // an entry/exit pair.
      expect(vertices).toHaveLength(10);
      expect(vertices.filter((vertex) => vertex.bulge !== undefined)).toHaveLength(2);
    });
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
