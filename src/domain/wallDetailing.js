import { generateId } from './ids';
import { wallLength } from '@/geometry/wallGeometry';
import { pointInPolygon, polygonArea, signedPolygonArea } from '@/geometry/polygon';
import { subtractPolygons } from '@/geometry/polygonBoolean';
import {
  boardLayerUSpan,
  deriveWallFramingLayout,
  resolveWallAssembly,
  wallOpeningRects,
  RAINSCREEN_MODULE,
  WALL_BOARD_MATERIALS,
} from './wallAssemblies';
import { resolveWallSlabBands, resolveWallVerticalSpan } from './wallFit';
import {
  DEFAULT_WALL_JURISDICTION_PROFILE_ID,
  DEFAULT_WALL_PRODUCT_PROFILE_ID,
  WALL_APPLICATIONS,
  WALL_PRODUCT_PROFILE_STATUS,
  getWallJurisdictionProfile,
  getWallProductProfile,
} from './wallProductProfiles';

export const WALL_DETAIL_SCHEMA_VERSION = 2;

export const WALL_DETAIL_SIDES = Object.freeze({
  INTERIOR: 'interior',
  EXTERIOR: 'exterior',
});

export const PANEL_LAYOUT_MODES = Object.freeze({
  GRID: 'grid',
  CUSTOM: 'custom',
});

export const PANEL_REVEAL_INTENTS = Object.freeze({
  AESTHETIC_SHADOW_LINE: 'aesthetic_shadow_line',
  INSTALLATION_TOLERANCE: 'installation_tolerance',
  MOVEMENT_CONTROL: 'movement_control',
});

export const FRAMING_LAYOUT_MODES = Object.freeze({
  AUTOMATIC: 'automatic',
  CUSTOM: 'custom',
});

export const FASTENER_LAYOUT_MODES = Object.freeze({
  GENERATED: 'generated',
  CUSTOM: 'custom',
});

export const FASTENER_APPEARANCE_MODES = Object.freeze({
  TONAL: 'tonal',
  METAL: 'metal',
  CONTRAST: 'contrast',
  CONSTRUCTION: 'construction',
});

export const FASTENER_GUIDE_DIRECTIONS = Object.freeze({
  VERTICAL: 'vertical',
  HORIZONTAL: 'horizontal',
});

export const FASTENER_GUIDE_ZONES = Object.freeze({
  PERIMETER: 'perimeter',
  FIELD: 'field',
});

export const FASTENER_GUIDE_MODES = Object.freeze({
  LINEAR: 'linear',
  PANEL_PERIMETER: 'panel_perimeter',
});

export const WALL_DIMENSION_MODES = Object.freeze({
  ALIGNED: 'aligned',
  HORIZONTAL: 'horizontal',
  VERTICAL: 'vertical',
});

export const WALL_DIMENSION_PRECISIONS = Object.freeze([0.01, 0.1, 1]);

const EPSILON = 0.01;

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

function polygonAreaUv(points) {
  return polygonArea(points.map((point) => ({ x: point.u, y: point.v })));
}

function polygonBounds(points) {
  return {
    u0: Math.min(...points.map((point) => point.u)),
    u1: Math.max(...points.map((point) => point.u)),
    v0: Math.min(...points.map((point) => point.v)),
    v1: Math.max(...points.map((point) => point.v)),
  };
}

function normalizeStoredOutline(value, bounds) {
  if (!Array.isArray(value?.outlinePoints) || value.outlinePoints.length < 3) return null;
  const outlinePoints = value.outlinePoints.map((point) => ({
    u: clamp(finite(point?.u, finite(point?.x)), bounds.u0, bounds.u1),
    v: clamp(finite(point?.v, finite(point?.y)), 0, bounds.v1),
  }));
  return polygonAreaUv(outlinePoints) > EPSILON ? outlinePoints : null;
}

function uvToXy(points) {
  return points.map((point) => ({ x: point.u, y: point.v }));
}

function xyToUv(points) {
  return points.map((point) => ({ u: point.x, v: point.y }));
}

function regionArea(region) {
  return Math.max(
    0,
    polygonAreaUv(region.outline) - region.holes.reduce((total, hole) => total + polygonAreaUv(hole), 0),
  );
}

function rectanglesIntersect(a, b) {
  return a.u0 < b.u1 - EPSILON && a.u1 > b.u0 + EPSILON && a.v0 < b.v1 - EPSILON && a.v1 > b.v0 + EPSILON;
}

function rectangleIntersection(a, b) {
  if (!rectanglesIntersect(a, b)) return null;
  return {
    u0: Math.max(a.u0, b.u0),
    u1: Math.min(a.u1, b.u1),
    v0: Math.max(a.v0, b.v0),
    v1: Math.min(a.v1, b.v1),
  };
}

function subtractRectangle(source, cut) {
  const hit = rectangleIntersection(source, cut);
  if (!hit) return [source];

  return [
    { u0: source.u0, u1: source.u1, v0: source.v0, v1: hit.v0 },
    { u0: source.u0, u1: source.u1, v0: hit.v1, v1: source.v1 },
    { u0: source.u0, u1: hit.u0, v0: hit.v0, v1: hit.v1 },
    { u0: hit.u1, u1: source.u1, v0: hit.v0, v1: hit.v1 },
  ].filter((rect) => rectangleArea(rect) > EPSILON);
}

function subtractRectangles(source, cuts) {
  return cuts.reduce((fragments, cut) => fragments.flatMap((fragment) => subtractRectangle(fragment, cut)), [source]);
}

function normalizeStoredRect(value, bounds) {
  const u0 = clamp(finite(value?.u, value?.u0), bounds.u0, bounds.u1);
  const v0 = clamp(finite(value?.v, value?.v0), 0, bounds.v1);
  const u1 = clamp(finite(value?.u1, u0 + positive(value?.width, 600)), u0, bounds.u1);
  const v1 = clamp(finite(value?.v1, v0 + positive(value?.height, 1200)), v0, bounds.v1);
  return { u0, u1, v0, v1 };
}

function createPanelFace(overrides = {}) {
  return {
    enabled: overrides.enabled ?? false,
    productProfileId: overrides.productProfileId || DEFAULT_WALL_PRODUCT_PROFILE_ID,
    application: overrides.application || WALL_APPLICATIONS.INTERNAL_PARTITION,
    layout: {
      mode: Object.values(PANEL_LAYOUT_MODES).includes(overrides.layout?.mode)
        ? overrides.layout.mode
        : PANEL_LAYOUT_MODES.GRID,
      orientation: overrides.layout?.orientation === 'horizontal' ? 'horizontal' : 'vertical',
      originU: finite(overrides.layout?.originU, 0),
      originV: finite(overrides.layout?.originV, 0),
      boardWidth: positive(overrides.layout?.boardWidth, 1219),
      boardHeight: positive(overrides.layout?.boardHeight, 2438),
      horizontalGap: Math.max(0, finite(overrides.layout?.horizontalGap, 6)),
      verticalGap: Math.max(0, finite(overrides.layout?.verticalGap, 6)),
      jointSystem: overrides.layout?.jointSystem || 'express',
      revealIntent: Object.values(PANEL_REVEAL_INTENTS).includes(overrides.layout?.revealIntent)
        ? overrides.layout.revealIntent
        : PANEL_REVEAL_INTENTS.AESTHETIC_SHADOW_LINE,
      customPanels: Array.isArray(overrides.layout?.customPanels)
        ? overrides.layout.customPanels.map((panel) => ({
            ...panel,
            ...(Array.isArray(panel.outlinePoints)
              ? { outlinePoints: panel.outlinePoints.map((point) => ({ ...point })) }
              : {}),
          }))
        : [],
    },
    fasteners: {
      mode: Object.values(FASTENER_LAYOUT_MODES).includes(overrides.fasteners?.mode)
        ? overrides.fasteners.mode
        : FASTENER_LAYOUT_MODES.GENERATED,
      type: overrides.fasteners?.type || '',
      appearance: Object.values(FASTENER_APPEARANCE_MODES).includes(overrides.fasteners?.appearance)
        ? overrides.fasteners.appearance
        : FASTENER_APPEARANCE_MODES.TONAL,
      headDiameter: Math.min(30, positive(overrides.fasteners?.headDiameter, 8, 4)),
      edgeClearance: positive(overrides.fasteners?.edgeClearance, 12),
      cornerClearance: positive(overrides.fasteners?.cornerClearance, 50),
      perimeterSpacing: positive(overrides.fasteners?.perimeterSpacing, 200),
      fieldSpacing: positive(overrides.fasteners?.fieldSpacing, 300),
      manual: Array.isArray(overrides.fasteners?.manual)
        ? overrides.fasteners.manual.map((fastener) => ({ ...fastener }))
        : [],
      guides: Array.isArray(overrides.fasteners?.guides)
        ? overrides.fasteners.guides.map((guide) => createFastenerGuide(guide))
        : [],
      removedGeneratedIds: Array.isArray(overrides.fasteners?.removedGeneratedIds)
        ? [...overrides.fasteners.removedGeneratedIds]
        : [],
    },
    dimensions: {
      precision: WALL_DIMENSION_PRECISIONS.includes(Number(overrides.dimensions?.precision))
        ? Number(overrides.dimensions.precision)
        : 0.01,
      showOverall: overrides.dimensions?.showOverall ?? true,
      showOpenings: overrides.dimensions?.showOpenings ?? true,
      showPanels: overrides.dimensions?.showPanels ?? false,
      showFraming: overrides.dimensions?.showFraming ?? false,
      manual: Array.isArray(overrides.dimensions?.manual)
        ? overrides.dimensions.manual.map((dimension) => createWallDimension(dimension))
        : [],
    },
  };
}

export function createWallDetailing(overrides = {}) {
  return {
    schemaVersion: WALL_DETAIL_SCHEMA_VERSION,
    enabled: overrides.enabled ?? true,
    activeSide:
      overrides.activeSide === WALL_DETAIL_SIDES.EXTERIOR ? WALL_DETAIL_SIDES.EXTERIOR : WALL_DETAIL_SIDES.INTERIOR,
    jurisdictionProfileId: overrides.jurisdictionProfileId || DEFAULT_WALL_JURISDICTION_PROFILE_ID,
    sides: {
      interior: createPanelFace(overrides.sides?.interior),
      exterior: createPanelFace(overrides.sides?.exterior),
    },
    framing: {
      mode: Object.values(FRAMING_LAYOUT_MODES).includes(overrides.framing?.mode)
        ? overrides.framing.mode
        : FRAMING_LAYOUT_MODES.AUTOMATIC,
      members: Array.isArray(overrides.framing?.members)
        ? overrides.framing.members.map((member) => ({ ...member }))
        : [],
      removedGeneratedIds: Array.isArray(overrides.framing?.removedGeneratedIds)
        ? [...overrides.framing.removedGeneratedIds]
        : [],
    },
    asBuilt: {
      tolerance: positive(overrides.asBuilt?.tolerance, 6),
      measurements: Array.isArray(overrides.asBuilt?.measurements)
        ? overrides.asBuilt.measurements.map((measurement) => ({ ...measurement }))
        : [],
    },
  };
}

export function resolveWallDetailing(wall) {
  return createWallDetailing(wall?.assembly?.detailing || { enabled: false });
}

export function createCustomPanel(rect, options = {}) {
  const outlinePoints = Array.isArray(rect?.outlinePoints)
    ? rect.outlinePoints.map((point) => ({
        u: finite(point?.u, finite(point?.x)),
        v: finite(point?.v, finite(point?.y)),
      }))
    : null;
  const hasOutline = outlinePoints?.length >= 3 && polygonAreaUv(outlinePoints) > EPSILON;
  const outlineBounds = hasOutline ? polygonBounds(outlinePoints) : null;
  const u = outlineBounds?.u0 ?? finite(rect?.u, rect?.u0);
  const v = outlineBounds?.v0 ?? finite(rect?.v, rect?.v0);
  const width = outlineBounds
    ? outlineBounds.u1 - outlineBounds.u0
    : positive(rect?.width, finite(rect?.u1) - finite(rect?.u0), 1);
  const height = outlineBounds
    ? outlineBounds.v1 - outlineBounds.v0
    : positive(rect?.height, finite(rect?.v1) - finite(rect?.v0), 1);
  return {
    id: options.id || generateId('panel'),
    u,
    v,
    width,
    height,
    ...(hasOutline ? { outlinePoints } : {}),
    label: options.label || '',
  };
}

export function createCustomFramingMember(member = {}) {
  const orientation = member.orientation === 'horizontal' ? 'horizontal' : 'vertical';
  return {
    id: member.id || generateId('frame'),
    kind: member.kind || (orientation === 'vertical' ? 'stud' : 'noggin'),
    orientation,
    u0: finite(member.u0, finite(member.u)),
    u1: finite(member.u1, finite(member.u) + positive(member.width, 50)),
    v0: finite(member.v0, finite(member.v)),
    v1: finite(member.v1, finite(member.v) + positive(member.height, 3000)),
    depth: positive(member.depth, 75),
    frameIndex: Math.max(0, Math.round(finite(member.frameIndex, 0))),
    frameOffset: finite(member.frameOffset, 0),
    material: member.material || null,
    label: member.label || '',
    custom: true,
  };
}

export function createManualFastener(point, options = {}) {
  return {
    id: options.id || generateId('fastener'),
    u: finite(point?.u),
    v: finite(point?.v),
    type: options.type || 'corrosion_resistant_screw',
    note: options.note || '',
    guideId: options.guideId || null,
    guideStation:
      options.guideStation != null && Number.isFinite(Number(options.guideStation))
        ? Math.max(0, Math.round(options.guideStation))
        : null,
    custom: true,
  };
}

export function createFastenerGuide(guide = {}) {
  const direction =
    guide.direction === FASTENER_GUIDE_DIRECTIONS.HORIZONTAL
      ? FASTENER_GUIDE_DIRECTIONS.HORIZONTAL
      : FASTENER_GUIDE_DIRECTIONS.VERTICAL;
  const start = Math.max(0, finite(guide.start, 50));
  const end = Math.max(start, finite(guide.end, 2400));
  return {
    id: guide.id || generateId('fastener_guide'),
    name: guide.name || 'Screw pencil guide',
    mode:
      guide.mode === FASTENER_GUIDE_MODES.PANEL_PERIMETER && guide.panelId
        ? FASTENER_GUIDE_MODES.PANEL_PERIMETER
        : FASTENER_GUIDE_MODES.LINEAR,
    panelId: guide.panelId || null,
    direction,
    zone: guide.zone === FASTENER_GUIDE_ZONES.FIELD ? FASTENER_GUIDE_ZONES.FIELD : FASTENER_GUIDE_ZONES.PERIMETER,
    coordinate: Math.max(0, finite(guide.coordinate, 0)),
    start,
    end,
    spacing: positive(guide.spacing, 200, 1),
    edgeClearance: positive(guide.edgeClearance, 12, 1),
    cornerClearance: positive(guide.cornerClearance, 50, 1),
  };
}

function derivePanelPerimeterGuideLayout(normalized, panel) {
  const outline = panel?.outlinePoints?.length ? panel.outlinePoints : panel ? rectOutline(panel) : [];
  if (outline.length < 3) return { ...normalized, panel: null, segments: [], stations: [], remainder: 0 };
  const orientation = signedPolygonArea(outline.map((point) => ({ x: point.u, y: point.v }))) >= 0 ? 1 : -1;
  const segments = [];
  const stations = [];
  for (let edgeIndex = 0; edgeIndex < outline.length; edgeIndex += 1) {
    const boundaryStart = outline[edgeIndex];
    const boundaryEnd = outline[(edgeIndex + 1) % outline.length];
    const deltaU = boundaryEnd.u - boundaryStart.u;
    const deltaV = boundaryEnd.v - boundaryStart.v;
    const length = Math.hypot(deltaU, deltaV);
    if (length <= EPSILON) continue;
    const tangent = { u: deltaU / length, v: deltaV / length };
    const inward = { u: (-deltaV / length) * orientation, v: (deltaU / length) * orientation };
    const cornerClearance = Math.min(normalized.cornerClearance, length / 2);
    const start = {
      u: boundaryStart.u + tangent.u * cornerClearance + inward.u * normalized.edgeClearance,
      v: boundaryStart.v + tangent.v * cornerClearance + inward.v * normalized.edgeClearance,
    };
    const end = {
      u: boundaryEnd.u - tangent.u * cornerClearance + inward.u * normalized.edgeClearance,
      v: boundaryEnd.v - tangent.v * cornerClearance + inward.v * normalized.edgeClearance,
    };
    const runLength = Math.max(0, length - cornerClearance * 2);
    const edgeStations = [];
    for (
      let distance = 0, stationIndex = 0;
      distance <= runLength + EPSILON && stationIndex < 2000;
      distance += normalized.spacing, stationIndex += 1
    ) {
      const station = {
        index: stations.length,
        stationIndex,
        segmentIndex: edgeIndex,
        distanceFromStart: distance,
        u: start.u + tangent.u * distance,
        v: start.v + tangent.v * distance,
        tangent,
        inward,
      };
      if (!pointInsidePanel(station, panel, normalized.edgeClearance + 0.5)) continue;
      edgeStations.push(station);
      stations.push(station);
    }
    const usedLength = edgeStations.length ? edgeStations[edgeStations.length - 1].distanceFromStart : 0;
    segments.push({
      index: edgeIndex,
      boundaryStart,
      boundaryEnd,
      start,
      end,
      tangent,
      inward,
      length: runLength,
      stations: edgeStations,
      remainder: Math.max(0, runLength - usedLength),
    });
  }
  return {
    ...normalized,
    panel,
    segments,
    stations,
    remainder: segments.reduce((maximum, segment) => Math.max(maximum, segment.remainder), 0),
  };
}

export function deriveFastenerGuideLayout(guide, bounds = {}, context = {}) {
  const normalized = createFastenerGuide(guide);
  if (normalized.mode === FASTENER_GUIDE_MODES.PANEL_PERIMETER) {
    const panel = context.panels?.find(
      (entry) => entry.localId === normalized.panelId || entry.id === normalized.panelId,
    );
    return derivePanelPerimeterGuideLayout(normalized, panel);
  }
  const vertical = normalized.direction === FASTENER_GUIDE_DIRECTIONS.VERTICAL;
  const runLimit = Math.max(0, finite(vertical ? bounds.height : bounds.length));
  const crossLimit = Math.max(0, finite(vertical ? bounds.length : bounds.height));
  const coordinate = clamp(normalized.coordinate, 0, crossLimit);
  const start = clamp(normalized.start, 0, runLimit);
  const end = clamp(Math.max(start, normalized.end), start, runLimit);
  const stations = [];
  for (let value = start, index = 0; value <= end + EPSILON && index < 2000; value += normalized.spacing, index += 1) {
    stations.push({
      index,
      distanceFromStart: value - start,
      u: vertical ? coordinate : value,
      v: vertical ? value : coordinate,
    });
  }
  const lastValue = stations.length
    ? vertical
      ? stations[stations.length - 1].v
      : stations[stations.length - 1].u
    : start;
  return {
    ...normalized,
    coordinate,
    start,
    end,
    stations,
    remainder: Math.max(0, end - lastValue),
  };
}

export function createFastenersFromGuide(guide, bounds, options = {}) {
  const layout = deriveFastenerGuideLayout(guide, bounds, { panels: options.panels || [] });
  return layout.stations.map((station) =>
    createManualFastener(station, {
      id:
        layout.mode === FASTENER_GUIDE_MODES.PANEL_PERIMETER
          ? `${layout.id}:edge:${station.segmentIndex}:station:${station.stationIndex}`
          : `${layout.id}:station:${station.index}`,
      type: options.type || 'corrosion_resistant_screw',
      note: `${layout.name} · ${layout.zone} · ${layout.mode === FASTENER_GUIDE_MODES.PANEL_PERIMETER ? `edge ${station.segmentIndex + 1} · ` : ''}station ${station.stationIndex + 1} · ${station.distanceFromStart} mm from guide origin`,
      guideId: layout.id,
      guideStation: station.index,
    }),
  );
}

export function normalizeDimensionPoint(point) {
  return { u: finite(point?.u), v: finite(point?.v) };
}

function normalizeDimensionReference(reference) {
  if (!reference?.entityType || !reference?.entityId || !reference?.anchor) return null;
  const normalized = {
    entityType: reference.entityType,
    entityId: reference.entityId,
    anchor: reference.anchor,
  };
  if (Number.isFinite(Number(reference.t))) normalized.t = clamp(Number(reference.t), 0, 1);
  return normalized;
}

export function createWallDimension(dimension = {}) {
  return {
    id: dimension.id || generateId('wall_dim'),
    mode: Object.values(WALL_DIMENSION_MODES).includes(dimension.mode) ? dimension.mode : WALL_DIMENSION_MODES.ALIGNED,
    start: normalizeDimensionPoint(dimension.start),
    end: normalizeDimensionPoint(dimension.end),
    startRef: normalizeDimensionReference(dimension.startRef),
    endRef: normalizeDimensionReference(dimension.endRef),
    offset: finite(dimension.offset, 60),
    textOverride: String(dimension.textOverride || ''),
    tolerance: Math.max(0, finite(dimension.tolerance, 0)),
    note: String(dimension.note || ''),
  };
}

export function createAsBuiltMeasurement(measurement = {}) {
  return {
    id: measurement.id || generateId('measure'),
    label: measurement.label || 'Site measurement',
    targetType: measurement.targetType || 'datum',
    targetId: measurement.targetId || null,
    axis: measurement.axis === 'v' ? 'v' : 'u',
    designValue: finite(measurement.designValue),
    measuredValue: finite(measurement.measuredValue),
    tolerance: positive(measurement.tolerance, 6),
    note: measurement.note || '',
    capturedAt: measurement.capturedAt || new Date().toISOString(),
  };
}

// One resolved frame per (wall, floor) pair. Floors and walls are replaced
// wholesale on every edit, so an entry can never go stale — and a single
// `deriveWallDetail` asks for the frame a dozen times over, each of which would
// otherwise re-run the plan overlap that finds the wall's slab bands.
const detailFrames = new WeakMap();

/**
 * The rectangle every wall-detail derivation is drawn inside, and where the
 * finished floor sits within it.
 *
 * For a platform wall this is exactly what it always was — `wallLength` by
 * `wall.height`, with the datum at v = 0. A bypass wall answers its RESOLVED
 * span instead: the plane starts below its own deck and finishes at the floor
 * above, so the frame is one uninterrupted run and v = 0 is the bottom of the
 * plane, not the floor you stand on. `datumV` is that floor, and every sill
 * measures from it.
 */
export function resolveWallDetailFrame(wall, floor, project = null) {
  const cached = detailFrames.get(wall);
  if (cached && cached.floor === floor && cached.project === project) return cached.frame;

  const span = resolveWallVerticalSpan(wall, floor, project);
  const height = Math.max(0, finite(span.top) - finite(span.base));
  const frame = {
    length: wallLength(wall),
    height,
    base: finite(span.base),
    top: finite(span.top),
    datumV: clamp(finite(span.datum) - finite(span.base), 0, height),
    mode: span.mode,
    drop: finite(span.drop),
    slabBands: resolveWallSlabBands(wall, floor, project),
  };
  if (wall && typeof wall === 'object') detailFrames.set(wall, { floor, project, frame });
  return frame;
}

/** The storey context a resolved frame hands the framing generator. */
export function wallFramingLayoutOptions(frame) {
  return { height: frame.height, datumV: frame.datumV, bands: frame.slabBands };
}

function wallOpeningSources(wall, floor) {
  return [
    ...(floor?.doors || [])
      .filter((opening) => opening.wallId === wall.id)
      .map((opening) => ({ ...opening, openingKind: 'door' })),
    ...(floor?.windows || [])
      .filter((opening) => opening.wallId === wall.id)
      .map((opening) => ({ ...opening, openingKind: 'window' })),
  ];
}

export function deriveWallDetailOpenings(wall, floor) {
  return wallOpeningRects(wallOpeningSources(wall, floor), resolveWallDetailFrame(wall, floor));
}

function profileBoardSize(face) {
  const profile = getWallProductProfile(face.productProfileId);
  const stock = profile.stockBoards[0] || { widthMm: 1219, heightMm: 2438 };
  const configuredWidth = positive(face.layout.boardWidth, stock.widthMm);
  const configuredHeight = positive(face.layout.boardHeight, stock.heightMm);
  return face.layout.orientation === 'horizontal'
    ? { width: configuredHeight, height: configuredWidth }
    : { width: configuredWidth, height: configuredHeight };
}

// The last grid line at or before `from`. The set-out is anchored on the origin
// and nothing else: moving where the layout STARTS must never move where the
// joints LAND, or extending a board past the wall end would shuffle every
// cassette on the elevation.
function firstGridLine(origin, pitch, from = 0) {
  if (pitch <= EPSILON) return from;
  let value = origin;
  while (value > from) value -= pitch;
  while (value + pitch <= from) value += pitch;
  return value;
}

/**
 * A regular grid of rectangles clipped to the face, the one generator behind
 * both the sheet layout and the rainscreen module. `extra` is stamped onto every
 * rect so a caller can carry its own bookkeeping — the rainscreen path uses it
 * for the module indices its tone cycling reads.
 *
 * `span` is the board's u-range, which is the wall's own 0 → length for a board
 * that stops at both ends and reaches beyond it for one that laps a corner. The
 * column index still counts from the origin's own grid line, so a board given an
 * overhang gains cassettes at the end rather than renumbering the ones already
 * there — which is what keeps the rainscreen's tone pattern still.
 */
function gridRects(layout, span, height, extra = null) {
  const pitchU = layout.width + layout.gapU;
  const pitchV = layout.height + layout.gapV;
  const originLine = firstGridLine(layout.originU, pitchU);
  const startU = firstGridLine(layout.originU, pitchU, span.u0);
  const startV = firstGridLine(layout.originV, pitchV);
  const rects = [];
  let column = pitchU > EPSILON ? Math.round((startU - originLine) / pitchU) : 0;
  for (let u = startU; u < span.u1 - EPSILON; u += pitchU, column += 1) {
    let row = 0;
    for (let v = startV; v < height - EPSILON; v += pitchV, row += 1) {
      const rect = {
        u0: clamp(u, span.u0, span.u1),
        u1: clamp(u + layout.width, span.u0, span.u1),
        v0: clamp(v, 0, height),
        v1: clamp(v + layout.height, 0, height),
      };
      if (rectangleArea(rect) <= EPSILON) continue;
      rects.push({
        id: `grid-c${column}-r${row}`,
        ...rect,
        source: 'generated',
        ...(extra ? extra(column, row) : null),
      });
    }
  }
  return rects;
}

function deriveGridRects(face, span, height) {
  const size = profileBoardSize(face);
  return gridRects(
    {
      width: size.width,
      height: size.height,
      gapU: face.layout.horizontalGap,
      gapV: face.layout.verticalGap,
      originU: face.layout.originU,
      originV: face.layout.originV,
    },
    span,
    height,
  );
}

/** Whether the board hung on this face of the wall is a rainscreen cassette. */
export function isRainscreenFace(wall, side = WALL_DETAIL_SIDES.INTERIOR) {
  const assembly = resolveWallAssembly(wall);
  return assembly.system === 'framed' && assembly[side]?.material === WALL_BOARD_MATERIALS.RAINSCREEN;
}

/**
 * The cassette grid, set out from the bottom corner of the wall's RESOLVED span.
 *
 * Nothing here is configurable, and that is the point: a rainscreen's joints are
 * a set-out, not a fitting allowance. A bypass wall's span is three storeys of
 * one plane, so the courses run right past the floor lines exactly the way the
 * cassettes do on the real building — which is what makes the facade read as one
 * elevation rather than as three stacked walls.
 */
function rainscreenGridRects(span, height) {
  return gridRects(
    {
      width: RAINSCREEN_MODULE.width,
      height: RAINSCREEN_MODULE.height,
      gapU: RAINSCREEN_MODULE.joint,
      gapV: RAINSCREEN_MODULE.joint,
      originU: 0,
      originV: 0,
    },
    span,
    height,
    (column, row) => ({ moduleColumn: column, moduleRow: row }),
  );
}

/**
 * Where this face's board actually starts and stops along the wall, overhangs
 * and all. Everything that draws, builds or bills the face reads it from here,
 * so the plan, the elevation, the 3D preview and the schedule cannot disagree
 * about how far the cladding runs.
 */
export function resolveWallBoardSpan(wall, floor, side = WALL_DETAIL_SIDES.INTERIOR, project = null) {
  const assembly = resolveWallAssembly(wall);
  return boardLayerUSpan(assembly[side], resolveWallDetailFrame(wall, floor, project).length);
}

/**
 * Openings punched out of a set of source rectangles, in the wall's own
 * elevation. Every panel answers both a rectangular fragment list (what gets
 * cut and hung) and a polygonal region list (what gets drawn and billed), and a
 * panel that falls entirely inside a door or window keeps no area at all and
 * drops out — the hole is not clad.
 */
function panelsFromRects(wall, floor, side, sourceRects) {
  const openings = deriveWallDetailOpenings(wall, floor);
  const openingPolygons = openings.map((opening) => uvToXy(rectOutline(opening)));

  return sourceRects
    .map((panel, index) => {
      const outlinePoints = panel.outlinePoints || rectOutline(panel);
      const fragments = subtractRectangles(panel, openings);
      const regions = subtractPolygons(uvToXy(outlinePoints), openingPolygons).map((region) => ({
        outline: xyToUv(region.outline),
        holes: region.holes.map(xyToUv),
      }));
      const netArea = regions.reduce((total, region) => total + regionArea(region), 0);
      const cutouts = openings.map((opening) => rectangleIntersection(panel, opening)).filter(Boolean);
      return {
        ...panel,
        id: `${wall.id}:${side}:panel:${panel.id}`,
        localId: panel.id,
        index: index + 1,
        label: panel.label || `P${index + 1}`,
        width: panel.u1 - panel.u0,
        height: panel.v1 - panel.v0,
        outlinePoints,
        grossArea: polygonAreaUv(outlinePoints),
        netArea,
        fragments,
        regions,
        cutouts,
      };
    })
    .filter((panel) => panel.netArea > EPSILON);
}

/**
 * The wall's own run, read back out of the span its board covers.
 *
 * `boardLayerUSpan` builds `u1` as run + end, so the run is still in there to be
 * read back. Nothing therefore has to carry the wall's length alongside its
 * board span, and no caller can pass a length that disagrees with the span it
 * came from.
 */
function boardSpanWallRun(span) {
  return span.u1 - span.end;
}

function mappedPanelU(geometry, mapU) {
  const u0 = mapU(geometry.u0);
  const u1 = mapU(geometry.u1);
  // A mapping that turns the board inside out is no mapping at all: a board
  // drawn wholly inside the overhang has only one of its edges on a wall end,
  // and moving that one alone would invert it.
  if (u1 - u0 <= EPSILON) return geometry;
  return {
    ...geometry,
    u0,
    u1,
    ...(geometry.outlinePoints?.length
      ? { outlinePoints: geometry.outlinePoints.map((point) => ({ ...point, u: mapU(point.u) })) }
      : {}),
  };
}

/**
 * A drawn board read back with this face's overhang applied to it.
 *
 * An overhang is a corner detail, so it moves the cladding that already reaches
 * the corner and nothing else: an edge standing on the wall's own end runs out
 * to the end of the board span, and every joint inside the wall stays exactly
 * where it was drawn. Precisely what the solid skin does in plan and in 3D,
 * where only the first and last segments of the run move.
 *
 * The stretch is DERIVED. The stored board keeps the numbers the user drew, so
 * changing the overhang re-derives from scratch and setting it back to zero
 * gives the drawing back untouched rather than leaving a lap baked into it.
 */
export function extendPanelOverBoardSpan(geometry, span) {
  if (!span || (!span.start && !span.end)) return geometry;
  const run = boardSpanWallRun(span);
  return mappedPanelU(geometry, (u) => (Math.abs(u) <= EPSILON ? span.u0 : Math.abs(u - run) <= EPSILON ? span.u1 : u));
}

/**
 * The same board with the overhang taken back off it — what gets STORED when
 * the editor turns derived boards into editable ones.
 *
 * Without it, materialising a face that already laps a corner would freeze that
 * lap into the stored geometry, and the next change to the overhang would move
 * the plan and the 3D preview while the drawn boards stayed exactly where the
 * old overhang had put them.
 */
export function retractPanelOverBoardSpan(geometry, span) {
  if (!span || (!span.start && !span.end)) return geometry;
  const run = boardSpanWallRun(span);
  return mappedPanelU(geometry, (u) =>
    Math.abs(u - span.u0) <= EPSILON ? 0 : Math.abs(u - span.u1) <= EPSILON ? run : u,
  );
}

/**
 * The rectangles a face's panels are cut from, before any opening touches them.
 *
 * A cassette face in grid mode is set out on the facade module rather than on
 * the sheet size, so the drawing, the 3D preview and the bill all show the
 * joints the facade is actually built to. Panels drawn by hand still override
 * it — that is how a rainscreen with a special bay gets documented.
 */
function panelSourceRects(wall, side, face, span, height) {
  if (face.layout.mode === PANEL_LAYOUT_MODES.CUSTOM) {
    const bounds = { u0: span.u0, u1: span.u1, v0: 0, v1: height };
    return face.layout.customPanels.map((panel, index) => {
      const storedOutline = normalizeStoredOutline(panel, bounds);
      // The generated grid is laid out over the span already; a drawn board is
      // laid out on the wall, so the lap is applied to it here — the one place
      // a stored board learns that its corner has been closed over.
      const lapped = extendPanelOverBoardSpan(
        storedOutline
          ? { ...polygonBounds(storedOutline), outlinePoints: storedOutline }
          : normalizeStoredRect(panel, bounds),
        span,
      );
      const rect = lapped.outlinePoints ? polygonBounds(lapped.outlinePoints) : lapped;
      return {
        id: panel.id || `custom-${index + 1}`,
        u0: rect.u0,
        u1: rect.u1,
        v0: rect.v0,
        v1: rect.v1,
        outlinePoints: lapped.outlinePoints || rectOutline(rect),
        polygonal: Boolean(storedOutline),
        source: 'custom',
        label: panel.label || '',
      };
    });
  }
  if (isRainscreenFace(wall, side)) return rainscreenGridRects(span, height);
  return deriveGridRects(face, span, height);
}

export function deriveWallPanels(wall, floor, side = WALL_DETAIL_SIDES.INTERIOR) {
  const detailing = resolveWallDetailing(wall);
  const face = detailing.sides[side];
  const { length, height } = resolveWallDetailFrame(wall, floor);
  if (!detailing.enabled || !face?.enabled || length <= EPSILON || height <= EPSILON) return [];
  const span = resolveWallBoardSpan(wall, floor, side);
  return panelsFromRects(wall, floor, side, panelSourceRects(wall, side, face, span, height));
}

/**
 * The cassette layout for a rainscreen face, whether or not anyone has opened
 * the wall detail editor.
 *
 * The panelization is the finish, not a documentation option: a rainscreen that
 * only breaks into cassettes once you switch detailing on would render as a
 * blank slab on every wall nobody had detailed yet. A face the editor HAS taken
 * over answers through `deriveWallPanels` instead, so a hand-drawn bay and the
 * generated grid can never disagree about what is hanging there.
 */
export function deriveRainscreenPanels(wall, floor, side = WALL_DETAIL_SIDES.INTERIOR) {
  if (!isRainscreenFace(wall, side)) return [];
  const detailing = resolveWallDetailing(wall);
  if (detailing.enabled && detailing.sides[side]?.enabled) return deriveWallPanels(wall, floor, side);
  const { length, height } = resolveWallDetailFrame(wall, floor);
  if (length <= EPSILON || height <= EPSILON) return [];
  return panelsFromRects(wall, floor, side, rainscreenGridRects(resolveWallBoardSpan(wall, floor, side), height));
}

/**
 * The generated frame for a wall, in that wall's own elevation.
 *
 * All of the geometry lives in `deriveWallFramingLayout`, which is also what the
 * plan renderer and the takeoff read: one generator, so what is drawn, what is
 * built, and what is billed cannot disagree. This adapter only supplies the
 * storey context the layout cannot see — the resolved span, the finished-floor
 * datum, and the slab bands a bypass wall's plane runs past — and stamps the
 * members as generated so the editor can tell them from hand-placed ones.
 */
export function deriveAutomaticWallFraming(wall, floor) {
  const layout = deriveWallFramingLayout(
    wall,
    wallOpeningSources(wall, floor),
    wallFramingLayoutOptions(resolveWallDetailFrame(wall, floor)),
  );
  return layout.members.map((member) => ({ ...member, source: 'generated' }));
}

/**
 * `includeWhenDisabled` derives the layout a framed wall would be built to even
 * though detailing has not been switched on for documentation. The layout comes
 * entirely from `assembly.framing`, which every framed wall has; the detailing
 * flag governs drawing and takeoff, not whether the studs exist. The 3D preview
 * uses it to show the frame behind a wall whose boards are hidden.
 */
export function deriveWallFramingMembers(wall, floor, { includeWhenDisabled = false } = {}) {
  const detailing = resolveWallDetailing(wall);
  const assembly = resolveWallAssembly(wall);
  if (assembly.system !== 'framed') return [];
  if (!detailing.enabled && !includeWhenDisabled) return [];

  if (detailing.framing.mode === FRAMING_LAYOUT_MODES.CUSTOM) {
    return detailing.framing.members.map((member) => createCustomFramingMember(member));
  }

  const removed = new Set(detailing.framing.removedGeneratedIds);
  return [
    ...deriveAutomaticWallFraming(wall, floor).filter((member) => !removed.has(member.id)),
    ...detailing.framing.members.map((member) => createCustomFramingMember(member)),
  ];
}

/**
 * The exact UV point an anchor id names on a rectangle — corner, edge midpoint,
 * a fraction `t` along an edge, or a vertex of a traced outline. Shared with the
 * ceiling editor, whose boards, framing and openings are the same kind of
 * rectangle in the same kind of UV frame.
 */
export function rectAnchorPoint(rect, reference) {
  const anchor = typeof reference === 'string' ? reference : reference?.anchor;
  const t = clamp(finite(typeof reference === 'string' ? 0.5 : reference?.t, 0.5), 0, 1);
  if (anchor?.startsWith('vertex_') && rect.outlinePoints?.length) {
    const index = Number(anchor.slice('vertex_'.length));
    return Number.isInteger(index) && rect.outlinePoints[index] ? { ...rect.outlinePoints[index] } : null;
  }
  const centerU = (rect.u0 + rect.u1) / 2;
  const centerV = (rect.v0 + rect.v1) / 2;
  if (anchor?.startsWith('outline_edge_') && rect.outlinePoints?.length) {
    const index = Number(anchor.slice('outline_edge_'.length));
    const start = Number.isInteger(index) ? rect.outlinePoints[index] : null;
    const end = start ? rect.outlinePoints[(index + 1) % rect.outlinePoints.length] : null;
    return start && end ? { u: start.u + (end.u - start.u) * t, v: start.v + (end.v - start.v) * t } : null;
  }
  if (anchor === 'edge_left') return { u: rect.u0, v: rect.v0 + (rect.v1 - rect.v0) * t };
  if (anchor === 'edge_right') return { u: rect.u1, v: rect.v0 + (rect.v1 - rect.v0) * t };
  if (anchor === 'edge_bottom') return { u: rect.u0 + (rect.u1 - rect.u0) * t, v: rect.v0 };
  if (anchor === 'edge_top') return { u: rect.u0 + (rect.u1 - rect.u0) * t, v: rect.v1 };
  if (anchor === 'axis_center' && rect.orientation === 'vertical') {
    return { u: centerU, v: rect.v0 + (rect.v1 - rect.v0) * t };
  }
  if (anchor === 'axis_center' && rect.orientation === 'horizontal') {
    return { u: rect.u0 + (rect.u1 - rect.u0) * t, v: centerV };
  }
  const anchors = {
    bottom_left: { u: rect.u0, v: rect.v0 },
    bottom_center: { u: centerU, v: rect.v0 },
    bottom_right: { u: rect.u1, v: rect.v0 },
    center_left: { u: rect.u0, v: centerV },
    center: { u: centerU, v: centerV },
    center_right: { u: rect.u1, v: centerV },
    top_left: { u: rect.u0, v: rect.v1 },
    top_center: { u: centerU, v: rect.v1 },
    top_right: { u: rect.u1, v: rect.v1 },
  };
  return anchors[anchor] || null;
}

export function resolveWallDimensionReference(reference, fallback, context) {
  if (!reference) return normalizeDimensionPoint(fallback);
  let entity = null;
  if (reference.entityType === 'wall' && reference.entityId === context.wall.id) {
    entity = { u0: 0, u1: context.length, v0: 0, v1: context.height };
  } else if (reference.entityType === 'panel') {
    entity = context.panels.find((panel) => panel.localId === reference.entityId || panel.id === reference.entityId);
  } else if (reference.entityType === 'opening') {
    entity = context.openings.find((opening) => opening.id === reference.entityId);
  } else if (reference.entityType === 'framing') {
    entity = context.members.find((member) => member.id === reference.entityId);
  } else if (reference.entityType === 'fastener') {
    const fastener = context.fasteners?.find((entry) => entry.id === reference.entityId);
    return fastener ? { u: fastener.u, v: fastener.v } : normalizeDimensionPoint(fallback);
  }
  if (!entity) return normalizeDimensionPoint(fallback);
  return rectAnchorPoint(entity, reference) || normalizeDimensionPoint(fallback);
}

export function wallDimensionMeasurement(dimension) {
  const deltaU = finite(dimension?.end?.u) - finite(dimension?.start?.u);
  const deltaV = finite(dimension?.end?.v) - finite(dimension?.start?.v);
  if (dimension?.mode === WALL_DIMENSION_MODES.HORIZONTAL) return Math.abs(deltaU);
  if (dimension?.mode === WALL_DIMENSION_MODES.VERTICAL) return Math.abs(deltaV);
  return Math.hypot(deltaU, deltaV);
}

export function formatWallDimensionValue(value, precision = 0.01) {
  const resolvedPrecision = WALL_DIMENSION_PRECISIONS.includes(Number(precision)) ? Number(precision) : 0.01;
  const decimals = Math.max(0, Math.round(-Math.log10(resolvedPrecision)));
  const scaled = finite(value) / resolvedPrecision;
  const correction = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 2;
  const rounded = Math.round(scaled + correction) * resolvedPrecision;
  return `${rounded.toFixed(decimals)} mm`;
}

export function deriveWallDimensionGeometry(dimension) {
  const start = normalizeDimensionPoint(dimension?.start);
  const end = normalizeDimensionPoint(dimension?.end);
  const offset = finite(dimension?.offset, 60);
  let dimensionStart;
  let dimensionEnd;

  if (dimension?.mode === WALL_DIMENSION_MODES.HORIZONTAL) {
    const baseV = Math.max(start.v, end.v) + offset;
    dimensionStart = { u: start.u, v: baseV };
    dimensionEnd = { u: end.u, v: baseV };
  } else if (dimension?.mode === WALL_DIMENSION_MODES.VERTICAL) {
    const baseU = Math.max(start.u, end.u) + offset;
    dimensionStart = { u: baseU, v: start.v };
    dimensionEnd = { u: baseU, v: end.v };
  } else {
    const deltaU = end.u - start.u;
    const deltaV = end.v - start.v;
    const length = Math.hypot(deltaU, deltaV) || 1;
    const normal = { u: (-deltaV / length) * offset, v: (deltaU / length) * offset };
    dimensionStart = { u: start.u + normal.u, v: start.v + normal.v };
    dimensionEnd = { u: end.u + normal.u, v: end.v + normal.v };
  }

  return {
    witnessStart: start,
    witnessEnd: end,
    dimensionStart,
    dimensionEnd,
    textPoint: {
      u: (dimensionStart.u + dimensionEnd.u) / 2,
      v: (dimensionStart.v + dimensionEnd.v) / 2,
    },
    angleDegrees:
      dimension?.mode === WALL_DIMENSION_MODES.VERTICAL
        ? -90
        : dimension?.mode === WALL_DIMENSION_MODES.HORIZONTAL
          ? 0
          : (-Math.atan2(dimensionEnd.v - dimensionStart.v, dimensionEnd.u - dimensionStart.u) * 180) / Math.PI,
  };
}

/**
 * A stored or generated dimension turned into the drawn one: the measured value
 * and the text that goes above the line. Assembly-agnostic — it reads nothing
 * but the dimension itself — so the ceiling plan labels its measurements the
 * same way an elevation does.
 */
export function describeDimension(id, name, dimension, source = 'automatic', precision = 0.01) {
  const measurement = wallDimensionMeasurement(dimension);
  return {
    ...dimension,
    id,
    name,
    source,
    measurement,
    label:
      dimension.textOverride?.trim() ||
      `${formatWallDimensionValue(measurement, precision)}${dimension.tolerance > 0 ? ` ±${formatWallDimensionValue(dimension.tolerance, precision)}` : ''}`,
  };
}

export function uniqueDimensionValues(values, tolerance = 0.5) {
  return [...values]
    .sort((a, b) => a - b)
    .filter((value, index, entries) => index === 0 || Math.abs(value - entries[index - 1]) > tolerance);
}

function automaticWallDimensions(side, face, context) {
  const dimensions = [];
  const makeDimension = (id, name, dimension) =>
    describeDimension(id, name, dimension, 'automatic', face.dimensions.precision);
  if (face.dimensions.showOverall) {
    dimensions.push(
      makeDimension(`auto:${side}:overall:length`, 'Overall wall length', {
        mode: WALL_DIMENSION_MODES.HORIZONTAL,
        start: { u: 0, v: 0 },
        end: { u: context.length, v: 0 },
        offset: 70,
      }),
      makeDimension(`auto:${side}:overall:height`, 'Overall wall height', {
        mode: WALL_DIMENSION_MODES.VERTICAL,
        start: { u: 0, v: 0 },
        end: { u: 0, v: context.height },
        offset: 70,
      }),
    );
  }

  if (face.dimensions.showOpenings) {
    for (const opening of context.openings) {
      dimensions.push(
        makeDimension(`auto:${side}:opening:${opening.id}:width`, `${opening.kind} width`, {
          mode: WALL_DIMENSION_MODES.HORIZONTAL,
          start: { u: opening.u0, v: opening.v1 },
          end: { u: opening.u1, v: opening.v1 },
          offset: -60,
        }),
        makeDimension(`auto:${side}:opening:${opening.id}:height`, `${opening.kind} height`, {
          mode: WALL_DIMENSION_MODES.VERTICAL,
          start: { u: opening.u1, v: opening.v0 },
          end: { u: opening.u1, v: opening.v1 },
          offset: -60,
        }),
      );
      if (opening.v0 > EPSILON) {
        dimensions.push(
          makeDimension(`auto:${side}:opening:${opening.id}:sill`, `${opening.kind} sill height`, {
            mode: WALL_DIMENSION_MODES.VERTICAL,
            start: { u: opening.u0, v: 0 },
            end: { u: opening.u0, v: opening.v0 },
            offset: 60,
          }),
        );
      }
      if (opening.u0 > EPSILON) {
        dimensions.push(
          makeDimension(`auto:${side}:opening:${opening.id}:setout`, `${opening.kind} set-out`, {
            mode: WALL_DIMENSION_MODES.HORIZONTAL,
            start: { u: 0, v: 0 },
            end: { u: opening.u0, v: 0 },
            offset: 150,
          }),
        );
      }
    }
  }

  if (face.dimensions.showPanels && context.panels.length) {
    const uValues = uniqueDimensionValues([
      0,
      context.length,
      ...context.panels.flatMap((panel) => [panel.u0, panel.u1]),
    ]);
    const vValues = uniqueDimensionValues([
      0,
      context.height,
      ...context.panels.flatMap((panel) => [panel.v0, panel.v1]),
    ]);
    for (let index = 1; index < uValues.length; index += 1) {
      dimensions.push(
        makeDimension(`auto:${side}:panel:u:${index}`, 'Panel/grid horizontal chain', {
          mode: WALL_DIMENSION_MODES.HORIZONTAL,
          start: { u: uValues[index - 1], v: 0 },
          end: { u: uValues[index], v: 0 },
          offset: 230,
        }),
      );
    }
    for (let index = 1; index < vValues.length; index += 1) {
      dimensions.push(
        makeDimension(`auto:${side}:panel:v:${index}`, 'Panel/grid vertical chain', {
          mode: WALL_DIMENSION_MODES.VERTICAL,
          start: { u: 0, v: vValues[index - 1] },
          end: { u: 0, v: vValues[index] },
          offset: 230,
        }),
      );
    }
  }

  if (face.dimensions.showFraming) {
    const centers = uniqueDimensionValues(
      context.members
        .filter((member) => member.frameIndex === 0 && member.orientation === 'vertical')
        .map((member) => (member.u0 + member.u1) / 2),
    );
    for (let index = 1; index < centers.length; index += 1) {
      dimensions.push(
        makeDimension(`auto:${side}:framing:${index}`, 'Framing centre spacing', {
          mode: WALL_DIMENSION_MODES.HORIZONTAL,
          start: { u: centers[index - 1], v: context.height },
          end: { u: centers[index], v: context.height },
          offset: -150,
        }),
      );
    }
  }
  return dimensions.filter((dimension) => dimension.measurement > EPSILON);
}

export function deriveWallDimensions(wall, floor, side = WALL_DETAIL_SIDES.INTERIOR) {
  const detailing = resolveWallDetailing(wall);
  const face = detailing.sides[side];
  if (!detailing.enabled || !face?.enabled) return [];
  const frame = resolveWallDetailFrame(wall, floor);
  const context = {
    wall,
    length: frame.length,
    height: frame.height,
    panels: deriveWallPanels(wall, floor, side),
    openings: deriveWallDetailOpenings(wall, floor),
    members: deriveWallFramingMembers(wall, floor),
    fasteners: deriveWallFasteners(wall, floor, side),
  };
  const manual = face.dimensions.manual
    .map((stored) => {
      const dimension = createWallDimension(stored);
      dimension.start = resolveWallDimensionReference(dimension.startRef, dimension.start, context);
      dimension.end = resolveWallDimensionReference(dimension.endRef, dimension.end, context);
      return describeDimension(
        dimension.id,
        dimension.note || 'User dimension',
        dimension,
        'custom',
        face.dimensions.precision,
      );
    })
    .filter((dimension) => dimension.measurement > EPSILON);
  return [...automaticWallDimensions(side, face, context), ...manual];
}

function memberCenterU(member) {
  return (member.u0 + member.u1) / 2;
}

function supportsVerticalEdge(member, u, v0, v1, tolerance = 2) {
  return (
    member.orientation === 'vertical' &&
    u >= member.u0 - tolerance &&
    u <= member.u1 + tolerance &&
    member.v0 <= v0 + tolerance &&
    member.v1 >= v1 - tolerance
  );
}

function supportsHorizontalEdge(member, v, u0, u1, tolerance = 2) {
  return (
    member.orientation === 'horizontal' &&
    v >= member.v0 - tolerance &&
    v <= member.v1 + tolerance &&
    member.u0 <= u0 + tolerance &&
    member.u1 >= u1 - tolerance
  );
}

function pointOnMember(point, member, tolerance = 2) {
  return (
    point.u >= member.u0 - tolerance &&
    point.u <= member.u1 + tolerance &&
    point.v >= member.v0 - tolerance &&
    point.v <= member.v1 + tolerance
  );
}

function pointInsidePanel(point, panel, tolerance = 0.5) {
  if (!panel.regions?.length) {
    return panel.fragments.some(
      (fragment) =>
        point.u >= fragment.u0 - tolerance &&
        point.u <= fragment.u1 + tolerance &&
        point.v >= fragment.v0 - tolerance &&
        point.v <= fragment.v1 + tolerance,
    );
  }
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

function generatePanelFasteners(panel, members, pattern, type) {
  const result = new Map();
  const corner = Math.min(pattern.cornerClearance, panel.width / 2, panel.height / 2);
  const edge = Math.min(pattern.edgeClearance, panel.width / 2, panel.height / 2);
  const verticalEdges = [
    { name: 'left', supportU: panel.u0, fastenerU: panel.u0 + edge },
    { name: 'right', supportU: panel.u1, fastenerU: panel.u1 - edge },
  ];
  for (const candidate of verticalEdges) {
    if (!members.some((member) => supportsVerticalEdge(member, candidate.supportU, panel.v0, panel.v1))) continue;
    for (const v of spacedValues(panel.v0 + corner, panel.v1 - corner, pattern.perimeterSpacing)) {
      addGeneratedFastener(result, panel, { u: candidate.fastenerU, v }, candidate.name, type);
    }
  }

  const horizontalEdges = [
    { name: 'bottom', supportV: panel.v0, fastenerV: panel.v0 + edge },
    { name: 'top', supportV: panel.v1, fastenerV: panel.v1 - edge },
  ];
  for (const candidate of horizontalEdges) {
    if (!members.some((member) => supportsHorizontalEdge(member, candidate.supportV, panel.u0, panel.u1))) continue;
    for (const u of spacedValues(panel.u0 + corner, panel.u1 - corner, pattern.perimeterSpacing)) {
      addGeneratedFastener(result, panel, { u, v: candidate.fastenerV }, candidate.name, type);
    }
  }

  for (const member of members) {
    if (member.orientation !== 'vertical') continue;
    const center = memberCenterU(member);
    if (center <= panel.u0 + edge || center >= panel.u1 - edge) continue;
    for (const v of spacedValues(panel.v0 + corner, panel.v1 - corner, pattern.fieldSpacing)) {
      addGeneratedFastener(result, panel, { u: center, v }, 'field', type);
    }
  }
  return [...result.values()];
}

export function deriveWallFasteners(wall, floor, side = WALL_DETAIL_SIDES.INTERIOR) {
  const detailing = resolveWallDetailing(wall);
  const face = detailing.sides[side];
  if (!detailing.enabled || !face?.enabled) return [];
  const profile = getWallProductProfile(face.productProfileId);
  const defaults = profile.planningDefaults || {};
  const pattern = {
    edgeClearance: positive(face.fasteners.edgeClearance, defaults.edgeClearanceMm || 12),
    cornerClearance: positive(face.fasteners.cornerClearance, defaults.cornerClearanceMm || 50),
    perimeterSpacing: positive(face.fasteners.perimeterSpacing, defaults.perimeterSpacingMm || 200),
    fieldSpacing: positive(face.fasteners.fieldSpacing, defaults.fieldSpacingMm || 300),
  };
  const members = deriveWallFramingMembers(wall, floor).filter((member) => member.frameIndex === 0);
  const panels = deriveWallPanels(wall, floor, side);
  const generated =
    face.fasteners.mode === FASTENER_LAYOUT_MODES.GENERATED
      ? panels.flatMap((panel) =>
          generatePanelFasteners(panel, members, pattern, face.fasteners.type || defaults.fastenerType || 'screw'),
        )
      : [];
  const guided =
    face.fasteners.mode === FASTENER_LAYOUT_MODES.CUSTOM
      ? face.fasteners.guides.flatMap((guide) =>
          createFastenersFromGuide(guide, resolveWallDetailFrame(wall, floor), {
            panels,
            type: face.fasteners.type || defaults.fastenerType || 'screw',
          }),
        )
      : [];
  const removed = new Set(face.fasteners.removedGeneratedIds);
  return [
    ...generated.filter((fastener) => !removed.has(fastener.id)),
    ...face.fasteners.manual
      .filter((fastener) => !fastener.guideId)
      .map((fastener) => createManualFastener(fastener, fastener)),
    ...guided,
  ];
}

// `variant` separates two findings of the same rule against the same thing —
// a board with both its right and top edges off the frame raises two, and
// without it they would share an id and the list would render one over the
// other. Empty for every rule that can only fire once per entity.
function issue(ruleId, severity, message, entity, evidence = {}, variant = '') {
  return {
    id: `${ruleId}:${entity.type}:${entity.id}${variant ? `:${variant}` : ''}`,
    ruleId,
    severity,
    message,
    entity,
    evidence,
    professionalReviewRequired: true,
  };
}

function validatePanelSupport(panel, members, issues, wallRunEnd = Infinity) {
  const edges = (panel.outlinePoints || rectOutline(panel)).flatMap((start, index, points) => {
    const end = points[(index + 1) % points.length];
    if (Math.abs(start.u - end.u) <= EPSILON) {
      const label =
        Math.abs(start.u - panel.u0) <= EPSILON ? 'left' : Math.abs(start.u - panel.u1) <= EPSILON ? 'right' : 'cut';
      return [
        { axis: 'vertical', value: start.u, start: Math.min(start.v, end.v), end: Math.max(start.v, end.v), label },
      ];
    }
    if (Math.abs(start.v - end.v) <= EPSILON) {
      const label =
        Math.abs(start.v - panel.v0) <= EPSILON ? 'bottom' : Math.abs(start.v - panel.v1) <= EPSILON ? 'top' : 'cut';
      return [
        { axis: 'horizontal', value: start.v, start: Math.min(start.u, end.u), end: Math.max(start.u, end.u), label },
      ];
    }
    return [];
  });
  for (const edge of edges) {
    // Edges in the overhang region are exempt: a board lapped past the wall end
    // is CARRIED BY THE NEIGHBOURING WALL'S FRAME, which is the whole point of
    // the lap, and no member of this wall could ever stand there. A vertical
    // edge past the end is skipped whole; a horizontal edge is checked only
    // over the stretch that lies within this wall's own frame.
    if (edge.axis === 'vertical' && (edge.value < -EPSILON || edge.value > wallRunEnd + EPSILON)) continue;
    let checkStart = edge.start;
    let checkEnd = edge.end;
    if (edge.axis === 'horizontal') {
      checkStart = Math.max(checkStart, 0);
      checkEnd = Math.min(checkEnd, wallRunEnd);
      if (checkEnd - checkStart <= EPSILON) continue;
    }
    const supported =
      edge.axis === 'vertical'
        ? members.some((member) => supportsVerticalEdge(member, edge.value, checkStart, checkEnd))
        : members.some((member) => supportsHorizontalEdge(member, edge.value, checkStart, checkEnd));
    if (supported) continue;
    issues.push(
      issue(
        'WALL.PANEL_EDGE_UNSUPPORTED',
        'error',
        `${panel.label} ${edge.label} edge has no continuous framing support.`,
        { type: 'panel', id: panel.id },
        { edge },
        `${edge.axis}:${edge.label}:${Math.round(edge.value)}`,
      ),
    );
  }
}

function validateFace(wall, floor, side, detailing, members) {
  const face = detailing.sides[side];
  if (!face.enabled) return [];
  const issues = [];
  const profile = getWallProductProfile(face.productProfileId);
  const jurisdiction = getWallJurisdictionProfile(detailing.jurisdictionProfileId);
  const assembly = resolveWallAssembly(wall);
  const panels = deriveWallPanels(wall, floor, side);
  const fasteners = deriveWallFasteners(wall, floor, side);

  if (profile.status !== WALL_PRODUCT_PROFILE_STATUS.VERIFIED) {
    issues.push(
      issue(
        'WALL.PRODUCT_PROFILE_NOT_FULLY_VERIFIED',
        'warning',
        `${profile.product} profile is ${profile.status.replaceAll('_', ' ')}; fixing rules require confirmation.`,
        { type: 'wall', id: wall.id },
        { profileId: profile.id, source: profile.source },
      ),
    );
  }
  if (jurisdiction.region !== 'GLOBAL' && profile.region !== 'GLOBAL' && jurisdiction.region !== profile.region) {
    issues.push(
      issue(
        'WALL.PROFILE_JURISDICTION_MISMATCH',
        'error',
        `Product region ${profile.region} does not match jurisdiction ${jurisdiction.region}.`,
        { type: 'wall', id: wall.id },
        { profileId: profile.id, jurisdictionProfileId: jurisdiction.id },
      ),
    );
  }
  if (jurisdiction.status !== WALL_PRODUCT_PROFILE_STATUS.VERIFIED) {
    issues.push(
      issue(
        'WALL.JURISDICTION_PROFILE_NOT_VERIFIED',
        'warning',
        `${jurisdiction.label} is a coordination marker, not a completed code approval.`,
        { type: 'wall', id: wall.id },
        { jurisdictionProfileId: jurisdiction.id, source: jurisdiction.source },
      ),
    );
  }
  if (face.application !== profile.application) {
    issues.push(
      issue(
        'WALL.PRODUCT_APPLICATION_MISMATCH',
        'error',
        `${profile.product} is profiled for ${profile.application.replaceAll('_', ' ')}, not ${face.application.replaceAll('_', ' ')}.`,
        { type: 'wall', id: wall.id },
        { profileId: profile.id, selectedApplication: face.application },
      ),
    );
  }
  if (!profile.allowedFrameMaterials.includes(assembly.framing?.material)) {
    issues.push(
      issue(
        'WALL.FRAME_MATERIAL_NOT_ALLOWED',
        'error',
        `${profile.product} profile does not list ${assembly.framing?.material} framing.`,
        { type: 'wall', id: wall.id },
      ),
    );
  }
  if (!profile.jointSystems.includes(face.layout.jointSystem)) {
    issues.push(
      issue(
        'WALL.JOINT_SYSTEM_NOT_ALLOWED',
        'error',
        `${face.layout.jointSystem} is not listed by the selected product profile.`,
        { type: 'wall', id: wall.id },
      ),
    );
  }
  if (
    face.layout.jointSystem === 'express' &&
    face.layout.horizontalGap <= EPSILON &&
    face.layout.verticalGap <= EPSILON
  ) {
    issues.push(
      issue(
        'WALL.EXPRESS_JOINT_REQUIRES_REVEAL',
        'warning',
        'Express joint is selected but both modeled reveal dimensions are zero.',
        { type: 'wall', id: wall.id },
        {
          horizontalGap: face.layout.horizontalGap,
          verticalGap: face.layout.verticalGap,
          note: 'Confirm the permitted reveal width and backing detail with the selected product system.',
        },
      ),
    );
  }
  if (
    face.layout.horizontalGap >= assembly.framing.studWidth ||
    face.layout.verticalGap >= assembly.framing.studWidth
  ) {
    issues.push(
      issue(
        'WALL.REVEAL_LEAVES_NO_SHARED_SUPPORT',
        'error',
        `The modeled reveal must be narrower than the ${assembly.framing.studWidth} mm framing support.`,
        { type: 'wall', id: wall.id },
        {
          supportWidth: assembly.framing.studWidth,
          horizontalGap: face.layout.horizontalGap,
          verticalGap: face.layout.verticalGap,
          note: 'Panel landing per side is (support width - reveal) / 2.',
        },
      ),
    );
  }
  const planningRules = profile.planningDefaults || {};
  if (planningRules.maximumStudSpacingMm && assembly.framing.spacing > planningRules.maximumStudSpacingMm) {
    issues.push(
      issue(
        'WALL.STUD_SPACING_EXCEEDS_PROFILE',
        'warning',
        `Stud spacing ${assembly.framing.spacing} mm exceeds the profile planning limit of ${planningRules.maximumStudSpacingMm} mm.`,
        { type: 'wall', id: wall.id },
        { configured: assembly.framing.spacing, planningLimit: planningRules.maximumStudSpacingMm },
      ),
    );
  }
  if (planningRules.minimumSupportWidthMm && assembly.framing.studWidth < planningRules.minimumSupportWidthMm) {
    issues.push(
      issue(
        'WALL.SUPPORT_WIDTH_BELOW_PROFILE',
        'warning',
        `Support width ${assembly.framing.studWidth} mm is below the profile planning minimum of ${planningRules.minimumSupportWidthMm} mm.`,
        { type: 'wall', id: wall.id },
      ),
    );
  }
  if (planningRules.edgeClearanceMm && face.fasteners.edgeClearance < planningRules.edgeClearanceMm) {
    issues.push(
      issue(
        'WALL.FASTENER_EDGE_CLEARANCE_BELOW_PROFILE',
        'warning',
        `Fastener edge clearance ${face.fasteners.edgeClearance} mm is below the profile planning value of ${planningRules.edgeClearanceMm} mm.`,
        { type: 'wall', id: wall.id },
      ),
    );
  }
  if (planningRules.perimeterSpacingMm && face.fasteners.perimeterSpacing > planningRules.perimeterSpacingMm) {
    issues.push(
      issue(
        'WALL.FASTENER_SPACING_EXCEEDS_PROFILE',
        'warning',
        `Perimeter fastener spacing ${face.fasteners.perimeterSpacing} mm exceeds the profile planning value of ${planningRules.perimeterSpacingMm} mm.`,
        { type: 'wall', id: wall.id },
      ),
    );
  }
  for (const storedGuide of face.fasteners.guides) {
    const guide = createFastenerGuide(storedGuide);
    const maximumSpacing =
      guide.zone === FASTENER_GUIDE_ZONES.FIELD ? planningRules.fieldSpacingMm : planningRules.perimeterSpacingMm;
    if (!maximumSpacing || guide.spacing <= maximumSpacing) continue;
    issues.push(
      issue(
        'WALL.FASTENER_GUIDE_SPACING_EXCEEDS_PROFILE',
        'warning',
        `${guide.name} uses ${guide.spacing} mm ${guide.zone} spacing, above the profile planning value of ${maximumSpacing} mm.`,
        { type: 'fastener_guide', id: guide.id },
        { guideSpacingMm: guide.spacing, maximumSpacingMm: maximumSpacing, zone: guide.zone },
      ),
    );
  }
  const matchesStockBoard = profile.stockBoards.some(
    (stock) =>
      (Math.abs(stock.widthMm - face.layout.boardWidth) <= EPSILON &&
        Math.abs(stock.heightMm - face.layout.boardHeight) <= EPSILON) ||
      (Math.abs(stock.heightMm - face.layout.boardWidth) <= EPSILON &&
        Math.abs(stock.widthMm - face.layout.boardHeight) <= EPSILON),
  );
  if (!matchesStockBoard) {
    issues.push(
      issue(
        'WALL.PANEL_SIZE_NOT_STOCK',
        'warning',
        `${face.layout.boardWidth} × ${face.layout.boardHeight} mm does not match a stock board in the selected profile.`,
        { type: 'wall', id: wall.id },
        { stockBoards: profile.stockBoards },
      ),
    );
  }
  const boardLayer = assembly[side];
  if (
    boardLayer?.material === WALL_BOARD_MATERIALS.FIBER_CEMENT &&
    !profile.thicknessesMm.includes(boardLayer.thickness)
  ) {
    issues.push(
      issue(
        'WALL.BOARD_THICKNESS_NOT_PROFILED',
        'warning',
        `${boardLayer.thickness} mm board thickness is not listed by ${profile.product}.`,
        { type: 'wall', id: wall.id },
        { listedThicknessesMm: profile.thicknessesMm },
      ),
    );
  }

  const faceMembers = members.filter((member) => member.frameIndex === 0);
  panels.forEach((panel) => validatePanelSupport(panel, faceMembers, issues, wallLength(wall)));
  for (const fastener of fasteners) {
    if (faceMembers.some((member) => pointOnMember(fastener, member))) continue;
    issues.push(
      issue(
        'WALL.FASTENER_MISSES_SUPPORT',
        'error',
        `Fastener at ${fastener.u.toFixed(0)}, ${fastener.v.toFixed(0)} mm does not hit modeled framing.`,
        { type: 'fastener', id: fastener.id },
        { u: fastener.u, v: fastener.v, side },
      ),
    );
  }
  const dimensionContext = {
    wall,
    ...resolveWallDetailFrame(wall, floor),
    panels,
    openings: deriveWallDetailOpenings(wall, floor),
    members,
    fasteners,
  };
  for (const source of face.dimensions.manual) {
    const dimension = createWallDimension(source);
    dimension.start = resolveWallDimensionReference(dimension.startRef, dimension.start, dimensionContext);
    dimension.end = resolveWallDimensionReference(dimension.endRef, dimension.end, dimensionContext);
    if (wallDimensionMeasurement(dimension) <= EPSILON) {
      issues.push(
        issue('WALL.DIMENSION_ZERO_LENGTH', 'error', 'A user construction dimension has zero measurable length.', {
          type: 'wall_dimension',
          id: dimension.id,
        }),
      );
    }
    const outside = [dimension.start, dimension.end].some(
      (point) =>
        point.u < -EPSILON ||
        point.u > dimensionContext.length + EPSILON ||
        point.v < -EPSILON ||
        point.v > dimensionContext.height + EPSILON,
    );
    if (outside) {
      issues.push(
        issue(
          'WALL.DIMENSION_POINT_OUTSIDE_WALL',
          'warning',
          'A user construction dimension references a point outside the wall-local elevation.',
          { type: 'wall_dimension', id: dimension.id },
          { start: dimension.start, end: dimension.end, side },
        ),
      );
    }
  }
  return issues;
}

export function deriveAsBuiltComparison(wall) {
  const detailing = resolveWallDetailing(wall);
  return detailing.asBuilt.measurements.map((source) => {
    const measurement = createAsBuiltMeasurement(source);
    const deviation = measurement.measuredValue - measurement.designValue;
    const absoluteDeviation = Math.abs(deviation);
    return {
      ...measurement,
      deviation,
      absoluteDeviation,
      status: absoluteDeviation <= measurement.tolerance ? 'within_tolerance' : 'out_of_tolerance',
    };
  });
}

export function validateWallDetail(wall, floor) {
  if (!wall?.assembly?.detailing?.enabled) return [];
  const detailing = resolveWallDetailing(wall);
  if (resolveWallAssembly(wall).system !== 'framed') return [];
  const members = deriveWallFramingMembers(wall, floor);
  const issues = [
    ...validateFace(wall, floor, WALL_DETAIL_SIDES.INTERIOR, detailing, members),
    ...validateFace(wall, floor, WALL_DETAIL_SIDES.EXTERIOR, detailing, members),
  ];
  for (const comparison of deriveAsBuiltComparison(wall)) {
    if (comparison.status === 'within_tolerance') continue;
    issues.push(
      issue(
        'WALL.AS_BUILT_OUT_OF_TOLERANCE',
        'warning',
        `${comparison.label} differs by ${comparison.deviation.toFixed(1)} mm (tolerance ±${comparison.tolerance} mm).`,
        { type: 'as_built_measurement', id: comparison.id },
        comparison,
      ),
    );
  }
  return issues;
}

export function validateProjectWallDetails(project) {
  return (project?.floors || []).flatMap((floor) =>
    (floor.walls || []).flatMap((wall) =>
      validateWallDetail(wall, floor).map((entry) => ({
        ...entry,
        category: 'wall_detail_coordination',
        entityRefs: [
          { type: 'wall', id: wall.id },
          ...(entry.entity && entry.entity.type !== 'wall' ? [entry.entity] : []),
        ],
        evidence: {
          resultKind: 'configured_rule_check',
          confidence: 'checked',
          inputs: entry.evidence || {},
        },
      })),
    ),
  );
}

function memberLinearLength(member) {
  return member.orientation === 'vertical' ? member.v1 - member.v0 : member.u1 - member.u0;
}

function panelJointLength(panel, length, height) {
  const points = panel.outlinePoints || rectOutline(panel);
  const total = points.reduce((sum, start, index) => {
    const end = points[(index + 1) % points.length];
    const onWallBoundary =
      (Math.abs(start.u) <= EPSILON && Math.abs(end.u) <= EPSILON) ||
      (Math.abs(start.u - length) <= EPSILON && Math.abs(end.u - length) <= EPSILON) ||
      (Math.abs(start.v) <= EPSILON && Math.abs(end.v) <= EPSILON) ||
      (Math.abs(start.v - height) <= EPSILON && Math.abs(end.v - height) <= EPSILON);
    return onWallBoundary ? sum : sum + Math.hypot(end.u - start.u, end.v - start.v);
  }, 0);
  return total / 2;
}

export function deriveWallDetailTakeoff(wall, floor) {
  const detailing = resolveWallDetailing(wall);
  const { length, height } = resolveWallDetailFrame(wall, floor);
  const sideResults = {};
  for (const side of Object.values(WALL_DETAIL_SIDES)) {
    const panels = deriveWallPanels(wall, floor, side);
    const fasteners = deriveWallFasteners(wall, floor, side);
    sideResults[side] = {
      enabled: detailing.sides[side].enabled,
      productProfileId: detailing.sides[side].productProfileId,
      panelCount: panels.length,
      stockSheetCount: panels.length,
      installedAreaMm2: panels.reduce((total, panel) => total + panel.netArea, 0),
      grossCutAreaMm2: panels.reduce((total, panel) => total + panel.grossArea, 0),
      fastenerCount: fasteners.length,
      jointLengthMm: panels.reduce((total, panel) => total + panelJointLength(panel, length, height), 0),
    };
  }
  const members = deriveWallFramingMembers(wall, floor);
  const asBuilt = deriveAsBuiltComparison(wall);
  return {
    enabled: detailing.enabled,
    sides: sideResults,
    panelCount: Object.values(sideResults).reduce((total, result) => total + result.panelCount, 0),
    stockSheetCount: Object.values(sideResults).reduce((total, result) => total + result.stockSheetCount, 0),
    installedAreaMm2: Object.values(sideResults).reduce((total, result) => total + result.installedAreaMm2, 0),
    fastenerCount: Object.values(sideResults).reduce((total, result) => total + result.fastenerCount, 0),
    jointLengthMm: Object.values(sideResults).reduce((total, result) => total + result.jointLengthMm, 0),
    framingMemberCount: members.length,
    framingLinearLengthMm: members.reduce((total, member) => total + memberLinearLength(member), 0),
    asBuiltMeasurementCount: asBuilt.length,
    asBuiltOutOfToleranceCount: asBuilt.filter((measurement) => measurement.status === 'out_of_tolerance').length,
  };
}

export function deriveWallDetail(wall, floor) {
  const detailing = resolveWallDetailing(wall);
  const frame = resolveWallDetailFrame(wall, floor);
  return {
    wallId: wall.id,
    length: frame.length,
    height: frame.height,
    // What the editor's V axis means: where the finished floor sits inside the
    // drawn elevation, and the deck bands the plane runs past on the way up.
    datumV: frame.datumV,
    framingMode: frame.mode,
    slabBands: frame.slabBands,
    // How far each face's board runs, so the editor can draw past the wall end
    // and still mark where the wall itself stops.
    boardSpans: {
      interior: resolveWallBoardSpan(wall, floor, WALL_DETAIL_SIDES.INTERIOR),
      exterior: resolveWallBoardSpan(wall, floor, WALL_DETAIL_SIDES.EXTERIOR),
    },
    configuration: detailing,
    openings: deriveWallDetailOpenings(wall, floor),
    panels: {
      interior: deriveWallPanels(wall, floor, WALL_DETAIL_SIDES.INTERIOR),
      exterior: deriveWallPanels(wall, floor, WALL_DETAIL_SIDES.EXTERIOR),
    },
    framing: deriveWallFramingMembers(wall, floor),
    fasteners: {
      interior: deriveWallFasteners(wall, floor, WALL_DETAIL_SIDES.INTERIOR),
      exterior: deriveWallFasteners(wall, floor, WALL_DETAIL_SIDES.EXTERIOR),
    },
    dimensions: {
      interior: deriveWallDimensions(wall, floor, WALL_DETAIL_SIDES.INTERIOR),
      exterior: deriveWallDimensions(wall, floor, WALL_DETAIL_SIDES.EXTERIOR),
    },
    validationIssues: validateWallDetail(wall, floor),
    asBuilt: deriveAsBuiltComparison(wall),
    takeoff: deriveWallDetailTakeoff(wall, floor),
  };
}
