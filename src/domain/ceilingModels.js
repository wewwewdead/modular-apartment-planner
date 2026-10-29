import { generateId } from './ids';
import { pointInPolygon, polygonArea } from '@/geometry/polygon';
import { intersectPolygons, subtractPolygons } from '@/geometry/polygonBoolean';
import { getWallRenderData } from '@/geometry/wallColumnGeometry';
import { columnOutline } from '@/geometry/columnGeometry';
import { collectCeilingObstructions } from './ceilingObstructions';
import { resolveColumnTopLevel } from './beamLevels';
import { getFloorTopElevation, getProjectFloor } from './floorModels';
import {
  deriveCeilingBoundaryFromBeams,
  deriveCeilingStructuralCoverage,
  resolveCeilingSupportBeams,
  selectCeilingCoverageSlabs,
  selectPreferredCeilingBeamLevel,
} from './ceilingBeamAttachment';
import {
  CEILING_BOARD_THICKNESS,
  CEILING_CARRIER_DEPTH,
  CEILING_CARRIER_SPACING,
  CEILING_CARRIER_WIDTH,
  CEILING_DROP,
  CEILING_FURRING_DEPTH,
  CEILING_FURRING_SPACING,
  CEILING_FURRING_WIDTH,
  CEILING_HANGER_PLAN_SIZE,
  CEILING_HANGER_SPACING,
  CEILING_WALL_ANGLE_LEG,
  WALL_HEIGHT,
} from './defaults';
import {
  CEILING_APPLICATIONS,
  CEILING_BOARD_MATERIALS,
  CEILING_FRAME_MATERIALS,
  DEFAULT_CEILING_JURISDICTION_PROFILE_ID,
  DEFAULT_CEILING_PRODUCT_PROFILE_ID,
  getCeilingProductProfile,
} from './ceilingProductProfiles';
import {
  BEAM_ANGLE_RANGE_DEG,
  getBulbType,
  getFixtureType,
  isKnownColorTemperature,
  isPendantFixture,
  resolveFixtureBulbId,
  resolveFixturePhotometrics,
} from './lightingCatalog';
// A dimension is a dimension: two points in an assembly's own UV frame, a
// direction, an offset and a rounding rule. The wall detailing module owns that
// vocabulary already, and a reflected ceiling plan measures in exactly the same
// frame — so the ceiling brings the model across rather than growing a second
// one that would drift from it.
import {
  WALL_DIMENSION_MODES,
  WALL_DIMENSION_PRECISIONS,
  createWallDimension,
  describeDimension,
  normalizeDimensionPoint,
  rectAnchorPoint,
  uniqueDimensionValues,
} from './wallDetailing';

export const CEILING_SCHEMA_VERSION = 1;

export const CEILING_ATTACHMENT_MODES = Object.freeze({
  BEAM: 'beam',
  MANUAL: 'manual',
});

// Where a ceiling's plan extent comes from. 'auto' lets the support beams
// redraw it on every read, which is what a ceiling added from the sidebar wants;
// 'drawn' means someone traced the area they wanted covered, and no amount of
// beam movement is allowed to redraw it for them.
export const CEILING_BOUNDARY_SOURCES = Object.freeze({
  AUTO: 'auto',
  DRAWN: 'drawn',
});

export const CEILING_OPENING_TYPES = Object.freeze({
  ACCESS_HATCH: 'access_hatch',
  DOWNLIGHT: 'downlight',
  DIFFUSER: 'diffuser',
  CUSTOM: 'custom',
});

export const CEILING_PANEL_LAYOUT_MODES = Object.freeze({
  GRID: 'grid',
  CUSTOM: 'custom',
});

export const CEILING_FRAMING_LAYOUT_MODES = Object.freeze({
  AUTOMATIC: 'automatic',
  CUSTOM: 'custom',
});

export const CEILING_FASTENER_LAYOUT_MODES = Object.freeze({
  GENERATED: 'generated',
  CUSTOM: 'custom',
});

const EPSILON = 0.01;
// How far inboard of an edge a containment test looks, in mm: far enough to
// clear floating-point noise on the edge itself, close enough that nothing real
// fits between the edge and the probe.
const MIN_RING_PROBE = 1;
const DEFAULT_CEILING_LENGTH = 6000;
const DEFAULT_CEILING_DEPTH = 4000;
const DEFAULT_CEILING_BASE_ELEVATION = WALL_HEIGHT;

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function positive(value, fallback, minimum = EPSILON) {
  const number = finite(value, fallback);
  return number >= minimum ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function rectangleArea(rect) {
  return Math.max(0, rect.u1 - rect.u0) * Math.max(0, rect.v1 - rect.v0);
}

function rectOutline(rect) {
  return [
    { u: rect.u0, v: rect.v0 },
    { u: rect.u1, v: rect.v0 },
    { u: rect.u1, v: rect.v1 },
    { u: rect.u0, v: rect.v1 },
  ];
}

function uvToXy(points) {
  return points.map((point) => ({ x: point.u, y: point.v }));
}

function xyToUv(points) {
  return points.map((point) => ({ u: point.x, v: point.y }));
}

function polygonAreaUv(points) {
  return polygonArea(uvToXy(points));
}

function regionArea(region) {
  return Math.max(
    0,
    polygonAreaUv(region.outline) - region.holes.reduce((total, hole) => total + polygonAreaUv(hole), 0),
  );
}

function polygonBounds(points) {
  return {
    u0: Math.min(...points.map((point) => point.u)),
    u1: Math.max(...points.map((point) => point.u)),
    v0: Math.min(...points.map((point) => point.v)),
    v1: Math.max(...points.map((point) => point.v)),
  };
}

function clonePlanPoints(points) {
  return (Array.isArray(points) ? points : [])
    .filter((point) => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y)))
    .map((point) => ({ x: Number(point.x), y: Number(point.y) }));
}

function createDefaultCeilingBoundary() {
  const halfLength = DEFAULT_CEILING_LENGTH / 2;
  const halfDepth = DEFAULT_CEILING_DEPTH / 2;
  return [
    { x: -halfLength, y: -halfDepth },
    { x: halfLength, y: -halfDepth },
    { x: halfLength, y: halfDepth },
    { x: -halfLength, y: halfDepth },
  ];
}

function boundsToPolygon(points = []) {
  const valid = clonePlanPoints(points);
  if (valid.length < 3) return createDefaultCeilingBoundary();

  const minX = Math.min(...valid.map((point) => point.x));
  const maxX = Math.max(...valid.map((point) => point.x));
  const minY = Math.min(...valid.map((point) => point.y));
  const maxY = Math.max(...valid.map((point) => point.y));

  const width = Math.max(1000, maxX - minX);
  const height = Math.max(1000, maxY - minY);
  const insetX = width < 1000 ? (1000 - width) / 2 : 0;
  const insetY = height < 1000 ? (1000 - height) / 2 : 0;

  return [
    { x: minX - insetX, y: minY - insetY },
    { x: maxX + insetX, y: minY - insetY },
    { x: maxX + insetX, y: maxY + insetY },
    { x: minX - insetX, y: maxY + insetY },
  ];
}

export function createCeilingOpening(rect = {}, options = {}) {
  const requestedType = options.type ?? rect?.type;
  return {
    id: options.id || rect?.id || generateId('ceil_open'),
    type: Object.values(CEILING_OPENING_TYPES).includes(requestedType)
      ? requestedType
      : CEILING_OPENING_TYPES.ACCESS_HATCH,
    u: finite(rect?.u, finite(rect?.u0)),
    v: finite(rect?.v, finite(rect?.v0)),
    width: positive(rect?.width, 600),
    height: positive(rect?.height, 600),
    label: options.label || rect?.label || '',
  };
}

// Degrees CCW from +U in the RCP plane, folded into one turn so a handle that
// was dragged round three times still names the direction it points.
function normalizeAzimuth(degrees) {
  return ((degrees % 360) + 360) % 360;
}

// null is an answer on a fixture — "whatever the lamp does" — so an absent or
// unreadable value has to come back as null rather than as zero, which would
// read as a real figure of nothing.
function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * A luminaire sitting on the ceiling at a point in RCP-local UV. The catalog
 * settles what can be built: a lamp the fixture has no socket for, a colour
 * temperature nobody sells, or a tilt past the gimbal's stop are all corrected
 * here rather than carried as data the renderer would have to second-guess.
 */
export function createCeilingLightFixture(point, options = {}) {
  const type = getFixtureType(options.fixtureType ?? point?.fixtureType);
  const bulb = getBulbType(resolveFixtureBulbId(type.id, options.bulbType ?? point?.bulbType));
  const colorTempK = finite(options.colorTempK ?? point?.colorTempK, bulb.defaultCct);
  const lumensOverride = nullableNumber(options.lumensOverride ?? point?.lumensOverride);
  const beamAngleDeg = nullableNumber(options.beamAngleDeg ?? point?.beamAngleDeg);
  const aim = options.aim ?? point?.aim;
  return {
    id: options.id || point?.id || generateId('ceil_light'),
    u: finite(point?.u),
    v: finite(point?.v),
    fixtureType: type.id,
    bulbType: bulb.id,
    colorTempK: isKnownColorTemperature(colorTempK) ? colorTempK : bulb.defaultCct,
    // null is the lamp's own rating; a number is a figure read off a real data
    // sheet, so a zero or a negative one is not an override at all.
    lumensOverride: lumensOverride !== null && lumensOverride > 0 ? lumensOverride : null,
    beamAngleDeg:
      beamAngleDeg === null ? null : clamp(beamAngleDeg, BEAM_ANGLE_RANGE_DEG.min, BEAM_ANGLE_RANGE_DEG.max),
    dropMm: positive(options.dropMm ?? point?.dropMm, type.defaultDropMm),
    aim: {
      // A fixture that cannot be aimed has a stop of 0°, which is the same
      // clamp saying it points straight down.
      tiltDeg: clamp(finite(aim?.tiltDeg), 0, type.maxTiltDeg),
      azimuthDeg: normalizeAzimuth(finite(aim?.azimuthDeg)),
    },
    castShadow: Boolean(options.castShadow ?? point?.castShadow ?? true),
    label: options.label || point?.label || '',
  };
}

export function createCeilingLighting(overrides = {}) {
  return {
    fixtures: (Array.isArray(overrides?.fixtures) ? overrides.fixtures : []).map((fixture) =>
      createCeilingLightFixture(fixture, fixture),
    ),
  };
}

export function createCeilingFace(overrides = {}) {
  return {
    enabled: overrides.enabled ?? true,
    productProfileId: overrides.productProfileId || DEFAULT_CEILING_PRODUCT_PROFILE_ID,
    application: overrides.application || CEILING_APPLICATIONS.INTERIOR_CEILING,
    boardThickness: positive(overrides.boardThickness, CEILING_BOARD_THICKNESS),
    layout: {
      mode: Object.values(CEILING_PANEL_LAYOUT_MODES).includes(overrides.layout?.mode)
        ? overrides.layout.mode
        : CEILING_PANEL_LAYOUT_MODES.GRID,
      // 'vertical' keeps the board long side running along V (plan north/south).
      orientation: overrides.layout?.orientation === 'horizontal' ? 'horizontal' : 'vertical',
      originU: finite(overrides.layout?.originU, 0),
      originV: finite(overrides.layout?.originV, 0),
      boardWidth: positive(overrides.layout?.boardWidth, 1219),
      boardHeight: positive(overrides.layout?.boardHeight, 2438),
      horizontalGap: Math.max(0, finite(overrides.layout?.horizontalGap, 6)),
      verticalGap: Math.max(0, finite(overrides.layout?.verticalGap, 6)),
      jointSystem: overrides.layout?.jointSystem || 'express',
      customPanels: Array.isArray(overrides.layout?.customPanels)
        ? overrides.layout.customPanels.map(({ material, ...panel }) => ({
            ...panel,
            ...(Array.isArray(panel.outlinePoints)
              ? { outlinePoints: panel.outlinePoints.map((point) => ({ ...point })) }
              : {}),
            // A board may be boarded in something other than the profile's own
            // material — half a ceiling in fiber cement and the rest in plywood
            // is one ceiling, not two. Only a known material is kept: an unknown
            // string, or the key cleared back to the profile default, leaves no
            // key at all, so "absent" is the only way a board says "inherit".
            ...(Object.values(CEILING_BOARD_MATERIALS).includes(material) ? { material } : {}),
          }))
        : [],
    },
    fasteners: {
      mode: Object.values(CEILING_FASTENER_LAYOUT_MODES).includes(overrides.fasteners?.mode)
        ? overrides.fasteners.mode
        : CEILING_FASTENER_LAYOUT_MODES.GENERATED,
      type: overrides.fasteners?.type || '',
      edgeClearance: positive(overrides.fasteners?.edgeClearance, 12),
      cornerClearance: positive(overrides.fasteners?.cornerClearance, 50),
      perimeterSpacing: positive(overrides.fasteners?.perimeterSpacing, 150),
      fieldSpacing: positive(overrides.fasteners?.fieldSpacing, 230),
      manual: Array.isArray(overrides.fasteners?.manual)
        ? overrides.fasteners.manual.map((fastener) => ({ ...fastener }))
        : [],
      removedGeneratedIds: Array.isArray(overrides.fasteners?.removedGeneratedIds)
        ? [...overrides.fasteners.removedGeneratedIds]
        : [],
    },
  };
}

export function createCeilingFraming(overrides = {}) {
  return {
    mode: Object.values(CEILING_FRAMING_LAYOUT_MODES).includes(overrides.mode)
      ? overrides.mode
      : CEILING_FRAMING_LAYOUT_MODES.AUTOMATIC,
    material: Object.values(CEILING_FRAME_MATERIALS).includes(overrides.material)
      ? overrides.material
      : CEILING_FRAME_MATERIALS.LIGHT_GAUGE_STEEL,
    furringSpacing: positive(overrides.furringSpacing, CEILING_FURRING_SPACING),
    carrierSpacing: positive(overrides.carrierSpacing, CEILING_CARRIER_SPACING),
    furringWidth: positive(overrides.furringWidth, CEILING_FURRING_WIDTH),
    furringDepth: positive(overrides.furringDepth, CEILING_FURRING_DEPTH),
    carrierWidth: positive(overrides.carrierWidth, CEILING_CARRIER_WIDTH),
    carrierDepth: positive(overrides.carrierDepth, CEILING_CARRIER_DEPTH),
    members: Array.isArray(overrides.members) ? overrides.members.map((member) => ({ ...member })) : [],
    removedGeneratedIds: Array.isArray(overrides.removedGeneratedIds) ? [...overrides.removedGeneratedIds] : [],
  };
}

export function createCeilingSuspension(overrides = {}) {
  return {
    drop: positive(overrides.drop, CEILING_DROP),
    hangerSpacing: positive(overrides.hangerSpacing, CEILING_HANGER_SPACING),
  };
}

/**
 * One hand-drawn measurement on the reflected ceiling plan. The shape is the
 * wall editor's, endpoints and all, so both drawings round, snap and re-anchor
 * identically; only the id prefix says which drawing it was taken on.
 */
export function createCeilingDimension(dimension = {}) {
  return createWallDimension({ ...dimension, id: dimension.id || generateId('ceiling_dim') });
}

/**
 * What the plan is dimensioned to: how finely measurements round, which derived
 * chains are drawn, and every measurement taken by hand. The show flags name the
 * things a ceiling has — boards and furring rather than panels and studs.
 */
export function createCeilingDimensions(overrides = {}) {
  return {
    precision: WALL_DIMENSION_PRECISIONS.includes(Number(overrides?.precision)) ? Number(overrides.precision) : 0.01,
    showOverall: overrides?.showOverall ?? true,
    showOpenings: overrides?.showOpenings ?? true,
    showBoards: overrides?.showBoards ?? false,
    showFraming: overrides?.showFraming ?? false,
    manual: Array.isArray(overrides?.manual)
      ? overrides.manual.map((dimension) => createCeilingDimension(dimension))
      : [],
  };
}

export function createCeilingDetailing(overrides = {}) {
  return {
    schemaVersion: CEILING_SCHEMA_VERSION,
    enabled: overrides.enabled ?? true,
    jurisdictionProfileId: overrides.jurisdictionProfileId || DEFAULT_CEILING_JURISDICTION_PROFILE_ID,
    face: createCeilingFace(overrides.face),
    framing: createCeilingFraming(overrides.framing),
    suspension: createCeilingSuspension(overrides.suspension),
    openings: (Array.isArray(overrides.openings) ? overrides.openings : []).map((opening) =>
      createCeilingOpening(opening, opening),
    ),
    lighting: createCeilingLighting(overrides.lighting),
    dimensions: createCeilingDimensions(overrides.dimensions),
  };
}

export function createCustomCeilingFramingMember(member = {}) {
  const orientation = member.orientation === 'vertical' ? 'vertical' : 'horizontal';
  const u0 = finite(member.u0, finite(member.u));
  const u1 = finite(member.u1, finite(member.u) + positive(member.width, CEILING_FURRING_WIDTH));
  const v0 = finite(member.v0, finite(member.v));
  const v1 = finite(member.v1, finite(member.v) + positive(member.height, CEILING_FURRING_WIDTH));
  return {
    id: member.id || generateId('ceil_frame'),
    kind: member.kind || (orientation === 'vertical' ? 'carrier' : 'furring'),
    orientation,
    u0: Math.min(u0, u1),
    u1: Math.max(u0, u1),
    v0: Math.min(v0, v1),
    v1: Math.max(v0, v1),
    depth: positive(member.depth, CEILING_FURRING_DEPTH),
    material: member.material || null,
    label: member.label || '',
    custom: true,
  };
}

export function createManualCeilingFastener(point, options = {}) {
  return {
    id: options.id || generateId('ceil_fastener'),
    u: finite(point?.u),
    v: finite(point?.v),
    type: options.type || 'corrosion_resistant_screw',
    note: options.note || '',
    custom: true,
  };
}

function normalizeBeamIds(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter((id) => typeof id === 'string' && id))];
}

export function createCeiling(name = 'Ceiling', options = {}) {
  const boundaryPolygon = clonePlanPoints(options.boundaryPolygon);
  return {
    id: options.id || generateId('ceiling'),
    name,
    floorId: options.floorId ?? null,
    phaseId: typeof options.phaseId === 'string' && options.phaseId ? options.phaseId : null,
    attachment: {
      // Anything else — including a 'truss' left behind by a save older than the
      // beam attachment — is a datum this ceiling can no longer resolve, so it
      // keeps whatever it stored and stands on its own.
      mode: Object.values(CEILING_ATTACHMENT_MODES).includes(options.attachment?.mode)
        ? options.attachment.mode
        : CEILING_ATTACHMENT_MODES.MANUAL,
      beamIds: normalizeBeamIds(options.attachment?.beamIds),
    },
    boundaryPolygon: boundaryPolygon.length >= 3 ? boundaryPolygon : createDefaultCeilingBoundary(),
    // Only an explicit 'drawn' claims a hand-traced area. Anything else — a save
    // written before the draw tool existed, or a junk value — is a ceiling that
    // never asked to keep its own outline.
    boundarySource:
      options.boundarySource === CEILING_BOUNDARY_SOURCES.DRAWN
        ? CEILING_BOUNDARY_SOURCES.DRAWN
        : CEILING_BOUNDARY_SOURCES.AUTO,
    baseElevation: finite(options.baseElevation, DEFAULT_CEILING_BASE_ELEVATION),
    detailing: createCeilingDetailing(options.detailing),
  };
}

export function deriveCeilingBoundaryForFloor(floor) {
  const points = [];
  for (const wall of floor?.walls || []) {
    points.push(...(getWallRenderData(wall, floor.columns || []).outline || []));
  }
  for (const room of floor?.rooms || []) {
    points.push(...(room.points || []));
  }
  for (const slab of floor?.slabs || []) {
    points.push(...(slab.boundaryPoints || []));
  }
  for (const column of floor?.columns || []) {
    points.push(...columnOutline(column));
  }
  return boundsToPolygon(points.filter(Boolean));
}

export function createCeilingForProject(project, options = {}) {
  const floorId = options.floorId ?? project?.floors?.[0]?.id ?? null;
  const floor = getProjectFloor(project, floorId);
  const requestedBeamIds = normalizeBeamIds(options.attachment?.beamIds);
  // An explicit manual attachment is a decision, not a default: only a ceiling
  // that asked for nothing goes looking for beams to hang from.
  const wantsManual = options.attachment?.mode === CEILING_ATTACHMENT_MODES.MANUAL && !requestedBeamIds.length;
  const supportBeams = wantsManual
    ? []
    : requestedBeamIds.length
      ? resolveCeilingSupportBeams(floor, requestedBeamIds)
      : selectPreferredCeilingBeamLevel(floor)?.beams || [];

  // Whether a ceiling hangs from beams and what shape they enclose are two
  // different questions, and naming beams answers only the first. A single beam
  // — or a pair on one grid line — frames no rectangle to draw, yet it is still
  // what the ceiling hangs from, and dropping such a ceiling back to the storey
  // datum would strand it above the very beams it was asked to hang under:
  // manual mode is traced against its own board plane alone, so nothing below
  // that plane is seen and the framing derives straight through the structure.
  //
  // Only a caller that named beams gets that reading. A ceiling that asked for
  // nothing is being guessed at, and there the beams' own rectangle is the
  // evidence that a level frames anything at all — while a ceiling whose only
  // shape came from the slab overhead hangs from nothing and must not claim to
  // hang from beams.
  const attachedToBeams = requestedBeamIds.length
    ? supportBeams.length > 0
    : clonePlanPoints(deriveCeilingBoundaryFromBeams(supportBeams, floor)).length >= 3;
  const beamElevation = attachedToBeams ? Math.min(...supportBeams.map((beam) => finite(beam.floorLevel))) : null;
  const coverage = clonePlanPoints(deriveCeilingStructuralCoverage({ project, floor, supportBeams }));

  const floorTopElevation = floor
    ? finite(floor.elevation, 0) + finite(floor.floorToFloorHeight, DEFAULT_CEILING_BASE_ELEVATION)
    : DEFAULT_CEILING_BASE_ELEVATION;

  return createCeiling(options.name ?? 'Ceiling', {
    ...options,
    floorId,
    attachment: {
      mode: attachedToBeams ? CEILING_ATTACHMENT_MODES.BEAM : CEILING_ATTACHMENT_MODES.MANUAL,
      beamIds: attachedToBeams ? supportBeams.map((beam) => beam.id) : [],
    },
    // A polygon handed in wins outright — that is how a drawn ceiling keeps the
    // area it was traced over while still hanging from the beams found above it.
    // Failing that the structure answers, and only a floor with no structure
    // overhead at all falls back to the bounding box of everything on it.
    boundaryPolygon:
      clonePlanPoints(options.boundaryPolygon).length >= 3
        ? options.boundaryPolygon
        : coverage.length >= 3
          ? coverage
          : deriveCeilingBoundaryForFloor(floor),
    baseElevation: finite(options.baseElevation, attachedToBeams ? beamElevation : floorTopElevation),
  });
}

export function resolveCeilingDetailing(ceiling) {
  return createCeilingDetailing(ceiling?.detailing);
}

export function getProjectCeilings(project, floorId = null) {
  const ceilings = project?.ceilings || [];
  if (!floorId) return ceilings;
  return ceilings.filter((ceiling) => ceiling.floorId === floorId);
}

export function getProjectCeiling(project, ceilingId) {
  return (project?.ceilings || []).find((ceiling) => ceiling.id === ceilingId) || null;
}

/**
 * The beams a ceiling currently hangs from. They are always on the ceiling's own
 * floor — a beam carries what stands under it — so a deleted or re-levelled beam
 * shows up here on the next read rather than being remembered from creation.
 */
export function resolveCeilingBeamSupports(project, ceiling) {
  if (ceiling?.attachment?.mode !== CEILING_ATTACHMENT_MODES.BEAM) return [];
  return resolveCeilingSupportBeams(getProjectFloor(project, ceiling.floorId), ceiling.attachment.beamIds);
}

// The floors whose structure a ceiling has to work around: only its own, since
// what it hangs from and what obstructs it both stand on it.
function resolveCeilingFloors(project, ceiling) {
  return [getProjectFloor(project, ceiling?.floorId)].filter(Boolean);
}

/**
 * The slabs overhead a ceiling sits under, and the floor they are on. Exported
 * so the RCP editor's preview project can carry exactly the slabs the boundary
 * would resolve through instead of guessing at them — the deck the boards hang
 * beneath, and the boundary itself for a ceiling whose beams frame nothing.
 */
export function resolveCeilingCoverageSlabs(project, ceiling) {
  return selectCeilingCoverageSlabs({
    project,
    floor: getProjectFloor(project, ceiling?.floorId),
    supportBeams: resolveCeilingBeamSupports(project, ceiling),
  });
}

// resolveCeilingBoundary is read constantly — the plan renderer, the properties
// panel, the 3D preview and the RCP editor all ask for it, and a drag asks again
// every frame — while the polygon booleans behind it are not free. Store state
// is immutable, so a project or ceiling that changed is a different object and
// object identity is a sound key for the answer.
const boundaryCache = new WeakMap();

function cachedBoundary(project, ceiling, derive) {
  if (!project || !ceiling) return derive();

  let byCeiling = boundaryCache.get(project);
  if (!byCeiling) {
    byCeiling = new WeakMap();
    boundaryCache.set(project, byCeiling);
  }
  let boundary = byCeiling.get(ceiling);
  if (!boundary) {
    boundary = derive();
    byCeiling.set(ceiling, boundary);
  }
  return boundary;
}

export function resolveCeilingBoundary(project, ceiling) {
  return cachedBoundary(project, ceiling, () => {
    const stored = clonePlanPoints(ceiling?.boundaryPolygon);
    // A drawn area is a decision about where the ceiling stops, so the structure
    // gets no say in it. The beams still fix the plane it hangs from — only the
    // outline is withheld, and only because someone traced it by hand.
    if (ceiling?.boundarySource === CEILING_BOUNDARY_SOURCES.DRAWN && stored.length >= 3) return stored;

    // Derived on every read, so dragging a column or moving a beam moves the
    // ceiling with it. Pulling a slab edge does not: the frame governs the AUTO
    // boundary, and a ceiling wanted out under an overhang is traced by hand —
    // which is the branch above. The stored polygon is the snapshot to fall back
    // on when the structure no longer resolves.
    const derived = clonePlanPoints(
      deriveCeilingStructuralCoverage({
        project,
        floor: getProjectFloor(project, ceiling?.floorId),
        supportBeams: resolveCeilingBeamSupports(project, ceiling),
      }),
    );
    if (derived.length >= 3) return derived;

    return stored.length >= 3 ? stored : createDefaultCeilingBoundary();
  });
}

function findColumn(floor, columnId) {
  return columnId ? (floor?.columns || []).find((column) => column.id === columnId) || null : null;
}

/**
 * Where one beam end stands in plan, or null when it stands nowhere the model
 * can name: a point ref carries its position on its face, a column ref borrows
 * its column's centre, and a ref to a column that has been deleted has no place
 * left to speak from.
 */
function beamEndAnchor(floor, ref) {
  if (ref?.kind === 'point') return { x: finite(ref.x), y: finite(ref.y) };
  const column = ref?.kind === 'column' ? findColumn(floor, ref.id) : null;
  return column ? { x: finite(column.x), y: finite(column.y) } : null;
}

export function resolveCeilingElevations(project, ceiling) {
  const detailing = resolveCeilingDetailing(ceiling);
  const beamMode = ceiling?.attachment?.mode === CEILING_ATTACHMENT_MODES.BEAM;
  const floor = getProjectFloor(project, ceiling?.floorId);
  const supports = resolveCeilingBeamSupports(project, ceiling);
  const supportLevels = supports.map((beam) => Number(beam.floorLevel)).filter(Number.isFinite);
  // The lowest beam top governs: the ceiling cannot hang from higher than the
  // support that stops first. With no beam left to read, the stored elevation is
  // the last thing the ceiling knew about its own attachment plane.
  const attachment = beamMode && supportLevels.length ? Math.min(...supportLevels) : finite(ceiling?.baseElevation, 0);
  // Manual mode stores the board underside directly; beam mode hangs the board
  // below the attachment plane by the suspension drop.
  const boardUnderside = beamMode ? attachment - detailing.suspension.drop : attachment;
  const boardTop = boardUnderside + detailing.face.boardThickness;
  const furringBottom = boardTop;
  const furringTop = furringBottom + detailing.framing.furringDepth;
  const carrierBottom = furringTop;
  const carrierTop = carrierBottom + detailing.framing.carrierDepth;
  // The lowest underside of the beams the ceiling hangs from. The assembly hangs
  // INSIDE the beams' depth, so the bay it fills is bounded not by the boards'
  // own plane but by everything built up under those beams — a partition fitted
  // to the beam soffit, a column stopped at it — and the band the tracer reads
  // has to reach at least that far down to see them. Null when there is nothing
  // to hang from: a manual ceiling sits on its own datum and knows no soffit,
  // and a beam-attached one whose beams have been deleted has none left to read.
  // A beam stored without a usable depth is taken at its own level, which is
  // what a beam of no depth physically is.
  const supportSoffits = supports
    .map((beam) => Number(beam.floorLevel) - Math.max(Number(beam.depth) || 0, 0))
    .filter(Number.isFinite);
  const supportSoffit = supportSoffits.length ? Math.min(...supportSoffits) : null;
  // The level the support beams are carried at. Retyping a beam's level lifts it
  // off the columns holding it up without shortening them, and the zone between
  // the two is still structure: the columns are built up through it to meet the
  // beam, and anything else standing in it — a partition the fitter never
  // touched because it runs under no beam, a column left at its old head — is
  // beside the assembly rather than under it.
  //
  // The bay's bearing plane is the HIGHEST head any of its supports stand on,
  // read per beam END rather than per beam. What this level states is where the
  // storey's structure used to stop — the plane the framing stood at before the
  // beams were raised off it — and that is a fact about the bay, not about its
  // unluckiest corner. One stub column landing low (a split-level pocket, a post
  // stopped short) says where a single beam end bears; it says nothing about
  // where the storey stops, and letting it drag the plane down would reach the
  // band past everything standing in the bay and cut the boards around walls
  // that pass a clear metre underneath. Per end, because a bay whose every beam
  // happens to touch that one short column would otherwise take its level from
  // it twice over instead of from the tall columns carrying the other ends.
  //
  // Null on the same terms as the soffit, since both are read off the support
  // beams and there is nothing to bear on without them. A beam that names no
  // column it can find — bare point refs, or columns since deleted or left
  // heightless — bears on nothing readable and falls back once to the top of its
  // storey, the only statement left about where its support stops.
  //
  // This scalar is the FIELDLESS SUMMARY of the bay: one number, the highest
  // plane in it, and it is what `ceilingElevationRange` folds into the band for
  // every caller that can only be handed a band. `supportBearingEnds` below
  // carries the same statements unsummarised, for the one caller that can ask
  // the question locally.
  const supportBearings = supports.flatMap((beam) => {
    const ends = [beam.startRef, beam.endRef]
      .filter((ref) => ref?.kind === 'column')
      .map((ref) => resolveColumnTopLevel(floor, ref.id))
      .filter(Number.isFinite);
    return ends.length ? ends : [getFloorTopElevation(floor)];
  });
  const supportBearing = supportBearings.length ? Math.max(...supportBearings) : null;
  // The same bearing statements as positions instead of as one number: one
  // entry per statement, anchored where in plan it was made and carrying the
  // level it names. A bay that genuinely steps has no single bearing plane —
  // the 2000 stub in the split-level pocket and the 3000 columns along the rest
  // of the frame are both true, each about its own end of the bay — so the
  // tracer is handed the ends themselves and judges each obstruction against
  // the plane of the support nearest it. Summarising first is what loses the
  // step: read as a MAX the pocket disappears and a partition built to it is
  // missed, read as a MIN the pocket speaks for the whole bay and the boards
  // are cut around walls a metre clear of them.
  //
  // Only an end that can say WHERE contributes. A column end anchors at that
  // column's centre; a bare-point end at the point it was drawn on; a ref to a
  // column since deleted at nothing at all, because a statement with no place
  // cannot be the nearest one to anything. The storey-top fallback is a fact
  // about one beam that bears on nothing readable, so it is anchored at that
  // beam's own ends rather than left to float over the bay.
  //
  // Absent — not empty — where a ceiling has nothing to hang from, so the
  // elevations of a manual ceiling stay the object they have always been. The
  // field is a refinement offered to a caller that can use it, never a new part
  // of the shape every reader has to know about.
  const supportBearingEnds = supports.flatMap((beam) => {
    const refs = [beam.startRef, beam.endRef];
    const borne = refs
      .map((ref) => {
        if (ref?.kind !== 'column') return null;
        const level = resolveColumnTopLevel(floor, ref.id);
        const column = Number.isFinite(level) ? findColumn(floor, ref.id) : null;
        return column ? { x: finite(column.x), y: finite(column.y), level } : null;
      })
      .filter(Boolean);
    if (borne.length) return borne;

    const storeyTop = getFloorTopElevation(floor);
    return refs
      .map((ref) => beamEndAnchor(floor, ref))
      .filter(Boolean)
      .map((anchor) => ({ ...anchor, level: storeyTop }));
  });
  return {
    attachment,
    boardUnderside,
    boardTop,
    furringBottom,
    furringTop,
    carrierBottom,
    carrierTop,
    supportSoffit,
    supportBearing,
    ...(supportBearingEnds.length ? { supportBearingEnds } : {}),
  };
}

/**
 * Direction of the boundary's longest edge, folded to within ±45° of plan
 * east. Folding modulo 90° keeps a plan-aligned boundary on the classic
 * east/north frame regardless of its proportions (a portrait room does not
 * turn sideways), and stops a near-square rotated ceiling from swapping U and
 * V when its dimensions drift past each other.
 */
function resolveCeilingFrameAxis(points) {
  let longest = 0;
  let edge = null;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    const candidate = { x: next.x - points[index].x, y: next.y - points[index].y };
    const length = Math.hypot(candidate.x, candidate.y);
    if (length > longest + EPSILON) {
      longest = length;
      edge = candidate;
    }
  }
  if (!edge) return { x: 1, y: 0 };

  const quarter = Math.PI / 2;
  const angle = Math.atan2(edge.y, edge.x);
  const folded = angle - quarter * Math.round(angle / quarter);
  return { x: Math.cos(folded), y: Math.sin(folded) };
}

/**
 * Ceiling-local UV is the reflected-ceiling-plan frame, aligned to the
 * ceiling's own edges rather than plan north: U runs along the boundary's
 * longest edge (folded to within ±45° of plan east) and V runs across it. A
 * ceiling hung from a rotated beam grid therefore draws upright in the RCP,
 * and members drawn along U/V land parallel to its real edges instead of
 * crossing them at the lot angle. For a plan-aligned boundary this is exactly
 * the classic frame (U = plan x − minX, V = maxY − plan y). V is mirrored
 * against plan Y either way, so the drawing keeps the same handedness as the
 * floor plan it sits over.
 */
export function getCeilingLocalSpace(boundaryPolygon) {
  const points = clonePlanPoints(boundaryPolygon);
  const axisU = resolveCeilingFrameAxis(points);
  const axisV = { x: axisU.y, y: -axisU.x };
  const localU = (point) => point.x * axisU.x + point.y * axisU.y;
  const localV = (point) => point.x * axisV.x + point.y * axisV.y;
  const minU = points.length ? Math.min(...points.map(localU)) : 0;
  const maxU = points.length ? Math.max(...points.map(localU)) : 0;
  const minV = points.length ? Math.min(...points.map(localV)) : 0;
  const maxV = points.length ? Math.max(...points.map(localV)) : 0;
  return {
    axisU,
    axisV,
    rotation: Math.atan2(axisU.y, axisU.x),
    length: maxU - minU,
    depth: maxV - minV,
    toLocal(point) {
      const plan = { x: finite(point?.x), y: finite(point?.y) };
      return { u: localU(plan) - minU, v: localV(plan) - minV };
    },
    toPlan(point) {
      const u = finite(point?.u) + minU;
      const v = finite(point?.v) + minV;
      return { x: u * axisU.x + v * axisV.x, y: u * axisU.y + v * axisV.y };
    },
  };
}

function openingRect(opening) {
  return {
    ...opening,
    u0: opening.u,
    u1: opening.u + opening.width,
    v0: opening.v,
    v1: opening.v + opening.height,
  };
}

/**
 * Vertical slice a ceiling has to be traced against, from the lowest level that
 * still bounds it up to whatever it hangs from. Structure crossing this band is
 * what the ceiling has to stop at. Exported because the RCP editor's 3D preview
 * has to show exactly the structure the boards were traced around, and it can
 * only do that by asking for the same band.
 *
 * The bottom is the board underside for a ceiling sitting on its own datum, but
 * a beam-hung one reaches down to the soffit of its support beams. The boards
 * hang inside the depth of those beams, so a wall or column built up to their
 * underside divides the bay from beside the assembly rather than passing below
 * it — an auto-fitted partition stops at exactly that soffit — and boards run
 * through it would be boards built through a wall.
 *
 * It reaches further still when the beams have been raised off what carries
 * them: a beam retyped above its columns owns the whole zone down to their
 * heads, because that is where the structure holding it up actually stops and
 * the columns have to be built up through the gap to meet it. Everything left
 * standing at the old level — the partition the fitter never touched because it
 * runs under no beam, a column still at the storey height — rises into that zone
 * and bounds the ceiling just as it did before the beam moved.
 *
 * So the bottom is simply the lowest of the three, which also keeps a suspension
 * drop deeper than the beams honest: hang the ceiling below the soffit and the
 * boards are the lowest thing again.
 */
export function ceilingElevationRange(elevations) {
  const bottoms = [elevations.boardUnderside, elevations.supportSoffit, elevations.supportBearing].filter(
    Number.isFinite,
  );
  return {
    min: Math.min(...bottoms),
    max: Math.max(elevations.carrierTop, elevations.attachment),
  };
}

function ceilingContext(ceiling, project) {
  const detailing = resolveCeilingDetailing(ceiling);
  const boundary = resolveCeilingBoundary(project, ceiling);
  const space = getCeilingLocalSpace(boundary);
  const boundaryLocal = boundary.map((point) => space.toLocal(point));
  const boundaryXy = uvToXy(boundaryLocal);
  // Resolved once and read twice on purpose: the band and the bearing ends that
  // refine its floor are two halves of one statement about the same supports,
  // and a second resolve could only ever be an opportunity for them to disagree.
  const elevations = resolveCeilingElevations(project, ceiling);
  const obstructions = collectCeilingObstructions(
    resolveCeilingFloors(project, ceiling),
    ceilingElevationRange(elevations),
    elevations.supportBearingEnds,
  ).map((outline) => uvToXy(outline.map((point) => space.toLocal(point))));

  return {
    detailing,
    space,
    boundary,
    boundaryLocal,
    boundaryXy,
    obstructions,
    // What is left of the boundary once the structure is taken out: one region
    // per stretch of ceiling, so a partition wall running across the plan gives
    // a region per room rather than one board sheet through the wall.
    regions: subtractPolygons(boundaryXy, obstructions),
    length: space.length,
    depth: space.depth,
    openings: detailing.openings.map(openingRect).filter((opening) => rectangleArea(opening) > EPSILON),
  };
}

function profileBoardSize(face) {
  const profile = getCeilingProductProfile(face.productProfileId);
  const stock = profile.stockBoards[0] || { widthMm: 1219, heightMm: 2438 };
  const configuredWidth = positive(face.layout.boardWidth, stock.widthMm);
  const configuredHeight = positive(face.layout.boardHeight, stock.heightMm);
  return face.layout.orientation === 'horizontal'
    ? { width: configuredHeight, height: configuredWidth }
    : { width: configuredWidth, height: configuredHeight };
}

function firstGridLine(origin, pitch) {
  if (pitch <= EPSILON) return 0;
  let value = origin;
  while (value > 0) value -= pitch;
  while (value + pitch <= 0) value += pitch;
  return value;
}

function deriveGridRects(face, length, depth) {
  const size = profileBoardSize(face);
  const pitchU = size.width + face.layout.horizontalGap;
  const pitchV = size.height + face.layout.verticalGap;
  const startU = firstGridLine(face.layout.originU, pitchU);
  const startV = firstGridLine(face.layout.originV, pitchV);
  const rects = [];
  let column = 0;
  for (let u = startU; u < length - EPSILON; u += pitchU, column += 1) {
    let row = 0;
    for (let v = startV; v < depth - EPSILON; v += pitchV, row += 1) {
      const rect = {
        u0: clamp(u, 0, length),
        u1: clamp(u + size.width, 0, length),
        v0: clamp(v, 0, depth),
        v1: clamp(v + size.height, 0, depth),
      };
      if (rectangleArea(rect) <= EPSILON) continue;
      rects.push({ id: `grid-c${column}-r${row}`, ...rect, source: 'generated' });
    }
  }
  return rects;
}

function normalizeStoredOutline(value, bounds) {
  if (!Array.isArray(value?.outlinePoints) || value.outlinePoints.length < 3) return null;
  const outlinePoints = value.outlinePoints.map((point) => ({
    u: clamp(finite(point?.u, finite(point?.x)), 0, bounds.u1),
    v: clamp(finite(point?.v, finite(point?.y)), 0, bounds.v1),
  }));
  return polygonAreaUv(outlinePoints) > EPSILON ? outlinePoints : null;
}

/** The board's own material where it names a valid one, the ceiling's otherwise. */
function resolveBoardMaterial(value, fallback) {
  return Object.values(CEILING_BOARD_MATERIALS).includes(value) ? value : fallback;
}

function normalizeStoredRect(value, bounds) {
  const u0 = clamp(finite(value?.u, value?.u0), 0, bounds.u1);
  const v0 = clamp(finite(value?.v, value?.v0), 0, bounds.v1);
  const u1 = clamp(finite(value?.u1, u0 + positive(value?.width, 1219)), u0, bounds.u1);
  const v1 = clamp(finite(value?.v1, v0 + positive(value?.height, 2438)), v0, bounds.v1);
  return { u0, u1, v0, v1 };
}

export function deriveCeilingPanels(ceiling, project) {
  const { detailing, boundaryLocal, boundaryXy, obstructions, length, depth, openings } = ceilingContext(
    ceiling,
    project,
  );
  const face = detailing.face;
  if (!detailing.enabled || !face.enabled || length <= EPSILON || depth <= EPSILON || boundaryLocal.length < 3) {
    return [];
  }

  const bounds = { u0: 0, u1: length, v0: 0, v1: depth };
  // The board material the ceiling is specified in. A generated grid is all of
  // it; a custom board may say otherwise for itself.
  const faceMaterial = getCeilingProductProfile(face.productProfileId).boardMaterial;
  const sourceRects =
    face.layout.mode === CEILING_PANEL_LAYOUT_MODES.CUSTOM
      ? face.layout.customPanels.map((panel, index) => {
          const outlinePoints = normalizeStoredOutline(panel, bounds);
          const rect = outlinePoints ? polygonBounds(outlinePoints) : normalizeStoredRect(panel, bounds);
          return {
            id: panel.id || `custom-${index + 1}`,
            ...rect,
            outlinePoints: outlinePoints || rectOutline(rect),
            polygonal: Boolean(outlinePoints),
            source: 'custom',
            label: panel.label || '',
            material: resolveBoardMaterial(panel.material, faceMaterial),
          };
        })
      : deriveGridRects(face, length, depth).map((rect) => ({ ...rect, material: faceMaterial }));
  const openingPolygons = openings.map((opening) => uvToXy(rectOutline(opening)));

  return sourceRects
    .map((panel, index) => {
      const outlinePoints = panel.outlinePoints || rectOutline(panel);
      const grossArea = polygonAreaUv(outlinePoints);
      const regions = intersectPolygons(uvToXy(outlinePoints), boundaryXy).flatMap((clipped) =>
        subtractPolygons(clipped.outline, [...openingPolygons, ...obstructions, ...clipped.holes]).map((region) => ({
          outline: xyToUv(region.outline),
          holes: region.holes.map(xyToUv),
        })),
      );
      const netArea = regions.reduce((total, region) => total + regionArea(region), 0);
      const clippedShape =
        regions.length !== 1 || regions[0].holes.length > 0 || Math.abs(netArea - grossArea) > EPSILON;
      return {
        id: `${ceiling.id}:panel:${panel.id}`,
        localId: panel.id,
        index: index + 1,
        label: panel.label || `P${index + 1}`,
        u0: panel.u0,
        u1: panel.u1,
        v0: panel.v0,
        v1: panel.v1,
        width: panel.u1 - panel.u0,
        height: panel.v1 - panel.v0,
        outlinePoints,
        polygonal: Boolean(panel.polygonal) || clippedShape,
        grossArea,
        netArea,
        regions,
        source: panel.source === 'custom' ? 'custom' : 'generated',
        material: panel.material,
      };
    })
    .filter((panel) => panel.netArea > EPSILON);
}

function stationValues(limit, spacing) {
  const values = [];
  if (spacing > EPSILON) {
    for (let value = 0; value < limit - EPSILON && values.length < 5000; value += spacing) values.push(value);
  }
  if (!values.length || Math.abs(values[values.length - 1] - limit) > EPSILON) values.push(limit);
  return values;
}

/**
 * The stretches of one clipped piece a member can be built on, measured along
 * the band.
 *
 * A framing member is a rectangle of the band's full section, so a piece is only
 * usable where the whole section survives. Where a beam bites halfway across the
 * band, or a notch in the boundary clips its corner, what comes back from the
 * clip is an L, and a bounding box around it would hand back exactly the area
 * the clip just took out — a furring laid through the beam that stopped it.
 *
 * The intrusions are read off the piece's own edges: an edge lying on one of the
 * band's own long sides is the band running clear, and every other edge — the
 * face of the beam, the notch's return, a boundary running at an angle — is
 * something standing in the section, so no member may cross where it projects.
 * Ends are found this way too, being edges square across the band.
 */
function bandRunsFromPiece(rings, band, along) {
  const alongKey = along === 'u' ? 'x' : 'y';
  const acrossKey = along === 'u' ? 'y' : 'x';
  const sides = along === 'u' ? [band.v0, band.v1] : [band.u0, band.u1];

  let min = Infinity;
  let max = -Infinity;
  const cuts = [];
  for (const ring of rings) {
    for (let index = 0; index < ring.length; index += 1) {
      const start = ring[index];
      const end = ring[(index + 1) % ring.length];
      min = Math.min(min, start[alongKey]);
      max = Math.max(max, start[alongKey]);
      const onSide = sides.some(
        (side) => Math.abs(start[acrossKey] - side) <= EPSILON && Math.abs(end[acrossKey] - side) <= EPSILON,
      );
      if (onSide) continue;
      cuts.push({ from: Math.min(start[alongKey], end[alongKey]), to: Math.max(start[alongKey], end[alongKey]) });
    }
  }
  if (!(max - min > EPSILON)) return [];

  const runs = [];
  let open = min;
  for (const cut of cuts.sort((a, b) => a.from - b.from)) {
    if (cut.from - open > EPSILON) runs.push({ from: open, to: Math.min(cut.from, max) });
    open = Math.max(open, cut.to);
    if (open >= max - EPSILON) break;
  }
  if (max - open > EPSILON) runs.push({ from: open, to: max });

  return runs;
}

// A band runs the full length of the ceiling; the pieces that survive are the
// runs between the walls, beams and columns it meets on the way.
function clipBandToCeilingArea(band, boundaryXy, obstructions, along) {
  return intersectPolygons(uvToXy(rectOutline(band)), boundaryXy)
    .flatMap((clipped) => subtractPolygons(clipped.outline, [...obstructions, ...clipped.holes]))
    .filter((region) => region.outline.length >= 3)
    .flatMap((region) => bandRunsFromPiece([region.outline, ...(region.holes || [])], band, along))
    .sort((first, second) => first.from - second.from)
    .map((run) =>
      along === 'u'
        ? { u0: run.from, u1: run.to, v0: band.v0, v1: band.v1 }
        : { u0: band.u0, u1: band.u1, v0: run.from, v1: run.to },
    );
}

function regionContains(region, point) {
  return pointInPolygon(point, region.outline) && !(region.holes || []).some((hole) => pointInPolygon(point, hole));
}

/**
 * The edges of a ring, each carrying the normal that points into the ceiling.
 * The direction is settled by probing just off the edge midpoint rather than by
 * trusting the ring's winding, which the polygon booleans are free to choose.
 */
function ringEdges(ring, region) {
  const count = ring.length;
  return ring
    .map((start, index) => {
      const end = ring[(index + 1) % count];
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      if (length <= EPSILON) return null;

      const direction = { x: (end.x - start.x) / length, y: (end.y - start.y) / length };
      const normal = { x: -direction.y, y: direction.x };
      // A short edge needs a short probe, or the probe overshoots the region.
      const reach = Math.min(MIN_RING_PROBE, length / 4);
      const probe = {
        x: (start.x + end.x) / 2 + normal.x * reach,
        y: (start.y + end.y) / 2 + normal.y * reach,
      };
      const inward = regionContains(region, probe) ? normal : { x: -normal.x, y: -normal.y };
      return { start, end, direction, length, inward };
    })
    .filter(Boolean);
}

/**
 * Pulls a ring in by `distance` so a member drawn on it sits wholly inside the
 * ceiling instead of straddling the edge — a wall angle screwed to a beam face
 * has its leg in the room, not buried in the beam.
 *
 * Vertices move along the miter of their two edges, so the offset ring stays
 * closed and consecutive members still meet at the corners.
 *
 * The ring's oriented edges are passed in rather than worked out here: the same
 * orientation answers where the stations go, and one probe per edge is enough to
 * settle it once.
 */
function insetRing(ring, distance, edges) {
  if (edges.length !== ring.length) return ring.map((point) => ({ ...point }));

  return ring.map((point, index) => {
    const incoming = edges[(index - 1 + edges.length) % edges.length].inward;
    const outgoing = edges[index].inward;

    const miter = { x: incoming.x + outgoing.x, y: incoming.y + outgoing.y };
    const miterLength = Math.hypot(miter.x, miter.y);
    if (miterLength <= EPSILON) return { ...point };

    const unit = { x: miter.x / miterLength, y: miter.y / miterLength };
    // 1/cos(half angle) — clamped so a hairpin corner cannot fire a spike off
    // into the middle of the ceiling.
    const scale = Math.min(distance / Math.max(unit.x * outgoing.x + unit.y * outgoing.y, 0.25), distance * 4);
    return { x: point.x + unit.x * scale, y: point.y + unit.y * scale };
  });
}

/**
 * Moves a point far enough off every edge it is crowding that a square of
 * `clearance` half-width around it clears them all. A hanger dropped on the
 * perimeter station lands on the boundary line — which is a beam face — so the
 * rod would otherwise stand half inside the beam.
 */
function clearEdges(point, region, clearance) {
  let current = { ...point };

  for (const ring of [region.outline, ...(region.holes || [])]) {
    for (const edge of ringEdges(ring, region)) {
      const along = (current.x - edge.start.x) * edge.direction.x + (current.y - edge.start.y) * edge.direction.y;
      // Only edges the point actually sits beside, not their infinite lines.
      if (along < -clearance || along > edge.length + clearance) continue;

      const inset = (current.x - edge.start.x) * edge.inward.x + (current.y - edge.start.y) * edge.inward.y;
      if (inset >= clearance) continue;
      current = {
        x: current.x + edge.inward.x * (clearance - inset),
        y: current.y + edge.inward.y * (clearance - inset),
      };
    }
  }

  return current;
}

function squareFits(point, region, clearance) {
  // Tested a hair inside the square: a corner that lands exactly on an edge is
  // touching, not overlapping, and point-in-polygon cannot call that reliably.
  const reach = clearance - EPSILON;
  return [
    { x: point.x - reach, y: point.y - reach },
    { x: point.x + reach, y: point.y - reach },
    { x: point.x + reach, y: point.y + reach },
    { x: point.x - reach, y: point.y + reach },
  ].every((corner) => regionContains(region, corner));
}

/**
 * A face is square to a band when it runs within this of parallel to it. A band
 * is an axis-aligned rectangle in the ceiling's own space, so it can only be
 * laid tight against a face it is already parallel to; roughly a third of a
 * degree of slop absorbs the floating-point noise a polygon clip leaves on an
 * edge without letting a genuinely skew face through.
 */
const EDGE_SQUARENESS = 0.006;

/**
 * One station hard against every region edge a band could run along.
 *
 * A module gets the two faces at the ends of its own extent for free whenever
 * the ceiling's bounding box IS the structure — which, with the beams governing
 * the AUTO boundary again, is once more true of a beam-framed rectangle. It is
 * not true of anything else, and the cases where it fails are the ordinary ones:
 * a hand-traced boundary stopping wherever the user drew it, a beam or a
 * partition crossing the middle of the bay, the return around a column, the ring
 * around an obstruction. At every one of those the module's stations land where
 * the grid wanted them and the face carries nothing, so a fitter looking up with
 * the boards hidden sees nothing behind their cut edge.
 *
 * So the stations are read off the ceiling area itself rather than off a box
 * drawn round it. Every edge of every region — the perimeter against a beam, the
 * return around a column, the ring around an obstruction standing in the middle
 * of it — that runs WITH the band gets a station half a member in from it, which
 * stands the member's own face on the structure's face. It is the treatment an
 * opening already gets from its trimmers, applied to the edges the ceiling was
 * cut to rather than only to the ones cut into it.
 *
 * Edges shorter than `minimumEdge` are left alone: a chamfer or a column's
 * return is something the surrounding grid already reaches across, not a face
 * that opens a gap in it.
 */
function regionEdgeStations(ringSets, along, width, limit, minimumEdge) {
  const acrossKey = along === 'u' ? 'y' : 'x';
  const stations = [];

  for (const rings of ringSets) {
    for (const entry of rings) {
      if (!entry) continue;
      for (const edge of entry.edges) {
        if (edge.length < minimumEdge) continue;
        if (Math.abs(edge.direction[acrossKey]) > EDGE_SQUARENESS) continue;
        const side = Math.sign(edge.inward[acrossKey]);
        if (!side) continue;
        // Clamped into the ceiling's own extent so the member it carries is a
        // whole member: a band centred on the very edge would be half a member
        // sticking out past the boundary.
        stations.push(
          clamp(edge.start[acrossKey] + (side * width) / 2, width / 2, Math.max(width / 2, limit - width / 2)),
        );
      }
    }
  }

  return stations;
}

/**
 * The stations one module runs at: its own, plus the edge stations that hold the
 * board edges up.
 *
 * Where the two would build members on top of each other the edge wins — a
 * module station is where the grid would like a member, an edge station is where
 * a board edge needs one — and a module station is dropped only when an edge
 * station stands within a member's width of it, which is exactly when the two
 * would be one member drawn twice.
 *
 * Each station carries the key its members are named by, so a module row keeps
 * the id it has always had whether or not an edge station was inserted before
 * it.
 */
function bandStations(limit, spacing, width, edges) {
  const overlapping = (value, others) => others.some((other) => Math.abs(other - value) < width - EPSILON);
  const kept = [];

  for (const value of [...edges].sort((first, second) => first - second)) {
    if (overlapping(value, kept)) continue;
    kept.push(value);
  }
  const stations = kept.map((value, index) => ({ value, key: `e${index}` }));

  stationValues(limit, spacing).forEach((value, index) => {
    if (overlapping(value, kept)) return;
    stations.push({ value, key: String(index) });
  });

  return stations.sort((first, second) => first.value - second.value);
}

function deriveAutomaticCeilingFraming(context, ceilingId) {
  const { detailing, boundaryXy, obstructions, regions, length, depth, openings } = context;
  const framing = detailing.framing;
  const members = [];

  // One bay of the tightest module in the assembly: a face shorter than that is
  // already spanned by the members running past it on either side.
  const minimumEdge = Math.min(framing.furringSpacing, framing.carrierSpacing);

  // Oriented once and read three times — the stations for each module, and the
  // angle laid down every ring. Orienting an edge costs a containment probe, and
  // nothing about the rings changes between those passes.
  const ringSets = regions.map((region) =>
    [region.outline, ...(region.holes || [])].map((ring) =>
      ring.length >= 3 ? { ring, edges: ringEdges(ring, region) } : null,
    ),
  );

  const furringEdges = regionEdgeStations(ringSets, 'u', framing.furringWidth, depth, minimumEdge);
  bandStations(depth, framing.furringSpacing, framing.furringWidth, furringEdges).forEach(({ value: v, key }) => {
    const band = {
      u0: 0,
      u1: length,
      v0: clamp(v - framing.furringWidth / 2, 0, depth),
      v1: clamp(v + framing.furringWidth / 2, 0, depth),
    };
    if (rectangleArea(band) <= EPSILON) return;
    clipBandToCeilingArea(band, boundaryXy, obstructions, 'u').forEach((fragment, fragmentIndex) => {
      members.push({
        id: `${ceilingId}:auto:furring:${key}:${fragmentIndex}`,
        kind: 'furring',
        orientation: 'horizontal',
        u0: fragment.u0,
        u1: fragment.u1,
        v0: band.v0,
        v1: band.v1,
        depth: framing.furringDepth,
        material: framing.material,
        source: 'generated',
      });
    });
  });

  const carrierEdges = regionEdgeStations(ringSets, 'v', framing.carrierWidth, length, minimumEdge);
  bandStations(length, framing.carrierSpacing, framing.carrierWidth, carrierEdges).forEach(({ value: u, key }) => {
    const band = {
      u0: clamp(u - framing.carrierWidth / 2, 0, length),
      u1: clamp(u + framing.carrierWidth / 2, 0, length),
      v0: 0,
      v1: depth,
    };
    if (rectangleArea(band) <= EPSILON) return;
    clipBandToCeilingArea(band, boundaryXy, obstructions, 'v').forEach((fragment, fragmentIndex) => {
      members.push({
        id: `${ceilingId}:auto:carrier:${key}:${fragmentIndex}`,
        kind: 'carrier',
        orientation: 'vertical',
        u0: band.u0,
        u1: band.u1,
        v0: fragment.v0,
        v1: fragment.v1,
        depth: framing.carrierDepth,
        material: framing.material,
        source: 'generated',
      });
    });
  });

  // Every edge of the surviving ceiling area gets an angle, holes included: the
  // ceiling dies into a beam or a partition the same way it dies into the wall
  // at its perimeter.
  ringSets.forEach((rings, regionIndex) => {
    rings.forEach((entry, ringIndex) => {
      if (!entry) return;
      const inset = insetRing(entry.ring, CEILING_WALL_ANGLE_LEG / 2, entry.edges);
      inset.forEach((start, edgeIndex) => {
        const end = inset[(edgeIndex + 1) % inset.length];
        if (Math.hypot(end.x - start.x, end.y - start.y) <= EPSILON) return;
        members.push({
          id: `${ceilingId}:auto:wall_angle:${regionIndex}:${ringIndex}:${edgeIndex}`,
          kind: 'wall_angle',
          start: { u: start.x, v: start.y },
          end: { u: end.x, v: end.y },
          depth: CEILING_WALL_ANGLE_LEG,
          width: CEILING_WALL_ANGLE_LEG,
          material: framing.material,
          source: 'generated',
        });
      });
    });
  });

  const trim = framing.furringWidth;
  for (const opening of openings) {
    const spanU0 = clamp(opening.u0 - trim, 0, length);
    const spanU1 = clamp(opening.u1 + trim, 0, length);
    const trimmers = [
      {
        edge: 'bottom',
        orientation: 'horizontal',
        u0: spanU0,
        u1: spanU1,
        v0: clamp(opening.v0 - trim, 0, depth),
        v1: clamp(opening.v0, 0, depth),
      },
      {
        edge: 'top',
        orientation: 'horizontal',
        u0: spanU0,
        u1: spanU1,
        v0: clamp(opening.v1, 0, depth),
        v1: clamp(opening.v1 + trim, 0, depth),
      },
      {
        edge: 'left',
        orientation: 'vertical',
        u0: clamp(opening.u0 - trim, 0, length),
        u1: clamp(opening.u0, 0, length),
        v0: clamp(opening.v0, 0, depth),
        v1: clamp(opening.v1, 0, depth),
      },
      {
        edge: 'right',
        orientation: 'vertical',
        u0: clamp(opening.u1, 0, length),
        u1: clamp(opening.u1 + trim, 0, length),
        v0: clamp(opening.v0, 0, depth),
        v1: clamp(opening.v1, 0, depth),
      },
    ];
    for (const trimmer of trimmers) {
      if (rectangleArea(trimmer) <= EPSILON) continue;
      members.push({
        id: `${ceilingId}:auto:trimmer:${opening.id}:${trimmer.edge}`,
        kind: 'trimmer',
        orientation: trimmer.orientation,
        u0: trimmer.u0,
        u1: trimmer.u1,
        v0: trimmer.v0,
        v1: trimmer.v1,
        depth: framing.furringDepth,
        material: framing.material,
        source: 'generated',
      });
    }
  }

  return members;
}

export function deriveCeilingFramingMembers(ceiling, project) {
  const context = ceilingContext(ceiling, project);
  const framing = context.detailing.framing;
  if (!context.detailing.enabled || context.length <= EPSILON || context.depth <= EPSILON) return [];

  // The Structure section has one material select for the whole grid, so it
  // governs drawn members too — a member baked as steel when it was drawn must
  // not stay steel after the ceiling is switched to timber.
  const custom = framing.members.map((member) => ({
    ...createCustomCeilingFramingMember(member),
    material: framing.material,
  }));
  if (framing.mode === CEILING_FRAMING_LAYOUT_MODES.CUSTOM) return custom;

  const removed = new Set(framing.removedGeneratedIds);
  return [...deriveAutomaticCeilingFraming(context, ceiling.id).filter((member) => !removed.has(member.id)), ...custom];
}

export function deriveCeilingHangers(ceiling, project) {
  const context = ceilingContext(ceiling, project);
  const { detailing, regions, length, depth } = context;
  if (!detailing.enabled || length <= EPSILON || depth <= EPSILON) return [];

  const columns = stationValues(length, detailing.framing.carrierSpacing);
  const stations = stationValues(depth, detailing.suspension.hangerSpacing);
  const centerU = length / 2;
  const centerV = depth / 2;
  const hangers = [];

  const clearance = CEILING_HANGER_PLAN_SIZE / 2;

  columns.forEach((u, columnIndex) => {
    stations.forEach((v, stationIndex) => {
      // Stations run to the edges of the ceiling, so the containment test
      // probes 1 mm inboard rather than on the edge itself. Probing the ceiling
      // regions rather than the raw boundary also drops the hangers that would
      // land inside a beam, column or wall.
      const toCenterU = centerU - u;
      const toCenterV = centerV - v;
      const distance = Math.hypot(toCenterU, toCenterV) || 1;
      const probe = {
        x: u + (toCenterU / distance) * MIN_RING_PROBE,
        y: v + (toCenterV / distance) * MIN_RING_PROBE,
      };
      const region = regions.find((entry) => regionContains(entry, probe));
      if (!region) return;

      // The rod has width: standing it on the station itself would leave half
      // of it inside the beam the perimeter runs along.
      const placed = clearEdges({ x: u, y: v }, region, clearance);
      if (!squareFits(placed, region, clearance)) return;

      hangers.push({
        id: `${ceiling.id}:auto:hanger:${columnIndex}:${stationIndex}`,
        u: placed.x,
        v: placed.y,
        source: 'generated',
      });
    });
  });
  return hangers;
}

function pointInsidePanel(point, panel) {
  const nativePoint = { x: point.u, y: point.v };
  return panel.regions.some(
    (region) =>
      pointInPolygon(nativePoint, uvToXy(region.outline)) &&
      !region.holes.some((hole) => pointInPolygon(nativePoint, uvToXy(hole))),
  );
}

function spacedValues(start, end, spacing) {
  if (end < start) return [];
  const values = [start];
  for (let value = start + spacing; value < end - EPSILON; value += spacing) values.push(value);
  if (end - start > EPSILON) values.push(end);
  return values;
}

function furringSupportsRow(members, v, u0, u1, tolerance = 2) {
  return members.some(
    (member) =>
      member.kind === 'furring' &&
      member.v0 <= v + tolerance &&
      member.v1 >= v - tolerance &&
      member.u0 <= u1 + tolerance &&
      member.u1 >= u0 - tolerance,
  );
}

function addGeneratedFastener(target, panel, point, edge, type) {
  if (!pointInsidePanel(point, panel)) return;
  const key = `${Math.round(point.u * 10)}:${Math.round(point.v * 10)}`;
  if (target.has(key)) return;
  target.set(key, {
    id: `${panel.id}:fastener:${key}`,
    panelId: panel.id,
    u: point.u,
    v: point.v,
    edge,
    type,
    source: 'generated',
  });
}

function generateCeilingPanelFasteners(panel, members, pattern, type) {
  const result = new Map();
  const corner = Math.min(pattern.cornerClearance, panel.width / 2, panel.height / 2);
  const edge = Math.min(pattern.edgeClearance, panel.width / 2, panel.height / 2);

  for (const candidate of [
    { name: 'left', fastenerU: panel.u0 + edge },
    { name: 'right', fastenerU: panel.u1 - edge },
  ]) {
    for (const v of spacedValues(panel.v0 + corner, panel.v1 - corner, pattern.perimeterSpacing)) {
      addGeneratedFastener(result, panel, { u: candidate.fastenerU, v }, candidate.name, type);
    }
  }

  for (const candidate of [
    { name: 'bottom', supportV: panel.v0, fastenerV: panel.v0 + edge },
    { name: 'top', supportV: panel.v1, fastenerV: panel.v1 - edge },
  ]) {
    if (!furringSupportsRow(members, candidate.supportV, panel.u0, panel.u1)) continue;
    for (const u of spacedValues(panel.u0 + corner, panel.u1 - corner, pattern.perimeterSpacing)) {
      addGeneratedFastener(result, panel, { u, v: candidate.fastenerV }, candidate.name, type);
    }
  }

  for (const member of members) {
    if (member.kind !== 'furring') continue;
    const center = (member.v0 + member.v1) / 2;
    if (center <= panel.v0 + edge || center >= panel.v1 - edge) continue;
    if (member.u1 <= panel.u0 || member.u0 >= panel.u1) continue;
    for (const u of spacedValues(panel.u0 + corner, panel.u1 - corner, pattern.fieldSpacing)) {
      addGeneratedFastener(result, panel, { u, v: center }, 'field', type);
    }
  }

  return [...result.values()];
}

export function deriveCeilingFasteners(ceiling, project) {
  const detailing = resolveCeilingDetailing(ceiling);
  const face = detailing.face;
  if (!detailing.enabled || !face.enabled) return [];

  const profile = getCeilingProductProfile(face.productProfileId);
  const defaults = profile.planningDefaults || {};
  const pattern = {
    edgeClearance: positive(face.fasteners.edgeClearance, defaults.edgeClearanceMm || 12),
    cornerClearance: positive(face.fasteners.cornerClearance, defaults.cornerClearanceMm || 50),
    perimeterSpacing: positive(face.fasteners.perimeterSpacing, defaults.perimeterSpacingMm || 150),
    fieldSpacing: positive(face.fasteners.fieldSpacing, defaults.fieldSpacingMm || 230),
  };
  const type = face.fasteners.type || defaults.fastenerType || 'screw';
  const members = deriveCeilingFramingMembers(ceiling, project);
  const panels = deriveCeilingPanels(ceiling, project);
  const generated =
    face.fasteners.mode === CEILING_FASTENER_LAYOUT_MODES.GENERATED
      ? panels.flatMap((panel) => generateCeilingPanelFasteners(panel, members, pattern, type))
      : [];
  const removed = new Set(face.fasteners.removedGeneratedIds);
  return [
    ...generated.filter((fastener) => !removed.has(fastener.id)),
    ...face.fasteners.manual.map((fastener) => createManualCeilingFastener(fastener, fastener)),
  ];
}

/**
 * The fixtures placed on a ceiling, resolved into what a drawing or a renderer
 * can use: plan position, what the lamp actually emits, and the two elevations
 * that matter — the plane the fixture is fixed to and the height the light
 * leaves from, which are the same thing until something hangs.
 *
 * A stored fixture is clamped into the ceiling rather than dropped: a boundary
 * that shrank under a fixture is a fixture to move, not one to lose.
 */
export function deriveCeilingLightFixtures(ceiling, project) {
  const { detailing, space, length, depth } = ceilingContext(ceiling, project);
  if (!detailing.enabled || length <= EPSILON || depth <= EPSILON) return [];

  const elevations = resolveCeilingElevations(project, ceiling);
  return detailing.lighting.fixtures.map((fixture) => {
    const u = clamp(fixture.u, 0, length);
    const v = clamp(fixture.v, 0, depth);
    const drop = isPendantFixture(fixture.fixtureType) ? fixture.dropMm : 0;
    return {
      ...fixture,
      u,
      v,
      plan: space.toPlan({ u, v }),
      photometrics: resolveFixturePhotometrics(fixture),
      elevations: {
        mountPlane: elevations.boardUnderside,
        bulb: elevations.boardUnderside - drop,
      },
    };
  });
}

/**
 * The exact point a stored measurement endpoint means, read off the drawing as
 * it stands now. Storing the anchor rather than the coordinate is what lets a
 * measurement follow the board, channel, opening, screw, hanger or luminaire it
 * was taken from when that piece moves.
 *
 * Wall angles are excluded: they are a run of line rather than a rectangle, so
 * there is no anchor grid on them to resolve — the ceiling outline itself is the
 * thing you would measure to, and that is the 'ceiling' reference.
 */
export function resolveCeilingDimensionReference(reference, fallback, context) {
  if (!reference) return normalizeDimensionPoint(fallback);
  const markerPoint = (entries) => {
    const found = (entries || []).find((entry) => entry.id === reference.entityId);
    return found ? { u: finite(found.u), v: finite(found.v) } : normalizeDimensionPoint(fallback);
  };
  let entity = null;
  if (reference.entityType === 'ceiling' && reference.entityId === context.ceilingId) {
    entity = { u0: 0, u1: context.length, v0: 0, v1: context.depth };
  } else if (reference.entityType === 'panel') {
    entity = (context.panels || []).find(
      (panel) => panel.localId === reference.entityId || panel.id === reference.entityId,
    );
  } else if (reference.entityType === 'opening') {
    entity = (context.openings || []).find((opening) => opening.id === reference.entityId);
  } else if (reference.entityType === 'framing') {
    entity = (context.members || []).find((member) => member.id === reference.entityId && member.kind !== 'wall_angle');
  } else if (reference.entityType === 'fastener') {
    return markerPoint(context.fasteners);
  } else if (reference.entityType === 'hanger') {
    return markerPoint(context.hangers);
  } else if (reference.entityType === 'fixture') {
    return markerPoint(context.fixtures);
  }
  if (!entity) return normalizeDimensionPoint(fallback);
  return rectAnchorPoint(entity, reference) || normalizeDimensionPoint(fallback);
}

/**
 * The chains the drawing works out for itself: the ceiling's own extent, every
 * opening's size and set-out, the board joint grid, and the centres the frame
 * is set out on. Each group is a checkbox, because a boarding drawing and a
 * setting-out drawing want different ones.
 */
function automaticCeilingDimensions(settings, context) {
  const dimensions = [];
  const makeDimension = (id, name, dimension) =>
    describeDimension(id, name, dimension, 'automatic', settings.precision);

  if (settings.showOverall) {
    dimensions.push(
      makeDimension('auto:overall:length', 'Overall ceiling length', {
        mode: WALL_DIMENSION_MODES.HORIZONTAL,
        start: { u: 0, v: 0 },
        end: { u: context.length, v: 0 },
        offset: 70,
      }),
      makeDimension('auto:overall:depth', 'Overall ceiling depth', {
        mode: WALL_DIMENSION_MODES.VERTICAL,
        start: { u: 0, v: 0 },
        end: { u: 0, v: context.depth },
        offset: 70,
      }),
    );
  }

  if (settings.showOpenings) {
    for (const opening of context.openings) {
      const kind = String(opening.type || 'opening').replaceAll('_', ' ');
      dimensions.push(
        makeDimension(`auto:opening:${opening.id}:width`, `${kind} width`, {
          mode: WALL_DIMENSION_MODES.HORIZONTAL,
          start: { u: opening.u0, v: opening.v1 },
          end: { u: opening.u1, v: opening.v1 },
          offset: -60,
        }),
        makeDimension(`auto:opening:${opening.id}:depth`, `${kind} depth`, {
          mode: WALL_DIMENSION_MODES.VERTICAL,
          start: { u: opening.u1, v: opening.v0 },
          end: { u: opening.u1, v: opening.v1 },
          offset: -60,
        }),
      );
      if (opening.u0 > EPSILON) {
        dimensions.push(
          makeDimension(`auto:opening:${opening.id}:setout:u`, `${kind} set-out from west edge`, {
            mode: WALL_DIMENSION_MODES.HORIZONTAL,
            start: { u: 0, v: opening.v0 },
            end: { u: opening.u0, v: opening.v0 },
            offset: 150,
          }),
        );
      }
      if (opening.v0 > EPSILON) {
        dimensions.push(
          makeDimension(`auto:opening:${opening.id}:setout:v`, `${kind} set-out from south edge`, {
            mode: WALL_DIMENSION_MODES.VERTICAL,
            start: { u: opening.u0, v: 0 },
            end: { u: opening.u0, v: opening.v0 },
            offset: 150,
          }),
        );
      }
    }
  }

  if (settings.showBoards && context.panels.length) {
    const uValues = uniqueDimensionValues([
      0,
      context.length,
      ...context.panels.flatMap((panel) => [panel.u0, panel.u1]),
    ]);
    const vValues = uniqueDimensionValues([
      0,
      context.depth,
      ...context.panels.flatMap((panel) => [panel.v0, panel.v1]),
    ]);
    for (let index = 1; index < uValues.length; index += 1) {
      dimensions.push(
        makeDimension(`auto:board:u:${index}`, 'Board joint chain along U', {
          mode: WALL_DIMENSION_MODES.HORIZONTAL,
          start: { u: uValues[index - 1], v: 0 },
          end: { u: uValues[index], v: 0 },
          offset: 230,
        }),
      );
    }
    for (let index = 1; index < vValues.length; index += 1) {
      dimensions.push(
        makeDimension(`auto:board:v:${index}`, 'Board joint chain along V', {
          mode: WALL_DIMENSION_MODES.VERTICAL,
          start: { u: 0, v: vValues[index - 1] },
          end: { u: 0, v: vValues[index] },
          offset: 230,
        }),
      );
    }
  }

  if (settings.showFraming) {
    // Carriers run along V and are spaced across U; furring runs along U and is
    // spaced up V. Each chain is drawn on the axis its spacing is measured on.
    const carrierCenters = uniqueDimensionValues(
      context.members.filter((member) => member.kind === 'carrier').map((member) => (member.u0 + member.u1) / 2),
    );
    for (let index = 1; index < carrierCenters.length; index += 1) {
      dimensions.push(
        makeDimension(`auto:framing:carrier:${index}`, 'Carrier centre spacing', {
          mode: WALL_DIMENSION_MODES.HORIZONTAL,
          start: { u: carrierCenters[index - 1], v: context.depth },
          end: { u: carrierCenters[index], v: context.depth },
          offset: -150,
        }),
      );
    }
    const furringCenters = uniqueDimensionValues(
      context.members.filter((member) => member.kind === 'furring').map((member) => (member.v0 + member.v1) / 2),
    );
    for (let index = 1; index < furringCenters.length; index += 1) {
      dimensions.push(
        makeDimension(`auto:framing:furring:${index}`, 'Furring centre spacing', {
          mode: WALL_DIMENSION_MODES.VERTICAL,
          start: { u: context.length, v: furringCenters[index - 1] },
          end: { u: context.length, v: furringCenters[index] },
          offset: -150,
        }),
      );
    }
  }

  return dimensions.filter((dimension) => dimension.measurement > EPSILON);
}

function ceilingDimensionEntries(settings, context) {
  const manual = settings.manual
    .map((stored) => {
      const dimension = createCeilingDimension(stored);
      dimension.start = resolveCeilingDimensionReference(dimension.startRef, dimension.start, context);
      dimension.end = resolveCeilingDimensionReference(dimension.endRef, dimension.end, context);
      return describeDimension(
        dimension.id,
        dimension.note || 'User dimension',
        dimension,
        'custom',
        settings.precision,
      );
    })
    .filter((dimension) => dimension.measurement > EPSILON);
  return [...automaticCeilingDimensions(settings, context), ...manual];
}

export function deriveCeilingDimensions(ceiling, project) {
  const context = ceilingContext(ceiling, project);
  if (!context.detailing.enabled || context.length <= EPSILON || context.depth <= EPSILON) return [];
  return ceilingDimensionEntries(context.detailing.dimensions, {
    ceilingId: ceiling.id,
    length: context.length,
    depth: context.depth,
    openings: context.openings,
    panels: deriveCeilingPanels(ceiling, project),
    members: deriveCeilingFramingMembers(ceiling, project),
    fasteners: deriveCeilingFasteners(ceiling, project),
    hangers: deriveCeilingHangers(ceiling, project),
    fixtures: deriveCeilingLightFixtures(ceiling, project),
  });
}

function memberLength(member) {
  if (member.kind === 'wall_angle') {
    return Math.hypot(member.end.u - member.start.u, member.end.v - member.start.v);
  }
  return member.orientation === 'vertical' ? member.v1 - member.v0 : member.u1 - member.u0;
}

/**
 * The boards split by what they are made of, for a ceiling boarded in more than
 * one material. Order follows the drawing — the material of the first board that
 * uses it — so the list reads in the order the boards do rather than in an order
 * invented here.
 *
 * The sheet counts are per material because that is how the boards are bought:
 * two half-ceilings need a whole sheet each where one ceiling of the same area
 * would have needed one. Every ceiling profile shares the same stock sheet, so
 * one stock area answers for all of them.
 */
function summarizePanelMaterials(panels, stockArea) {
  const totals = new Map();
  for (const panel of panels) {
    const entry = totals.get(panel.material) || { material: panel.material, panelCount: 0, installedAreaMm2: 0 };
    entry.panelCount += 1;
    entry.installedAreaMm2 += panel.netArea;
    totals.set(panel.material, entry);
  }
  return [...totals.values()].map((entry) => ({
    ...entry,
    stockSheetCount: Math.ceil(entry.installedAreaMm2 / stockArea),
  }));
}

/**
 * The luminaires split by what they are — fixture and lamp together, since the
 * same can with a BR30 and with a PAR38 are two different line items on an
 * order. Order follows the drawing, the same way the board materials do.
 */
function summarizeLightFixtures(fixtures) {
  const totals = new Map();
  for (const fixture of fixtures) {
    const key = `${fixture.fixtureType}:${fixture.bulbType}`;
    const entry = totals.get(key) || {
      fixtureType: fixture.fixtureType,
      bulbType: fixture.bulbType,
      count: 0,
      totalLumens: 0,
      totalWatts: 0,
    };
    entry.count += 1;
    entry.totalLumens += fixture.photometrics.lumens;
    entry.totalWatts += fixture.photometrics.watts;
    totals.set(key, entry);
  }
  return [...totals.values()];
}

export function deriveCeilingTakeoff(ceiling, project) {
  const detailing = resolveCeilingDetailing(ceiling);
  const panels = deriveCeilingPanels(ceiling, project);
  const members = deriveCeilingFramingMembers(ceiling, project);
  const fasteners = deriveCeilingFasteners(ceiling, project);
  const hangers = deriveCeilingHangers(ceiling, project);
  const lightFixtures = deriveCeilingLightFixtures(ceiling, project);
  const profile = getCeilingProductProfile(detailing.face.productProfileId);
  const stock = profile.stockBoards[0] || { widthMm: 1219, heightMm: 2438 };
  const stockArea = Math.max(EPSILON, stock.widthMm * stock.heightMm);
  const installedAreaMm2 = panels.reduce((total, panel) => total + panel.netArea, 0);
  const linearByKind = (kind) =>
    members.filter((member) => member.kind === kind).reduce((total, member) => total + memberLength(member), 0);

  return {
    enabled: detailing.enabled && detailing.face.enabled,
    panelCount: panels.length,
    stockSheetCount: Math.ceil(installedAreaMm2 / stockArea),
    installedAreaMm2,
    materials: summarizePanelMaterials(panels, stockArea),
    fastenerCount: fasteners.length,
    furringLinearMm: linearByKind('furring'),
    carrierLinearMm: linearByKind('carrier'),
    wallAngleLinearMm: linearByKind('wall_angle'),
    trimmerLinearMm: linearByKind('trimmer'),
    hangerCount: hangers.length,
    lighting: {
      fixtureCount: lightFixtures.length,
      totalLumens: lightFixtures.reduce((total, fixture) => total + fixture.photometrics.lumens, 0),
      totalWatts: lightFixtures.reduce((total, fixture) => total + fixture.photometrics.watts, 0),
      byType: summarizeLightFixtures(lightFixtures),
    },
  };
}

export function deriveCeilingDetail(ceiling, project) {
  const context = ceilingContext(ceiling, project);
  const panels = deriveCeilingPanels(ceiling, project);
  const framing = deriveCeilingFramingMembers(ceiling, project);
  const hangers = deriveCeilingHangers(ceiling, project);
  const fasteners = deriveCeilingFasteners(ceiling, project);
  const lightFixtures = deriveCeilingLightFixtures(ceiling, project);
  const openings = context.detailing.openings.map(openingRect);
  return {
    ceilingId: ceiling.id,
    length: context.length,
    depth: context.depth,
    // Plan angle of the local U axis: 0 when the frame matches plan north-up,
    // non-zero when the ceiling's edges pulled the RCP frame around with them.
    rotation: context.space.rotation,
    boundaryLocal: context.boundaryLocal,
    // The drawn outline: the boundary with the structure taken out of it.
    regions: context.regions.map((region) => ({
      outline: xyToUv(region.outline),
      holes: (region.holes || []).map(xyToUv),
    })),
    openings,
    configuration: context.detailing,
    panels,
    framing,
    hangers,
    fasteners,
    lightFixtures,
    dimensions:
      context.detailing.enabled && context.length > EPSILON && context.depth > EPSILON
        ? ceilingDimensionEntries(context.detailing.dimensions, {
            ceilingId: ceiling.id,
            length: context.length,
            depth: context.depth,
            openings,
            panels,
            members: framing,
            fasteners,
            hangers,
            fixtures: lightFixtures,
          })
        : [],
    takeoff: deriveCeilingTakeoff(ceiling, project),
    elevations: resolveCeilingElevations(project, ceiling),
  };
}
