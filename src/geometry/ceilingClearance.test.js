import { describe, expect, it } from 'vitest';
import { createBeam, createColumn, createSlab, createWall } from '@/domain/models';
import {
  CEILING_ATTACHMENT_MODES,
  CEILING_BOUNDARY_SOURCES,
  ceilingElevationRange,
  createCeilingForProject,
  deriveCeilingDetail,
  resolveCeilingBoundary,
  resolveCeilingElevations,
} from '@/domain/ceilingModels';
import { deriveCeilingBoundaryFromBeams, selectCeilingBeamsForArea } from '@/domain/ceilingBeamAttachment';
import { CEILING_DROP, CEILING_WALL_ANGLE_LEG } from '@/domain/defaults';
import { createTrussSystem, syncProjectTrussSystems, TRUSS_SUPPORT_MODES } from '@/domain/trussModels';
import { getBeamRenderData } from './beamGeometry';
import { columnOutline } from './columnGeometry';
import { getWallRenderData } from './wallColumnGeometry';
import { pointInPolygon } from './polygon';
import { intersectionArea, multiPolygonArea, subtractPolygons } from './polygonBoolean';
import { buildCeilingPreviewObjects } from './ceilingGeometry';

/**
 * Nothing a ceiling puts in the model may end up inside the structure it hangs
 * beside. This measures the built 3D descriptors — the exact meshes the preview
 * draws — against the beam and wall footprints, so a regression shows up as a
 * real overlap area rather than as something that merely looks wrong on screen.
 */

const BEAM_TOP = 3000;
const BEAM_WIDTH = 250;
const SPAN = 6000;

function buildProject() {
  const columns = [
    ['col_a1', 0, 0],
    ['col_a2', 9000, 0],
    ['col_b1', 0, SPAN],
    ['col_b2', 9000, SPAN],
    ['col_m1', 4500, 0],
    ['col_m2', 4500, SPAN],
  ].map(([id, x, y]) => ({ ...createColumn(x, y, 300, 300, { height: BEAM_TOP }), id }));

  const beam = (id, startId, endId) => ({
    ...createBeam({ kind: 'column', id: startId }, { kind: 'column', id: endId }, BEAM_WIDTH, 450, BEAM_TOP),
    id,
  });

  const floor = {
    id: 'floor_1',
    elevation: 0,
    floorToFloorHeight: BEAM_TOP,
    columns,
    beams: [
      beam('beam_a', 'col_a1', 'col_a2'),
      beam('beam_b', 'col_b1', 'col_b2'),
      beam('beam_cross', 'col_m1', 'col_m2'),
    ],
    walls: [{ ...createWall({ x: 6800, y: 0 }, { x: 6800, y: SPAN }, 200, { height: BEAM_TOP }), id: 'wall_1' }],
    rooms: [],
    slabs: [],
    stairs: [],
    landings: [],
    fixtures: [],
    railings: [],
  };

  const project = syncProjectTrussSystems({
    floors: [floor],
    ceilings: [],
    trussSystems: [
      createTrussSystem('Roof trusses', {
        id: 'ts_1',
        floorId: floor.id,
        baseElevation: BEAM_TOP,
        trussInstances: [
          {
            trussTypeId: 'truss_type_gable',
            startPoint: { x: 0, y: SPAN / 2 },
            endPoint: { x: 9000, y: SPAN / 2 },
            span: SPAN,
            rise: 1200,
            spacing: 1000,
            count: 9,
            supportMode: TRUSS_SUPPORT_MODES.BEAM_PAIR,
            supportBeamIds: { start: 'beam_a', end: 'beam_b' },
          },
        ],
      }),
    ],
  });

  const ceiling = createCeilingForProject(project, { floorId: floor.id });
  project.ceilings = [ceiling];

  return { floor, ceiling, project };
}

function structureFootprints(floor) {
  return [
    ...floor.beams.map((entry) => ({
      id: entry.id,
      outline: getBeamRenderData(entry, floor.columns).outline,
    })),
    ...floor.walls.map((entry) => ({
      id: entry.id,
      outline: getWallRenderData(entry, floor.columns).outline,
    })),
    // Columns are wider than the beams they carry, so they bite into the
    // ceiling area past the beam faces at every corner.
    ...floor.columns.map((entry) => ({ id: entry.id, outline: columnOutline(entry) })),
  ];
}

function rotatePoint(point, cos, sin) {
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

// Plan footprint of a preview descriptor, matching how each geometry kind is
// turned into a mesh: prisms extrude their outline, boxes are centred and
// rotated in plan, and segment3d is a box of crossSection.width laid along the
// line between its endpoints.
function planFootprint(descriptor) {
  if (descriptor.geometry === 'prism') return descriptor.outline;

  if (descriptor.geometry === 'box') {
    const cos = Math.cos(descriptor.rotation || 0);
    const sin = Math.sin(descriptor.rotation || 0);
    const halfX = descriptor.size.x / 2;
    const halfZ = descriptor.size.z / 2;
    return [
      { x: -halfX, y: -halfZ },
      { x: halfX, y: -halfZ },
      { x: halfX, y: halfZ },
      { x: -halfX, y: halfZ },
    ].map((corner) => {
      const rotated = rotatePoint(corner, cos, sin);
      return { x: descriptor.center.x + rotated.x, y: descriptor.center.y + rotated.y };
    });
  }

  const start = { x: descriptor.start.x, y: descriptor.start.z };
  const end = { x: descriptor.end.x, y: descriptor.end.z };
  const length = Math.hypot(end.x - start.x, end.y - start.y) || 1;
  const half = (descriptor.crossSection?.width || descriptor.thickness || 1) / 2;
  const normal = { x: (-(end.y - start.y) / length) * half, y: ((end.x - start.x) / length) * half };
  return [
    { x: start.x + normal.x, y: start.y + normal.y },
    { x: end.x + normal.x, y: end.y + normal.y },
    { x: end.x - normal.x, y: end.y - normal.y },
    { x: start.x - normal.x, y: start.y - normal.y },
  ];
}

function overlapReport(floor, descriptors) {
  const structure = structureFootprints(floor);
  const overlaps = [];

  for (const descriptor of descriptors) {
    const footprint = planFootprint(descriptor);
    for (const member of structure) {
      const area = intersectionArea(footprint, member.outline);
      if (area <= 1) continue;
      overlaps.push({
        kind: descriptor.metadata.ceilingDetailKind,
        framingKind: descriptor.metadata.framingKind || null,
        into: member.id,
        area,
        id: descriptor.id,
      });
    }
  }

  return overlaps;
}

describe('ceiling clearance against the structure it hangs beside', () => {
  it('puts no part of the ceiling inside a beam or a wall', () => {
    const { floor, ceiling, project } = buildProject();
    const descriptors = buildCeilingPreviewObjects(ceiling, project);

    // Guard the fixture: a ceiling that fell back to a manual datum would be
    // measuring a stored rectangle rather than the beams it hangs from.
    expect(ceiling.attachment.mode).toBe('beam');
    expect(ceiling.attachment.beamIds).toEqual(['beam_a', 'beam_b', 'beam_cross']);

    // Guard the guard: an empty ceiling would pass the overlap check trivially.
    const kinds = new Set(descriptors.map((descriptor) => descriptor.metadata.ceilingDetailKind));
    expect([...kinds].sort()).toEqual(['framing', 'hanger', 'panel']);

    // Sorted worst-first so a failure names the biggest offender, what it is,
    // and which member it is buried in.
    const overlaps = overlapReport(floor, descriptors).sort((a, b) => b.area - a.area);
    expect(overlaps).toEqual([]);
  });

  it('runs the boards right up to the faces they stop at, not short of them', () => {
    const { ceiling, project } = buildProject();
    const boards = buildCeilingPreviewObjects(ceiling, project).filter(
      (descriptor) => descriptor.metadata.ceilingDetailKind === 'panel',
    );
    const points = boards.flatMap((board) => board.outline);

    // Support beams at y 0 and y 6000, 250 wide: the boards die on their inner
    // faces, so they reach 125 and 5875 exactly — no gap, no burial.
    expect(Math.min(...points.map((point) => point.y))).toBeCloseTo(BEAM_WIDTH / 2, 6);
    expect(Math.max(...points.map((point) => point.y))).toBeCloseTo(SPAN - BEAM_WIDTH / 2, 6);

    // Both faces of the beam crossing the middle at x 4500, and of the 200 mm
    // partition at x 6800, are reached from each side.
    for (const face of [4500 - BEAM_WIDTH / 2, 4500 + BEAM_WIDTH / 2, 6700, 6900]) {
      expect(points.some((point) => Math.abs(point.x - face) < 1e-6)).toBe(true);
    }
  });
});

/* ── A bay with a notched slab over it and an L of structure through it ──────
 *
 * The geometry a ceiling actually gets built into, rather than the clean
 * rectangle above: a slab traced onto the columns' inner faces on one side and
 * missing a corner, and a beam meeting a partition at a column to make an L that
 * runs out to the boundary. Everything here is measured off the built 3D
 * descriptors, so a failure is an area in millimetres rather than an impression.
 *
 * The slab is drawn awkwardly on purpose and gets NO say in the outline: the
 * beams govern the AUTO boundary, so the ceiling is the bay its frame encloses
 * whether the storey above was traced short of it, over it, or notched. What is
 * left for the tracer to answer is the L — beam, partition and columns standing
 * in the bay — which is structure, not a statement about the floor above.
 */

const BAY_WIDTH = 4000;
const BAY_DEPTH = 3200;
const COLUMN_SIZE = 300;

// Traced onto the columns' faces on the west side — 150 in from the grid line,
// where the beams between those columns reach 125 — and notched at the north
// east corner. Both are statements about where the storey above stops.
const NOTCHED_SLAB = [
  { x: COLUMN_SIZE / 2, y: 0 },
  { x: 3000, y: 0 },
  { x: 3000, y: 800 },
  { x: BAY_WIDTH, y: 800 },
  { x: BAY_WIDTH, y: BAY_DEPTH },
  { x: COLUMN_SIZE / 2, y: BAY_DEPTH },
];

function buildNotchedBay({ slabAbove = true } = {}) {
  const columns = [
    ['col_nw', 0, 0],
    ['col_ne', BAY_WIDTH, 0],
    ['col_sw', 0, BAY_DEPTH],
    ['col_se', BAY_WIDTH, BAY_DEPTH],
    ['col_em', BAY_WIDTH, 1400],
    // The knuckle of the L: the beam arm dies into it and the partition leaves it.
    ['col_mid', 2600, 1400],
  ].map(([id, x, y]) => ({ ...createColumn(x, y, COLUMN_SIZE, COLUMN_SIZE, { height: BEAM_TOP }), id }));

  const bayBeam = (id, startId, endId) => ({
    ...createBeam({ kind: 'column', id: startId }, { kind: 'column', id: endId }, BEAM_WIDTH, 450, BEAM_TOP),
    id,
  });

  const floor = {
    id: 'floor_1',
    levelIndex: 0,
    elevation: 0,
    floorToFloorHeight: BEAM_TOP,
    columns,
    beams: [
      bayBeam('beam_n', 'col_nw', 'col_ne'),
      bayBeam('beam_s', 'col_sw', 'col_se'),
      bayBeam('beam_w', 'col_nw', 'col_sw'),
      bayBeam('beam_e', 'col_ne', 'col_se'),
      bayBeam('beam_arm', 'col_em', 'col_mid'),
    ],
    walls: [
      {
        ...createWall({ x: 2600, y: 1400 }, { x: 2600, y: BAY_DEPTH }, 200, { height: BEAM_TOP }),
        id: 'wall_leg',
      },
    ],
    rooms: [],
    slabs: [],
    stairs: [],
    landings: [],
    fixtures: [],
    railings: [],
  };

  const above = {
    id: 'floor_2',
    levelIndex: 1,
    elevation: BEAM_TOP,
    floorToFloorHeight: BEAM_TOP,
    columns: [],
    beams: [],
    walls: [],
    rooms: [],
    slabs: slabAbove ? [{ ...createSlab('floor_2', NOTCHED_SLAB, 200, BEAM_TOP), id: 'slab_above' }] : [],
  };

  const project = { floors: [floor, above], ceilings: [] };
  const ceiling = createCeilingForProject(project, {
    floorId: floor.id,
    // Lands a furring row half across the knuckle column's south face, which is
    // where a member sized off a bounding box climbs into the column.
    detailing: { framing: { furringSpacing: 330 } },
  });
  project.ceilings = [ceiling];

  return { floor, ceiling, project };
}

function planArea(points) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    sum += start.x * end.y - end.x * start.y;
  }
  return Math.abs(sum) / 2;
}

/**
 * Whether a point is inside the ceiling proper: inside the boundary and clear of
 * everything the ceiling was traced around.
 */
function insideCeilingArea(point, boundary, structure) {
  return pointInPolygon(point, boundary) && !structure.some((member) => pointInPolygon(point, member.outline));
}

function segmentFor(descriptor) {
  return {
    start: { x: descriptor.start.x, y: descriptor.start.z },
    end: { x: descriptor.end.x, y: descriptor.end.z },
  };
}

describe('a ceiling in a bay with an L of structure through it', () => {
  it('fills the bay to the beam faces however the slab overhead was traced', () => {
    const { floor, ceiling, project } = buildNotchedBay();
    const boards = buildCeilingPreviewObjects(ceiling, project).filter(
      (descriptor) => descriptor.metadata.ceilingDetailKind === 'panel',
    );
    const points = boards.flatMap((board) => board.outline);

    expect(ceiling.attachment.mode).toBe('beam');
    expect(boards.length).toBeGreaterThan(0);
    expect(resolveCeilingBoundary(project, ceiling)).toEqual(deriveCeilingBoundaryFromBeams(floor.beams, floor));

    // The beam rectangle, inner face to inner face, on all four sides — not the
    // slab's west edge 25 mm inboard of it, and not its notch.
    expect(Math.min(...points.map((point) => point.x))).toBeCloseTo(BEAM_WIDTH / 2, 6);
    expect(Math.max(...points.map((point) => point.x))).toBeCloseTo(BAY_WIDTH - BEAM_WIDTH / 2, 6);
    expect(Math.min(...points.map((point) => point.y))).toBeCloseTo(BEAM_WIDTH / 2, 6);
    expect(Math.max(...points.map((point) => point.y))).toBeCloseTo(BAY_DEPTH - BEAM_WIDTH / 2, 6);

    // Board area standing where the slab was notched away: under the old rule
    // this was zero, because the notch cut the boards back.
    const beyondSlab = boards.reduce(
      (total, board) => total + multiPolygonArea(subtractPolygons(board.outline, [NOTCHED_SLAB])),
      0,
    );
    const covered = boards.reduce((total, board) => total + planArea(board.outline), 0);

    expect(covered).toBeGreaterThan(6e6);
    expect(beyondSlab).toBeGreaterThan(6e5);
  });

  it('draws the same ceiling whether or not a slab is stacked over the frame', () => {
    const outlines = ({ ceiling, project }) =>
      buildCeilingPreviewObjects(ceiling, project)
        .filter((descriptor) => descriptor.metadata.ceilingDetailKind === 'panel')
        .map((board) => board.outline);

    // The discriminating comparison for the rule: the notched slab is the only
    // difference between these two projects, and a ceiling that read it would
    // come out a different shape.
    expect(outlines(buildNotchedBay())).toEqual(outlines(buildNotchedBay({ slabAbove: false })));
  });

  it('puts no framing member inside the structure it stops at', () => {
    const { floor, ceiling, project } = buildNotchedBay();
    const descriptors = buildCeilingPreviewObjects(ceiling, project);

    const kinds = new Set(descriptors.map((descriptor) => descriptor.metadata.ceilingDetailKind));
    expect([...kinds].sort()).toEqual(['framing', 'hanger', 'panel']);

    const overlaps = overlapReport(floor, descriptors).sort((a, b) => b.area - a.area);
    expect(overlaps).toEqual([]);
  });

  it('runs an edge member along every obstruction face the ceiling dies into', () => {
    const { floor, ceiling, project } = buildNotchedBay();
    const angles = buildCeilingPreviewObjects(ceiling, project)
      .filter((descriptor) => descriptor.metadata.framingKind === 'wall_angle')
      .map(segmentFor);
    const structure = structureFootprints(floor);
    const boundary = resolveCeilingBoundary(project, ceiling);

    expect(angles.length).toBeGreaterThan(0);

    // Walked in 50 mm steps rather than edge by edge: a face is only part
    // boundary — a partition runs on past the beam that stops the ceiling — and
    // what has to carry an angle is the stretch of it that faces open ceiling.
    const bare = [];
    for (const member of structure) {
      const outline = member.outline;
      for (let index = 0; index < outline.length; index += 1) {
        const start = outline[index];
        const end = outline[(index + 1) % outline.length];
        const length = Math.hypot(end.x - start.x, end.y - start.y);
        if (length < 200) continue;
        const direction = { x: (end.x - start.x) / length, y: (end.y - start.y) / length };
        const normal = { x: -direction.y, y: direction.x };

        // Corners are skipped: the angles mitre into each other there, so the
        // last few millimetres of a face belong to the return, not to it.
        for (let along = 60; along <= length - 60; along += 50) {
          const on = { x: start.x + direction.x * along, y: start.y + direction.y * along };
          const outward = [1, -1]
            .map((side) => ({ x: on.x + normal.x * side * 2, y: on.y + normal.y * side * 2 }))
            .find((probe) => insideCeilingArea(probe, boundary, structure));
          if (!outward) continue;

          const carried = angles.some((angle) => {
            const span = Math.hypot(angle.end.x - angle.start.x, angle.end.y - angle.start.y);
            if (span <= 1) return false;
            const axis = { x: (angle.end.x - angle.start.x) / span, y: (angle.end.y - angle.start.y) / span };
            if (Math.abs(axis.x * direction.y - axis.y * direction.x) > 1e-3) return false;
            const offset = (on.x - angle.start.x) * axis.y - (on.y - angle.start.y) * axis.x;
            if (Math.abs(offset) > CEILING_WALL_ANGLE_LEG) return false;
            // Half a leg of slack at each end: an angle mitres into the return
            // at a corner, so it stops that far short of the face it meets.
            const projected = (on.x - angle.start.x) * axis.x + (on.y - angle.start.y) * axis.y;
            return projected >= -CEILING_WALL_ANGLE_LEG && projected <= span + CEILING_WALL_ANGLE_LEG;
          });
          if (!carried) bare.push({ into: member.id, at: on });
        }
      }
    }

    expect(bare).toEqual([]);
  });
});

/* ── A ceiling under a slab drawn over the beams it hangs in ─────────────────
 *
 * How a storey actually gets traced: the slab above is drawn over the frame, or
 * onto the grid lines, rather than onto the column faces. This is the case the
 * user rejected — a ceiling that followed such a slab ran its framing out over
 * the beams and past their faces, so a fitter saw boards where the frame is.
 *
 * With the beams governing the AUTO boundary, the ceiling IS the beam rectangle
 * here and both of the things measured below hold by construction: nothing
 * stands outside the beams' inner faces, and the module's own end stations land
 * on those faces because they are the ends of its extent. The describe stays as
 * a guard rather than as a discovery — it is what would fail first if the slab
 * ever got a say back — and the framing-on-every-face check still earns its keep
 * on the cross beam, which bounds no extent and is stationed off its own edges.
 */

const COVERED_WIDTH = 6000;
const COVERED_DEPTH = 4000;
const CROSS_AT = 3000;

const planRect = (x0, y0, x1, y1) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

function buildCoveredBay(slabRing) {
  const columns = [
    ['col_nw', 0, 0],
    ['col_ne', COVERED_WIDTH, 0],
    ['col_sw', 0, COVERED_DEPTH],
    ['col_se', COVERED_WIDTH, COVERED_DEPTH],
    ['col_mn', CROSS_AT, 0],
    ['col_ms', CROSS_AT, COVERED_DEPTH],
  ].map(([id, x, y]) => ({ ...createColumn(x, y, COLUMN_SIZE, COLUMN_SIZE, { height: BEAM_TOP }), id }));

  const bayBeam = (id, startId, endId) => ({
    ...createBeam({ kind: 'column', id: startId }, { kind: 'column', id: endId }, BEAM_WIDTH, 450, BEAM_TOP),
    id,
  });

  const floor = {
    id: 'floor_1',
    levelIndex: 0,
    elevation: 0,
    floorToFloorHeight: BEAM_TOP,
    columns,
    beams: [
      bayBeam('beam_n', 'col_nw', 'col_ne'),
      bayBeam('beam_s', 'col_sw', 'col_se'),
      bayBeam('beam_w', 'col_nw', 'col_sw'),
      bayBeam('beam_e', 'col_ne', 'col_se'),
      bayBeam('beam_cross', 'col_mn', 'col_ms'),
    ],
    walls: [],
    rooms: [],
    slabs: [],
    stairs: [],
    landings: [],
    fixtures: [],
    railings: [],
  };

  const above = {
    id: 'floor_2',
    levelIndex: 1,
    elevation: BEAM_TOP,
    floorToFloorHeight: BEAM_TOP,
    columns: [],
    beams: [],
    walls: [],
    rooms: [],
    slabs: [{ ...createSlab('floor_2', slabRing, 200, BEAM_TOP), id: 'slab_above' }],
  };

  const project = { floors: [floor, above], ceilings: [] };
  const ceiling = createCeilingForProject(project, { floorId: floor.id });
  project.ceilings = [ceiling];

  return { floor, ceiling, project };
}

// The six beam faces this bay's ceiling dies into, each with the direction the
// open ceiling lies in.
const ROOM_FACES = [
  { name: 'beam_n inner', axis: 'y', at: BEAM_WIDTH / 2, inward: 1 },
  { name: 'beam_s inner', axis: 'y', at: COVERED_DEPTH - BEAM_WIDTH / 2, inward: -1 },
  { name: 'beam_w inner', axis: 'x', at: BEAM_WIDTH / 2, inward: 1 },
  { name: 'beam_e inner', axis: 'x', at: COVERED_WIDTH - BEAM_WIDTH / 2, inward: -1 },
  { name: 'beam_cross west', axis: 'x', at: CROSS_AT - BEAM_WIDTH / 2, inward: -1 },
  { name: 'beam_cross east', axis: 'x', at: CROSS_AT + BEAM_WIDTH / 2, inward: 1 },
];

/**
 * How far inboard of each face the nearest framing band parallel to it begins.
 * Zero is a member with its own face on the structure's face; a metre is the
 * module's next station, with nothing between it and the beam.
 */
function faceSetbacks(descriptors) {
  const bands = descriptors.filter((descriptor) => ['furring', 'carrier'].includes(descriptor.metadata.framingKind));

  return ROOM_FACES.map((face) => {
    const across = face.axis;
    const along = face.axis === 'x' ? 'y' : 'x';
    let nearest = Infinity;

    for (const band of bands) {
      const footprint = planFootprint(band);
      const acrossValues = footprint.map((point) => point[across]);
      const alongValues = footprint.map((point) => point[along]);
      // Only bands running WITH the face; one crossing it says nothing about
      // whether the face is carried.
      if (Math.max(...alongValues) - Math.min(...alongValues) < Math.max(...acrossValues) - Math.min(...acrossValues)) {
        continue;
      }
      const setback = face.inward > 0 ? Math.min(...acrossValues) - face.at : face.at - Math.max(...acrossValues);
      if (setback < -1e-6) continue;
      nearest = Math.min(nearest, setback);
    }

    return { face: face.name, setback: Number.isFinite(nearest) ? nearest : null };
  });
}

describe('a ceiling under a slab drawn over the beams it hangs in', () => {
  const tracings = [
    [
      'over the frame',
      planRect(-BEAM_WIDTH / 2, -BEAM_WIDTH / 2, COVERED_WIDTH + BEAM_WIDTH / 2, COVERED_DEPTH + BEAM_WIDTH / 2),
    ],
    ['onto the grid lines', planRect(0, 0, COVERED_WIDTH, COVERED_DEPTH)],
  ];

  for (const [tracing, slabRing] of tracings) {
    it(`stands framing on every beam face for a slab traced ${tracing}`, () => {
      const { floor, ceiling, project } = buildCoveredBay(slabRing);
      const descriptors = buildCeilingPreviewObjects(ceiling, project, { hideBoards: true });

      expect(ceiling.attachment.mode).toBe('beam');
      expect(descriptors.some((descriptor) => descriptor.metadata.framingKind === 'furring')).toBe(true);
      expect(descriptors.some((descriptor) => descriptor.metadata.framingKind === 'carrier')).toBe(true);

      // Every face carried, and carried by a member standing on it rather than
      // by whichever station of the module happened to land nearby. Before the
      // stations were read off the ceiling area, this bay left the cross beam's
      // faces bare by most of a carrier bay.
      expect(faceSetbacks(descriptors)).toEqual(ROOM_FACES.map((face) => ({ face: face.name, setback: 0 })));

      // …and nothing bought that by climbing into the structure.
      expect(overlapReport(floor, descriptors).sort((a, b) => b.area - a.area)).toEqual([]);
    });

    it(`takes the beam rectangle, not the slab, for a slab traced ${tracing}`, () => {
      const { floor, ceiling, project } = buildCoveredBay(slabRing);
      const beamRect = deriveCeilingBoundaryFromBeams(floor.beams, floor);

      expect(resolveCeilingBoundary(project, ceiling)).toEqual(beamRect);

      // Not one square millimetre of ceiling outside the beams' inner faces —
      // no board, no furring, no carrier, no hanger. Following the slab put a
      // sliver of every one of them out there, over the frame and past it.
      const outside = buildCeilingPreviewObjects(ceiling, project)
        .map((descriptor) => multiPolygonArea(subtractPolygons(planFootprint(descriptor), [beamRect])))
        .reduce((total, area) => total + area, 0);
      expect(outside).toBeLessThan(1);

      // Guard the guard: an empty ceiling would clear that trivially.
      const kinds = new Set(
        buildCeilingPreviewObjects(ceiling, project).map((descriptor) => descriptor.metadata.ceilingDetailKind),
      );
      expect([...kinds].sort()).toEqual(['framing', 'hanger', 'panel']);
      expect(
        overlapReport(floor, buildCeilingPreviewObjects(ceiling, project)).sort((a, b) => b.area - a.area),
      ).toEqual([]);
    });
  }

  it('builds the same framing whether or not the boards are drawn', () => {
    const { ceiling, project } = buildCoveredBay(planRect(0, 0, COVERED_WIDTH, COVERED_DEPTH));
    const framingIds = (options) =>
      buildCeilingPreviewObjects(ceiling, project, options)
        .filter((descriptor) => descriptor.metadata.ceilingDetailKind === 'framing')
        .map((descriptor) => descriptor.id);

    // The user's view of this is the one with the boards hidden, so the thing
    // being looked past must not be the thing deciding what is behind it.
    expect(framingIds({ hideBoards: true })).toEqual(framingIds({}));
  });
});

/* ── A new ceiling on a frame that stops below the storey top ────────────────
 *
 * The discriminating case for how a ceiling gets attached at all. A ceiling that
 * falls back to a manual datum sits at the top of its storey and is traced
 * against its own board plane alone, so structure a few hundred millimetres
 * below it is invisible and the whole furring grid derives through the beams.
 * Beams at 2700 under a 3000 storey make that failure measurable: the frame is
 * 300 clear of the datum a manual ceiling would take.
 */

const DROPPED_TOP = 2700;
const STOREY_HEIGHT = 3000;

function droppedBeam(id, startId, endId) {
  return {
    ...createBeam({ kind: 'column', id: startId }, { kind: 'column', id: endId }, BEAM_WIDTH, 450, DROPPED_TOP),
    id,
  };
}

function droppedFrame({ crossBeam = true, splitNorth = false, partitionAt = 6800 } = {}) {
  const columns = [
    ['col_nw', 0, 0],
    ['col_nm', 4500, 0],
    ['col_ne', 9000, 0],
    ['col_sw', 0, 6000],
    ['col_sm', 4500, 6000],
    ['col_se', 9000, 6000],
  ].map(([id, x, y]) => ({ ...createColumn(x, y, COLUMN_SIZE, COLUMN_SIZE, { height: DROPPED_TOP }), id }));

  const north = splitNorth
    ? [droppedBeam('beam_n_w', 'col_nw', 'col_nm'), droppedBeam('beam_n_e', 'col_nm', 'col_ne')]
    : [droppedBeam('beam_n', 'col_nw', 'col_ne')];

  return {
    id: 'floor_1',
    levelIndex: 0,
    elevation: 0,
    floorToFloorHeight: STOREY_HEIGHT,
    columns,
    beams: [
      ...north,
      droppedBeam('beam_s', 'col_sw', 'col_se'),
      ...(crossBeam ? [droppedBeam('beam_cross', 'col_nm', 'col_sm')] : []),
    ],
    walls: [
      {
        ...createWall({ x: partitionAt, y: 0 }, { x: partitionAt, y: 6000 }, 200, { height: DROPPED_TOP }),
        id: 'wall_1',
      },
    ],
    rooms: [],
    slabs: [],
    stairs: [],
    landings: [],
    fixtures: [],
    railings: [],
  };
}

function ceilingOn(floor, options) {
  const project = { floors: [floor], ceilings: [] };
  const ceiling = createCeilingForProject(project, { floorId: floor.id, ...options });
  project.ceilings = [ceiling];
  return { project, ceiling };
}

describe('a new ceiling hangs from the beams it was asked to hang from', () => {
  it('hangs from a single named beam rather than dropping to the storey datum', () => {
    const floor = droppedFrame();
    const { project, ceiling } = ceilingOn(floor, {
      attachment: { mode: CEILING_ATTACHMENT_MODES.BEAM, beamIds: ['beam_s'] },
      boundarySource: CEILING_BOUNDARY_SOURCES.AUTO,
    });

    // The point of the fixture: one beam encloses no rectangle, so the boundary
    // genuinely cannot be derived from it — and the attachment has to survive
    // that, because it is a different question.
    expect(deriveCeilingBoundaryFromBeams([floor.beams.find((entry) => entry.id === 'beam_s')], floor)).toBeNull();

    expect(ceiling.attachment).toEqual({ mode: CEILING_ATTACHMENT_MODES.BEAM, beamIds: ['beam_s'] });
    expect(ceiling.baseElevation).toBe(DROPPED_TOP);

    // Hung from the beam, the band reaches down past its soffit, so the frame
    // 300 below the storey top is structure the boards get traced around.
    expect(ceilingElevationRange(resolveCeilingElevations(project, ceiling)).min).toBeLessThanOrEqual(
      DROPPED_TOP - 450,
    );

    const descriptors = buildCeilingPreviewObjects(ceiling, project, { hideBoards: true });
    expect(descriptors.some((descriptor) => descriptor.metadata.framingKind === 'furring')).toBe(true);
    // On a manual datum this measured 1.39 m² of furring and carrier buried in
    // the beams, the partition and the columns.
    expect(overlapReport(floor, descriptors).sort((a, b) => b.area - a.area)).toEqual([]);
  });

  it('hangs from two beams on one grid line, which bound no area between them', () => {
    const floor = droppedFrame({ splitNorth: true });
    const collinear = ['beam_n_w', 'beam_n_e'];
    const { project, ceiling } = ceilingOn(floor, {
      attachment: { mode: CEILING_ATTACHMENT_MODES.BEAM, beamIds: collinear },
      boundarySource: CEILING_BOUNDARY_SOURCES.AUTO,
    });

    expect(
      deriveCeilingBoundaryFromBeams(
        floor.beams.filter((entry) => collinear.includes(entry.id)),
        floor,
      ),
    ).toBeNull();

    expect(ceiling.attachment).toEqual({ mode: CEILING_ATTACHMENT_MODES.BEAM, beamIds: collinear });
    expect(ceiling.baseElevation).toBe(DROPPED_TOP);

    const descriptors = buildCeilingPreviewObjects(ceiling, project, { hideBoards: true });
    expect(descriptors.some((descriptor) => descriptor.metadata.framingKind === 'furring')).toBe(true);
    expect(overlapReport(floor, descriptors).sort((a, b) => b.area - a.area)).toEqual([]);
  });
});

/* ── A ceiling traced the way a room is traced ───────────────────────────────
 *
 * The draw tool's natural gesture: follow the room, inside the beams' inner
 * faces, crossing no beam footprint at all. What that area is under is the bay,
 * and the bay is what it has to end up hanging from.
 */

describe('a ceiling drawn inside the bay that frames it', () => {
  // Inside the ring's inner faces on every side — they stand 125 in from the
  // grid lines — and across the partition that divides the bay.
  const TRACED_ROOM = planRect(300, 300, 8700, 5700);

  function drawnCeiling(floor, points) {
    const beamIds = selectCeilingBeamsForArea(floor, points);
    return {
      beamIds,
      ...ceilingOn(floor, {
        attachment: {
          mode: beamIds.length ? CEILING_ATTACHMENT_MODES.BEAM : CEILING_ATTACHMENT_MODES.MANUAL,
          beamIds,
        },
        boundaryPolygon: points,
        boundarySource: CEILING_BOUNDARY_SOURCES.DRAWN,
      }),
    };
  }

  // A ring of four beams with a partition through it: there is nothing inside
  // the ring for the traced outline to cross except the wall, so the beams can
  // only be found through the bay.
  function ringedFrame() {
    const floor = droppedFrame({ crossBeam: false, partitionAt: 4500 });
    return {
      ...floor,
      beams: [...floor.beams, droppedBeam('beam_w', 'col_nw', 'col_sw'), droppedBeam('beam_e', 'col_ne', 'col_se')],
    };
  }

  it('hangs the traced area from the beams around it, and traces the wall through it', () => {
    const floor = ringedFrame();
    const { beamIds, project, ceiling } = drawnCeiling(floor, TRACED_ROOM);

    expect(beamIds).toEqual(['beam_n', 'beam_s', 'beam_w', 'beam_e']);
    expect(ceiling.attachment.mode).toBe(CEILING_ATTACHMENT_MODES.BEAM);
    expect(ceiling.baseElevation).toBe(DROPPED_TOP);
    expect(ceiling.boundaryPolygon).toEqual(TRACED_ROOM);

    // The partition crosses the drawn area, so the boards come out as a sheet
    // per room rather than one sheet built through the wall.
    expect(deriveCeilingDetail(ceiling, project).regions).toHaveLength(2);

    const descriptors = buildCeilingPreviewObjects(ceiling, project, { hideBoards: true });
    expect(descriptors.some((descriptor) => descriptor.metadata.framingKind === 'furring')).toBe(true);
    expect(overlapReport(floor, descriptors).sort((a, b) => b.area - a.area)).toEqual([]);
  });

  it('leaves an area drawn outside every bay on a manual datum', () => {
    const floor = ringedFrame();
    const { beamIds, ceiling } = drawnCeiling(floor, planRect(20000, 0, 26000, 6000));

    // A trace out in the open hangs from nothing, and the top of the storey is
    // the only datum left to give it.
    expect(beamIds).toEqual([]);
    expect(ceiling.attachment).toEqual({ mode: CEILING_ATTACHMENT_MODES.MANUAL, beamIds: [] });
    expect(ceiling.baseElevation).toBe(STOREY_HEIGHT);
  });
});

/* ── A ceiling traced under a cantilever ─────────────────────────────────────
 *
 * The escape hatch the AUTO boundary rule leaves open, driven end to end. The
 * storey above is slabbed 1500 mm past the east frame line and the user traces
 * the underside of that overhang: the outline crosses no beam and sits in no
 * bay, and what it IS under is the deck those beams carry.
 *
 * Measured off the built descriptors because the failure this guards against
 * looks identical in plan. A ceiling stranded on the storey datum draws the same
 * rectangle; it is wrong only in section, where its boards sit flush with the
 * beam tops instead of hanging a drop below them and its trace band never
 * reaches down far enough to see the structure it is beside.
 */

const CANTILEVER_MM = 1500;

function cantileverBay() {
  const columns = [
    ['col_nw', 0, 0],
    ['col_ne', COVERED_WIDTH, 0],
    ['col_sw', 0, COVERED_DEPTH],
    ['col_se', COVERED_WIDTH, COVERED_DEPTH],
  ].map(([id, x, y]) => ({ ...createColumn(x, y, COLUMN_SIZE, COLUMN_SIZE, { height: BEAM_TOP }), id }));

  const bayBeam = (id, startId, endId) => ({
    ...createBeam({ kind: 'column', id: startId }, { kind: 'column', id: endId }, BEAM_WIDTH, 450, BEAM_TOP),
    id,
  });

  const floor = {
    id: 'floor_1',
    levelIndex: 0,
    elevation: 0,
    floorToFloorHeight: BEAM_TOP,
    columns,
    beams: [
      bayBeam('beam_n', 'col_nw', 'col_ne'),
      bayBeam('beam_s', 'col_sw', 'col_se'),
      bayBeam('beam_w', 'col_nw', 'col_sw'),
      bayBeam('beam_e', 'col_ne', 'col_se'),
    ],
    walls: [],
    rooms: [],
    slabs: [],
    stairs: [],
    landings: [],
    fixtures: [],
    railings: [],
  };

  // The deck: the storey's own footprint pulled east past the frame. It rests on
  // these beams, so its underside is at their tops.
  const above = {
    id: 'floor_2',
    levelIndex: 1,
    elevation: BEAM_TOP,
    floorToFloorHeight: BEAM_TOP,
    columns: [],
    beams: [],
    walls: [],
    rooms: [],
    slabs: [
      {
        ...createSlab('floor_2', planRect(0, 0, COVERED_WIDTH + CANTILEVER_MM, COVERED_DEPTH), 200, BEAM_TOP),
        id: 'slab_above',
      },
    ],
  };

  return { floor, project: { floors: [floor, above], ceilings: [] } };
}

function tracedUnderCantilever(points) {
  const { floor, project } = cantileverBay();
  const beamIds = selectCeilingBeamsForArea(floor, points, project);
  const ceiling = createCeilingForProject(project, {
    floorId: floor.id,
    attachment: {
      mode: beamIds.length ? CEILING_ATTACHMENT_MODES.BEAM : CEILING_ATTACHMENT_MODES.MANUAL,
      beamIds,
    },
    boundaryPolygon: points,
    boundarySource: CEILING_BOUNDARY_SOURCES.DRAWN,
  });
  project.ceilings = [ceiling];
  return { floor, project, ceiling, beamIds };
}

describe('a ceiling traced under a cantilevered deck', () => {
  // The overhang itself: from the east beam's outer face out to the slab edge,
  // the full depth of the building.
  const OVERHANG = planRect(COVERED_WIDTH + BEAM_WIDTH / 2, 0, COVERED_WIDTH + CANTILEVER_MM, COVERED_DEPTH);

  it('hangs it from the beams the deck rests on, at the plane the deck bears on', () => {
    const { floor, project, ceiling, beamIds } = tracedUnderCantilever(OVERHANG);

    expect(beamIds).toEqual(['beam_n', 'beam_s', 'beam_w', 'beam_e']);
    expect(ceiling.attachment.mode).toBe(CEILING_ATTACHMENT_MODES.BEAM);
    expect(ceiling.baseElevation).toBe(BEAM_TOP);
    // Drawn areas are never re-derived, so the overhang keeps the outline the
    // user traced rather than collapsing back onto the bay.
    expect(resolveCeilingBoundary(project, ceiling)).toEqual(OVERHANG);

    const elevations = resolveCeilingElevations(project, ceiling);
    // The whole point of attaching: the boards hang a drop below the deck's
    // soffit instead of sitting flush with it, and the band the tracer reads
    // reaches down past the beams beside them.
    expect(elevations.attachment).toBe(BEAM_TOP);
    expect(elevations.boardUnderside).toBe(BEAM_TOP - CEILING_DROP);
    expect(ceilingElevationRange(elevations).min).toBeLessThanOrEqual(BEAM_TOP - 450);

    const descriptors = buildCeilingPreviewObjects(ceiling, project);
    const kinds = new Set(descriptors.map((descriptor) => descriptor.metadata.ceilingDetailKind));
    expect([...kinds].sort()).toEqual(['framing', 'hanger', 'panel']);

    // The rods bridge the gap exactly: they stand on the carriers and stop on
    // the underside of the deck they hang from.
    for (const hanger of descriptors.filter((entry) => entry.metadata.ceilingDetailKind === 'hanger')) {
      expect(hanger.baseElevation + hanger.size.y).toBeCloseTo(BEAM_TOP, 6);
    }

    // Nothing is buried in the frame or the columns it passes.
    expect(overlapReport(floor, descriptors).sort((a, b) => b.area - a.area)).toEqual([]);
  });

  it('stops the boards on the beam face and the slab edge, and stays inside what was traced', () => {
    const { project, ceiling } = tracedUnderCantilever(OVERHANG);
    const descriptors = buildCeilingPreviewObjects(ceiling, project);
    const boards = descriptors.filter((descriptor) => descriptor.metadata.ceilingDetailKind === 'panel');
    const xs = boards.flatMap((board) => board.outline).map((point) => point.x);

    expect(Math.min(...xs)).toBeCloseTo(COVERED_WIDTH + BEAM_WIDTH / 2, 6);
    expect(Math.max(...xs)).toBeCloseTo(COVERED_WIDTH + CANTILEVER_MM, 6);

    // Not one square millimetre of ceiling outside the traced area — no board,
    // no furring, no carrier, no hanger.
    const outside = descriptors
      .map((descriptor) => multiPolygonArea(subtractPolygons(planFootprint(descriptor), [OVERHANG])))
      .reduce((total, area) => total + area, 0);
    expect(outside).toBeLessThan(1);
  });

  it('traces the perimeter beam through an outline drawn across it', () => {
    // The other way this gets traced: start inside the bay, run out past the
    // frame. That outline crosses a beam, so it hangs from the beam it crosses
    // — and the beam is then structure standing in the middle of the ceiling,
    // which the boards stop either side of.
    const lapped = planRect(COVERED_WIDTH - 1000, 500, COVERED_WIDTH + CANTILEVER_MM, COVERED_DEPTH - 500);
    const { floor, project, ceiling, beamIds } = tracedUnderCantilever(lapped);

    expect(beamIds).toEqual(['beam_e']);
    expect(ceiling.baseElevation).toBe(BEAM_TOP);
    expect(deriveCeilingDetail(ceiling, project).regions).toHaveLength(2);

    const descriptors = buildCeilingPreviewObjects(ceiling, project);
    const xs = descriptors
      .filter((descriptor) => descriptor.metadata.ceilingDetailKind === 'panel')
      .flatMap((board) => board.outline)
      .map((point) => point.x);
    for (const face of [COVERED_WIDTH - BEAM_WIDTH / 2, COVERED_WIDTH + BEAM_WIDTH / 2]) {
      expect(xs.some((x) => Math.abs(x - face) < 1e-6)).toBe(true);
    }
    expect(overlapReport(floor, descriptors).sort((a, b) => b.area - a.area)).toEqual([]);
  });
});
