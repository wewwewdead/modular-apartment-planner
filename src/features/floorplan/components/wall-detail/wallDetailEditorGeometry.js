import { WALL_DIMENSION_MODES, createCustomFramingMember } from '@/domain/wallDetailing';
import { polygonArea } from '@/geometry/polygon';

const MIN_ELEMENT_SIZE = 10;

/** Millimetres of slop below which two edges count as landing on each other. */
const CONTACT_TOLERANCE = 0.05;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function unique(values, tolerance = 0.5) {
  return [...values]
    .sort((a, b) => a - b)
    .filter((value, index, entries) => index === 0 || Math.abs(value - entries[index - 1]) > tolerance);
}

function nearestWithin(value, candidates, threshold) {
  let nearest = value;
  let distance = threshold + 1;
  for (const candidate of candidates) {
    const nextDistance = Math.abs(candidate - value);
    if (nextDistance <= threshold && nextDistance < distance) {
      nearest = candidate;
      distance = nextDistance;
    }
  }
  return nearest;
}

function nearestMatchWithin(value, candidates, threshold) {
  let match = null;
  let distance = threshold + 1;
  for (const candidate of candidates) {
    const nextDistance = Math.abs(candidate - value);
    if (nextDistance <= threshold && nextDistance < distance) {
      match = candidate;
      distance = nextDistance;
    }
  }
  return match;
}

export function zoomWallViewport(viewport, requestedZoom, focal = { u: 0, v: 0 }) {
  const currentZoom = Math.max(0.001, Number(viewport?.zoom) || 1);
  const zoom = clamp(Number(requestedZoom) || 1, 0.35, 5);
  const panU = Number(viewport?.panU) || 0;
  const panV = Number(viewport?.panV) || 0;
  const ratio = zoom / currentZoom;
  return {
    zoom,
    panU: focal.u - (focal.u - panU) * ratio,
    panV: focal.v - (focal.v - panV) * ratio,
  };
}

export function panWallViewport(viewport, delta) {
  return {
    ...viewport,
    panU: (Number(viewport?.panU) || 0) + (Number(delta?.u) || 0),
    panV: (Number(viewport?.panV) || 0) + (Number(delta?.v) || 0),
  };
}

export function screenPointToWallLocal(event, rect, bounds) {
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  return {
    u: clamp(((event.clientX - rect.left) / width) * bounds.length, 0, bounds.length),
    v: clamp(bounds.height - ((event.clientY - rect.top) / height) * bounds.height, 0, bounds.height),
  };
}

export function collectWallSnapCandidates({
  panels = [],
  members = [],
  openings = [],
  length,
  height,
  revealGap = null,
}) {
  const gapAware = revealGap != null;
  const gapU = Math.max(0, Number(revealGap?.u) || 0);
  const gapV = Math.max(0, Number(revealGap?.v) || 0);
  const panelU = panels.flatMap((panel) => {
    const values = [panel.u0, panel.u1, ...(panel.outlinePoints || []).map((point) => point.u)];
    return gapAware ? [panel.u0 - gapU, panel.u1 + gapU] : values;
  });
  const panelV = panels.flatMap((panel) => {
    const values = [panel.v0, panel.v1, ...(panel.outlinePoints || []).map((point) => point.v)];
    return gapAware ? [panel.v0 - gapV, panel.v1 + gapV] : values;
  });
  return {
    preferredU: gapAware ? unique(panelU.filter((value) => value >= 0 && value <= length)) : [],
    preferredV: gapAware ? unique(panelV.filter((value) => value >= 0 && value <= height)) : [],
    u: unique([
      0,
      length,
      ...panelU.filter((value) => value >= 0 && value <= length),
      ...members.flatMap((member) => [member.u0, (member.u0 + member.u1) / 2, member.u1]),
      ...openings.flatMap((opening) => [opening.u0, opening.u1]),
    ]),
    v: unique([
      0,
      height,
      ...panelV.filter((value) => value >= 0 && value <= height),
      ...members.flatMap((member) => [member.v0, (member.v0 + member.v1) / 2, member.v1]),
      ...openings.flatMap((opening) => [opening.v0, opening.v1]),
    ]),
  };
}

export function snapWallLocalPoint(point, candidates, options = {}) {
  if (options.enabled === false) return point;
  const step = Math.max(1, Number(options.step) || 50);
  const threshold = Math.max(0, Number(options.threshold) || step * 0.24);
  const gridU = Math.round(point.u / step) * step;
  const gridV = Math.round(point.v / step) * step;
  const candidateU =
    nearestMatchWithin(point.u, candidates.preferredU || [], threshold) ??
    nearestMatchWithin(point.u, candidates.u, threshold);
  const candidateV =
    nearestMatchWithin(point.v, candidates.preferredV || [], threshold) ??
    nearestMatchWithin(point.v, candidates.v, threshold);
  return {
    u: candidateU ?? nearestWithin(point.u, [gridU], threshold),
    v: candidateV ?? nearestWithin(point.v, [gridV], threshold),
  };
}

function rectSnapTargets(entityType, entityId, rect) {
  const centerU = (rect.u0 + rect.u1) / 2;
  const centerV = (rect.v0 + rect.v1) / 2;
  const points = [
    ['bottom_left', rect.u0, rect.v0],
    ['bottom_center', centerU, rect.v0],
    ['bottom_right', rect.u1, rect.v0],
    ['center_left', rect.u0, centerV],
    ['center', centerU, centerV],
    ['center_right', rect.u1, centerV],
    ['top_left', rect.u0, rect.v1],
    ['top_center', centerU, rect.v1],
    ['top_right', rect.u1, rect.v1],
  ].map(([anchor, u, v]) => ({
    kind: 'point',
    u,
    v,
    reference: { entityType, entityId, anchor },
  }));
  const segments = [
    ['edge_left', { u: rect.u0, v: rect.v0 }, { u: rect.u0, v: rect.v1 }],
    ['edge_right', { u: rect.u1, v: rect.v0 }, { u: rect.u1, v: rect.v1 }],
    ['edge_bottom', { u: rect.u0, v: rect.v0 }, { u: rect.u1, v: rect.v0 }],
    ['edge_top', { u: rect.u0, v: rect.v1 }, { u: rect.u1, v: rect.v1 }],
  ].map(([anchor, start, end]) => ({
    kind: 'segment',
    start,
    end,
    reference: { entityType, entityId, anchor },
  }));
  return [...points, ...segments];
}

function polygonSnapTargets(entityType, entityId, points) {
  return points.flatMap((point, index) => {
    const end = points[(index + 1) % points.length];
    return [
      {
        kind: 'point',
        ...point,
        reference: { entityType, entityId, anchor: `vertex_${index}` },
      },
      {
        kind: 'segment',
        start: point,
        end,
        reference: { entityType, entityId, anchor: `outline_edge_${index}` },
      },
    ];
  });
}

export function collectWallDimensionSnapTargets({
  wallId,
  panels = [],
  members = [],
  openings = [],
  fasteners = [],
  length,
  height,
}) {
  return [
    ...rectSnapTargets('wall', wallId, { u0: 0, u1: length, v0: 0, v1: height }),
    ...panels.flatMap((panel) =>
      panel.outlinePoints?.length
        ? polygonSnapTargets('panel', panel.localId || panel.id, panel.outlinePoints)
        : rectSnapTargets('panel', panel.localId || panel.id, panel),
    ),
    ...members
      .filter((member) => member.frameIndex === 0)
      .flatMap((member) => {
        const centerU = (member.u0 + member.u1) / 2;
        const centerV = (member.v0 + member.v1) / 2;
        return [
          ...rectSnapTargets('framing', member.id, member),
          {
            kind: 'segment',
            start: member.orientation === 'vertical' ? { u: centerU, v: member.v0 } : { u: member.u0, v: centerV },
            end: member.orientation === 'vertical' ? { u: centerU, v: member.v1 } : { u: member.u1, v: centerV },
            reference: { entityType: 'framing', entityId: member.id, anchor: 'axis_center' },
          },
        ];
      }),
    ...openings.flatMap((opening) => rectSnapTargets('opening', opening.id, opening)),
    ...fasteners.map((fastener) => ({
      kind: 'point',
      u: fastener.u,
      v: fastener.v,
      reference: { entityType: 'fastener', entityId: fastener.id, anchor: 'center' },
    })),
  ];
}

export function deriveWallDimensionGuideSegment(dimension) {
  const start = {
    u: Number(dimension?.start?.u) || 0,
    v: Number(dimension?.start?.v) || 0,
  };
  const end = {
    u: Number(dimension?.end?.u) || 0,
    v: Number(dimension?.end?.v) || 0,
  };
  if (dimension?.mode === WALL_DIMENSION_MODES.HORIZONTAL) {
    return { start, end: { u: end.u, v: start.v } };
  }
  if (dimension?.mode === WALL_DIMENSION_MODES.VERTICAL) {
    return { start, end: { u: start.u, v: end.v } };
  }
  return { start, end };
}

function segmentIntersection(first, second, tolerance = 0.000001) {
  const firstDelta = {
    u: first.end.u - first.start.u,
    v: first.end.v - first.start.v,
  };
  const secondDelta = {
    u: second.end.u - second.start.u,
    v: second.end.v - second.start.v,
  };
  const cross = firstDelta.u * secondDelta.v - firstDelta.v * secondDelta.u;
  if (Math.abs(cross) <= tolerance) return null;
  const between = {
    u: second.start.u - first.start.u,
    v: second.start.v - first.start.v,
  };
  const firstT = (between.u * secondDelta.v - between.v * secondDelta.u) / cross;
  const secondT = (between.u * firstDelta.v - between.v * firstDelta.u) / cross;
  if (firstT < -tolerance || firstT > 1 + tolerance || secondT < -tolerance || secondT > 1 + tolerance) {
    return null;
  }
  return {
    u: first.start.u + firstDelta.u * firstT,
    v: first.start.v + firstDelta.v * firstT,
  };
}

/**
 * Converts user dimensions into pencil-guide targets for manual screw placement.
 * The measured path remains continuous, while its exact ends and crossings get
 * point priority so a horizontal and vertical set-out can locate one screw.
 */
export function collectWallDimensionGuideTargets(dimensions = []) {
  const guides = dimensions.map((dimension) => ({
    id: dimension.id,
    ...deriveWallDimensionGuideSegment(dimension),
  }));
  const targets = guides.flatMap((guide) => [
    {
      kind: 'segment',
      start: guide.start,
      end: guide.end,
      reference: { entityType: 'measurement', entityId: guide.id, anchor: 'guide_line' },
    },
    {
      kind: 'point',
      ...guide.start,
      reference: { entityType: 'measurement', entityId: guide.id, anchor: 'start' },
    },
    {
      kind: 'point',
      ...guide.end,
      reference: { entityType: 'measurement', entityId: guide.id, anchor: 'end' },
    },
  ]);
  for (let firstIndex = 0; firstIndex < guides.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < guides.length; secondIndex += 1) {
      const point = segmentIntersection(guides[firstIndex], guides[secondIndex]);
      if (!point) continue;
      targets.push({
        kind: 'point',
        ...point,
        reference: {
          entityType: 'measurement',
          entityId: `${guides[firstIndex].id}:${guides[secondIndex].id}`,
          anchor: 'guide_intersection',
        },
      });
    }
  }
  return targets;
}

export function snapWallDimensionEndpoint(point, targets, thresholdOrOptions) {
  const options =
    thresholdOrOptions && typeof thresholdOrOptions === 'object'
      ? thresholdOrOptions
      : { threshold: thresholdOrOptions };
  const threshold = Math.max(0, Number(options.thresholdPixels ?? options.threshold) || 0);
  const scaleU = Math.max(0.000001, Number(options.pixelsPerU) || 1);
  const scaleV = Math.max(0.000001, Number(options.pixelsPerV) || 1);
  const pointThreshold = Math.max(0, Number(options.pointThresholdPixels) || threshold * 0.65);
  const candidates = [];
  for (const target of targets) {
    if (target.kind === 'segment') {
      const deltaU = target.end.u - target.start.u;
      const deltaV = target.end.v - target.start.v;
      const weightedDeltaU = deltaU * scaleU;
      const weightedDeltaV = deltaV * scaleV;
      const lengthSquared = weightedDeltaU * weightedDeltaU + weightedDeltaV * weightedDeltaV;
      const t =
        lengthSquared > 0
          ? Math.max(
              0,
              Math.min(
                1,
                ((point.u - target.start.u) * scaleU * weightedDeltaU +
                  (point.v - target.start.v) * scaleV * weightedDeltaV) /
                  lengthSquared,
              ),
            )
          : 0;
      const projected = { u: target.start.u + deltaU * t, v: target.start.v + deltaV * t };
      const distancePixels = Math.hypot((projected.u - point.u) * scaleU, (projected.v - point.v) * scaleV);
      if (distancePixels <= threshold) {
        candidates.push({ point: projected, reference: { ...target.reference, t }, distancePixels, kind: 'segment' });
      }
      continue;
    }
    const distancePixels = Math.hypot((target.u - point.u) * scaleU, (target.v - point.v) * scaleV);
    if (distancePixels <= threshold) {
      candidates.push({
        point: { u: target.u, v: target.v },
        reference: target.reference,
        distancePixels,
        kind: 'point',
      });
    }
  }
  const nearbyPoint = candidates
    .filter((candidate) => candidate.kind === 'point' && candidate.distancePixels <= pointThreshold)
    .sort((a, b) => a.distancePixels - b.distancePixels)[0];
  const nearest = nearbyPoint || candidates.sort((a, b) => a.distancePixels - b.distancePixels)[0];
  return nearest ? { point: nearest.point, reference: nearest.reference } : null;
}

export function quantizeWallLocalPoint(point, precision = 0.01) {
  const step = Math.max(0.000001, Number(precision) || 0.01);
  const decimals = Math.max(0, Math.min(12, Math.ceil(-Math.log10(step))));
  const quantize = (value) => Number((Math.round((Number(value) || 0) / step) * step).toFixed(decimals));
  return { u: quantize(point?.u), v: quantize(point?.v) };
}

export function createDrawnPanel(start, end, bounds, minimumSize = 25) {
  const u0 = clamp(Math.min(start.u, end.u), 0, bounds.length);
  const u1 = clamp(Math.max(start.u, end.u), 0, bounds.length);
  const v0 = clamp(Math.min(start.v, end.v), 0, bounds.height);
  const v1 = clamp(Math.max(start.v, end.v), 0, bounds.height);
  if (u1 - u0 < minimumSize || v1 - v0 < minimumSize) return null;
  return { u0, u1, v0, v1, u: u0, v: v0, width: u1 - u0, height: v1 - v0 };
}

export function createTracedPanel(points, bounds, minimumArea = 625) {
  const normalized = (points || []).reduce((result, point) => {
    const next = {
      u: clamp(Number(point?.u) || 0, 0, bounds.length),
      v: clamp(Number(point?.v) || 0, 0, bounds.height),
    };
    const previous = result[result.length - 1];
    if (!previous || Math.hypot(next.u - previous.u, next.v - previous.v) > 0.5) result.push(next);
    return result;
  }, []);
  if (
    normalized.length > 2 &&
    Math.hypot(
      normalized[0].u - normalized[normalized.length - 1].u,
      normalized[0].v - normalized[normalized.length - 1].v,
    ) <= 0.5
  ) {
    normalized.pop();
  }
  if (normalized.length < 3 || polygonArea(normalized.map((point) => ({ x: point.u, y: point.v }))) < minimumArea) {
    return null;
  }
  const u0 = Math.min(...normalized.map((point) => point.u));
  const u1 = Math.max(...normalized.map((point) => point.u));
  const v0 = Math.min(...normalized.map((point) => point.v));
  const v1 = Math.max(...normalized.map((point) => point.v));
  return { u0, u1, v0, v1, u: u0, v: v0, width: u1 - u0, height: v1 - v0, outlinePoints: normalized };
}

function resizePanelToBounds(panel, u0, u1, v0, v1, extra = {}) {
  const width = u1 - u0;
  const height = v1 - v0;
  const fitted = { ...panel, ...extra, u0, u1, v0, v1, u: u0, v: v0, width, height };
  if (panel.outlinePoints?.length) {
    const sourceWidth = Math.max(MIN_ELEMENT_SIZE, panel.u1 - panel.u0);
    const sourceHeight = Math.max(MIN_ELEMENT_SIZE, panel.v1 - panel.v0);
    fitted.outlinePoints = panel.outlinePoints.map((point) => ({
      u: u0 + ((point.u - panel.u0) / sourceWidth) * width,
      v: v0 + ((point.v - panel.v0) / sourceHeight) * height,
    }));
  }
  return fitted;
}

function spansOverlap(startA, endA, startB, endB) {
  return Math.min(endA, endB) - Math.max(startA, startB) > 0.5;
}

/**
 * Gives an adjacent panel reveal priority over framing/grid snapping. A panel
 * drawn to the right of an existing panel lands at existing.u1 + gapU; the
 * equivalent role-aware rule is applied on the other three sides.
 */
export function snapPanelToAdjacentReveal(panel, panels, revealGap, bounds, options = {}) {
  if (!panel) return null;
  const threshold = Math.max(1, Number(options.threshold) || 40);
  const gapU = Math.max(0, Number(revealGap?.u) || 0);
  const gapV = Math.max(0, Number(revealGap?.v) || 0);
  const original = { u0: panel.u0, u1: panel.u1, v0: panel.v0, v1: panel.v1 };
  const revealSnaps = [];
  const matches = {};

  const definitions = [
    { key: 'u0', axis: 'u', edge: 'u1', gap: gapU, direction: 1, cross0: 'v0', cross1: 'v1' },
    { key: 'u1', axis: 'u', edge: 'u0', gap: gapU, direction: -1, cross0: 'v0', cross1: 'v1' },
    { key: 'v0', axis: 'v', edge: 'v1', gap: gapV, direction: 1, cross0: 'u0', cross1: 'u1' },
    { key: 'v1', axis: 'v', edge: 'v0', gap: gapV, direction: -1, cross0: 'u0', cross1: 'u1' },
  ];

  for (const definition of definitions) {
    let nearest = null;
    let nearestDistance = threshold + 1;
    for (const existing of panels || []) {
      if (
        !spansOverlap(
          original[definition.cross0],
          original[definition.cross1],
          existing[definition.cross0],
          existing[definition.cross1],
        )
      ) {
        continue;
      }
      const target = existing[definition.edge] + definition.direction * definition.gap;
      const axisLimit = definition.axis === 'u' ? bounds.length : bounds.height;
      const distance = Math.abs(original[definition.key] - target);
      if (target < 0 || target > axisLimit || distance > threshold || distance >= nearestDistance) continue;
      nearest = { existing, target };
      nearestDistance = distance;
    }
    if (!nearest) continue;
    matches[definition.key] = nearest;
  }

  let { u0, u1, v0, v1 } = original;
  if (matches.u0 && matches.u0.target < u1 - MIN_ELEMENT_SIZE) u0 = matches.u0.target;
  if (matches.u1 && matches.u1.target > u0 + MIN_ELEMENT_SIZE) u1 = matches.u1.target;
  if (matches.v0 && matches.v0.target < v1 - MIN_ELEMENT_SIZE) v0 = matches.v0.target;
  if (matches.v1 && matches.v1.target > v0 + MIN_ELEMENT_SIZE) v1 = matches.v1.target;

  const horizontalRevealMatch = matches.u0 || matches.u1;
  const verticalRevealMatch = matches.v0 || matches.v1;
  if (horizontalRevealMatch && !verticalRevealMatch) {
    const existing = horizontalRevealMatch.existing;
    if (Math.abs(v0 - existing.v0) <= threshold) v0 = existing.v0;
    if (Math.abs(v1 - existing.v1) <= threshold) v1 = existing.v1;
  }
  if (verticalRevealMatch && !horizontalRevealMatch) {
    const existing = verticalRevealMatch.existing;
    if (Math.abs(u0 - existing.u0) <= threshold) u0 = existing.u0;
    if (Math.abs(u1 - existing.u1) <= threshold) u1 = existing.u1;
  }

  for (const [key, match] of Object.entries(matches)) {
    const applied = { u0, u1, v0, v1 }[key] === match.target;
    if (!applied) continue;
    const axis = key.startsWith('u') ? 'u' : 'v';
    const gap = axis === 'u' ? gapU : gapV;
    revealSnaps.push({
      axis,
      edge: key,
      gap,
      existingPanelId: match.existing.localId || match.existing.id || null,
      from: match.existing[key === 'u0' ? 'u1' : key === 'u1' ? 'u0' : key === 'v0' ? 'v1' : 'v0'],
      to: match.target,
      start: axis === 'u' ? Math.max(v0, match.existing.v0) : Math.max(u0, match.existing.u0),
      end: axis === 'u' ? Math.min(v1, match.existing.v1) : Math.min(u1, match.existing.u1),
    });
  }

  if (!revealSnaps.length) return panel;
  return resizePanelToBounds(panel, u0, u1, v0, v1, { revealSnaps });
}

function nearestSupportCenter(value, members, orientation, threshold) {
  let result = null;
  let nearestDistance = threshold + 1;
  for (const member of members) {
    if (member.orientation !== orientation || member.frameIndex > 0) continue;
    const center = orientation === 'vertical' ? (member.u0 + member.u1) / 2 : (member.v0 + member.v1) / 2;
    const distance = Math.abs(center - value);
    if (distance <= threshold && distance < nearestDistance) {
      result = center;
      nearestDistance = distance;
    }
  }
  return result;
}

/**
 * Fits the outside edges of a newly drawn panel around framing centerlines.
 * The reveal is centered on the support, leaving equal bearing for the panel
 * on each side: (support width - reveal) / 2.
 */
export function fitPanelToFramingReveal(panel, members, revealGap, bounds, options = {}) {
  if (!panel) return null;
  const threshold = Math.max(1, Number(options.threshold) || 40);
  const gapU = Math.max(0, Number(revealGap?.u) || 0);
  const gapV = Math.max(0, Number(revealGap?.v) || 0);
  const wallTolerance = Math.max(1, Number(options.wallTolerance) || threshold);

  let u0 = panel.u0;
  let u1 = panel.u1;
  let v0 = panel.v0;
  let v1 = panel.v1;

  if (Math.abs(u0) <= wallTolerance) u0 = 0;
  else {
    const center = nearestSupportCenter(u0, members, 'vertical', threshold);
    if (center != null) u0 = center + gapU / 2;
  }
  if (Math.abs(bounds.length - u1) <= wallTolerance) u1 = bounds.length;
  else {
    const center = nearestSupportCenter(u1, members, 'vertical', threshold);
    if (center != null) u1 = center - gapU / 2;
  }
  if (Math.abs(v0) <= wallTolerance) v0 = 0;
  else {
    const center = nearestSupportCenter(v0, members, 'horizontal', threshold);
    if (center != null) v0 = center + gapV / 2;
  }
  if (Math.abs(bounds.height - v1) <= wallTolerance) v1 = bounds.height;
  else {
    const center = nearestSupportCenter(v1, members, 'horizontal', threshold);
    if (center != null) v1 = center - gapV / 2;
  }

  if (u1 - u0 < MIN_ELEMENT_SIZE || v1 - v0 < MIN_ELEMENT_SIZE) return panel;
  return resizePanelToBounds(panel, u0, u1, v0, v1);
}

export function createDrawnFramingMember(tool, start, end, framing, bounds) {
  const thickness = Math.max(MIN_ELEMENT_SIZE, Number(framing?.studWidth) || 50);
  const depth = Math.max(MIN_ELEMENT_SIZE, Number(framing?.studDepth) || 75);
  if (tool === 'draw_stud') {
    const center = clamp(start.u, 0, bounds.length);
    const hasSpan = Math.abs(end.v - start.v) >= MIN_ELEMENT_SIZE;
    return createCustomFramingMember({
      kind: 'stud',
      orientation: 'vertical',
      u0: clamp(center - thickness / 2, 0, bounds.length),
      u1: clamp(center + thickness / 2, 0, bounds.length),
      v0: hasSpan ? Math.min(start.v, end.v) : 0,
      v1: hasSpan ? Math.max(start.v, end.v) : bounds.height,
      depth,
      material: framing?.material || null,
    });
  }
  const center = clamp(start.v, 0, bounds.height);
  const hasSpan = Math.abs(end.u - start.u) >= MIN_ELEMENT_SIZE;
  return createCustomFramingMember({
    kind: 'noggin',
    orientation: 'horizontal',
    u0: hasSpan ? Math.min(start.u, end.u) : 0,
    u1: hasSpan ? Math.max(start.u, end.u) : bounds.length,
    v0: clamp(center - thickness / 2, 0, bounds.height),
    v1: clamp(center + thickness / 2, 0, bounds.height),
    depth,
    material: framing?.material || null,
  });
}

export function movePanelWithinBounds(panel, delta, bounds) {
  const width = panel.u1 - panel.u0;
  const height = panel.v1 - panel.v0;
  const u0 = clamp(panel.u0 + delta.u, 0, Math.max(0, bounds.length - width));
  const v0 = clamp(panel.v0 + delta.v, 0, Math.max(0, bounds.height - height));
  const moved = { ...panel, u0, u1: u0 + width, v0, v1: v0 + height, u: u0, v: v0, width, height };
  if (panel.polygonal && panel.outlinePoints?.length) {
    moved.outlinePoints = panel.outlinePoints.map((point) => ({
      u: point.u + u0 - panel.u0,
      v: point.v + v0 - panel.v0,
    }));
  } else {
    delete moved.outlinePoints;
  }
  return moved;
}

export function moveMemberWithinBounds(member, delta, bounds) {
  const width = member.u1 - member.u0;
  const height = member.v1 - member.v0;
  const u0 = clamp(member.u0 + delta.u, 0, Math.max(0, bounds.length - width));
  const v0 = clamp(member.v0 + delta.v, 0, Math.max(0, bounds.height - height));
  return { ...member, u0, u1: u0 + width, v0, v1: v0 + height };
}

export function movePointWithinBounds(point, delta, bounds) {
  return {
    ...point,
    u: clamp(point.u + delta.u, 0, bounds.length),
    v: clamp(point.v + delta.v, 0, bounds.height),
  };
}

export function moveWallDimensionWithinBounds(dimension, delta, bounds, precision = 0.01) {
  const start = dimension?.start || { u: 0, v: 0 };
  const end = dimension?.end || { u: 0, v: 0 };
  const quantizedDelta = quantizeWallLocalPoint(delta, precision);
  const minimumU = Math.min(start.u, end.u);
  const maximumU = Math.max(start.u, end.u);
  const minimumV = Math.min(start.v, end.v);
  const maximumV = Math.max(start.v, end.v);
  const deltaU = clamp(quantizedDelta.u, -minimumU, bounds.length - maximumU);
  const deltaV = clamp(quantizedDelta.v, -minimumV, bounds.height - maximumV);
  return {
    ...dimension,
    start: quantizeWallLocalPoint({ u: start.u + deltaU, v: start.v + deltaV }, precision),
    end: quantizeWallLocalPoint({ u: end.u + deltaU, v: end.v + deltaV }, precision),
    startRef: null,
    endRef: null,
  };
}

function supportsEdge(member, edge, tolerance = 2) {
  if (edge.orientation === 'vertical') {
    return (
      member.orientation === 'vertical' &&
      edge.position >= member.u0 - tolerance &&
      edge.position <= member.u1 + tolerance &&
      member.v0 <= edge.start + tolerance &&
      member.v1 >= edge.end - tolerance
    );
  }
  return (
    member.orientation === 'horizontal' &&
    edge.position >= member.v0 - tolerance &&
    edge.position <= member.v1 + tolerance &&
    member.u0 <= edge.start + tolerance &&
    member.u1 >= edge.end - tolerance
  );
}

function panelEdges(panels) {
  return panels.flatMap((panel, panelIndex) => {
    const points = panel.outlinePoints;
    if (!points?.length) {
      return [
        { orientation: 'vertical', role: 'left', position: panel.u0, start: panel.v0, end: panel.v1, panelIndex },
        { orientation: 'vertical', role: 'right', position: panel.u1, start: panel.v0, end: panel.v1, panelIndex },
        { orientation: 'horizontal', role: 'bottom', position: panel.v0, start: panel.u0, end: panel.u1, panelIndex },
        { orientation: 'horizontal', role: 'top', position: panel.v1, start: panel.u0, end: panel.u1, panelIndex },
      ];
    }
    return points.flatMap((start, index) => {
      const end = points[(index + 1) % points.length];
      if (Math.abs(start.u - end.u) <= 0.5) {
        return [
          {
            orientation: 'vertical',
            role: Math.abs(start.u - panel.u0) <= 0.5 ? 'left' : Math.abs(start.u - panel.u1) <= 0.5 ? 'right' : 'cut',
            position: start.u,
            start: Math.min(start.v, end.v),
            end: Math.max(start.v, end.v),
            panelIndex,
          },
        ];
      }
      if (Math.abs(start.v - end.v) <= 0.5) {
        return [
          {
            orientation: 'horizontal',
            role: Math.abs(start.v - panel.v0) <= 0.5 ? 'bottom' : Math.abs(start.v - panel.v1) <= 0.5 ? 'top' : 'cut',
            position: start.v,
            start: Math.min(start.u, end.u),
            end: Math.max(start.u, end.u),
            panelIndex,
          },
        ];
      }
      return [];
    });
  });
}

function centeredRevealSupport(edge, edges, maximumGap) {
  const oppositeRole = { left: 'right', right: 'left', bottom: 'top', top: 'bottom' }[edge.role];
  if (!oppositeRole) return edge.position;
  let nearest = null;
  let nearestDistance = maximumGap + 1;
  for (const candidate of edges) {
    if (
      candidate.panelIndex === edge.panelIndex ||
      candidate.orientation !== edge.orientation ||
      candidate.role !== oppositeRole
    ) {
      continue;
    }
    const overlap = Math.min(edge.end, candidate.end) - Math.max(edge.start, candidate.start);
    const distance = Math.abs(candidate.position - edge.position);
    if (overlap <= 0.5 || distance <= 0.5 || distance > maximumGap || distance >= nearestDistance) continue;
    nearest = candidate;
    nearestDistance = distance;
  }
  return nearest ? (edge.position + nearest.position) / 2 : edge.position;
}

function normalizedRect(value) {
  const u0 = Number(value?.u0) || 0;
  const u1 = Number(value?.u1) || 0;
  const v0 = Number(value?.v0) || 0;
  const v1 = Number(value?.v1) || 0;
  return { u0: Math.min(u0, u1), u1: Math.max(u0, u1), v0: Math.min(v0, v1), v1: Math.max(v0, v1) };
}

/**
 * Axis-aligned separation between two wall-local rectangles.
 *
 * `value` is the clear gap in millimetres: positive when the pair misses,
 * zero when they land flush, and negative when they genuinely overlap — in
 * which case its magnitude is the shortest push that would part them again.
 * `axis` names the direction that separation acts along.
 */
export function rectSeparation(a, b) {
  const left = normalizedRect(a);
  const right = normalizedRect(b);
  const gapU = Math.max(right.u0 - left.u1, left.u0 - right.u1);
  const gapV = Math.max(right.v0 - left.v1, left.v0 - right.v1);
  return gapU >= gapV ? { value: gapU, axis: 'u' } : { value: gapV, axis: 'v' };
}

/**
 * How one framing member meets the nearest opening, so the drawing can answer
 * "does this stud hit the door?" with a number instead of a thick line.
 *
 * `contact` is the installer-facing verdict:
 *   clear     — misses the opening by `separation` mm
 *   flush     — lands exactly on the jamb, head, or sill line (headers and
 *               sills sit here, which is why flush is never a clash)
 *   jamb      — straddles an opening edge, so `overlap` mm of the member sits
 *               inside the opening; this is how generated trimmer studs sit
 *   intrusion — the member's centreline is inside the opening, so on a real
 *               wall it is in the way and has to move or be cut
 */
export function measureFramingClearance(member, openings = [], tolerance = CONTACT_TOLERANCE) {
  let nearest = null;
  for (const opening of openings) {
    const separation = rectSeparation(member, opening);
    if (nearest && separation.value >= nearest.separation) continue;
    nearest = { opening, separation: separation.value, axis: separation.axis };
  }
  if (!nearest) return null;
  const { opening, separation, axis } = nearest;
  const rect = normalizedRect(member);
  const bounds = normalizedRect(opening);
  const centre = axis === 'u' ? (rect.u0 + rect.u1) / 2 : (rect.v0 + rect.v1) / 2;
  const low = axis === 'u' ? bounds.u0 : bounds.v0;
  const high = axis === 'u' ? bounds.u1 : bounds.v1;
  const contact =
    separation > tolerance
      ? 'clear'
      : separation >= -tolerance
        ? 'flush'
        : centre > low + tolerance && centre < high - tolerance
          ? 'intrusion'
          : 'jamb';
  return {
    openingId: opening?.id ?? null,
    openingKind: opening?.kind || 'opening',
    axis,
    separation,
    overlap: Math.max(0, -separation),
    contact,
  };
}

/**
 * Every framing member that eats into an opening, worst intrusion first, keyed
 * by member id so the canvas can flag them without re-measuring per render.
 */
export function findFramingOpeningClashes(members = [], openings = [], tolerance = CONTACT_TOLERANCE) {
  if (!openings.length) return [];
  return members
    .map((member) => ({ member, clearance: measureFramingClearance(member, openings, tolerance) }))
    .filter((entry) => entry.clearance && entry.clearance.overlap > tolerance)
    .map((entry) => ({ memberId: entry.member.id, kind: entry.member.kind, ...entry.clearance }))
    .sort((a, b) => b.overlap - a.overlap);
}

export function buildPanelJointBackingMembers(panels, existingMembers, framing, bounds) {
  const thickness = Math.max(MIN_ELEMENT_SIZE, Number(framing?.studWidth) || 50);
  const depth = Math.max(MIN_ELEMENT_SIZE, Number(framing?.studDepth) || 75);
  const material = framing?.material || null;
  const result = [];
  const edges = panelEdges(panels);
  for (const edge of edges) {
    if ([...existingMembers, ...result].some((member) => supportsEdge(member, edge))) continue;
    const supportPosition = centeredRevealSupport(edge, edges, thickness);
    if (edge.orientation === 'vertical') {
      result.push(
        createCustomFramingMember({
          kind: 'joint_stud',
          orientation: 'vertical',
          u0: clamp(supportPosition - thickness / 2, 0, bounds.length),
          u1: clamp(supportPosition + thickness / 2, 0, bounds.length),
          v0: edge.start,
          v1: edge.end,
          depth,
          material,
          label: 'Panel-joint backing',
        }),
      );
    } else {
      result.push(
        createCustomFramingMember({
          kind: 'joint_noggin',
          orientation: 'horizontal',
          u0: edge.start,
          u1: edge.end,
          v0: clamp(supportPosition - thickness / 2, 0, bounds.height),
          v1: clamp(supportPosition + thickness / 2, 0, bounds.height),
          depth,
          material,
          label: 'Panel-joint backing',
        }),
      );
    }
  }
  return result;
}
