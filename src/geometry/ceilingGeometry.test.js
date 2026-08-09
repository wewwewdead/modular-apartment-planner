import { describe, it, expect } from 'vitest';
import { createCeiling, deriveCeilingDetail } from '@/domain/ceilingModels';
import {
  CEILING_BOARD_THICKNESS,
  CEILING_CARRIER_DEPTH,
  CEILING_FURRING_DEPTH,
  CEILING_WALL_ANGLE_LEG,
} from '@/domain/defaults';
import { buildPreviewScene } from '@/three/scene/buildPreviewScene';
import { buildCeilingPreviewObjects } from './ceilingGeometry';

const BOUNDARY = [
  { x: 1000, y: 500 },
  { x: 5000, y: 500 },
  { x: 5000, y: 3500 },
  { x: 1000, y: 3500 },
];

const MANUAL_BASE_ELEVATION = 2700;
const TRUSS_BASE_ELEVATION = 3000;
const TRUSS_DROP = 150;

function createFloor() {
  return {
    id: 'floor_1',
    name: 'Ground',
    elevation: 0,
    floorToFloorHeight: 3000,
    walls: [],
    rooms: [],
    slabs: [],
    columns: [],
    beams: [],
    stairs: [],
    landings: [],
    fixtures: [],
    railings: [],
  };
}

function createProject(ceilings = []) {
  return {
    floors: [createFloor()],
    trussSystems: [
      { id: 'ts1', name: 'Roof trusses', floorId: 'floor_1', baseElevation: TRUSS_BASE_ELEVATION, trussInstances: [] },
    ],
    ceilings,
  };
}

function manualCeiling(overrides = {}) {
  return createCeiling('Manual ceiling', {
    id: 'ceiling_manual',
    floorId: 'floor_1',
    boundaryPolygon: BOUNDARY,
    baseElevation: MANUAL_BASE_ELEVATION,
    ...overrides,
  });
}

function trussCeiling(overrides = {}) {
  return createCeiling('Truss ceiling', {
    id: 'ceiling_truss',
    floorId: 'floor_1',
    boundaryPolygon: BOUNDARY,
    attachment: { mode: 'truss', trussSystemId: 'ts1' },
    detailing: { suspension: { drop: TRUSS_DROP } },
    ...overrides,
  });
}

function byDetailKind(descriptors, kind) {
  return descriptors.filter((descriptor) => descriptor.metadata.ceilingDetailKind === kind);
}

function byFramingKind(descriptors, kind) {
  return descriptors.filter((descriptor) => descriptor.metadata.framingKind === kind);
}

describe('buildCeilingPreviewObjects', () => {
  it('builds a manual ceiling as boards, grid framing and wall angles with no hangers', () => {
    const ceiling = manualCeiling();
    const project = createProject([ceiling]);
    const descriptors = buildCeilingPreviewObjects(ceiling, project);

    const boards = byDetailKind(descriptors, 'panel');
    expect(boards.length).toBeGreaterThan(0);
    for (const board of boards) {
      expect(board.geometry).toBe('prism');
      expect(board.materialKey).toBe('ceilingBoard');
      // Manual mode hangs nothing: the stored base elevation IS the board underside.
      expect(board.baseElevation).toBe(MANUAL_BASE_ELEVATION);
      expect(board.height).toBe(CEILING_BOARD_THICKNESS);
      expect(board.metadata.ceilingId).toBe('ceiling_manual');
      expect(board.metadata.floorId).toBe('floor_1');
    }

    expect(byDetailKind(descriptors, 'hanger')).toHaveLength(0);

    const boardTop = MANUAL_BASE_ELEVATION + CEILING_BOARD_THICKNESS;
    const furring = byFramingKind(descriptors, 'furring');
    expect(furring.length).toBeGreaterThan(0);
    for (const member of furring) {
      expect(member.geometry).toBe('box');
      expect(member.materialKey).toBe('ceilingFraming');
      expect(member.baseElevation).toBe(boardTop);
      expect(member.size.y).toBe(CEILING_FURRING_DEPTH);
    }

    const carriers = byFramingKind(descriptors, 'carrier');
    expect(carriers.length).toBeGreaterThan(0);
    for (const member of carriers) {
      expect(member.baseElevation).toBe(boardTop + CEILING_FURRING_DEPTH);
      expect(member.size.y).toBe(CEILING_CARRIER_DEPTH);
    }

    const wallAngles = byFramingKind(descriptors, 'wall_angle');
    expect(wallAngles).toHaveLength(4);
    for (const angle of wallAngles) {
      expect(angle.geometry).toBe('segment3d');
      expect(angle.crossSection).toEqual({ width: CEILING_WALL_ANGLE_LEG, height: CEILING_WALL_ANGLE_LEG });
      expect(angle.start.y).toBeCloseTo(boardTop + CEILING_WALL_ANGLE_LEG / 2, 6);
      expect(angle.end.y).toBeCloseTo(boardTop + CEILING_WALL_ANGLE_LEG / 2, 6);
    }

    for (const descriptor of descriptors) {
      expect(['prism', 'box', 'segment3d']).toContain(descriptor.geometry);
      expect(descriptor.kind).toBe('ceiling');
      expect(descriptor.metadata.sourceId).toBe('ceiling_manual');
      for (const key of ['minX', 'maxX', 'minY', 'maxY', 'minElevation', 'maxElevation']) {
        expect(Number.isFinite(descriptor.bounds[key])).toBe(true);
      }
      expect(descriptor.bounds.maxElevation).toBeGreaterThanOrEqual(descriptor.bounds.minElevation);
    }
  });

  it('maps ceiling-local UV back to plan coordinates (V flip) and into world space', () => {
    const ceiling = manualCeiling();
    const project = createProject([ceiling]);
    const descriptors = buildCeilingPreviewObjects(ceiling, project);

    // Wall angles ring the boundary half a leg (12.5 mm) inboard, so their
    // world x/z must reproduce the boundary corners pulled that far toward the
    // middle — this is the V-flip round trip under test.
    const corners = byFramingKind(descriptors, 'wall_angle')
      .map((angle) => `${angle.start.x.toFixed(1)},${angle.start.z.toFixed(1)}`)
      .sort();
    const centre = { x: 3000, y: 2000 };
    expect(corners).toEqual(
      BOUNDARY.map((point) => {
        const inset = {
          x: point.x + Math.sign(centre.x - point.x) * 12.5,
          y: point.y + Math.sign(centre.y - point.y) * 12.5,
        };
        return `${inset.x.toFixed(1)},${inset.y.toFixed(1)}`;
      }).sort(),
    );

    for (const board of byDetailKind(descriptors, 'panel')) {
      for (const point of board.outline) {
        expect(point.x).toBeGreaterThanOrEqual(1000 - 1e-6);
        expect(point.x).toBeLessThanOrEqual(5000 + 1e-6);
        expect(point.y).toBeGreaterThanOrEqual(500 - 1e-6);
        expect(point.y).toBeLessThanOrEqual(3500 + 1e-6);
      }
    }

    // Every framing box sits inside the boundary footprint.
    for (const member of byDetailKind(descriptors, 'framing').filter((entry) => entry.geometry === 'box')) {
      expect(member.center.x).toBeGreaterThanOrEqual(1000);
      expect(member.center.x).toBeLessThanOrEqual(5000);
      expect(member.center.y).toBeGreaterThanOrEqual(500);
      expect(member.center.y).toBeLessThanOrEqual(3500);
      expect(member.size.x).toBeGreaterThan(0);
      expect(member.size.z).toBeGreaterThan(0);
      expect(member.rotation).toBe(0);
    }
  });

  it('drops a truss-attached ceiling below the attachment plane and hangs it back up', () => {
    const ceiling = trussCeiling();
    const project = createProject([ceiling]);
    const descriptors = buildCeilingPreviewObjects(ceiling, project);

    const boardUnderside = TRUSS_BASE_ELEVATION - TRUSS_DROP;
    expect(boardUnderside).toBe(2850);
    for (const board of byDetailKind(descriptors, 'panel')) {
      expect(board.baseElevation).toBe(boardUnderside);
    }

    const gridDepth = CEILING_BOARD_THICKNESS + CEILING_FURRING_DEPTH + CEILING_CARRIER_DEPTH;
    const hangers = byDetailKind(descriptors, 'hanger');
    expect(hangers.length).toBeGreaterThan(0);
    for (const hanger of hangers) {
      expect(hanger.geometry).toBe('box');
      expect(hanger.materialKey).toBe('ceilingHanger');
      expect(hanger.size.y).toBeCloseTo(TRUSS_DROP - gridDepth, 6);
      expect(hanger.baseElevation).toBeCloseTo(boardUnderside + gridDepth, 6);
      expect(hanger.baseElevation + hanger.size.y).toBeCloseTo(TRUSS_BASE_ELEVATION, 6);
    }
  });

  it('matches the derived detail counts one descriptor per region, member and hanger', () => {
    const ceiling = trussCeiling();
    const project = createProject([ceiling]);
    const detail = deriveCeilingDetail(ceiling, project);
    const descriptors = buildCeilingPreviewObjects(ceiling, project);

    const regionCount = detail.panels.reduce((total, panel) => total + panel.regions.length, 0);
    const rectMembers = detail.framing.filter((member) => member.kind !== 'wall_angle');
    const wallAngles = detail.framing.filter((member) => member.kind === 'wall_angle');

    expect(byDetailKind(descriptors, 'panel')).toHaveLength(regionCount);
    expect(byDetailKind(descriptors, 'framing').filter((entry) => entry.geometry === 'box')).toHaveLength(
      rectMembers.length,
    );
    expect(byFramingKind(descriptors, 'wall_angle')).toHaveLength(wallAngles.length);
    expect(byDetailKind(descriptors, 'hanger')).toHaveLength(detail.hangers.length);
    expect(new Set(descriptors.map((descriptor) => descriptor.id)).size).toBe(descriptors.length);
    // Fasteners stay out of the main scene even though the detail derives them.
    expect(detail.fasteners.length).toBeGreaterThan(0);
    expect(descriptors.some((descriptor) => descriptor.metadata.ceilingDetailKind === 'fastener')).toBe(false);
  });

  it('returns nothing for disabled detailing, a disabled face or a degenerate boundary', () => {
    const project = createProject();

    expect(buildCeilingPreviewObjects(manualCeiling({ detailing: { enabled: false } }), project)).toEqual([]);
    expect(buildCeilingPreviewObjects(manualCeiling({ detailing: { face: { enabled: false } } }), project)).toEqual([]);
    expect(buildCeilingPreviewObjects(null, project)).toEqual([]);

    const degenerate = manualCeiling();
    degenerate.boundaryPolygon = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
    expect(buildCeilingPreviewObjects(degenerate, project)).toEqual([]);
  });
});

describe('buildPreviewScene ceilings', () => {
  it('adds ceiling descriptors to their floor objects and source key', () => {
    const ceiling = manualCeiling();
    const project = createProject([ceiling]);
    const scene = buildPreviewScene(project);
    const floor = scene.floors.find((entry) => entry.floorId === 'floor_1');

    const ceilingObjects = floor.objects.filter((descriptor) => descriptor.metadata?.ceilingId === 'ceiling_manual');
    expect(ceilingObjects).toHaveLength(buildCeilingPreviewObjects(ceiling, project).length);
    expect(ceilingObjects.every((descriptor) => descriptor.metadata.floorId === 'floor_1')).toBe(true);

    // Cache correctness: the ceiling source array must be reachable by reference.
    expect(floor.sourceKey.ceilings).toEqual([ceiling]);
    expect(floor.sourceKey.ceilings[0]).toBe(ceiling);
    expect(floor.bounds.maxElevation).toBeGreaterThanOrEqual(MANUAL_BASE_ELEVATION);
  });

  it('keeps a ceiling off floors it does not belong to', () => {
    const ceiling = manualCeiling({ floorId: 'floor_2' });
    const project = createProject([ceiling]);
    const scene = buildPreviewScene(project);
    const floor = scene.floors.find((entry) => entry.floorId === 'floor_1');

    expect(floor.objects.filter((descriptor) => descriptor.metadata?.ceilingId)).toHaveLength(0);
    expect(floor.sourceKey.ceilings).toEqual([]);
  });
});
