/**
 * End-to-end proof of the fabrication composition order:
 *
 *   joint fit (geometry) -> kerf compensation -> dogbone corner relief
 *
 * A tab-and-slot joint is resolved into real manufacturing geometry, exported to
 * DXF with all three passes active, and the resulting toolpath is measured. Each
 * stage is also exported alone so the test can attribute every millimetre.
 */

import { describe, expect, it } from 'vitest';
import { exportEntitiesToDxf } from '../export/dxfExport';
import { DOGBONE_STYLES } from '../export/dogboneUtils';
import { exportNestedSheetsToDxf } from '../export/nestedDxfExport';
import { generateAssemblySteps } from '../utils/assemblyGenerator';
import { generateAssemblyHtml } from '../export/assemblyHtmlExport';
import { createSketchJoint, resolveSketchJoinery } from '../../utils/sketchJoineryUtils';

const BIT_DIAMETER = 6.35;
const BIT_RADIUS = BIT_DIAMETER / 2;
const KERF = 0.4;
/** Wall bite of a 90-degree bisector dogbone: 2 * r * cos(45deg) = r * sqrt(2). */
const CORNER_BITE = BIT_RADIUS * Math.SQRT2;

const PANEL = {
  id: 'panel',
  type: 'rect',
  x: 0,
  y: 0,
  width: 200,
  height: 120,
  rotation: 0,
  thickness: 18,
  materialId: 'birch-plywood-18',
  layerId: 'default',
  meta: { label: 'Side panel' },
};

const BACK = {
  id: 'back',
  type: 'rect',
  x: 50,
  y: -18,
  width: 100,
  height: 18,
  rotation: 0,
  thickness: 18,
  materialId: 'birch-plywood-18',
  layerId: 'default',
  meta: { label: 'Back panel' },
};

function buildTabSlotJoint(tolerance = undefined) {
  return createSketchJoint({
    id: 'joint-tabs',
    type: 'tab_slot',
    sourcePartId: 'back',
    targetPartId: 'panel',
    sourceEdgeRef: { entityId: 'back', sourceType: 'segment', sourceKey: 'bottom' },
    targetEdgeRef: { entityId: 'panel', sourceType: 'segment', sourceKey: 'top' },
    parameters: { count: 2, tabWidth: 20, spacing: 10, edgeOffset: 10, depth: 9 },
    ...(tolerance ? { tolerance } : {}),
  });
}

function resolve(tolerance) {
  return resolveSketchJoinery([PANEL, BACK], [buildTabSlotJoint(tolerance)]);
}

/** The generated cut profile for the slotted panel. */
function getPanelProfile(resolution) {
  return resolution.exportEntities.find((entity) => entity.id === 'joinery-profile-panel');
}

/**
 * LWPOLYLINE vertices from the ENTITIES section, with their bulge when present.
 * The header's $EXTMIN/$EXTMAX are also 10/20 pairs, so the scan starts after
 * the section marker.
 */
function readPolylineVertices(dxf) {
  const allLines = dxf.split('\n').map((line) => line.trim());
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

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Width of the first slot notch, measured across the profile at cut depth. */
function measureFirstSlotWidth(profile) {
  // Profile walks the top edge left to right, dropping into each slot:
  //   ... (entry, 0) (entry, depth) (exit, depth) (exit, 0) ...
  const depthPoints = profile.points.filter((point) => Math.abs(point.y) > 1e-9 && Math.abs(point.y) < 20);
  return Math.abs(depthPoints[1].x - depthPoints[0].x);
}

describe('fit -> kerf -> dogbone composition', () => {
  it('resolves the female slot to nominal width when the joint has no fit', () => {
    const profile = getPanelProfile(resolve(undefined));
    expect(measureFirstSlotWidth(profile)).toBeCloseTo(20, 9);
  });

  it('widens only the slot by the fit clearance, leaving the tab nominal', () => {
    const legacy = resolve(undefined);
    const glue = resolve({ fit: 'glue' });

    expect(measureFirstSlotWidth(getPanelProfile(glue))).toBeCloseTo(20.1, 9);

    // The male tabs live on the back panel's own generated profile and must be
    // byte-for-byte where they were.
    const legacyBack = legacy.exportEntities.find((entity) => entity.id === 'joinery-profile-back');
    const glueBack = glue.exportEntities.find((entity) => entity.id === 'joinery-profile-back');
    expect(glueBack.points).toEqual(legacyBack.points);
  });

  it('subtracts the kerf from the fitted slot, in that order', () => {
    // Fit widens the finished opening; kerf then pulls the toolpath back by
    // halfKerf on each wall so the finished opening lands at the fitted size.
    // Measured on the panel profile alone, so the mating tabs cannot confuse
    // the reading.
    const panelOnly = [getPanelProfile(resolve({ fit: 'glue' }))];
    const fitOnly = readPolylineVertices(exportEntitiesToDxf(panelOnly));
    const fitAndKerf = readPolylineVertices(exportEntitiesToDxf(panelOnly, { kerf: KERF }));

    // Points at the BOTTOM of a notch: ~9mm deep, well clear of the top edge
    // (which kerf compensation nudges to ~0.2mm) and of the 120mm far edge.
    const slotWidth = (vertices) => {
      const atDepth = vertices.filter((vertex) => Math.abs(vertex.y) > 1 && Math.abs(vertex.y) < 20);
      return Math.abs(atDepth[1].x - atDepth[0].x);
    };

    expect(slotWidth(fitOnly)).toBeCloseTo(20.1, 6);
    expect(slotWidth(fitAndKerf)).toBeCloseTo(20.1 - KERF, 6);
  });

  it('relieves the concave corners of BOTH mating parts', () => {
    // The slots in the panel and the recesses between the tabs on the back are
    // both regions a round bit has to be able to reach into.
    const resolution = resolve({ fit: 'glue' });
    const vertices = readPolylineVertices(
      exportEntitiesToDxf(resolution.exportEntities, {
        kerf: KERF,
        dogbone: { style: DOGBONE_STYLES.DOGBONE, bitDiameter: BIT_DIAMETER },
      }),
    );

    expect(vertices.filter((vertex) => vertex.bulge !== undefined)).toHaveLength(8);
  });

  it('relieves the slot corners on the KERF-COMPENSATED path, not the design path', () => {
    const panelOnly = [getPanelProfile(resolve({ fit: 'glue' }))];
    const dogbone = { style: DOGBONE_STYLES.DOGBONE, bitDiameter: BIT_DIAMETER };

    const kerfOnly = readPolylineVertices(exportEntitiesToDxf(panelOnly, { kerf: KERF }));
    const allThree = readPolylineVertices(exportEntitiesToDxf(panelOnly, { kerf: KERF, dogbone }));

    // Two slots, two unreachable corners each: the deep corners where the panel
    // material wraps around the bottom of the notch.
    const bulged = allThree.filter((vertex) => vertex.bulge !== undefined);
    expect(bulged).toHaveLength(4);
    bulged.forEach((vertex) => expect(Math.abs(vertex.bulge)).toBeCloseTo(1, 9));
    expect(allThree).toHaveLength(kerfOnly.length + 4);

    // Every corner that disappeared was replaced by an entry/exit pair sitting
    // exactly one wall bite away from it - measured against the KERFED corner,
    // which is what proves the relief ran after kerf compensation.
    const isSame = (a, b) => distance(a, b) < 1e-6;
    const removedCorners = kerfOnly.filter((corner) => !allThree.some((vertex) => isSame(vertex, corner)));
    expect(removedCorners).toHaveLength(4);

    removedCorners.forEach((corner) => {
      const neighbours = allThree.filter((vertex) => Math.abs(distance(vertex, corner) - CORNER_BITE) < 1e-6);
      expect(neighbours).toHaveLength(2);
      // The corner is on the relief circle: the two cut ends and the corner are
      // all r away from the same centre, so the bit sweep covers the corner.
      const chord = distance(neighbours[0], neighbours[1]);
      expect(chord).toBeCloseTo(2 * BIT_RADIUS, 6);
    });
  });

  it('changes the toolpath only when a pass is switched on', () => {
    const resolution = resolve(undefined);
    const baseline = exportEntitiesToDxf(resolution.exportEntities);

    expect(exportEntitiesToDxf(resolution.exportEntities, {})).toBe(baseline);
    expect(exportEntitiesToDxf(resolution.exportEntities, { dogbone: { style: DOGBONE_STYLES.NONE } })).toBe(baseline);
    expect(exportEntitiesToDxf(resolution.exportEntities, { kerf: 0 })).toBe(baseline);
  });

  it('composes the same three passes through the nested per-sheet export', () => {
    const resolution = resolve({ fit: 'glue' });
    const bomRows = [
      {
        partId: 'panel',
        entityIds: ['panel'],
        partName: 'Side panel',
        material: 'birch-plywood-18',
        materialName: '18mm Birch Plywood',
        width: 200,
        height: 120,
        quantity: 1,
        stockKind: 'sheet',
        costBasis: 'perM2',
        hasGrain: true,
        grainAngle: 0,
      },
    ];

    const [sheet] = exportNestedSheetsToDxf(resolution.exportEntities, bomRows, {
      kerf: KERF,
      dogbone: { style: DOGBONE_STYLES.DOGBONE, bitDiameter: BIT_DIAMETER },
      sheetSize: { width: 2440, height: 1220 },
      bladeKerf: 3,
    });

    expect(sheet.filename).toBe('sheet-01.dxf');
    // Corner relief survived the placement transform...
    expect(readPolylineVertices(sheet.content).filter((vertex) => vertex.bulge !== undefined)).toHaveLength(4);
    // ...and the grain-locked part is annotated on its own non-cutting layer.
    expect(sheet.content).toContain('GRAIN');
  });
});

describe('fit documentation', () => {
  it('records the fit on the generated geometry so assembly can quote it', () => {
    const profile = getPanelProfile(resolve({ fit: 'glue' }));
    const fits = profile.meta.joinery.fits;

    expect(fits).toHaveLength(1);
    expect(fits[0]).toMatchObject({ jointId: 'joint-tabs', jointType: 'tab_slot', fit: 'glue', clearanceMm: 0.1 });
  });

  it('puts a per-joint fit note in the assembly steps and HTML', () => {
    const assembly = generateAssemblySteps(resolve({ fit: 'loose' }).exportEntities);

    expect(assembly.jointFits).toHaveLength(1);
    expect(assembly.steps.some((step) => step.type === 'fit')).toBe(true);

    const html = generateAssemblyHtml(assembly, 'Fit Test');
    expect(html).toContain('Joint fits');
    expect(html).toContain('joint-tabs');
    expect(html).toContain('female opening widened by 0.3mm');
  });

  it('omits the fit section entirely for a document with no fitted joints', () => {
    const assembly = generateAssemblySteps(resolve(undefined).exportEntities);

    // A legacy joint still reports its (zero-clearance) standard fit, which is
    // honest documentation; a document with no joinery at all reports nothing.
    const plain = generateAssemblySteps([PANEL]);
    expect(plain.jointFits).toHaveLength(0);
    expect(generateAssemblyHtml(plain, 'Plain')).not.toContain('Joint fits');
    expect(assembly.jointFits[0].clearanceMm).toBe(0);
  });
});
