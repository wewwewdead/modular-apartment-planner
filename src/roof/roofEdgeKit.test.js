import { describe, expect, it } from 'vitest';
import { createRoofSystem, createRoofSystemForProject } from '@/domain/roofModels';
import { createTrussSystem } from '@/domain/trussModels';
import { buildRoofPlaneGeometry } from '@/geometry/roofPlaneGeometry';
import { buildRoofPreviewObjects } from '@/geometry/roof3dGeometry';
import {
  buildRoofEdgeKitLayout,
  buildRoofEdgeKitObjects,
  buildRoofEdgeKitQuantities,
  describeRoofTrims,
  resolveRoofBearingOutline,
} from './roofEdgeKit';

// Layout line along +x for 10 m, trusses spanning 8 m across y with no tails
// of their own: the roof's 300 overhang is what makes the eaves. Roof outline
// 10.6 × 8.6 m over a 10 × 8 m bearing rectangle.
function createGableTrussSystem() {
  return createTrussSystem('Gable System', {
    floorId: 'floor_1',
    baseElevation: 3000,
    trussInstances: [
      {
        trussTypeId: 'truss_type_gable',
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 10000, y: 0 },
        span: 8000,
        rise: 1000,
        spacing: 2000,
        count: 6,
        overhangs: { start: 0, end: 0 },
      },
    ],
  });
}

function attachedGableFixture() {
  const trussSystem = createGableTrussSystem();
  const project = {
    floors: [{ id: 'floor_1', name: 'Ground', elevation: 0, height: 3000, walls: [] }],
    trussSystems: [trussSystem],
  };
  const roofSystem = createRoofSystemForProject(project, { pitch: { overhang: 300 } });
  const context = {
    trussSystem,
    bearingOutline: resolveRoofBearingOutline(roofSystem, trussSystem),
    groundElevation: 0,
  };
  return { trussSystem, roofSystem, context };
}

function byPart(descriptors, part) {
  return descriptors.filter((descriptor) => descriptor.metadata?.part === part);
}

const rectangle = (width, depth) => [
  { x: 0, y: 0 },
  { x: width, y: 0 },
  { x: width, y: depth },
  { x: 0, y: depth },
];

describe('the roof-edge kit on an attached gable roof', () => {
  const { roofSystem, context } = attachedGableFixture();
  const roofGeometry = buildRoofPlaneGeometry(roofSystem);
  const descriptors = buildRoofEdgeKitObjects(roofSystem, roofGeometry, context);

  it('is a pitched, trimmed roof to begin with', () => {
    expect(roofSystem.roofType).toBe('gable');
    expect(roofSystem.trims.fascia.enabled).toBe(true);
  });

  it('puts a fascia and a gutter on each eave, and two barge boards on each gable', () => {
    expect(byPart(descriptors, 'fascia')).toHaveLength(2);
    expect(byPart(descriptors, 'gutter')).toHaveLength(2);
    // Each gable end runs eave → ridge → eave: two sloped boards.
    expect(byPart(descriptors, 'barge')).toHaveLength(4);
    expect(byPart(descriptors, 'ridgeCap')).toHaveLength(2);
    expect(byPart(descriptors, 'bargeCap')).toHaveLength(0);
  });

  it('lines the overhang band behind each fascia with a boxed soffit', () => {
    const soffits = byPart(descriptors, 'soffit');
    expect(soffits).toHaveLength(2);
    expect(soffits.every((descriptor) => descriptor.geometry === 'prism')).toBe(true);
    const layout = buildRoofEdgeKitLayout(roofSystem, roofGeometry, context);
    const area = layout.soffits.reduce((sum, soffit) => sum + soffit.area, 0);
    expect(area / 1_000_000).toBeCloseTo(2 * 10.6 * 0.3, 3);
  });

  it('hangs each fascia from the roof underside at the eave', () => {
    const layout = buildRoofEdgeKitLayout(roofSystem, roofGeometry, context);
    for (const fascia of layout.fascias) {
      const eavePoint = { x: fascia.topStart.x, y: fascia.topStart.z };
      expect(fascia.topStart.y).toBeCloseTo(roofGeometry.getSurfaceElevation(eavePoint, 'bottom'), 6);
      expect(fascia.topEnd.y).toBeCloseTo(fascia.topStart.y, 6);
    }
    // The board's centre is half its depth below that, and its outer face is
    // flush with the roof edge (centre half a thickness inside it).
    const fascia = byPart(descriptors, 'fascia')[0];
    const top = layout.fascias[0].topStart.y;
    expect(fascia.start.y).toBeCloseTo(top - 100, 6);
    expect(fascia.crossSection).toEqual({ height: 200, width: 25 });
    expect(fascia.bounds.maxElevation).toBeCloseTo(top, 6);
  });

  it('runs the barge boards up the rake, plumb, with the top on the roof underside', () => {
    const layout = buildRoofEdgeKitLayout(roofSystem, roofGeometry, context);
    for (const barge of layout.barges) {
      const startPoint = { x: barge.topStart.x, y: barge.topStart.z };
      const endPoint = { x: barge.topEnd.x, y: barge.topEnd.z };
      expect(barge.topStart.y).toBeCloseTo(roofGeometry.getSurfaceElevation(startPoint, 'bottom'), 6);
      expect(barge.topEnd.y).toBeCloseTo(roofGeometry.getSurfaceElevation(endPoint, 'bottom'), 6);
      expect(Math.abs(barge.topEnd.y - barge.topStart.y)).toBeGreaterThan(500);
    }
    // `up` is world-up squared to the rake: no sideways lean.
    for (const descriptor of byPart(descriptors, 'barge')) {
      const { up, start, end } = descriptor;
      const along = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
      expect(up.x * along.x + up.y * along.y + up.z * along.z).toBeCloseTo(0, 6);
      expect(up.y).toBeGreaterThan(0.9);
    }
  });

  it('lays the ridge capping on the two slopes, one strip a side', () => {
    const [a, b] = byPart(descriptors, 'ridgeCap');
    expect(a.crossSection).toEqual({ height: 8, width: 175 });
    // Mirror images across the ridge: the up vectors lean opposite ways.
    expect(Math.sign(a.up.z)).toBe(-Math.sign(b.up.z));
    expect(a.up.y).toBeGreaterThan(0.9);
  });

  it('drops a downpipe from each gutter to just above the ground floor', () => {
    const pipes = byPart(descriptors, 'downpipe');
    expect(pipes).toHaveLength(2);
    for (const pipe of pipes) {
      expect(pipe.geometry).toBe('box');
      expect(pipe.baseElevation).toBe(150);
      expect(pipe.size.x).toBe(90);
    }
  });

  it('gives every descriptor a stable id, the roof as its source, and bounds', () => {
    const again = buildRoofEdgeKitObjects(roofSystem, roofGeometry, context);
    expect(again.map((descriptor) => descriptor.id)).toEqual(descriptors.map((descriptor) => descriptor.id));
    expect(new Set(descriptors.map((descriptor) => descriptor.id)).size).toBe(descriptors.length);
    for (const descriptor of descriptors) {
      expect(descriptor.kind).toBe('roofSystem');
      expect(descriptor.metadata.sourceId).toBe(roofSystem.id);
      expect(descriptor.materialKey).toMatch(/^roof/);
      expect(Number.isFinite(descriptor.bounds.minElevation)).toBe(true);
      expect(descriptor.bounds.maxX).toBeGreaterThanOrEqual(descriptor.bounds.minX);
    }
    // Ids are built from the roof id and the outline edge index.
    for (const descriptor of byPart(descriptors, 'fascia')) {
      expect(descriptor.id.startsWith(`${roofSystem.id}-fascia-`)).toBe(true);
      expect(descriptor.id.slice(`${roofSystem.id}-fascia-`.length)).toMatch(/^[0-9]+$/);
    }
  });

  it('is appended to the roof preview objects, with the body in the covering family', () => {
    const objects = buildRoofPreviewObjects(roofSystem, context);
    expect(objects[0].materialKey).toBe('roof_metal');
    expect(byPart(objects, 'fascia')).toHaveLength(2);
  });

  it('follows the switches', () => {
    const bare = {
      ...roofSystem,
      trims: {
        ...roofSystem.trims,
        fascia: { ...roofSystem.trims.fascia, enabled: false },
        soffit: { ...roofSystem.trims.soffit, mode: 'raked' },
        bargeCap: { ...roofSystem.trims.bargeCap, enabled: true },
      },
    };
    const objects = buildRoofEdgeKitObjects(bare, roofGeometry, context);
    expect(byPart(objects, 'fascia')).toHaveLength(0);
    expect(byPart(objects, 'bargeCap')).toHaveLength(4);
    const raked = byPart(objects, 'soffit');
    expect(raked.every((descriptor) => descriptor.geometry === 'roofMesh')).toBe(true);
    // The raked lining sits just under the roof body, following its slope.
    for (const descriptor of raked) {
      for (const point of descriptor.surfaces[0].outline) {
        expect(point.topElevation).toBeCloseTo(roofGeometry.getSurfaceElevation(point, 'bottom') - 1, 6);
      }
    }
    expect(describeRoofTrims(bare)).toBe('Barge · Gutter · Downpipes · Ridge cap · Barge cap · Raked soffit');
  });

  it('measures the trims for the takeoff', () => {
    const quantities = buildRoofEdgeKitQuantities(roofSystem, context);
    expect(quantities.fasciaLm).toBeCloseTo(2 * 10.6, 3);
    expect(quantities.gutterLm).toBeCloseTo(2 * 10.6, 3);
    expect(quantities.downpipeCount).toBe(2);
    expect(quantities.ridgeCapLm).toBeCloseTo(10.6, 3);
    expect(quantities.soffitM2).toBeCloseTo(6.36, 3);
    // Four rakes, each the sloped length from eave to ridge.
    const run = 4300;
    const rise = (roofSystem.pitch.slope / 100) * run;
    expect(quantities.bargeLm).toBeCloseTo((4 * Math.hypot(run, rise)) / 1000, 2);
  });
});

describe('the roof-edge kit on other roof shapes', () => {
  it('puts a fascia on the high edge of a shed roof, and gutters only on the low eave', () => {
    const roofSystem = createRoofSystem('Shed', {
      id: 'roof_shed',
      roofType: 'shed',
      boundaryPolygon: rectangle(6000, 4000),
      baseElevation: 3000,
      pitch: { slope: 10, overhang: 300, direction: { x: 0, y: 1 } },
    });
    const layout = buildRoofEdgeKitLayout(roofSystem, null, { groundElevation: 0 });
    const roles = layout.fascias.map((fascia) => fascia.run.role).sort();
    expect(roles).toEqual(['high_edge', 'low_eave']);
    expect(layout.gutters.map((gutter) => gutter.run.role)).toEqual(['low_eave']);
    expect(layout.barges).toHaveLength(2);
    // A shed has no ridge.
    expect(layout.ridgeCaps).toHaveLength(0);
  });

  it('gives a flat roof nothing at all', () => {
    const roofSystem = createRoofSystem('Flat', {
      id: 'roof_flat',
      roofType: 'flat',
      boundaryPolygon: rectangle(6000, 4000),
    });
    expect(buildRoofEdgeKitObjects(roofSystem, null, { groundElevation: 0 })).toEqual([]);
    expect(describeRoofTrims(roofSystem)).toBe('None (flat roof)');
  });

  it('even when a flat roof has trims switched on', () => {
    const roofSystem = createRoofSystem('Flat', {
      id: 'roof_flat',
      roofType: 'flat',
      boundaryPolygon: rectangle(6000, 4000),
      trims: { fascia: { enabled: true }, gutter: { enabled: true } },
    });
    expect(buildRoofEdgeKitObjects(roofSystem, null, { groundElevation: 0 })).toEqual([]);
  });

  it('treats the level ends of a detached hip roof as eaves, closing the gutter corners', () => {
    const roofSystem = createRoofSystem('Hip', {
      id: 'roof_hip',
      roofType: 'hip',
      boundaryPolygon: rectangle(10000, 8000),
      baseElevation: 3000,
      pitch: { slope: 25, overhang: 450, direction: { x: 0, y: 1 } },
    });
    const layout = buildRoofEdgeKitLayout(roofSystem, null, { groundElevation: 0 });
    expect(layout.fascias).toHaveLength(4);
    expect(layout.barges).toHaveLength(0);
    expect(layout.gutters).toHaveLength(4);
    // Each gutter runs on past both corners by its own width.
    for (const gutter of layout.gutters) {
      const planLength = Math.hypot(gutter.end.x - gutter.start.x, gutter.end.z - gutter.start.z);
      expect(planLength).toBeCloseTo(gutter.length + 2 * 115, 3);
    }
    // Four soffit bands, the corners kept by one band each: the lining area is
    // the outline minus the bearing rectangle.
    const area = layout.soffits.reduce((sum, soffit) => sum + soffit.area, 0);
    expect(area).toBeCloseTo(10900 * 8900 - 10000 * 8000, -2);
  });
});

// RT-4 (spec §7.9.3.2): a hip's soffit starts at the SUPPORT line (the end
// wall), not at the first/last copy; gable/shed keep the copy range. Layout
// 0 → 12 000 along x, span 7200 across y, 300 tails, roof overhang 510.
describe('the bearing outline of an attached hip roof (RT-4)', () => {
  function seatingTrussSystem(trussTypeId, instance = {}) {
    return createTrussSystem('Seating System', {
      id: 'ts_seat',
      floorId: 'floor_1',
      baseElevation: 3000,
      purlinSystem: { enabled: true, depth: 50, width: 75, spacing: 900 },
      trussInstances: [
        {
          trussTypeId,
          startPoint: { x: 0, y: 0 },
          endPoint: { x: 12000, y: 0 },
          span: 7200,
          rise: 900,
          spacing: 1200,
          count: 11,
          overhangs: { start: 300, end: 300 },
          ...instance,
        },
      ],
    });
  }

  function extent(points) {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }

  function expectExtent(points, minX, maxX, minY, maxY) {
    const box = extent(points);
    expect(box.minX).toBeCloseTo(minX, 6);
    expect(box.maxX).toBeCloseTo(maxX, 6);
    expect(box.minY).toBeCloseTo(minY, 6);
    expect(box.maxY).toBeCloseTo(maxY, 6);
  }

  it('is the support line by the bearings: 0 … 12 000 along the layout, ±3600 across', () => {
    const trussSystem = seatingTrussSystem('truss_type_hip');
    const roofSystem = createRoofSystemForProject({ trussSystems: [trussSystem] }, { pitch: { overhang: 510 } });
    expect(roofSystem.roofType).toBe('hip');
    expectExtent(resolveRoofBearingOutline(roofSystem, trussSystem), 0, 12000, -3600, 3600);
  });

  it('lines the whole overhang band with soffit: hip ends as deep as the sides (300 + 510)', () => {
    const trussSystem = seatingTrussSystem('truss_type_hip');
    const roofSystem = createRoofSystemForProject({ trussSystems: [trussSystem] }, { pitch: { overhang: 510 } });
    const roofGeometry = buildRoofPlaneGeometry(roofSystem);
    expectExtent(roofGeometry.roofOutline, -810, 12810, -4410, 4410);
    const context = {
      trussSystem,
      bearingOutline: resolveRoofBearingOutline(roofSystem, trussSystem),
      groundElevation: 0,
    };
    const layout = buildRoofEdgeKitLayout(roofSystem, roofGeometry, context);
    expect(layout.soffits).toHaveLength(4);
    const area = layout.soffits.reduce((sum, soffit) => sum + soffit.area, 0);
    expect(area).toBeCloseTo((12000 + 2 * 810) * (7200 + 2 * 810) - 12000 * 7200, -2);
  });

  it('reads the line, not the copies, for a hip; a gable keeps the copy range', () => {
    const offsetCopies = { supportOffsetAlongAxis: 450, count: 10 };
    const hip = seatingTrussSystem('truss_type_hip', offsetCopies);
    const hipRoof = createRoofSystemForProject({ trussSystems: [hip] }, { pitch: { overhang: 510 } });
    expectExtent(resolveRoofBearingOutline(hipRoof, hip), 0, 12000, -3600, 3600);

    const gable = seatingTrussSystem('truss_type_gable', offsetCopies);
    const gableRoof = createRoofSystemForProject({ trussSystems: [gable] }, { pitch: { overhang: 510 } });
    expect(gableRoof.roofType).toBe('gable');
    expectExtent(resolveRoofBearingOutline(gableRoof, gable), 450, 11250, -3600, 3600);
  });
});

describe('the roof-edge kit in elevation and section', () => {
  async function detachedGable() {
    return createRoofSystem('Gable', {
      id: 'roof_gable',
      roofType: 'gable',
      boundaryPolygon: rectangle(10000, 8000),
      baseElevation: 3000,
      // Ridge along x, eaves on the y = const edges.
      pitch: { slope: 25, overhang: 300, direction: { x: 0, y: 1 } },
    });
  }

  it('draws the eave fascia as a band under the roof and the gutter as a line pair', async () => {
    const { buildRoofElevationElements } = await import('@/geometry/roofElevationGeometry');
    const { getElevationView } = await import('@/elevations/projection');
    const roofSystem = await detachedGable();
    const geometry = buildRoofPlaneGeometry(roofSystem);
    const eaveUnderside = geometry.getSurfaceElevation({ x: 5000, y: -300 }, 'bottom');
    const front = buildRoofElevationElements(roofSystem, getElevationView('elevation_front'), { groundElevation: 0 });

    const bands = front.polygonElements.filter((element) => element.style === 'roofFascia');
    // Front view looks along +y: both eave fascias face it, the gable barges are end-on.
    expect(bands).toHaveLength(2);
    for (const band of bands) {
      const tops = band.points.map((point) => point.z);
      expect(Math.max(...tops)).toBeCloseTo(eaveUnderside, 6);
      expect(Math.max(...tops) - Math.min(...tops)).toBeCloseTo(200, 6);
    }
    const gutterLines = front.lineElements.filter((element) => element.id.startsWith('roof-gutter-elevation-'));
    expect(gutterLines).toHaveLength(4);
    const downpipeLines = front.lineElements.filter((element) => element.id.startsWith('roof-downpipe-elevation-'));
    expect(downpipeLines).toHaveLength(4);
    expect(Math.min(...downpipeLines.map((line) => line.end.z))).toBe(150);

    // From the side the rakes face the viewer: two sloped barge boards per gable.
    const left = buildRoofElevationElements(roofSystem, getElevationView('elevation_left'), null);
    const barges = left.polygonElements.filter((element) => element.style === 'roofFascia');
    expect(barges).toHaveLength(4);
    // No context, no ground: no downpipes.
    expect(left.lineElements.some((element) => element.id.startsWith('roof-downpipe-elevation-'))).toBe(false);
  });

  it('cuts the fascia and the gutter where a section crosses an eave', async () => {
    const { buildRoofSectionElements } = await import('@/geometry/roofSectionGeometry');
    const { createSectionCut } = await import('@/domain/models');
    const roofSystem = await detachedGable();
    // A cut across the ridge, from beyond one eave to beyond the other.
    const cut = createSectionCut({ x: 5000, y: -1000 }, { x: 5000, y: 9000 }, { direction: 1, depth: 100 });
    const trims = buildRoofSectionElements(roofSystem, cut).rectElements.filter(
      (element) => element.category === 'roofTrim',
    );
    expect(trims.filter((element) => element.id.includes('-fascia-'))).toHaveLength(2);
    expect(trims.filter((element) => element.id.includes('-gutter-'))).toHaveLength(2);
    for (const element of trims) expect(element.renderMode).toBe('cut');
  });
});
