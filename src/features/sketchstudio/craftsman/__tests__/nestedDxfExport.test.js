import { describe, expect, it } from 'vitest';
import { buildNestedSheetFilename, exportNestedSheetsToDxf } from '../export/nestedDxfExport';

const SHEET = { width: 2440, height: 1220 };

function splitDxfLines(dxf) {
  return dxf
    .trimEnd()
    .split(/\r?\n/)
    .map((line) => line.trim());
}

/** Every (10, 20) coordinate pair in the file, in document order. */
function readVertices(dxf) {
  const lines = splitDxfLines(dxf);
  const vertices = [];
  for (let index = 0; index < lines.length - 3; index += 1) {
    if (lines[index] === '10' && lines[index + 2] === '20') {
      vertices.push({ x: Number(lines[index + 1]), y: Number(lines[index + 3]) });
    }
  }
  return vertices;
}

/**
 * Vertices of the Nth LWPOLYLINE. Vertex 0 is the sheet outline, so part
 * outlines start at polylineIndex 1.
 */
function readPolylineVertices(dxf, polylineIndex) {
  const lines = splitDxfLines(dxf);
  let seen = -1;

  for (let index = 0; index < lines.length - 1; index += 1) {
    if (lines[index] !== '0' || lines[index + 1] !== 'LWPOLYLINE') {
      continue;
    }

    seen += 1;
    if (seen !== polylineIndex) {
      continue;
    }

    const vertices = [];
    for (let cursor = index + 2; cursor < lines.length - 3; cursor += 2) {
      if (lines[cursor] === '0') {
        break;
      }
      if (lines[cursor] === '10' && lines[cursor + 2] === '20') {
        vertices.push({ x: Number(lines[cursor + 1]), y: Number(lines[cursor + 3]) });
      }
    }
    return vertices;
  }

  return [];
}

function boundsOf(vertices) {
  return {
    minX: Math.min(...vertices.map((vertex) => vertex.x)),
    maxX: Math.max(...vertices.map((vertex) => vertex.x)),
    minY: Math.min(...vertices.map((vertex) => vertex.y)),
    maxY: Math.max(...vertices.map((vertex) => vertex.y)),
  };
}

function findEntityPairs(dxf, type, occurrence = 0) {
  const lines = splitDxfLines(dxf);
  let seen = -1;

  for (let index = 0; index < lines.length - 1; index += 1) {
    if (lines[index] !== '0' || lines[index + 1] !== type) {
      continue;
    }

    seen += 1;
    if (seen !== occurrence) {
      continue;
    }

    const pairs = new Map();
    for (let cursor = index + 2; cursor < lines.length; cursor += 2) {
      if (lines[cursor] === '0') {
        break;
      }
      pairs.set(lines[cursor], lines[cursor + 1]);
    }
    return pairs;
  }

  return null;
}

function sheetRow(overrides) {
  return {
    partName: 'Panel',
    role: 'rect',
    material: 'ply',
    materialName: 'Plywood',
    thickness: 18,
    quantity: 1,
    ...overrides,
  };
}

describe('Nested sheet DXF export', () => {
  it('translates a placed part out of sketch space and into sheet space', () => {
    // Panel drawn far from the origin; nesting puts the only part at (0, 0).
    const entities = [{ id: 'r1', type: 'rect', x: 1000, y: 500, width: 600, height: 300, materialId: 'ply' }];
    const rows = [sheetRow({ partId: 'r1', entityIds: ['r1'], width: 600, height: 300 })];

    const files = exportNestedSheetsToDxf(entities, rows, { sheetSize: SHEET });

    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('sheet-01.dxf');

    const part = boundsOf(readPolylineVertices(files[0].content, 1));
    // DXF negates Y, so the panel occupies x 0..600 and y -300..0.
    expect(part.minX).toBeCloseTo(0, 6);
    expect(part.maxX).toBeCloseTo(600, 6);
    expect(part.minY).toBeCloseTo(-300, 6);
    expect(part.maxY).toBeCloseTo(0, 6);
  });

  it('rotates a portrait part 90 degrees to match its landscape nested footprint', () => {
    // 300 wide x 600 tall in the sketch; the optimizer nests every sheet part
    // landscape, so the exported geometry has to come out 600 x 300.
    const entities = [{ id: 'r1', type: 'rect', x: 0, y: 0, width: 300, height: 600, materialId: 'ply' }];
    const rows = [sheetRow({ partId: 'r1', entityIds: ['r1'], width: 300, height: 600 })];

    const files = exportNestedSheetsToDxf(entities, rows, { sheetSize: SHEET });
    const part = boundsOf(readPolylineVertices(files[0].content, 1));

    expect(part.maxX - part.minX).toBeCloseTo(600, 6);
    expect(part.maxY - part.minY).toBeCloseTo(300, 6);
    expect(part.minX).toBeCloseTo(0, 6);
    expect(part.maxY).toBeCloseTo(0, 6);
  });

  it('carries holes and cutouts along with the part transform', () => {
    const entities = [
      { id: 'r1', type: 'rect', x: 1000, y: 1000, width: 600, height: 300, materialId: 'ply' },
      {
        id: 'hole',
        type: 'feature',
        shape: 'circle',
        operation: 'subtract',
        cx: 1100,
        cy: 1050,
        diameter: 20,
        meta: { manufacturingSourceEntityIds: ['r1'] },
      },
    ];
    const rows = [sheetRow({ partId: 'r1', entityIds: ['r1'], width: 600, height: 300 })];

    const files = exportNestedSheetsToDxf(entities, rows, { sheetSize: SHEET });
    const circle = findEntityPairs(files[0].content, 'CIRCLE');

    expect(circle).not.toBeNull();
    // Hole sat 100mm right of and 50mm below the panel origin; the panel origin
    // is now (0, 0), so the hole lands at (100, -50) in DXF coordinates.
    expect(Number(circle.get('10'))).toBeCloseTo(100, 6);
    expect(Number(circle.get('20'))).toBeCloseTo(-50, 6);
    expect(Number(circle.get('40'))).toBeCloseTo(10, 6);
  });

  it('rotates hole positions with the part when the placement is turned', () => {
    const entities = [
      { id: 'r1', type: 'rect', x: 0, y: 0, width: 300, height: 600, materialId: 'ply' },
      {
        id: 'hole',
        type: 'feature',
        shape: 'circle',
        operation: 'subtract',
        cx: 50,
        cy: 100,
        diameter: 20,
        meta: { manufacturingSourceEntityIds: ['r1'] },
      },
    ];
    const rows = [sheetRow({ partId: 'r1', entityIds: ['r1'], width: 300, height: 600 })];

    const files = exportNestedSheetsToDxf(entities, rows, { sheetSize: SHEET });
    const circle = findEntityPairs(files[0].content, 'CIRCLE');

    // Quarter turn (x, y) -> (-y, x) then translate by (+600, 0):
    // (50, 100) -> (-100, 50) -> (500, 50); DXF negates Y.
    expect(Number(circle.get('10'))).toBeCloseTo(500, 6);
    expect(Number(circle.get('20'))).toBeCloseTo(-50, 6);
  });

  it('emits one file per sheet with sequential names', () => {
    // Four 1300x900 panels: only one fits per 2440x1220 sheet shelf-wise.
    const entities = [1, 2, 3, 4].map((index) => ({
      id: `r${index}`,
      type: 'rect',
      x: 0,
      y: 0,
      width: 1300,
      height: 900,
      materialId: 'ply',
    }));
    const rows = [
      sheetRow({
        partId: 'r1',
        entityIds: ['r1', 'r2', 'r3', 'r4'],
        width: 1300,
        height: 900,
        quantity: 4,
      }),
    ];

    const files = exportNestedSheetsToDxf(entities, rows, { sheetSize: SHEET });

    expect(files.length).toBeGreaterThan(1);
    expect(files.map((file) => file.filename)).toEqual(
      files.map((_file, index) => `sheet-${String(index + 1).padStart(2, '0')}.dxf`),
    );
    files.forEach((file) => {
      expect(file.content).toContain('LWPOLYLINE');
      expect(file.content.endsWith('\n')).toBe(true);
    });
  });

  it('gives each entity in a grouped BOM row its own geometry', () => {
    // Two same-size panels grouped into one row; only one is drilled. Each copy
    // must resolve to its own entity, so exactly one hole is exported.
    const entities = [
      { id: 'r1', type: 'rect', x: 0, y: 0, width: 400, height: 200, materialId: 'ply' },
      { id: 'r2', type: 'rect', x: 0, y: 400, width: 400, height: 200, materialId: 'ply' },
      {
        id: 'hole',
        type: 'feature',
        shape: 'circle',
        operation: 'subtract',
        cx: 100,
        cy: 500,
        diameter: 20,
        meta: { manufacturingSourceEntityIds: ['r2'] },
      },
    ];
    const rows = [sheetRow({ partId: 'r1', entityIds: ['r1', 'r2'], width: 400, height: 200, quantity: 2 })];

    const files = exportNestedSheetsToDxf(entities, rows, { sheetSize: SHEET });
    const allContent = files.map((file) => file.content).join('\n');

    expect((allContent.match(/\nCIRCLE\n/g) || []).length).toBe(1);
    // Sheet outline + two part outlines.
    expect((files[0].content.match(/LWPOLYLINE/g) || []).length).toBe(3);
  });

  it('draws the stock outline on the SHEET layer at true stock size', () => {
    const entities = [{ id: 'r1', type: 'rect', x: 0, y: 0, width: 600, height: 300, materialId: 'ply' }];
    const rows = [sheetRow({ partId: 'r1', entityIds: ['r1'], width: 600, height: 300 })];

    const files = exportNestedSheetsToDxf(entities, rows, { sheetSize: { width: 1000, height: 800 } });
    const outlinePairs = findEntityPairs(files[0].content, 'LWPOLYLINE');
    const outline = boundsOf(readPolylineVertices(files[0].content, 0));

    expect(outlinePairs.get('8')).toBe('SHEET');
    expect(outline.minX).toBeCloseTo(0, 6);
    expect(outline.maxX).toBeCloseTo(1000, 6);
    expect(outline.minY).toBeCloseTo(-800, 6);
    expect(outline.maxY).toBeCloseTo(0, 6);
  });

  it('applies kerf compensation to parts but never to the stock outline', () => {
    const entities = [{ id: 'r1', type: 'rect', x: 0, y: 0, width: 600, height: 300, materialId: 'ply' }];
    const rows = [sheetRow({ partId: 'r1', entityIds: ['r1'], width: 600, height: 300 })];
    const kerf = 1;

    const files = exportNestedSheetsToDxf(entities, rows, { sheetSize: { width: 1000, height: 800 }, kerf });
    const outline = boundsOf(readPolylineVertices(files[0].content, 0));
    const part = boundsOf(readPolylineVertices(files[0].content, 1));

    expect(outline.maxX - outline.minX).toBeCloseTo(1000, 6);
    expect(outline.maxY - outline.minY).toBeCloseTo(800, 6);
    expect(part.maxX - part.minX).toBeCloseTo(600 + kerf, 6);
    expect(part.maxY - part.minY).toBeCloseTo(300 + kerf, 6);
  });

  it('honours the blade gap between nested parts', () => {
    const entities = [
      { id: 'r1', type: 'rect', x: 0, y: 0, width: 400, height: 200, materialId: 'ply' },
      { id: 'r2', type: 'rect', x: 0, y: 0, width: 400, height: 200, materialId: 'ply' },
    ];
    const rows = [sheetRow({ partId: 'r1', entityIds: ['r1', 'r2'], width: 400, height: 200, quantity: 2 })];

    const files = exportNestedSheetsToDxf(entities, rows, { sheetSize: SHEET, bladeKerf: 10 });
    const second = boundsOf(readPolylineVertices(files[0].content, 2));

    expect(second.minX).toBeCloseTo(410, 6);
  });

  it('falls back to the nested footprint when a placement has no resolvable entity', () => {
    const rows = [sheetRow({ width: 600, height: 300 })];

    const files = exportNestedSheetsToDxf([], rows, { sheetSize: SHEET });
    const part = boundsOf(readPolylineVertices(files[0].content, 1));

    expect(files).toHaveLength(1);
    expect(part.maxX - part.minX).toBeCloseTo(600, 6);
    expect(part.maxY - part.minY).toBeCloseTo(300, 6);
  });

  it('returns no files for an empty BOM or an all-linear BOM', () => {
    expect(exportNestedSheetsToDxf([], [])).toEqual([]);
    expect(exportNestedSheetsToDxf([], null)).toEqual([]);
    expect(
      exportNestedSheetsToDxf(
        [{ id: 'l1', type: 'line', x1: 0, y1: 0, x2: 1200, y2: 0, materialId: 'steel' }],
        [
          {
            partId: 'l1',
            entityIds: ['l1'],
            partName: 'Rail',
            material: 'steel',
            materialName: 'Steel tube',
            stockKind: 'linear',
            costBasis: 'perLinearMeter',
            width: 1200,
            height: 25,
            quantity: 2,
            defaultStockLength: 6000,
          },
        ],
      ),
    ).toEqual([]);
  });

  it('skips rows without usable dimensions instead of emitting empty sheets', () => {
    const rows = [sheetRow({ partId: 'r1', entityIds: ['r1'], width: 0, height: 0 })];
    expect(exportNestedSheetsToDxf([{ id: 'r1', type: 'rect', x: 0, y: 0, width: 0, height: 0 }], rows)).toEqual([]);
  });

  it('produces well-formed DXF documents', () => {
    const entities = [{ id: 'r1', type: 'rect', x: 0, y: 0, width: 600, height: 300, materialId: 'ply' }];
    const rows = [sheetRow({ partId: 'r1', entityIds: ['r1'], width: 600, height: 300 })];

    const dxf = exportNestedSheetsToDxf(entities, rows, { sheetSize: SHEET })[0].content;
    const lines = splitDxfLines(dxf);

    expect(lines.length % 2).toBe(0);
    expect(lines.slice(-2)).toEqual(['0', 'EOF']);
    expect(readVertices(dxf).length).toBeGreaterThan(4);
  });

  describe('grain-locked placements', () => {
    it('keeps a 0-degree grain part as drawn instead of normalizing it landscape', () => {
      // Same 300 x 600 portrait panel the landscape test uses - but grain
      // locked, so the nested geometry must stay 300 x 600.
      const entities = [{ id: 'r1', type: 'rect', x: 0, y: 0, width: 300, height: 600, materialId: 'ply' }];
      const rows = [
        sheetRow({ partId: 'r1', entityIds: ['r1'], width: 300, height: 600, hasGrain: true, grainAngle: 0 }),
      ];

      const files = exportNestedSheetsToDxf(entities, rows, { sheetSize: SHEET });
      const part = boundsOf(readPolylineVertices(files[0].content, 1));

      expect(part.maxX - part.minX).toBeCloseTo(300, 6);
      expect(part.maxY - part.minY).toBeCloseTo(600, 6);
    });

    it('keeps the footprint-derived rotation coherent for a 90-degree grain part', () => {
      // Grain across the sheet means the placement IS turned, and the rotation
      // derivation (footprint comparison, not the optimizer's own flag) has to
      // agree - the geometry must come out 600 x 300 with its hole carried along.
      const entities = [
        { id: 'r1', type: 'rect', x: 0, y: 0, width: 300, height: 600, materialId: 'ply' },
        {
          id: 'hole',
          type: 'feature',
          shape: 'circle',
          operation: 'subtract',
          cx: 50,
          cy: 100,
          diameter: 10,
          meta: { manufacturingSourceEntityIds: ['r1'] },
        },
      ];
      const rows = [
        sheetRow({ partId: 'r1', entityIds: ['r1'], width: 300, height: 600, hasGrain: true, grainAngle: 90 }),
      ];

      const files = exportNestedSheetsToDxf(entities, rows, { sheetSize: SHEET });
      const part = boundsOf(readPolylineVertices(files[0].content, 1));

      expect(part.maxX - part.minX).toBeCloseTo(600, 6);
      expect(part.maxY - part.minY).toBeCloseTo(300, 6);

      // The hole rides the same quarter turn: sketch (50, 100) maps to (-100, 50)
      // before translation, i.e. (500, 50) once the part is anchored at (0, 0).
      const circle = findEntityPairs(files[0].content, 'CIRCLE');
      expect(Number(circle.get('10'))).toBeCloseTo(500, 6);
      expect(Number(circle.get('20'))).toBeCloseTo(-50, 6);
    });

    it('draws a grain arrow on its own non-cutting GRAIN layer', () => {
      const entities = [{ id: 'r1', type: 'rect', x: 0, y: 0, width: 600, height: 300, materialId: 'ply' }];
      const rows = [
        sheetRow({ partId: 'r1', entityIds: ['r1'], width: 600, height: 300, hasGrain: true, grainAngle: 0 }),
      ];

      const content = exportNestedSheetsToDxf(entities, rows, { sheetSize: SHEET })[0].content;
      const lines = splitDxfLines(content);

      // Layer declared, and three LINEs (shaft plus two barbs) sit on it.
      expect(content).toContain('GRAIN');
      const grainLayerRefs = lines.filter((line, index) => line === 'GRAIN' && lines[index - 1] === '8');
      expect(grainLayerRefs).toHaveLength(3);
    });

    it('adds no GRAIN layer at all when nothing is grain locked', () => {
      const entities = [{ id: 'r1', type: 'rect', x: 0, y: 0, width: 600, height: 300, materialId: 'ply' }];
      const rows = [sheetRow({ partId: 'r1', entityIds: ['r1'], width: 600, height: 300 })];

      expect(exportNestedSheetsToDxf(entities, rows, { sheetSize: SHEET })[0].content).not.toContain('GRAIN');
    });

    it('leaves the grain arrow out of kerf compensation', () => {
      const entities = [{ id: 'r1', type: 'rect', x: 0, y: 0, width: 600, height: 300, materialId: 'ply' }];
      const rows = [
        sheetRow({ partId: 'r1', entityIds: ['r1'], width: 600, height: 300, hasGrain: true, grainAngle: 0 }),
      ];

      const plain = exportNestedSheetsToDxf(entities, rows, { sheetSize: SHEET })[0].content;
      const kerfed = exportNestedSheetsToDxf(entities, rows, { sheetSize: SHEET, kerf: 1 })[0].content;

      const grainShaft = (dxf) => findEntityPairs(dxf, 'LINE');
      expect(Number(grainShaft(kerfed).get('10'))).toBeCloseTo(Number(grainShaft(plain).get('10')), 9);
      expect(Number(grainShaft(kerfed).get('11'))).toBeCloseTo(Number(grainShaft(plain).get('11')), 9);
    });
  });

  it('pads sheet filenames to at least two digits and grows past 99', () => {
    expect(buildNestedSheetFilename(0, 1)).toBe('sheet-01.dxf');
    expect(buildNestedSheetFilename(8, 9)).toBe('sheet-09.dxf');
    expect(buildNestedSheetFilename(99, 120)).toBe('sheet-100.dxf');
  });
});
