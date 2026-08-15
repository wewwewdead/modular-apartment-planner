import { describe, expect, it } from 'vitest';
import {
  SHAPER_CUT_TYPES,
  SHAPER_STYLES,
  buildShaperDepthTable,
  buildShaperPartDocument,
  buildShaperSvgDocuments,
  bulgeToArcCommand,
  classifyShaperCut,
  entityToShaperPathData,
} from '../export/shaperSvgExport';
import { DOGBONE_STYLES } from '../export/dogboneUtils';

const PART = {
  id: 'p1',
  type: 'rect',
  x: 0,
  y: 0,
  width: 200,
  height: 100,
  materialId: 'birch-plywood-18',
  thickness: 18,
  grainAngle: 0,
  layerId: 'default',
  meta: { label: 'Side panel' },
};

const THROUGH_HOLE = {
  id: 'f-through',
  type: 'feature',
  shape: 'circle',
  operation: 'subtract',
  cx: 50,
  cy: 50,
  diameter: 10,
  through: true,
  layerId: 'default',
  meta: { manufacturingSourceEntityIds: ['p1'] },
};

const POCKET = {
  id: 'f-pocket',
  type: 'feature',
  shape: 'rect',
  operation: 'subtract',
  x: 100,
  y: 20,
  width: 40,
  height: 18,
  depth: 6,
  through: false,
  layerId: 'default',
  meta: { manufacturingSourceEntityIds: ['p1'] },
};

const FASTENER = {
  id: 'f-screw',
  type: 'feature',
  shape: 'circle',
  operation: 'subtract',
  cx: 20,
  cy: 80,
  diameter: 3,
  depth: 20,
  through: false,
  hardwareId: 'hw-screw-8-40',
  layerId: 'default',
  meta: { manufacturingSourceEntityIds: ['p1'] },
};

const ENTITIES = [PART, THROUGH_HOLE, POCKET, FASTENER];

describe('Shaper colour contract', () => {
  it('encodes the five cut types exactly as Origin reads them', () => {
    expect(SHAPER_STYLES.exterior).toMatchObject({ fill: '#FFFFFF', stroke: '#000000' });
    expect(SHAPER_STYLES.interior).toMatchObject({ fill: '#000000', stroke: 'none' });
    expect(SHAPER_STYLES.pocket).toMatchObject({ fill: '#808080', stroke: 'none' });
    expect(SHAPER_STYLES.online).toMatchObject({ fill: 'none', stroke: '#808080' });
    expect(SHAPER_STYLES.guide).toMatchObject({ fill: 'none', stroke: '#0068FF' });
  });
});

describe('classifyShaperCut', () => {
  it('makes a part perimeter an exterior cut', () => {
    expect(classifyShaperCut(PART, 18)).toBe(SHAPER_CUT_TYPES.EXTERIOR);
    expect(classifyShaperCut({ type: 'polyline', closed: true }, 18)).toBe(SHAPER_CUT_TYPES.EXTERIOR);
    expect(classifyShaperCut({ type: 'circle' }, 18)).toBe(SHAPER_CUT_TYPES.EXTERIOR);
  });

  it('makes a through cutout an interior cut', () => {
    expect(classifyShaperCut(THROUGH_HOLE, 18)).toBe(SHAPER_CUT_TYPES.INTERIOR);
  });

  it('makes a fastener hole an interior cut even though it is blind', () => {
    expect(FASTENER.through).toBe(false);
    expect(classifyShaperCut(FASTENER, 18)).toBe(SHAPER_CUT_TYPES.INTERIOR);
  });

  it('makes a partial-depth channel a pocket', () => {
    expect(classifyShaperCut(POCKET, 18)).toBe(SHAPER_CUT_TYPES.POCKET);
  });

  it('promotes a pocket that reaches the far face to an interior cut', () => {
    expect(classifyShaperCut({ ...POCKET, depth: 18 }, 18)).toBe(SHAPER_CUT_TYPES.INTERIOR);
    expect(classifyShaperCut({ ...POCKET, depth: 25 }, 18)).toBe(SHAPER_CUT_TYPES.INTERIOR);
  });

  it('treats a feature with no depth as through, which is the safe reading', () => {
    expect(classifyShaperCut({ ...POCKET, depth: null }, 18)).toBe(SHAPER_CUT_TYPES.INTERIOR);
  });

  it('makes open geometry an on-line cut', () => {
    expect(classifyShaperCut({ type: 'line' }, 18)).toBe(SHAPER_CUT_TYPES.ONLINE);
    expect(classifyShaperCut({ type: 'arc' }, 18)).toBe(SHAPER_CUT_TYPES.ONLINE);
    expect(classifyShaperCut({ type: 'polyline', closed: false }, 18)).toBe(SHAPER_CUT_TYPES.ONLINE);
  });
});

describe('flat geometry', () => {
  it('writes a rectangle as an explicit closed path', () => {
    expect(entityToShaperPathData({ type: 'rect', x: 10, y: 20, width: 30, height: 40 })).toBe(
      'M 10 20 L 40 20 L 40 60 L 10 60 Z',
    );
  });

  it('writes a rotated rectangle as its four corners, not as a transform', () => {
    const path = entityToShaperPathData({ type: 'rect', x: 0, y: 0, width: 100, height: 50, rotation: 30 });
    expect(path).not.toContain('transform');
    expect(path.startsWith('M ')).toBe(true);
    expect(path.match(/L /g)).toHaveLength(3);
  });

  it('writes a circle as two arc segments, not as a <circle>', () => {
    expect(entityToShaperPathData({ type: 'circle', cx: 50, cy: 50, r: 10 })).toBe(
      'M 40 50 A 10 10 0 1 0 60 50 A 10 10 0 1 0 40 50 Z',
    );
  });

  it('carries an ellipse rotation in the arc command, not in a transform', () => {
    const path = entityToShaperPathData({ type: 'ellipse', cx: 0, cy: 0, rx: 20, ry: 10, rotation: 45 });
    expect(path).not.toContain('transform');
    // rx ry x-axis-rotation large-arc sweep
    expect(path).toContain('A 20 10 45 1 0');
  });

  it('writes an arc as an absolute quadratic bezier', () => {
    const path = entityToShaperPathData({
      type: 'arc',
      start: { x: 0, y: 0 },
      control: { x: 5, y: 10 },
      end: { x: 10, y: 0 },
    });
    expect(path).toBe('M 0 0 Q 5 10 10 0');
  });
});

describe('bulge -> SVG arc', () => {
  it('turns the classic 90-degree relief bulge into a semicircle', () => {
    // bulge = tan(sweep/4); a semicircle is sweep = 180deg, so bulge = tan(45) = 1.
    // Chord 10 across a semicircle means radius 5.
    expect(bulgeToArcCommand({ x: 0, y: 0 }, { x: 10, y: 0 }, 1)).toBe('A 5 5 0 0 1 10 0');
  });

  it('flips the sweep flag with the sign of the bulge, and never the radius', () => {
    expect(bulgeToArcCommand({ x: 0, y: 0 }, { x: 10, y: 0 }, -1)).toBe('A 5 5 0 0 0 10 0');
  });

  it('sets the large-arc flag past a half turn', () => {
    // bulge = tan(270/4 deg) = tan(67.5) = 2.4142 -> sweep 270deg.
    const command = bulgeToArcCommand({ x: 0, y: 0 }, { x: 10, y: 0 }, Math.tan((67.5 * Math.PI) / 180));
    expect(command.split(' ')[4]).toBe('1');
  });

  it('degrades to a straight segment for a degenerate bulge', () => {
    expect(bulgeToArcCommand({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.0000000001)).toBe('L 10 0');
    expect(bulgeToArcCommand({ x: 0, y: 0 }, { x: 0, y: 0 }, 1)).toBe('L 0 0');
  });
});

describe('buildShaperPartDocument', () => {
  const document = buildShaperPartDocument(ENTITIES, PART);

  it('emits one path per cut, with no transforms and no groups anywhere', () => {
    expect(document.content).not.toContain('transform');
    expect(document.content).not.toContain('<g');
    expect(document.content.match(/<path /g)).toHaveLength(6); // 4 cuts + 2 grain guides
  });

  it('uses millimetre units in both the size and the viewBox', () => {
    expect(document.content).toContain('width="204mm" height="104mm"');
    expect(document.content).toContain('viewBox="-2 -2 204 104"');
  });

  it('colours each cut by its type', () => {
    expect(document.content).toContain('fill="#FFFFFF" stroke="#000000"'); // perimeter
    expect(document.content).toContain('fill="#000000" stroke="none"'); // through hole + screw
    expect(document.content).toContain('fill="#808080" stroke="none"'); // pocket
    expect(document.content).toContain('stroke="#0068FF"'); // grain guide
  });

  it('records the classification of every cut', () => {
    expect(document.cuts).toEqual([
      { entityId: 'p1', cutType: 'exterior', depthMm: 18 },
      { entityId: 'f-through', cutType: 'interior', depthMm: 18 },
      { entityId: 'f-pocket', cutType: 'pocket', depthMm: 6 },
      { entityId: 'f-screw', cutType: 'interior', depthMm: 20 },
    ]);
  });

  it('embeds the intended depth without pretending Origin will read it', () => {
    expect(document.content).toContain('data-shaper-depth-mm="6"');
    expect(document.content).toContain('Origin ignores this - set depth on the tool');
    expect(document.content).toContain('<desc>');
  });

  it('says out loud that kerf is not compensated', () => {
    expect(document.content).toContain('Kerf is NOT compensated');
  });

  it('names the file after the part', () => {
    expect(document.filename).toBe('Side-panel-p1.svg');
  });

  it('returns null for a part with no cut geometry', () => {
    expect(buildShaperPartDocument([{ id: 'ghost', type: 'rect', materialId: 'mdf-18' }], { id: 'nope' })).toBeNull();
  });
});

describe('kerf and dogbone interaction', () => {
  it('ignores a kerf option completely - Origin compensates on-tool', () => {
    const plain = buildShaperPartDocument(ENTITIES, PART);
    const kerfed = buildShaperPartDocument(ENTITIES, PART, { kerf: 0.2 });
    expect(kerfed.content).toBe(plain.content);
  });

  it('applies the same dogbone pipeline the DXF export uses', () => {
    const plain = buildShaperPartDocument(ENTITIES, PART);
    const relieved = buildShaperPartDocument(ENTITIES, PART, {
      dogbone: { style: DOGBONE_STYLES.DOGBONE, bitDiameter: 6.35 },
    });

    expect(relieved.content).not.toBe(plain.content);
    // The pocket's four square corners become arc segments in the path.
    expect(plain.content).not.toContain(' A 3.175 3.175 ');
    expect(relieved.content).toContain(' A 3.175 3.175 ');
  });

  it('leaves the geometry untouched when relief is switched off', () => {
    const plain = buildShaperPartDocument(ENTITIES, PART);
    expect(buildShaperPartDocument(ENTITIES, PART, { dogbone: { style: 'none' } }).content).toBe(plain.content);
    expect(buildShaperPartDocument(ENTITIES, PART, { dogbone: null }).content).toBe(plain.content);
  });

  it('never relieves a fastener hole', () => {
    const relieved = buildShaperPartDocument(ENTITIES, PART, {
      dogbone: { style: DOGBONE_STYLES.DOGBONE, bitDiameter: 6.35 },
    });
    // The 3mm screw hole is still the same two-arc circle it always was.
    expect(relieved.content).toContain('A 1.5 1.5 0 1 0');
  });
});

describe('buildShaperSvgDocuments', () => {
  const SECOND_PART = {
    id: 'p2',
    type: 'rect',
    x: 400,
    y: 0,
    width: 150,
    height: 80,
    materialId: 'birch-plywood-18',
    thickness: 18,
    layerId: 'default',
    meta: { label: 'Shelf' },
  };

  const documents = buildShaperSvgDocuments([...ENTITIES, SECOND_PART]);

  it('produces one file per part plus a combined file', () => {
    expect(documents.parts.map((entry) => entry.partId)).toEqual(['p1', 'p2']);
    expect(documents.combined.filename).toBe('all-parts.svg');
  });

  it('keeps parts in their drawn positions in the combined file', () => {
    // Bounds run from -2 (margin) to 550 + 2.
    expect(documents.combined.content).toContain('viewBox="-2 -2 554 104"');
  });

  it('skips entities with no material - they are not parts', () => {
    const noMaterial = buildShaperSvgDocuments([{ id: 'sketchy', type: 'rect', x: 0, y: 0, width: 10, height: 10 }]);
    expect(noMaterial.parts).toEqual([]);
    expect(noMaterial.combined).toBeNull();
  });

  it('summarises every cut depth for the README', () => {
    const table = buildShaperDepthTable(documents);
    expect(table).toHaveLength(2);
    expect(table[0]).toContain('Side-panel-p1.svg');
    expect(table[0]).toContain('pocket @ 6mm');
    expect(table[0]).toContain('exterior @ 18mm');
  });

  it('is deterministic', () => {
    const first = JSON.stringify(buildShaperSvgDocuments([...ENTITIES, SECOND_PART]));
    expect(JSON.stringify(buildShaperSvgDocuments([...ENTITIES, SECOND_PART]))).toBe(first);
  });
});
