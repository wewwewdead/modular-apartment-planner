import { createWallAssembly, wallAssemblyThickness } from '@/domain/wallAssemblies';
import {
  TRUSS_END_CLOSURE_PRESET_LABELS,
  TRUSS_END_CLOSURE_SIDES,
  normalizeTrussEndClosures,
} from '@/domain/trussModels';
import { buildRoofPlaneGeometry } from '@/geometry/roofPlaneGeometry';
import { buildTrussSystemGeometry } from '@/geometry/trussGeometry';
import { distanceToSegment } from '@/geometry/line';
import { add, distance, dot, normalize, perpendicular, scale, subtract } from '@/geometry/point';
import { pointInPolygon, polygonArea } from '@/geometry/polygon';
import { projectPointOntoAxis, resolveSystemPlanAxes } from './systemPlanAxes';

/**
 * Gable-end closures (docs/roof-truss-industrial.md §6.1, RT-2).
 *
 * The open triangle between the top of an end wall and the two roof slopes is
 * closed by a panel on the plane of the end truss — the gable end frame,
 * sheathed and clad. This module is the single source for that panel: the 3D
 * descriptors, the elevation and section cuts, the plan footprint, the
 * quantities and the panel readouts all read `buildEndClosureLayout`.
 *
 * Frame of a closure: local x runs along the panel from its first bearing
 * point, local z up from `trussSystem.baseElevation` (the bearing surface).
 * The bottom edge is z = 0 between the bearing points; the top edge follows the
 * attached roof body's UNDERSIDE when this system carries the roof (sampled at
 * every structural top node and at most every 150 mm between), else the truss
 * profile's `roofOutline` (RT-3 makes that the chord top face).
 *
 * Sides: `start` / `end` are the first and last truss copy along the layout
 * axis (End A / End B); `spanStart` / `spanEnd` are strips along the two
 * bearing lines, drawn only where the profile stands tall there — a shed's high
 * side, a flat truss's depth. Hip-shaped copies get nothing: their end slices
 * are flat and the hip planes close them. A closure under 50 mm tall
 * everywhere is dropped.
 */

const EPSILON = 1e-6;
export const END_CLOSURE_MIN_HEIGHT = 50;
export const END_CLOSURE_SAMPLE_STEP = 150;
export const END_CLOSURE_VENT_DEPTH = 50;
const VENT_ROUND_SEGMENTS = 24;
// A vent closer than this to the panel's edge is not built (it would cut the
// panel in two at the eave or poke through the rake).
const VENT_EDGE_CLEARANCE = 20;
// Collinear top-edge samples closer than this to the chord are merged.
const SIMPLIFY_TOLERANCE = 0.5;
const TOP_NODE_KINDS = new Set(['top_chord', 'ridge', 'high_point']);

export const END_CLOSURE_SIDE_LABELS = Object.freeze({
  start: 'End A',
  end: 'End B',
  spanStart: 'Side A',
  spanEnd: 'Side B',
});

/** Panel thickness of a closure: the wall assembly preset's own build-up. */
export function endClosureThickness(assemblyPreset) {
  return wallAssemblyThickness(createWallAssembly(assemblyPreset));
}

function isHipInstance(instanceGeometry) {
  const shape = instanceGeometry?.trussType?.shape || instanceGeometry?.metrics?.shape;
  return shape === 'hip';
}

/** The roof this system carries, or null. Only an attached roof shapes a closure's top edge. */
function attachedRoof(trussSystem, roofSystem) {
  if (!roofSystem || !trussSystem?.id || roofSystem.trussAttachmentId !== trussSystem.id) return null;
  if ((roofSystem.boundaryPolygon || []).length < 3) return null;
  return roofSystem;
}

function sampleOutlineZ(outline = [], x = 0) {
  const ordered = outline
    .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.z))
    .sort((a, b) => a.x - b.x);
  if (!ordered.length) return 0;
  if (x <= ordered[0].x) return ordered[0].z;
  if (x >= ordered[ordered.length - 1].x) return ordered[ordered.length - 1].z;
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const a = ordered[index];
    const b = ordered[index + 1];
    if (x < a.x - EPSILON || x > b.x + EPSILON) continue;
    const run = b.x - a.x;
    if (Math.abs(run) <= EPSILON) return Math.max(a.z, b.z);
    return a.z + ((b.z - a.z) * (x - a.x)) / run;
  }
  return ordered[ordered.length - 1].z;
}

/** Every key position, plus even subdivisions no longer than `step` between consecutive keys. */
function sampleRange(keys, from, to, step = END_CLOSURE_SAMPLE_STEP) {
  const sorted = [...new Set([from, to, ...keys.filter((x) => x > from + EPSILON && x < to - EPSILON)])].sort(
    (a, b) => a - b,
  );
  const values = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const a = sorted[index];
    values.push(a);
    const b = sorted[index + 1];
    if (b === undefined) break;
    const parts = Math.ceil((b - a) / step - EPSILON);
    for (let part = 1; part < parts; part += 1) {
      values.push(a + ((b - a) * part) / parts);
    }
  }
  return values.filter((x, index) => index === 0 || x - values[index - 1] > EPSILON);
}

/** Drop interior points that sit on the chord of their neighbours. */
function simplifyProfile(points) {
  if (points.length <= 2) return points;
  const result = [points[0]];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = result[result.length - 1];
    const point = points[index];
    const next = points[index + 1];
    const run = next.x - previous.x;
    const expected =
      Math.abs(run) <= EPSILON ? previous.z : previous.z + ((next.z - previous.z) * (point.x - previous.x)) / run;
    if (Math.abs(point.z - expected) > SIMPLIFY_TOLERANCE) result.push(point);
  }
  result.push(points[points.length - 1]);
  return result;
}

function toPlanXY(points) {
  return points.map((point) => ({ x: point.x, y: point.z }));
}

/** Closed panel outline from its top profile: bottom edge on z = 0, then the top edge back. */
function closurePolygon(topProfile) {
  const length = topProfile[topProfile.length - 1].x;
  const top = [...topProfile].reverse();
  const points = [
    { x: 0, z: 0 },
    { x: length, z: 0 },
  ];
  top.forEach((point, index) => {
    const atEnd = index === 0 || index === top.length - 1;
    if (atEnd && point.z <= EPSILON) return;
    points.push(point);
  });
  return points;
}

function ventOutline(vent, centreX) {
  const halfWidth = vent.width / 2;
  const sill = vent.sillOffset;
  if (vent.shape === 'round') {
    const radiusZ = vent.height / 2;
    return Array.from({ length: VENT_ROUND_SEGMENTS }, (_, index) => {
      const angle = (index / VENT_ROUND_SEGMENTS) * Math.PI * 2;
      return { x: centreX + halfWidth * Math.cos(angle), z: sill + radiusZ + radiusZ * Math.sin(angle) };
    });
  }
  if (vent.shape === 'triangle') {
    return [
      { x: centreX - halfWidth, z: sill },
      { x: centreX + halfWidth, z: sill },
      { x: centreX, z: sill + vent.height },
    ];
  }
  return [
    { x: centreX - halfWidth, z: sill },
    { x: centreX + halfWidth, z: sill },
    { x: centreX + halfWidth, z: sill + vent.height },
    { x: centreX - halfWidth, z: sill + vent.height },
  ];
}

function ventFits(hole, polygon) {
  const ring = toPlanXY(polygon);
  return toPlanXY(hole).every(
    (point) =>
      pointInPolygon(point, ring) &&
      ring.every((a, index) => distanceToSegment(point, a, ring[(index + 1) % ring.length]) >= VENT_EDGE_CLEARANCE),
  );
}

/**
 * One closure from its frame and top profile. `frame` = `{origin, xAxis,
 * length, inward}` in plan; `topProfile` = `[{x, z}]` with x from 0 to length.
 */
function createClosure({ trussSystem, side, settings, frame, topProfile, kind, copyId, instanceId }) {
  const heights = topProfile.map((point) => point.z);
  const maxHeight = Math.max(0, ...heights);
  if (maxHeight < END_CLOSURE_MIN_HEIGHT || frame.length < END_CLOSURE_MIN_HEIGHT) return null;

  const profile = simplifyProfile(topProfile.map((point) => ({ x: point.x, z: Math.max(0, point.z) })));
  const points = closurePolygon(profile);
  const grossAreaMm2 = polygonArea(toPlanXY(points));
  const thickness = endClosureThickness(settings.assemblyPreset);

  let vent = null;
  if (settings.vent.enabled) {
    const outline = ventOutline(settings.vent, frame.length / 2);
    const fits = ventFits(outline, points);
    vent = {
      ...settings.vent,
      outline,
      fits,
      centreX: frame.length / 2,
      areaMm2: fits ? polygonArea(toPlanXY(outline)) : 0,
    };
  }
  const ventAreaMm2 = vent?.areaMm2 || 0;

  return {
    id: `${trussSystem.id}-closure-${side}`,
    side,
    kind,
    mode: settings.mode,
    assemblyPreset: settings.assemblyPreset,
    thickness,
    copyId,
    instanceId,
    origin: { x: frame.origin.x, y: frame.origin.y },
    xAxis: frame.xAxis,
    normal: perpendicular(frame.xAxis),
    inward: frame.inward,
    length: frame.length,
    baseElevation: Number(trussSystem.baseElevation) || 0,
    topProfile: profile,
    maxHeight,
    points,
    holes: vent?.fits ? [vent.outline] : [],
    vent,
    grossAreaMm2,
    ventAreaMm2,
    areaMm2: Math.max(0, grossAreaMm2 - ventAreaMm2),
  };
}

function copyFrame(copy, instanceGeometry) {
  const span = Math.max(Number(instanceGeometry?.metrics?.span) || 0, EPSILON);
  const length = distance(copy.structuralStartPoint, copy.structuralEndPoint);
  const xAxis = normalize(subtract(copy.structuralEndPoint, copy.structuralStartPoint));
  const planScale = length / span;
  return {
    span,
    length,
    xAxis,
    planScale,
    planAt: (profileX) => add(copy.structuralStartPoint, scale(xAxis, profileX * planScale)),
  };
}

function collectEndCopies(systemGeometry, planAxes) {
  let start = null;
  let end = null;
  for (const instanceGeometry of systemGeometry?.instances || []) {
    for (const copy of instanceGeometry.copies || []) {
      const value = projectPointOntoAxis(copy.origin, planAxes.origin, planAxes.layoutAxis);
      if (!start || value < start.value - EPSILON) start = { copy, instanceGeometry, value };
      if (!end || value > end.value + EPSILON) end = { copy, instanceGeometry, value };
    }
  }
  return { start, end };
}

/**
 * Where the closures of a truss system are, which sides the geometry can
 * close at all, and how big they are. Pure in the truss system, its built
 * geometry and the roof it carries.
 *
 * Returns `{attached, sides: {start|end|spanStart|spanEnd: {available, label,
 * mode, closure}}, closures: [infill closures], totalAreaM2}`. `closure` is
 * there for every available side whatever its mode, so a panel can show what an
 * 'open' side would close; `closures` holds only the ones that are built.
 */
export function buildEndClosureLayout(trussSystem, systemGeometry = null, roofSystem = null) {
  const settings = normalizeTrussEndClosures(trussSystem?.endClosures);
  const sides = Object.fromEntries(
    TRUSS_END_CLOSURE_SIDES.map((side) => [
      side,
      { available: false, label: END_CLOSURE_SIDE_LABELS[side], mode: settings[side].mode, closure: null },
    ]),
  );
  const empty = { attached: false, sides, closures: [], totalAreaM2: 0, settings };
  if (!trussSystem || !(trussSystem.trussInstances || []).length) return empty;

  const geometry = systemGeometry || buildTrussSystemGeometry(trussSystem);
  const planAxes = resolveSystemPlanAxes(geometry);
  if (!planAxes) return empty;

  const roof = attachedRoof(trussSystem, roofSystem);
  const roofGeometry = roof ? buildRoofPlaneGeometry(roof) : null;
  const baseElevation = Number(trussSystem.baseElevation) || 0;
  const roofUnderside = roofGeometry
    ? (planPoint) => roofGeometry.getSurfaceElevation(planPoint, 'bottom') - baseElevation
    : null;

  const { start, end } = collectEndCopies(geometry, planAxes);
  const endEntries = [
    ['start', start, planAxes.layoutAxis],
    // A single copy is both ends of its own run; one panel closes it.
    ['end', end && end.copy !== start?.copy ? end : null, scale(planAxes.layoutAxis, -1)],
  ];

  for (const [side, entry, inward] of endEntries) {
    if (!entry || isHipInstance(entry.instanceGeometry)) continue;
    const { copy, instanceGeometry } = entry;
    const frame = copyFrame(copy, instanceGeometry);
    const roofOutline = instanceGeometry.roofOutline || [];
    const topNodeXs = (instanceGeometry.nodes || [])
      .filter((node) => TOP_NODE_KINDS.has(node.kind))
      .map((node) => node.x);
    const outlineXs = roofOutline.map((point) => point.x);
    const xs = sampleRange([...topNodeXs, ...outlineXs], 0, frame.span);
    const topProfile = xs.map((profileX) => ({
      x: profileX * frame.planScale,
      z: roofUnderside ? roofUnderside(frame.planAt(profileX)) : sampleOutlineZ(roofOutline, profileX),
    }));
    const closure = createClosure({
      trussSystem,
      side,
      settings: settings[side],
      frame: { origin: copy.structuralStartPoint, xAxis: frame.xAxis, length: frame.length, inward },
      topProfile,
      kind: 'gable',
      copyId: copy.id,
      instanceId: instanceGeometry.instance?.id || null,
    });
    if (closure) sides[side] = { ...sides[side], available: true, closure };
  }

  // The side strips run along a bearing line from the first copy to the last.
  // Whether a side is tall is the PROFILE's call (a gable eave is not, even
  // under a roof whose underside sits a little above the heel); how tall it is
  // follows the roof underside when there is one.
  if (
    start &&
    end &&
    start.copy !== end.copy &&
    !isHipInstance(start.instanceGeometry) &&
    !isHipInstance(end.instanceGeometry)
  ) {
    const startFrame = copyFrame(start.copy, start.instanceGeometry);
    const endFrame = copyFrame(end.copy, end.instanceGeometry);
    const roofOutline = start.instanceGeometry.roofOutline || [];
    const metrics = start.instanceGeometry.metrics || {};
    const heelBase = (Number(metrics.bottomChordDepth) || 0) + (Number(metrics.raisedHeel) || 0);
    const underside = start.instanceGeometry.undersideOutline?.length
      ? start.instanceGeometry.undersideOutline
      : roofOutline;
    for (const [side, profileXAt] of [
      ['spanStart', () => 0],
      ['spanEnd', (frame) => frame.span],
    ]) {
      // RT-3: every heel now stands bc + tc / cos θ tall, so "tall" is measured
      // on the profile LINE (the top-chord underside above the heel base): a
      // gable eave is 0, a shed's high side is its rise, a flat truss its depth.
      const lineHeight = sampleOutlineZ(underside, profileXAt(startFrame)) - heelBase;
      if (lineHeight < END_CLOSURE_MIN_HEIGHT) continue;
      const profileHeight = sampleOutlineZ(roofOutline, profileXAt(startFrame));
      const a = startFrame.planAt(profileXAt(startFrame));
      const b = endFrame.planAt(profileXAt(endFrame));
      const length = distance(a, b);
      if (length < END_CLOSURE_MIN_HEIGHT) continue;
      const xAxis = normalize(subtract(b, a));
      const inward = side === 'spanStart' ? startFrame.xAxis : scale(startFrame.xAxis, -1);
      const xs = sampleRange([], 0, length);
      const topProfile = xs.map((x) => ({
        x,
        z: roofUnderside ? roofUnderside(add(a, scale(xAxis, x))) : profileHeight,
      }));
      const closure = createClosure({
        trussSystem,
        side,
        settings: settings[side],
        frame: { origin: a, xAxis, length, inward },
        topProfile,
        kind: 'strip',
        copyId: null,
        instanceId: null,
      });
      if (closure) sides[side] = { ...sides[side], available: true, closure };
    }
  }

  // A shed's tall side is its high side; a flat truss is equally tall on both.
  const spanStart = sides.spanStart.closure;
  const spanEnd = sides.spanEnd.closure;
  if (spanStart && spanEnd && Math.abs(spanStart.maxHeight - spanEnd.maxHeight) > 1) {
    const startHigher = spanStart.maxHeight > spanEnd.maxHeight;
    sides.spanStart.label = startHigher ? 'High side' : 'Low side';
    sides.spanEnd.label = startHigher ? 'Low side' : 'High side';
  } else if (spanStart && !spanEnd) {
    sides.spanStart.label = 'High side';
  } else if (spanEnd && !spanStart) {
    sides.spanEnd.label = 'High side';
  }

  const closures = TRUSS_END_CLOSURE_SIDES.map((side) => sides[side])
    .filter((entry) => entry.available && entry.mode === 'infill')
    .map((entry) => entry.closure);

  return {
    attached: Boolean(roofGeometry),
    sides,
    closures,
    totalAreaM2: closures.reduce((sum, closure) => sum + closure.areaMm2, 0) / 1_000_000,
    settings,
  };
}

/** Plan point at local x along the closure, `offset` along its left normal. */
export function closurePlanPoint(closure, localX, offset = 0) {
  return add(add(closure.origin, scale(closure.xAxis, localX)), scale(closure.normal, offset));
}

/** Height of the closure's top edge above its bearing at local x. */
export function closureTopAt(closure, localX) {
  return sampleOutlineZ(closure.topProfile, localX);
}

/** Local x of a plan point projected onto the closure's line. */
export function closureLocalX(closure, planPoint) {
  return dot(subtract(planPoint, closure.origin), closure.xAxis);
}

/** The closure's plan footprint: its line, `thickness` wide, centred. */
export function closureFootprint(closure) {
  const half = closure.thickness / 2;
  return [
    closurePlanPoint(closure, 0, -half),
    closurePlanPoint(closure, closure.length, -half),
    closurePlanPoint(closure, closure.length, half),
    closurePlanPoint(closure, 0, half),
  ];
}

function closureBounds(closure) {
  const footprint = closureFootprint(closure);
  return {
    minX: Math.min(...footprint.map((point) => point.x)),
    maxX: Math.max(...footprint.map((point) => point.x)),
    minY: Math.min(...footprint.map((point) => point.y)),
    maxY: Math.max(...footprint.map((point) => point.y)),
    minElevation: closure.baseElevation,
    maxElevation: closure.baseElevation + closure.maxHeight,
  };
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

/**
 * The 3D preview descriptors: one `verticalPolygon` panel per built closure
 * and, behind a vent, a recessed dark box. Phase filtering needs nothing here:
 * the closures belong to the truss system and come and go with it.
 */
export function buildEndClosureObjects(trussSystem, systemGeometry = null, roofSystem = null) {
  const layout = buildEndClosureLayout(trussSystem, systemGeometry, roofSystem);
  const descriptors = [];
  for (const closure of layout.closures) {
    const metadata = {
      sourceId: trussSystem.id,
      trussSystemId: trussSystem.id,
      floorId: trussSystem.floorId || null,
      part: 'endClosure',
      side: closure.side,
      assemblyPreset: closure.assemblyPreset,
    };
    descriptors.push({
      id: closure.id,
      kind: 'trussSystem',
      geometry: 'verticalPolygon',
      plane: {
        origin: { x: round(closure.origin.x), y: round(closure.origin.y), elevation: closure.baseElevation },
        xAxis: { x: closure.xAxis.x, y: closure.xAxis.y },
        up: { x: 0, y: 1, z: 0 },
      },
      points: closure.points.map((point) => ({ x: round(point.x), z: round(point.z) })),
      holes: closure.holes.map((hole) => hole.map((point) => ({ x: round(point.x), z: round(point.z) }))),
      thickness: closure.thickness,
      materialKey: 'gableInfill',
      metadata,
      bounds: closureBounds(closure),
    });

    if (closure.vent?.fits) {
      const { vent } = closure;
      const centre = add(
        closurePlanPoint(closure, vent.centreX),
        scale(closure.inward, closure.thickness / 2 + END_CLOSURE_VENT_DEPTH / 2),
      );
      descriptors.push({
        id: `${closure.id}-vent`,
        kind: 'trussSystem',
        geometry: 'box',
        center: { x: round(centre.x), y: round(centre.y) },
        baseElevation: closure.baseElevation + vent.sillOffset,
        size: { x: vent.width, y: vent.height, z: END_CLOSURE_VENT_DEPTH },
        rotation: Math.atan2(closure.xAxis.y, closure.xAxis.x),
        materialKey: 'fixtureAccentDark',
        metadata: { ...metadata, part: 'endClosureVent' },
        bounds: {
          minX: centre.x - vent.width / 2,
          maxX: centre.x + vent.width / 2,
          minY: centre.y - vent.width / 2,
          maxY: centre.y + vent.width / 2,
          minElevation: closure.baseElevation + vent.sillOffset,
          maxElevation: closure.baseElevation + vent.sillOffset + vent.height,
        },
      });
    }
  }
  return descriptors;
}

/** "Infill · fibre cement" / "Open" / "—" for one side. */
export function describeEndClosureSide(entry, settings) {
  if (!entry?.available) return '—';
  if (entry.mode !== 'infill') return 'Open';
  return `Infill · ${TRUSS_END_CLOSURE_PRESET_LABELS[settings.assemblyPreset] || settings.assemblyPreset}`;
}

/**
 * The inspect card's one-line summary: "End A: Infill · fibre cement · End B:
 * Infill · fibre cement", plus the side strips where the geometry draws them.
 * A hip end, which the hip planes close, reads "—".
 */
export function describeEndClosures(layout) {
  if (!layout) return '—';
  return TRUSS_END_CLOSURE_SIDES.filter((side) => side === 'start' || side === 'end' || layout.sides[side].available)
    .map((side) => `${layout.sides[side].label}: ${describeEndClosureSide(layout.sides[side], layout.settings[side])}`)
    .join(' · ');
}
