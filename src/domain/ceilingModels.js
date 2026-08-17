import { generateId } from './ids';
import { pointInPolygon, polygonArea } from '@/geometry/polygon';
import { intersectPolygons, subtractPolygons } from '@/geometry/polygonBoolean';
import { getWallRenderData } from '@/geometry/wallColumnGeometry';
import { columnOutline } from '@/geometry/columnGeometry';
import { collectCeilingObstructions } from './ceilingObstructions';
import { getProjectFloor } from './floorModels';
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

  // Attachment is a statement about beams, so it is read off the beams alone: a
  // ceiling whose only shape came from the slab overhead hangs from nothing and
  // must not claim to hang from beams.
  const beamBoundary = deriveCeilingBoundaryFromBeams(supportBeams, floor);
  const attachedToBeams = clonePlanPoints(beamBoundary).length >= 3;
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
 * The slabs overhead a ceiling's boundary is drawn from, and the floor they are
 * on. Exported so the RCP editor's preview project can carry exactly the slabs
 * the boundary resolves through instead of guessing at them.
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

    // Derived on every read, so dragging a column, moving a beam or pulling a
    // slab edge out over a cantilever moves the ceiling with it. The stored
    // polygon is the snapshot to fall back on when the structure no longer
    // resolves.
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

export function resolveCeilingElevations(project, ceiling) {
  const detailing = resolveCeilingDetailing(ceiling);
  const beamMode = ceiling?.attachment?.mode === CEILING_ATTACHMENT_MODES.BEAM;
  const supportLevels = resolveCeilingBeamSupports(project, ceiling)
    .map((beam) => Number(beam.floorLevel))
    .filter(Number.isFinite);
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
  return { attachment, boardUnderside, boardTop, furringBottom, furringTop, carrierBottom, carrierTop };
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
 * Vertical slice the ceiling assembly occupies, from the underside of the
 * boards up to whatever it hangs from. Structure crossing this band is what the
 * ceiling has to stop at. Exported because the RCP editor's 3D preview has to
 * show exactly the structure the boards were traced around, and it can only do
 * that by asking for the same band.
 */
export function ceilingElevationRange(elevations) {
  return { min: elevations.boardUnderside, max: Math.max(elevations.carrierTop, elevations.attachment) };
}

function ceilingContext(ceiling, project) {
  const detailing = resolveCeilingDetailing(ceiling);
  const boundary = resolveCeilingBoundary(project, ceiling);
  const space = getCeilingLocalSpace(boundary);
  const boundaryLocal = boundary.map((point) => space.toLocal(point));
  const boundaryXy = uvToXy(boundaryLocal);
  const obstructions = collectCeilingObstructions(
    resolveCeilingFloors(project, ceiling),
    ceilingElevationRange(resolveCeilingElevations(project, ceiling)),
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

// A band runs the full length of the ceiling; the pieces that survive are the
// runs between the walls, beams and columns it meets on the way.
function clipBandToCeilingArea(band, boundaryXy, obstructions) {
  return intersectPolygons(uvToXy(rectOutline(band)), boundaryXy)
    .flatMap((clipped) => subtractPolygons(clipped.outline, [...obstructions, ...clipped.holes]))
    .map((region) => region.outline)
    .filter((outline) => outline.length >= 3)
    .map((outline) => ({
      u0: Math.min(...outline.map((point) => point.x)),
      u1: Math.max(...outline.map((point) => point.x)),
      v0: Math.min(...outline.map((point) => point.y)),
      v1: Math.max(...outline.map((point) => point.y)),
    }));
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
 */
function insetRing(ring, distance, region) {
  const edges = ringEdges(ring, region);
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

function deriveAutomaticCeilingFraming(context, ceilingId) {
  const { detailing, boundaryXy, obstructions, regions, length, depth, openings } = context;
  const framing = detailing.framing;
  const members = [];

  stationValues(depth, framing.furringSpacing).forEach((v, rowIndex) => {
    const band = {
      u0: 0,
      u1: length,
      v0: clamp(v - framing.furringWidth / 2, 0, depth),
      v1: clamp(v + framing.furringWidth / 2, 0, depth),
    };
    if (rectangleArea(band) <= EPSILON) return;
    clipBandToCeilingArea(band, boundaryXy, obstructions).forEach((fragment, fragmentIndex) => {
      members.push({
        id: `${ceilingId}:auto:furring:${rowIndex}:${fragmentIndex}`,
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

  stationValues(length, framing.carrierSpacing).forEach((u, columnIndex) => {
    const band = {
      u0: clamp(u - framing.carrierWidth / 2, 0, length),
      u1: clamp(u + framing.carrierWidth / 2, 0, length),
      v0: 0,
      v1: depth,
    };
    if (rectangleArea(band) <= EPSILON) return;
    clipBandToCeilingArea(band, boundaryXy, obstructions).forEach((fragment, fragmentIndex) => {
      members.push({
        id: `${ceilingId}:auto:carrier:${columnIndex}:${fragmentIndex}`,
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
  regions.forEach((region, regionIndex) => {
    [region.outline, ...(region.holes || [])].forEach((ring, ringIndex) => {
      if (ring.length < 3) return;
      const inset = insetRing(ring, CEILING_WALL_ANGLE_LEG / 2, region);
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
    openings: context.detailing.openings.map(openingRect),
    configuration: context.detailing,
    panels: deriveCeilingPanels(ceiling, project),
    framing: deriveCeilingFramingMembers(ceiling, project),
    hangers: deriveCeilingHangers(ceiling, project),
    fasteners: deriveCeilingFasteners(ceiling, project),
    lightFixtures: deriveCeilingLightFixtures(ceiling, project),
    takeoff: deriveCeilingTakeoff(ceiling, project),
    elevations: resolveCeilingElevations(project, ceiling),
  };
}
