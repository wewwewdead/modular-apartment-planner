import { describe, expect, it } from 'vitest';
import { resolveSketchDocument } from '../../utils/sketchDocumentResolver';
import { createSketchJoint } from '../../utils/sketchJoineryUtils';
import { buildFastenerFeatureConfig } from '../../utils/fastenerUtils';
import { createFeatureEntity } from '../../utils/entityUtils';
import { exportEntitiesToDxf } from '../export/dxfExport';
import { buildSvgExportDocument, exportEntitiesToSvg } from '../export/svgExport';
import { buildPrintableSvg } from '../export/pdfExport';
import { buildFastenerLegend, formatFastenerLegendRow } from '../export/fastenerLegend';
import { generateAssemblySteps, exportAssemblyToText } from '../utils/assemblyGenerator';
import { generateAssemblyHtml } from '../export/assemblyHtmlExport';
import { buildWorkshopPackageContents } from '../export/workshopExport';
import { exportNestedSheetsToDxf } from '../export/nestedDxfExport';
import { buildBomEntityList } from '../utils/entityBomAdapter';

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

function panel(overrides = {}) {
  return {
    id: 'panel',
    type: 'rect',
    x: 0,
    y: 0,
    width: 400,
    height: 300,
    rotation: 0,
    thickness: 18,
    materialId: 'birch-plywood-18',
    layerId: 'default',
    meta: { label: 'Side panel' },
    ...overrides,
  };
}

/** What the fastener tool commits for one click. */
function fastener(id, hardwareId, point, targetPartId = null) {
  return {
    ...createFeatureEntity(buildFastenerFeatureConfig(hardwareId, point, { targetPartId }), [], 'default'),
    id,
  };
}

/** A plain drilled hole with no catalog hardware behind it. */
function plainHole(id, point, diameter) {
  return {
    id,
    type: 'feature',
    featureType: 'hole',
    operation: 'subtract',
    shape: 'circle',
    cx: point.x,
    cy: point.y,
    diameter,
    layerId: 'default',
    meta: {},
  };
}

function joineryDocument(jointType, parameters = {}) {
  return {
    version: 1,
    id: `doc-${jointType}`,
    name: 'Joinery Hardware',
    units: 'mm',
    metadata: {},
    objectDefinition: {},
    layers: [{ id: 'default', name: 'Default', visible: true, locked: false }],
    variables: [],
    constraints: [],
    joints: [
      createSketchJoint({
        id: `joint-${jointType}`,
        type: jointType,
        sourcePartId: 'shelf',
        targetPartId: 'panel',
        parameters,
      }),
    ],
    entities: [panel(), panel({ id: 'shelf', x: 40, y: -18, width: 300, height: 18, meta: { label: 'Shelf' } })],
  };
}

describe('fastener DXF layer', () => {
  it('routes placed fasteners to the HARDWARE layer as drill-ready circles', () => {
    const dxf = exportEntitiesToDxf([panel(), fastener('f1', 'hw-screw-8-32', { x: 120, y: 80 }, 'panel')]);
    const lines = splitDxfLines(dxf);

    // The layer must be declared in the LAYER table, not just referenced.
    const layerTable = lines.join('\n');
    expect(layerTable).toContain('HARDWARE');

    const circle = findEntityPairs(lines, 'CIRCLE');
    expect(circle).not.toBeNull();
    expect(circle.get('8')).toBe('HARDWARE');
    expect(Number(circle.get('10'))).toBeCloseTo(120, 6);
    expect(Number(circle.get('20'))).toBeCloseTo(-80, 6);
    expect(Number(circle.get('40'))).toBeCloseTo(1.5, 6);
  });

  it('keeps joinery holes and plain features on the cut layer', () => {
    const dxf = exportEntitiesToDxf([plainHole('hole-1', { x: 10, y: 10 }, 8)]);
    const circle = findEntityPairs(splitDxfLines(dxf), 'CIRCLE');

    expect(circle.get('8')).toBe('0');
  });

  it('never kerf-compensates a drilled pilot hole', () => {
    const entities = [fastener('f1', 'hw-screw-8-32', { x: 120, y: 80 })];

    const plain = findEntityPairs(splitDxfLines(exportEntitiesToDxf(entities)), 'CIRCLE');
    const kerfed = findEntityPairs(splitDxfLines(exportEntitiesToDxf(entities, { kerf: 0.4 })), 'CIRCLE');

    expect(Number(plain.get('40'))).toBeCloseTo(1.5, 6);
    expect(Number(kerfed.get('40'))).toBeCloseTo(1.5, 6);
  });

  it('still shrinks an ordinary hole of the same size when kerf is on', () => {
    const entities = [plainHole('hole-1', { x: 120, y: 80 }, 3)];
    const kerfed = findEntityPairs(splitDxfLines(exportEntitiesToDxf(entities, { kerf: 0.4 })), 'CIRCLE');

    expect(Number(kerfed.get('40'))).toBeCloseTo(1.3, 6);
  });
});

describe('fastener legend', () => {
  it('indexes distinct catalog items and marks every placed fastener', () => {
    const legend = buildFastenerLegend([
      panel(),
      fastener('f1', 'hw-screw-8-32', { x: 100, y: 50 }, 'panel'),
      fastener('f2', 'hw-screw-8-32', { x: 200, y: 50 }, 'panel'),
      fastener('f3', 'hw-bolt-m6-40', { x: 300, y: 50 }, 'panel'),
    ]);

    expect(legend.items).toHaveLength(2);
    expect(legend.items[0]).toMatchObject({
      symbol: 'F1',
      hardwareId: 'hw-screw-8-32',
      name: '#8 x 32mm Wood Screw',
      pilotDiameter: 3,
      quantity: 2,
    });
    expect(legend.items[1]).toMatchObject({ symbol: 'F2', hardwareId: 'hw-bolt-m6-40', quantity: 1 });
    expect(formatFastenerLegendRow(legend.items[0])).toBe('F1 — #8 x 32mm Wood Screw, Ø3.0 pilot, ×2');

    expect(legend.marks.map((mark) => mark.symbol)).toEqual(['F1', 'F1', 'F2']);
    expect(legend.marks[0]).toMatchObject({ x: 100, y: 50, headRadius: 4 });
  });

  it('counts joinery hardware once but tags every drill site it produces', () => {
    const resolution = resolveSketchDocument(joineryDocument('pocket_screw', { count: 3 }));
    const legend = buildFastenerLegend(resolution.manufacturingExportEntities);

    // 3 pocket bores + 3 pilot holes, but only 3 screws.
    expect(legend.items).toHaveLength(1);
    expect(legend.items[0]).toMatchObject({ hardwareId: 'hw-pocket-screw-32-coarse', quantity: 3 });

    // Every drill site is tagged with the screw's symbol. The bore and its pilot
    // share a plan position, so they collapse into one tag standing for both
    // sites rather than printing "F1" twice on the same spot.
    expect(legend.marks).toHaveLength(3);
    expect(legend.marks.every((mark) => mark.symbol === 'F1')).toBe(true);
    expect(legend.marks.every((mark) => mark.joineryGenerated)).toBe(true);
    expect(legend.marks.map((mark) => mark.sites)).toEqual([2, 2, 2]);
    expect(new Set(legend.marks.map((mark) => `${mark.x},${mark.y}`)).size).toBe(3);
    // Tag clearance follows the widest hole at that position (the pocket bore).
    expect(legend.marks.every((mark) => mark.headRadius > 0)).toBe(true);
  });

  it('tags dowel holes in both parts with the same symbol', () => {
    const resolution = resolveSketchDocument(joineryDocument('dowel', { count: 2, dowelDiameter: 8 }));
    const legend = buildFastenerLegend(resolution.manufacturingExportEntities);

    expect(legend.items).toHaveLength(1);
    expect(legend.items[0]).toMatchObject({ hardwareId: 'hw-dowel-8-35', quantity: 2 });
    // One hole per part per dowel; the pair meets at the joint line, so each
    // dowel yields one tag standing for its two sites.
    expect(legend.marks).toHaveLength(2);
    expect(legend.marks.map((mark) => mark.symbol)).toEqual(['F1', 'F1']);
    expect(legend.marks.map((mark) => mark.sites)).toEqual([2, 2]);
  });

  it('indexes user fasteners and joinery hardware into one symbol table', () => {
    const resolution = resolveSketchDocument(joineryDocument('pocket_screw', { count: 2 }));
    const entities = [
      ...resolution.manufacturingExportEntities,
      fastener('f1', 'hw-screw-8-32', { x: 100, y: 100 }, 'panel'),
    ];
    const legend = buildFastenerLegend(entities);

    const symbols = legend.items.map((item) => item.symbol);
    expect(symbols).toEqual(['F1', 'F2']);
    expect(new Set(legend.items.map((item) => item.hardwareId))).toEqual(
      new Set(['hw-pocket-screw-32-coarse', 'hw-screw-8-32']),
    );

    const symbolOf = (hardwareId) => legend.items.find((item) => item.hardwareId === hardwareId).symbol;
    const userMarks = legend.marks.filter((mark) => !mark.joineryGenerated);
    expect(userMarks).toHaveLength(1);
    expect(userMarks[0].symbol).toBe(symbolOf('hw-screw-8-32'));
    const joineryMarks = legend.marks.filter((mark) => mark.joineryGenerated);
    expect(joineryMarks).toHaveLength(2);
    expect(joineryMarks.every((mark) => mark.symbol === symbolOf('hw-pocket-screw-32-coarse'))).toBe(true);
    expect(joineryMarks.reduce((sum, mark) => sum + mark.sites, 0)).toBe(4);
  });

  it('renders marks for a joinery-only document', () => {
    const resolution = resolveSketchDocument(joineryDocument('pocket_screw', { count: 2 }));
    const svg = exportEntitiesToSvg(resolution.manufacturingExportEntities);

    expect(svg).toContain('HARDWARE LEGEND');
    expect((svg.match(/>F1</g) || []).length).toBeGreaterThan(1);
  });

  it('returns nothing for a drawing without hardware', () => {
    expect(buildFastenerLegend([panel(), plainHole('hole-1', { x: 10, y: 10 }, 8)])).toMatchObject({
      items: [],
      marks: [],
    });
  });
});

describe('SVG and print callouts', () => {
  it('draws the index marks and legend block under the geometry', () => {
    const entities = [panel(), fastener('f1', 'hw-screw-8-32', { x: 100, y: 50 }, 'panel')];
    const svg = exportEntitiesToSvg(entities);

    expect(svg).toContain('HARDWARE LEGEND');
    expect(svg).toContain('>F1<');
    expect(svg).toContain('#8 x 32mm Wood Screw, Ø3.0 pilot, ×1');

    const withLegend = buildSvgExportDocument(entities);
    const withoutLegend = buildSvgExportDocument(entities, { hardwareLegend: false });

    expect(withLegend.bounds.height).toBeGreaterThan(withoutLegend.bounds.height);
    expect(withoutLegend.elements.join('\n')).not.toContain('HARDWARE LEGEND');
  });

  it('leaves hardware-free drawings byte-identical to the geometry document', () => {
    const document = buildSvgExportDocument([panel()]);

    expect(document.elements).toHaveLength(1);
    expect(document.legend.items).toHaveLength(0);
  });

  it('keeps the print ruler clear of the legend block', () => {
    const svg = buildPrintableSvg([panel(), fastener('f1', 'hw-screw-8-32', { x: 100, y: 50 }, 'panel')]);

    expect(svg).toContain('100mm ruler');
    expect(svg).toContain('HARDWARE LEGEND');
  });
});

describe('assembly hardware', () => {
  it('summarizes hardware and attaches it to the step of the part it fastens', () => {
    const assembly = generateAssemblySteps([
      panel(),
      fastener('f1', 'hw-screw-8-32', { x: 100, y: 50 }, 'panel'),
      fastener('f2', 'hw-screw-8-32', { x: 200, y: 50 }, 'panel'),
      fastener('f3', 'hw-bolt-m6-40', { x: 300, y: 250 }),
    ]);

    expect(assembly.hardware).toEqual([
      { hardwareId: 'hw-screw-8-32', name: '#8 x 32mm Wood Screw', kind: 'wood-screw', quantity: 2 },
      {
        hardwareId: 'hw-bolt-m6-40',
        name: 'M6 x 40mm Bolt with Nut and Washers',
        kind: 'machine-bolt',
        quantity: 1,
      },
    ]);
    expect(assembly.totalHardware).toBe(3);

    const summaryStep = assembly.steps.find((step) => step.title === 'Hardware needed');
    expect(summaryStep.description).toContain('2× #8 x 32mm Wood Screw');
    expect(summaryStep.description).toContain('1× M6 x 40mm Bolt with Nut and Washers');

    const partStep = assembly.steps.find((step) => step.parts.includes('panel'));
    expect(partStep.description).toContain('Attach with 2× #8 x 32mm Wood Screw');
    expect(partStep.description).not.toContain('Bolt');

    // The untargeted bolt cannot be tied to a part, so it gets its own step.
    const remainingStep = assembly.steps.find((step) => step.title === 'Install remaining hardware');
    expect(remainingStep.description).toContain('1× M6 x 40mm Bolt with Nut and Washers');
    expect(assembly.steps.map((step) => step.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it('reuses the BOM adapter dedupe for joinery fasteners', () => {
    const resolution = resolveSketchDocument(joineryDocument('pocket_screw', { count: 3 }));
    const assembly = generateAssemblySteps(resolution.manufacturingExportEntities);

    expect(assembly.hardware).toHaveLength(1);
    expect(assembly.hardware[0]).toMatchObject({ hardwareId: 'hw-pocket-screw-32-coarse', quantity: 3 });
    // The pocket bores are cut into the shelf, so the shelf's step carries them.
    const shelfStep = assembly.steps.find((step) => step.description.includes('Attach with 3×'));
    expect(shelfStep).toBeDefined();
  });

  it('leaves hardware-free projects with the original step sequence', () => {
    const assembly = generateAssemblySteps([panel()]);

    expect(assembly.hardware).toHaveLength(0);
    expect(assembly.totalHardware).toBe(0);
    expect(assembly.steps.map((step) => step.title)).toEqual(['Prepare Materials', 'Attach side piece', 'Finish']);
  });

  it('lists hardware in the text and HTML instruction exports', () => {
    const assembly = generateAssemblySteps([panel(), fastener('f1', 'hw-screw-8-32', { x: 100, y: 50 }, 'panel')]);

    expect(exportAssemblyToText(assembly)).toContain('HARDWARE NEEDED\n  1× #8 x 32mm Wood Screw');

    const html = generateAssemblyHtml(assembly, 'Shelf Unit');
    expect(html).toContain('<h2>Hardware needed</h2>');
    expect(html).toContain('#8 x 32mm Wood Screw');
    expect(html).toContain('1 fasteners');
  });
});

describe('nested sheet fasteners', () => {
  const SHEET = { width: 2440, height: 1220 };

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

  function firstCircle(dxf) {
    return findEntityPairs(splitDxfLines(dxf), 'CIRCLE');
  }

  it('drills a part-attached fastener at its transformed position on the sheet', () => {
    // Panel drawn far from the origin; nesting anchors it at (0, 0), so the
    // fastener's 100/50 offset inside the panel is what must survive.
    const entities = [
      panel({ id: 'p1', x: 1000, y: 500, width: 600, height: 300, materialId: 'ply' }),
      fastener('f1', 'hw-screw-8-32', { x: 1100, y: 550 }, 'p1'),
    ];
    const rows = [sheetRow({ partId: 'p1', entityIds: ['p1'], width: 600, height: 300 })];

    const files = exportNestedSheetsToDxf(entities, rows, { sheetSize: SHEET });
    const circle = firstCircle(files[0].content);

    expect(files[0].skippedFasteners).toBe(0);
    expect(circle).not.toBeNull();
    expect(circle.get('8')).toBe('HARDWARE');
    expect(Number(circle.get('10'))).toBeCloseTo(100, 6);
    expect(Number(circle.get('20'))).toBeCloseTo(-50, 6);
    expect(Number(circle.get('40'))).toBeCloseTo(1.5, 6);
  });

  it('rotates fastener positions with a turned placement', () => {
    // 300 x 600 portrait panel: the optimizer nests it landscape, so the part
    // and its fastener both take the quarter turn.
    const entities = [
      panel({ id: 'p1', x: 0, y: 0, width: 300, height: 600, materialId: 'ply' }),
      fastener('f1', 'hw-screw-8-32', { x: 50, y: 100 }, 'p1'),
    ];
    const rows = [sheetRow({ partId: 'p1', entityIds: ['p1'], width: 300, height: 600 })];

    const files = exportNestedSheetsToDxf(entities, rows, { sheetSize: SHEET });
    const circle = firstCircle(files[0].content);

    // (x, y) -> (-y, x) then translate by (+600, 0): (50, 100) -> (500, 50).
    expect(Number(circle.get('10'))).toBeCloseTo(500, 6);
    expect(Number(circle.get('20'))).toBeCloseTo(-50, 6);
    expect(circle.get('8')).toBe('HARDWARE');
  });

  it('skips and counts a fastener whose centre no longer lands on its part', () => {
    const entities = [
      panel({ id: 'p1', x: 0, y: 0, width: 600, height: 300, materialId: 'ply' }),
      // Stale target: the panel was moved out from under this fastener.
      fastener('f1', 'hw-screw-8-32', { x: 2000, y: 2000 }, 'p1'),
      fastener('f2', 'hw-screw-8-32', { x: 120, y: 80 }, 'p1'),
    ];
    const rows = [sheetRow({ partId: 'p1', entityIds: ['p1'], width: 600, height: 300 })];

    const files = exportNestedSheetsToDxf(entities, rows, { sheetSize: SHEET });

    expect(files[0].skippedFasteners).toBe(1);
    expect((files[0].content.match(/\nCIRCLE\n/g) || []).length).toBe(1);
    expect(Number(firstCircle(files[0].content).get('10'))).toBeCloseTo(120, 6);
  });

  it('never kerf-compensates a nested pilot hole', () => {
    const entities = [
      panel({ id: 'p1', x: 0, y: 0, width: 600, height: 300, materialId: 'ply' }),
      fastener('f1', 'hw-screw-8-32', { x: 120, y: 80 }, 'p1'),
    ];
    const rows = [sheetRow({ partId: 'p1', entityIds: ['p1'], width: 600, height: 300 })];

    const files = exportNestedSheetsToDxf(entities, rows, { sheetSize: SHEET, kerf: 1 });

    expect(Number(firstCircle(files[0].content).get('40'))).toBeCloseTo(1.5, 6);
  });

  it('gives each copy of a grouped row only its own fasteners', () => {
    const entities = [
      panel({ id: 'p1', x: 0, y: 0, width: 400, height: 200, materialId: 'ply' }),
      panel({ id: 'p2', x: 0, y: 400, width: 400, height: 200, materialId: 'ply' }),
      fastener('f1', 'hw-screw-8-32', { x: 100, y: 500 }, 'p2'),
    ];
    const rows = [sheetRow({ partId: 'p1', entityIds: ['p1', 'p2'], width: 400, height: 200, quantity: 2 })];

    const files = exportNestedSheetsToDxf(entities, rows, { sheetSize: SHEET });
    const allContent = files.map((file) => file.content).join('\n');

    expect((allContent.match(/\nCIRCLE\n/g) || []).length).toBe(1);
  });

  it('leaves fastener-free sheets exactly as they were', () => {
    const entities = [panel({ id: 'p1', x: 0, y: 0, width: 600, height: 300, materialId: 'ply' })];
    const rows = [sheetRow({ partId: 'p1', entityIds: ['p1'], width: 600, height: 300 })];

    const files = exportNestedSheetsToDxf(entities, rows, { sheetSize: SHEET });

    expect(files[0].skippedFasteners).toBe(0);
    expect(files[0].content).not.toContain('\nCIRCLE\n');
  });
});

describe('assembly panel and workshop package parity', () => {
  function parityDocument() {
    const base = joineryDocument('pocket_screw', { count: 3 });
    return {
      ...base,
      entities: [...base.entities, fastener('f1', 'hw-screw-8-32', { x: 100, y: 100 }, 'panel')],
    };
  }

  it('reports the same hardware from the sidebar input and the ZIP', () => {
    const resolution = resolveSketchDocument(parityDocument());
    const documentEntities = resolution.document.entities;
    const manufacturing = resolution.manufacturingExportEntities;

    // What SketchStudioLayout hands the assembly panel.
    const panelAssembly = generateAssemblySteps(buildBomEntityList(documentEntities, manufacturing));
    const contents = buildWorkshopPackageContents(manufacturing, [], 0, {}, 'Parity', {
      referenceEntities: documentEntities,
    });
    const html = contents.files.find((file) => file.name === 'assembly-instructions.html').content;

    expect(panelAssembly.hardware.map((item) => item.hardwareId).sort()).toEqual([
      'hw-pocket-screw-32-coarse',
      'hw-screw-8-32',
    ]);
    expect(panelAssembly.totalHardware).toBe(4);

    // Every line of the panel's summary appears verbatim in the packaged HTML.
    panelAssembly.hardware.forEach((item) => {
      expect(html).toContain(`${item.quantity}&times;</span> ${item.name}`);
    });
    expect(html).toContain('4 fasteners');
  });

  it('counts the document parts once even though the manufacturing set clones them', () => {
    const resolution = resolveSketchDocument(parityDocument());
    const manufacturing = resolution.manufacturingExportEntities;
    const assembly = generateAssemblySteps(buildBomEntityList(resolution.document.entities, manufacturing));

    // Panel + shelf, not their clones or the generated cut profiles.
    expect(assembly.totalParts).toBe(2);

    const contents = buildWorkshopPackageContents(manufacturing, [], 0, {}, 'Parity', {
      referenceEntities: resolution.document.entities,
    });
    expect(contents.files.find((file) => file.name === 'assembly-instructions.html').content).toContain('2 parts');
  });

  it('would have missed joinery hardware with the old document-only input', () => {
    const resolution = resolveSketchDocument(parityDocument());
    const stale = generateAssemblySteps(resolution.document.entities);

    expect(stale.hardware.map((item) => item.hardwareId)).toEqual(['hw-screw-8-32']);
  });
});

describe('workshop package hardware', () => {
  it('carries the hardware layer, legend and assembly section through the ZIP contents', () => {
    const entities = [panel(), fastener('f1', 'hw-screw-8-32', { x: 100, y: 50 }, 'panel')];
    const bomRows = [
      {
        partId: 'panel',
        partName: 'Side panel',
        role: 'rect',
        material: 'birch-plywood-18',
        materialName: '18mm Birch Plywood',
        thickness: 18,
        width: 400,
        height: 300,
        quantity: 1,
        dimensionAccuracy: 'exact',
        costAccuracy: 'exact',
      },
      {
        partId: 'f1',
        partName: '#8 x 32mm Wood Screw',
        role: 'hardware',
        material: 'hw-screw-8-32',
        materialName: '#8 x 32mm Wood Screw',
        stockKind: 'piece',
        costBasis: 'perPiece',
        quantity: 1,
        dimensionAccuracy: 'exact',
        costAccuracy: 'exact',
      },
    ];

    const contents = buildWorkshopPackageContents(entities, bomRows, 1.2, {}, 'Shelf Unit');
    const read = (name) => contents.files.find((file) => file.name === name)?.content;

    expect(contents.errors).toHaveLength(0);
    expect(read('Shelf Unit.dxf')).toContain('HARDWARE');
    expect(read('Shelf Unit.svg')).toContain('HARDWARE LEGEND');
    expect(read('cutting-list.html')).toContain('<h2>Hardware</h2>');
    expect(read('assembly-instructions.html')).toContain('<h2>Hardware needed</h2>');

    // The part's own fastener is repeated on its nested sheet.
    const sheet = read('sheets/sheet-01.dxf');
    expect(sheet).toContain('HARDWARE');
    expect(Number(findEntityPairs(splitDxfLines(sheet), 'CIRCLE').get('40'))).toBeCloseTo(1.5, 6);

    const readme = read('README.txt');
    expect(readme).toContain('layer HARDWARE');
    expect(readme).toContain('1 fastener(s) across 1 catalog item(s)');
    expect(readme).toContain('kerf compensation is never applied');
    expect(readme).toContain("sheets/ repeats each part's own fasteners");
    expect(readme).not.toContain('WARNING:');
  });

  it('warns in the README when a stale fastener is left off the nested sheets', () => {
    const entities = [panel(), fastener('f1', 'hw-screw-8-32', { x: 5000, y: 5000 }, 'panel')];
    const bomRows = [
      {
        partId: 'panel',
        partName: 'Side panel',
        role: 'rect',
        material: 'birch-plywood-18',
        materialName: '18mm Birch Plywood',
        thickness: 18,
        width: 400,
        height: 300,
        quantity: 1,
      },
      {
        partId: 'f1',
        partName: '#8 x 32mm Wood Screw',
        role: 'hardware',
        material: 'hw-screw-8-32',
        materialName: '#8 x 32mm Wood Screw',
        stockKind: 'piece',
        costBasis: 'perPiece',
        quantity: 1,
      },
    ];

    const contents = buildWorkshopPackageContents(entities, bomRows, 0.1, {}, 'Stale');
    const readme = contents.files.find((file) => file.name === 'README.txt').content;

    expect(readme).toContain('WARNING: 1 fastener(s) were left off the nested sheets');
    expect(contents.files.find((file) => file.name === 'sheets/sheet-01.dxf').content).not.toContain('\nCIRCLE\n');
  });
});
