import {
  createTrussMember,
  createTrussNode,
  deriveTrussPitchFromRise,
  deriveTrussRiseFromPitch,
  getTrussRun,
  normalizeTrussHeel,
  normalizeTrussMemberSizes,
  resolveTrussType,
} from '@/domain/trussModels';
import { WEB_PATTERNS, parseWebNodeRef, resolveWebPatternKey } from './webPatterns';

/*
 * Truss profiles (RT-3, docs/roof-truss-industrial.md §7.1).
 *
 * Truss-local frame: x along the span from the start bearing, z up from the
 * bearing surface (`trussSystem.baseElevation`). Every shape is first built in
 * LINE space — today's profile line, 0 at the heels and `rise` at the ridge,
 * with the overhang tails continuing the slope of the run they extend — and
 * then given real members by `applyMemberGeometry`:
 *
 * - the bottom chord's bottom face sits on the bearing, so its centre-line is
 *   at z = bc / 2 (bc = bottom-chord depth);
 * - the top chord's UNDERSIDE is u(x) = bc + h_r + line(x) (h_r = raised heel),
 *   its centre-line u(x) + tc / (2 cos θ) and its TOP FACE u(x) + tc / cos θ,
 *   both as true perpendicular offsets of the underside (mitred at kinks, plumb
 *   at the tail tips).
 *
 * `rise` keeps its stored meaning: the rise of the underside line over the run.
 * The returned `roofOutline` is the TOP FACE, tails included — the closure top
 * edge and the attached roof both follow it. `undersideOutline` is u(x),
 * `lineOutline` the bare profile line.
 */

const EPSILON = 1e-6;
// RT-4.1 (spec §7.10.1): a kink within this of a panel point is that panel
// point (the same rule the named web patterns use for their kink nodes).
const KINK_PANEL_TOLERANCE = 1;
// RT-4.1 (spec §7.10.4): a hip slice whose sloped run is shorter than this is
// built as the flat slice (a sub-millimetre stub only distorts the mitre).
export const HIP_SLICE_MIN_RUN = 1;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * The interior points of an x-ordered outline where it changes direction:
 * the point is off the straight line through its two neighbours by more than
 * EPSILON in z (spec §7.10.1).
 */
function outlineKinkPoints(points = []) {
  const kinks = [];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    const next = points[index + 1];
    const run = next.x - previous.x;
    if (Math.abs(run) <= EPSILON) continue;
    const expected = previous.z + ((next.z - previous.z) * (point.x - previous.x)) / run;
    if (Math.abs(point.z - expected) > EPSILON) kinks.push(point);
  }
  return kinks;
}

function createLocalNodeMap(points, prefix) {
  return points.map((point, index) =>
    createTrussNode(point.x, point.z, {
      id: `${prefix}_${index}`,
      kind: point.kind,
    }),
  );
}

function addMember(members, startNodeId, endNodeId, memberType, index) {
  if (!startNodeId || !endNodeId || startNodeId === endNodeId) return;
  members.push(
    createTrussMember(startNodeId, endNodeId, {
      id: `${memberType}_${index}`,
      memberType,
    }),
  );
}

function distance2d(start, end) {
  const dx = Number(end?.x || 0) - Number(start?.x || 0);
  const dz = Number(end?.z || 0) - Number(start?.z || 0);
  return Math.hypot(dx, dz);
}

function uniqueOutlinePoints(points = []) {
  const unique = [];
  for (const point of points) {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.z)) continue;
    const previous = unique[unique.length - 1];
    if (!previous || distance2d(previous, point) > EPSILON) {
      unique.push(point);
    }
  }
  return unique;
}

function sampleOutlineAtX(points = [], x = 0) {
  if (!points.length) return { x, z: 0 };
  if (points.length === 1) return { x, z: points[0].z };

  const ordered = [...points].sort((a, b) => a.x - b.x);
  if (x <= ordered[0].x + EPSILON) return { x, z: ordered[0].z };
  if (x >= ordered[ordered.length - 1].x - EPSILON) return { x, z: ordered[ordered.length - 1].z };

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const start = ordered[index];
    const end = ordered[index + 1];
    if (x < start.x - EPSILON || x > end.x + EPSILON) continue;
    const span = end.x - start.x;
    if (Math.abs(span) <= EPSILON) {
      return { x, z: end.z };
    }
    const ratio = (x - start.x) / span;
    return {
      x,
      z: lerp(start.z, end.z, ratio),
    };
  }

  return { x, z: ordered[ordered.length - 1].z };
}

function createBottomPoints(metrics) {
  return Array.from({ length: metrics.panelCount + 1 }, (_, index) => ({
    x: (metrics.span * index) / metrics.panelCount,
    z: 0,
    kind: 'bottom_chord',
  }));
}

/**
 * Line-space z of the two overhang tail tips: each tail continues the slope of
 * the run it extends (spec §7.1). A flat run gives a level tail.
 *
 * `tailSlope` (RT-4.1, spec §7.10.2) overrides that: both tails fall at this
 * slope from their heel, whatever the run does — a flat hip slice's tails
 * follow the hip pitch, because the hip plane comes down over them.
 */
function continueOutlineTails(structuralOutline = [], metrics, { tailSlope = null } = {}) {
  const points = structuralOutline;
  if (!points.length) return { start: 0, end: 0 };
  if (Number.isFinite(tailSlope)) {
    return {
      start: points[0].z - metrics.overhangStart * tailSlope,
      end: points[points.length - 1].z - metrics.overhangEnd * tailSlope,
    };
  }
  const first = points[0];
  const second = points[1] || first;
  const last = points[points.length - 1];
  const beforeLast = points[points.length - 2] || last;
  const startRun = second.x - first.x;
  const endRun = last.x - beforeLast.x;
  const startSlope = Math.abs(startRun) > EPSILON ? (second.z - first.z) / startRun : 0;
  const endSlope = Math.abs(endRun) > EPSILON ? (last.z - beforeLast.z) / endRun : 0;
  return {
    start: first.z - metrics.overhangStart * startSlope,
    end: last.z + metrics.overhangEnd * endSlope,
  };
}

function buildProfileFromStructuralOutline(metrics, structuralOutline, options = {}) {
  const webMode = options.webMode || (metrics.family === 'gable' ? 'gable' : 'alternating');
  const bottomPoints = createBottomPoints(metrics);
  const topPoints = bottomPoints.map((point, index) => {
    const sampled = sampleOutlineAtX(structuralOutline, point.x);
    return {
      x: point.x,
      z: sampled.z,
      kind:
        sampled.z >= Math.max(...structuralOutline.map((entry) => entry.z)) - EPSILON
          ? metrics.family === 'gable'
            ? 'ridge'
            : 'top_chord'
          : 'top_chord',
    };
  });

  const tails = continueOutlineTails(structuralOutline, metrics, { tailSlope: options.tailSlope });
  const overhangPoints = [
    { x: -metrics.overhangStart, z: tails.start, kind: 'overhang' },
    { x: metrics.span + metrics.overhangEnd, z: tails.end, kind: 'overhang' },
  ];

  const topNodes = createLocalNodeMap(topPoints, 'top');
  const bottomNodes = createLocalNodeMap(bottomPoints, 'bottom');
  const overhangNodes = createLocalNodeMap(overhangPoints, 'overhang');
  // RT-4.1 (spec §7.10.1): the chord changes direction only at a node. Every
  // kink of the outline that is not already a panel point gets a top-chord
  // node of its own; the webs keep pairing with the panel points by index. A
  // curved chord (`curvedChord`, the domed arch) samples a curve, not kinks,
  // and keeps its panel-only chain.
  const curvedChord = Boolean(options.curvedChord);
  const kinkNodes = (curvedChord ? [] : outlineKinkPoints(structuralOutline))
    .filter((point) => !topPoints.some((panel) => Math.abs(panel.x - point.x) <= KINK_PANEL_TOLERANCE))
    .map((point, index) => createTrussNode(point.x, point.z, { id: `top_kink_${index}`, kind: 'top_chord' }));
  const chordNodes = [...topNodes, ...kinkNodes].sort((a, b) => a.x - b.x);
  const members = [];

  addMember(members, overhangNodes[0].id, chordNodes[0].id, 'topChord', members.length);
  for (let index = 0; index < chordNodes.length - 1; index += 1) {
    addMember(members, chordNodes[index].id, chordNodes[index + 1].id, 'topChord', members.length);
  }
  addMember(members, chordNodes[chordNodes.length - 1].id, overhangNodes[1].id, 'topChord', members.length);

  for (let index = 0; index < bottomNodes.length - 1; index += 1) {
    addMember(members, bottomNodes[index].id, bottomNodes[index + 1].id, 'bottomChord', members.length);
  }

  for (let index = 1; index < bottomNodes.length - 1; index += 1) {
    if (Math.abs(topPoints[index].z - bottomPoints[index].z) <= EPSILON) continue;
    addMember(members, bottomNodes[index].id, topNodes[index].id, 'web', members.length);
  }

  if (webMode === 'gable') {
    const midpoint = metrics.panelCount / 2;
    for (let index = 0; index < metrics.panelCount; index += 1) {
      if (index < midpoint) {
        addMember(members, bottomNodes[index].id, topNodes[index + 1].id, 'web', members.length);
        continue;
      }
      addMember(members, topNodes[index].id, bottomNodes[index + 1].id, 'web', members.length);
    }
  } else {
    for (let index = 0; index < metrics.panelCount; index += 1) {
      if (index % 2 === 0) {
        addMember(members, bottomNodes[index].id, topNodes[index + 1].id, 'web', members.length);
        continue;
      }
      addMember(members, topNodes[index].id, bottomNodes[index + 1].id, 'web', members.length);
    }
  }

  return {
    nodes: [...overhangNodes, ...topNodes, ...kinkNodes, ...bottomNodes],
    members,
    roofOutline: uniqueOutlinePoints([
      { x: -metrics.overhangStart, z: tails.start },
      ...structuralOutline,
      { x: metrics.span + metrics.overhangEnd, z: tails.end },
    ]),
    bottomOutline: bottomPoints,
    topChordRuns: options.topChordRuns || [
      {
        id: 'main',
        side: 'main',
        points: structuralOutline,
      },
    ],
    ...(curvedChord ? { curvedChord: true } : {}),
  };
}

export function resolveTrussMetrics(instance, trussType = resolveTrussType(instance?.trussTypeId)) {
  const family = trussType.family;
  const shape = trussType.shape || family;
  const span = Math.max(Number(instance?.span || trussType.defaultSpan || 0), 1000);
  const defaultRise = Number(trussType.defaultRise || 0);
  const explicitRise = Number(instance?.rise);
  const explicitPitch = Number(instance?.pitch);

  if (shape === 'flat') {
    const rise = Number.isFinite(explicitRise) ? Math.max(0, explicitRise) : Math.max(0, defaultRise || 900);
    return {
      family,
      shape,
      span,
      rise,
      pitch: 0,
      overhangStart: Math.max(Number(instance?.overhangs?.start || 0), 0),
      overhangEnd: Math.max(Number(instance?.overhangs?.end || 0), 0),
      bearingStart: Number(instance?.bearingOffsets?.start || 0),
      bearingEnd: Number(instance?.bearingOffsets?.end || 0),
      panelCount: Math.max(2, Math.round(trussType.webPattern?.panelCount || 4)),
    };
  }

  // RISE is the single geometric source of truth (all profile builders draw
  // from rise). Precedence: an explicit rise ALWAYS wins and pitch is derived
  // from it -- even when both are present but inconsistent (this is the
  // legacy-save case). Pitch only drives rise when no explicit rise was given.
  let rise;
  if (Number.isFinite(explicitRise)) {
    rise = Math.max(0, explicitRise);
  } else if (Number.isFinite(explicitPitch)) {
    rise = deriveTrussRiseFromPitch(explicitPitch, span, family);
  } else {
    rise = Math.max(0, defaultRise);
  }
  const pitch = deriveTrussPitchFromRise(rise, span, family);

  return {
    family,
    shape,
    span,
    rise,
    pitch,
    overhangStart: Math.max(Number(instance?.overhangs?.start || 0), 0),
    overhangEnd: Math.max(Number(instance?.overhangs?.end || 0), 0),
    bearingStart: Number(instance?.bearingOffsets?.start || 0),
    bearingEnd: Number(instance?.bearingOffsets?.end || 0),
    panelCount: Math.max(2, Math.round(trussType.webPattern?.panelCount || 4)),
  };
}

function buildGableProfile(metrics) {
  const topPoints = [];
  for (let index = 0; index <= metrics.panelCount; index += 1) {
    const ratio = index / metrics.panelCount;
    const x = metrics.span * ratio;
    const z = ratio <= 0.5 ? lerp(0, metrics.rise, ratio / 0.5) : lerp(metrics.rise, 0, (ratio - 0.5) / 0.5);
    topPoints.push({ x, z, kind: index === Math.floor(metrics.panelCount / 2) ? 'ridge' : 'top_chord' });
  }

  const bottomPoints = createBottomPoints(metrics);
  // The tails continue the rafter slope past the heel (they used to run level).
  const halfSpan = Math.max(metrics.span / 2, EPSILON);
  const overhangPoints = [
    { x: -metrics.overhangStart, z: (-metrics.overhangStart * metrics.rise) / halfSpan, kind: 'overhang' },
    { x: metrics.span + metrics.overhangEnd, z: (-metrics.overhangEnd * metrics.rise) / halfSpan, kind: 'overhang' },
  ];

  const topNodes = createLocalNodeMap(topPoints, 'top');
  const bottomNodes = createLocalNodeMap(bottomPoints, 'bottom');
  const overhangNodes = createLocalNodeMap(overhangPoints, 'overhang');
  const members = [];

  addMember(members, overhangNodes[0].id, topNodes[0].id, 'topChord', members.length);
  for (let index = 0; index < topNodes.length - 1; index += 1) {
    addMember(members, topNodes[index].id, topNodes[index + 1].id, 'topChord', members.length);
  }
  addMember(members, topNodes[topNodes.length - 1].id, overhangNodes[1].id, 'topChord', members.length);

  for (let index = 0; index < bottomNodes.length - 1; index += 1) {
    addMember(members, bottomNodes[index].id, bottomNodes[index + 1].id, 'bottomChord', members.length);
  }

  for (let index = 1; index < bottomNodes.length - 1; index += 1) {
    addMember(members, bottomNodes[index].id, topNodes[index].id, 'web', members.length);
  }

  const midpoint = Math.floor(metrics.panelCount / 2);
  for (let index = 0; index < metrics.panelCount; index += 1) {
    if (index < midpoint) {
      addMember(members, bottomNodes[index].id, topNodes[index + 1].id, 'web', members.length);
      continue;
    }
    addMember(members, topNodes[index].id, bottomNodes[index + 1].id, 'web', members.length);
  }

  return {
    nodes: [...overhangNodes, ...topNodes, ...bottomNodes],
    members,
    roofOutline: uniqueOutlinePoints([
      { x: overhangPoints[0].x, z: overhangPoints[0].z },
      ...topPoints,
      { x: overhangPoints[1].x, z: overhangPoints[1].z },
    ]),
    bottomOutline: bottomPoints,
    topChordRuns: [
      { id: 'left', side: 'left', points: topPoints.slice(0, midpoint + 1) },
      { id: 'right', side: 'right', points: topPoints.slice(midpoint).reverse() },
    ],
  };
}

function buildShedProfile(metrics) {
  const topPoints = [];
  for (let index = 0; index <= metrics.panelCount; index += 1) {
    const ratio = index / metrics.panelCount;
    topPoints.push({
      x: metrics.span * ratio,
      z: metrics.rise * ratio,
      kind: index === metrics.panelCount ? 'high_point' : 'top_chord',
    });
  }

  const bottomPoints = createBottomPoints(metrics);
  const overhangPoints = [
    {
      x: -metrics.overhangStart,
      z: metrics.span > EPSILON ? -metrics.rise * (metrics.overhangStart / metrics.span) : 0,
      kind: 'overhang',
    },
    {
      x: metrics.span + metrics.overhangEnd,
      z: metrics.span > EPSILON ? metrics.rise * ((metrics.span + metrics.overhangEnd) / metrics.span) : metrics.rise,
      kind: 'overhang',
    },
  ];

  const topNodes = createLocalNodeMap(topPoints, 'top');
  const bottomNodes = createLocalNodeMap(bottomPoints, 'bottom');
  const overhangNodes = createLocalNodeMap(overhangPoints, 'overhang');
  const members = [];

  addMember(members, overhangNodes[0].id, topNodes[0].id, 'topChord', members.length);
  for (let index = 0; index < topNodes.length - 1; index += 1) {
    addMember(members, topNodes[index].id, topNodes[index + 1].id, 'topChord', members.length);
  }
  addMember(members, topNodes[topNodes.length - 1].id, overhangNodes[1].id, 'topChord', members.length);

  for (let index = 0; index < bottomNodes.length - 1; index += 1) {
    addMember(members, bottomNodes[index].id, bottomNodes[index + 1].id, 'bottomChord', members.length);
  }

  for (let index = 1; index < metrics.panelCount; index += 1) {
    addMember(members, bottomNodes[index].id, topNodes[index].id, 'web', members.length);
  }

  for (let index = 0; index < metrics.panelCount; index += 1) {
    if (index % 2 === 0) {
      addMember(members, bottomNodes[index].id, topNodes[index + 1].id, 'web', members.length);
      continue;
    }
    addMember(members, topNodes[index].id, bottomNodes[index + 1].id, 'web', members.length);
  }

  return {
    nodes: [...overhangNodes, ...topNodes, ...bottomNodes],
    members,
    roofOutline: uniqueOutlinePoints([
      { x: -metrics.overhangStart, z: overhangPoints[0].z },
      ...topPoints,
      { x: metrics.span + metrics.overhangEnd, z: overhangPoints[1].z },
    ]),
    bottomOutline: bottomPoints,
    topChordRuns: [{ id: 'main', side: 'main', points: topPoints }],
  };
}

function buildFlatProfile(metrics, { tailSlope = null } = {}) {
  const structuralOutline = uniqueOutlinePoints([
    { x: 0, z: metrics.rise },
    { x: metrics.span, z: metrics.rise },
  ]);

  return buildProfileFromStructuralOutline(metrics, structuralOutline, {
    webMode: 'alternating',
    topChordRuns: [{ id: 'main', side: 'main', points: structuralOutline }],
    tailSlope,
  });
}

function buildBoxGableProfile(metrics) {
  const crownWidth = Math.max(metrics.span * 0.22, Math.min(metrics.span * 0.3, 1200));
  const crownStart = (metrics.span - crownWidth) / 2;
  const crownEnd = crownStart + crownWidth;
  const structuralOutline = uniqueOutlinePoints([
    { x: 0, z: 0 },
    { x: crownStart, z: metrics.rise },
    { x: crownEnd, z: metrics.rise },
    { x: metrics.span, z: 0 },
  ]);

  return buildProfileFromStructuralOutline(metrics, structuralOutline, {
    webMode: 'gable',
    topChordRuns: [
      { id: 'left', side: 'left', points: structuralOutline.slice(0, 2) },
      { id: 'right', side: 'right', points: [structuralOutline[3], structuralOutline[2]] },
    ],
  });
}

function buildHipSliceProfile(metrics, options = {}) {
  const supportLength = Math.max(Number(options.supportLength || 0), 0);
  const layoutOffset = Math.max(Number(options.layoutOffset || 0), 0);
  const halfSpan = Math.max(metrics.span / 2, EPSILON);
  const endDistance =
    supportLength > EPSILON ? Math.max(0, Math.min(layoutOffset, supportLength - layoutOffset)) : halfSpan;
  const clippedRun = Math.max(0, Math.min(halfSpan, endDistance));
  const localRise = metrics.rise * (clippedRun / halfSpan);

  // The flat slice — at a line end, or a sub-millimetre sliver (RT-4.1, spec
  // §7.10.4) — is a flat truss whose tails fall at the HIP pitch (§7.10.2):
  // the hip planes come down over them on every side.
  if (clippedRun < HIP_SLICE_MIN_RUN || localRise <= EPSILON) {
    return buildFlatProfile({ ...metrics, rise: 0 }, { tailSlope: metrics.rise / halfSpan });
  }

  if (clippedRun >= halfSpan - EPSILON) {
    return buildGableProfile(metrics);
  }

  const crownStart = clippedRun;
  const crownEnd = metrics.span - clippedRun;
  const structuralOutline = uniqueOutlinePoints([
    { x: 0, z: 0 },
    { x: crownStart, z: localRise },
    { x: crownEnd, z: localRise },
    { x: metrics.span, z: 0 },
  ]);

  return buildProfileFromStructuralOutline(metrics, structuralOutline, {
    webMode: 'gable',
    topChordRuns: [
      { id: 'left', side: 'left', points: structuralOutline.slice(0, 2) },
      { id: 'right', side: 'right', points: [structuralOutline[3], structuralOutline[2]] },
    ],
  });
}

function buildHipProfile(metrics) {
  return buildGableProfile(metrics);
}

function buildDroppedEavesProfile(metrics) {
  const heelInset = Math.max(metrics.span * 0.12, Math.min(metrics.span * 0.18, 900));
  const heelHeight = Math.max(metrics.rise * 0.32, 250);
  const structuralOutline = uniqueOutlinePoints([
    { x: 0, z: 0 },
    { x: heelInset, z: heelHeight },
    { x: metrics.span / 2, z: metrics.rise },
    { x: metrics.span - heelInset, z: heelHeight },
    { x: metrics.span, z: 0 },
  ]);

  return buildProfileFromStructuralOutline(metrics, structuralOutline, {
    webMode: 'gable',
    topChordRuns: [
      { id: 'left', side: 'left', points: structuralOutline.slice(0, 3) },
      { id: 'right', side: 'right', points: [structuralOutline[4], structuralOutline[3], structuralOutline[2]] },
    ],
  });
}

function buildPyramidHippedProfile(metrics) {
  const ridgeWidth = Math.max(metrics.span * 0.08, Math.min(metrics.span * 0.14, 700));
  const ridgeStart = (metrics.span - ridgeWidth) / 2;
  const ridgeEnd = ridgeStart + ridgeWidth;
  const shoulderHeight = Math.max(metrics.rise * 0.82, 300);
  const shoulderInset = Math.max(metrics.span * 0.08, Math.min(metrics.span * 0.12, 600));
  const structuralOutline = uniqueOutlinePoints([
    { x: 0, z: 0 },
    { x: ridgeStart - shoulderInset, z: shoulderHeight },
    { x: ridgeStart, z: metrics.rise },
    { x: ridgeEnd, z: metrics.rise },
    { x: ridgeEnd + shoulderInset, z: shoulderHeight },
    { x: metrics.span, z: 0 },
  ]);

  return buildProfileFromStructuralOutline(metrics, structuralOutline, {
    webMode: 'gable',
    topChordRuns: [
      { id: 'left', side: 'left', points: structuralOutline.slice(0, 3) },
      { id: 'right', side: 'right', points: [structuralOutline[5], structuralOutline[4], structuralOutline[3]] },
    ],
  });
}

function buildDomedProfile(metrics) {
  const segments = Math.max(metrics.panelCount * 6, 48);
  const structuralOutline = uniqueOutlinePoints(
    Array.from({ length: segments + 1 }, (_, index) => {
      const ratio = index / segments;
      const x = metrics.span * ratio;
      const z = metrics.rise * Math.sin(Math.PI * ratio);
      return {
        x,
        z: Math.max(0, z),
      };
    }),
  );

  return buildProfileFromStructuralOutline(metrics, structuralOutline, {
    webMode: 'gable',
    // The arch's sample points are not structural kinks: the chord stays a
    // panel-point chain (no kink nodes, no mitre move — RT-4.1 audit).
    curvedChord: true,
    topChordRuns: [
      {
        id: 'main',
        side: 'main',
        points: structuralOutline,
        measurementCurve: {
          kind: 'sine_arch',
          startX: 0,
          endX: metrics.span,
          rise: metrics.rise,
        },
      },
    ],
  });
}

// --- Member geometry (RT-3) -----------------------------------------------

function sortedOutline(points = []) {
  return uniqueOutlinePoints(
    [...points]
      .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.z))
      .map((point) => ({ x: point.x, z: point.z }))
      .sort((a, b) => a.x - b.x),
  ).filter((point, index, list) => index === 0 || point.x - list[index - 1].x > EPSILON);
}

function segmentSlope(a, b) {
  const run = b.x - a.x;
  return Math.abs(run) > EPSILON ? (b.z - a.z) / run : 0;
}

/**
 * The polyline `distance` above an x-monotone polyline, measured square to
 * each segment: segment i moves up by `distance / cos θ_i`; interior vertices
 * are the mitre (the intersection of the two moved lines), the two end
 * vertices stay plumb above their x (a plumb-cut tail).
 */
export function offsetTrussOutline(points = [], distance = 0) {
  const outline = sortedOutline(points);
  if (outline.length < 2 || Math.abs(distance) <= EPSILON) return outline;
  const lift = (a, b) => distance * Math.sqrt(1 + segmentSlope(a, b) ** 2);
  const result = [{ x: outline[0].x, z: outline[0].z + lift(outline[0], outline[1]) }];
  for (let index = 1; index < outline.length - 1; index += 1) {
    const previous = outline[index - 1];
    const point = outline[index];
    const next = outline[index + 1];
    const slopeA = segmentSlope(previous, point);
    const slopeB = segmentSlope(point, next);
    const liftA = lift(previous, point);
    const liftB = lift(point, next);
    if (Math.abs(slopeA - slopeB) <= 1e-9) {
      result.push({ x: point.x, z: point.z + liftA });
      continue;
    }
    // point.z + slopeA·dx + liftA = point.z + slopeB·dx + liftB
    const dx = (liftB - liftA) / (slopeA - slopeB);
    const x = Math.min(next.x, Math.max(previous.x, point.x + dx));
    const z = x <= point.x ? point.z + slopeA * (x - point.x) + liftA : point.z + slopeB * (x - point.x) + liftB;
    result.push({ x, z });
  }
  const last = outline[outline.length - 1];
  result.push({ x: last.x, z: last.z + lift(outline[outline.length - 2], last) });
  return sortedOutline(result);
}

/** z of an x-monotone outline at x (clamped to the end points). */
export function sampleTrussOutlineZ(points = [], x = 0) {
  return sampleOutlineAtX(sortedOutline(points), x).z;
}

/** Slope angle (radians) of the outline segment that starts at, or contains, x heading +x. */
function outlineAngleAt(points, x) {
  const outline = sortedOutline(points);
  for (let index = 0; index < outline.length - 1; index += 1) {
    if (x < outline[index + 1].x - EPSILON) return Math.atan(segmentSlope(outline[index], outline[index + 1]));
  }
  return outline.length >= 2 ? Math.atan(segmentSlope(outline[outline.length - 2], outline[outline.length - 1])) : 0;
}

/** Slope angle (radians) of the outline segment that ends at, or contains, x heading −x. */
function outlineAngleBefore(points, x) {
  const outline = sortedOutline(points);
  for (let index = outline.length - 1; index > 0; index -= 1) {
    if (x > outline[index - 1].x + EPSILON) return Math.atan(segmentSlope(outline[index - 1], outline[index]));
  }
  return outline.length >= 2 ? Math.atan(segmentSlope(outline[0], outline[1])) : 0;
}

function resolveMemberSizes(options = {}) {
  const memberSizes = normalizeTrussMemberSizes(options.memberSizes);
  const heel = normalizeTrussHeel(options.heel);
  return {
    memberSizes,
    tc: memberSizes.topChord.depth,
    bc: memberSizes.bottomChord.depth,
    wb: memberSizes.web.depth,
    raisedHeel: heel.raised,
  };
}

const TOP_KINDS = new Set(['top_chord', 'ridge', 'high_point', 'overhang']);

/**
 * The centre-line mitre at every kink of the underside: `{lineX, x, z}` with
 * `lineX` the kink's x on the line and `{x, z}` the centre-line vertex
 * `offsetTrussOutline` made for it (the two offset lines' intersection).
 */
function resolveCentreKinks(undersideOutline, centreOutline) {
  if (undersideOutline.length !== centreOutline.length) return [];
  return outlineKinkPoints(undersideOutline).map((point) => {
    const index = undersideOutline.indexOf(point);
    return { lineX: point.x, x: centreOutline[index].x, z: centreOutline[index].z };
  });
}

/**
 * A top-chord run's points on the chord centre-line (RT-4.1, spec §7.10.3):
 * the run's OWN line offset square to its own segments (`tc / 2`, mitred at
 * its interior kinks, plumb at its ends), so a run that stops at a kink of the
 * whole outline (a hip slice's crown) ends on its own slope, not on the next
 * segment's centre-line. A straight run gives the old value.
 */
function runCentrePoints(points, centreOutline, { tc, lift }) {
  const runUnderside = sortedOutline(points.map((point) => ({ x: point.x, z: point.z + lift })));
  if (runUnderside.length < 2) {
    return points.map((point) => ({ ...point, z: sampleTrussOutlineZ(centreOutline, point.x) }));
  }
  const runCentre = offsetTrussOutline(runUnderside, tc / 2);
  return points.map((point) => ({ ...point, z: sampleTrussOutlineZ(runCentre, point.x) }));
}

/**
 * Line-space profile → profile with real members (see the header comment).
 * Webs that would lie flat on the bearing line (a zero-rise hip slice) are
 * dropped: there is no depth between the chords for them.
 */
function applyMemberGeometry(lineProfile, metrics, sizes) {
  const { tc, bc, raisedHeel } = sizes;
  const lineOutline = sortedOutline(lineProfile.roofOutline || []);
  const undersideOutline = lineOutline.map((point) => ({ x: point.x, z: point.z + bc + raisedHeel }));
  const centreOutline = offsetTrussOutline(undersideOutline, tc / 2);
  const topFace = offsetTrussOutline(undersideOutline, tc);
  const lineNodes = new Map((lineProfile.nodes || []).map((node) => [node.id, node]));
  // A curved chord (the domed arch) has no structural kinks: its top nodes
  // sample the centre outline as before RT-4.1.
  const centreKinks = lineProfile.curvedChord ? [] : resolveCentreKinks(undersideOutline, centreOutline);

  const nodes = (lineProfile.nodes || []).map((node) => {
    if (!TOP_KINDS.has(node.kind)) return { ...node, z: node.z + bc / 2 };
    // RT-4.1 (spec §7.10.1): a chord node at a kink sits where the two chord
    // centre-lines meet (the mitre), so both members it joins lie exactly on
    // their own centre-lines.
    const kink =
      node.kind === 'overhang'
        ? null
        : centreKinks.find((entry) => Math.abs(entry.lineX - node.x) <= KINK_PANEL_TOLERANCE) || null;
    return kink ? { ...node, x: kink.x, z: kink.z } : { ...node, z: sampleTrussOutlineZ(centreOutline, node.x) };
  });
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  const members = (lineProfile.members || [])
    .filter((member) => {
      if (member.memberType !== 'web' || raisedHeel > EPSILON) return true;
      const start = lineNodes.get(member.startNodeId);
      const end = lineNodes.get(member.endNodeId);
      if (!start || !end) return false;
      const topNode = TOP_KINDS.has(start.kind) ? start : TOP_KINDS.has(end.kind) ? end : null;
      const bottomNode = topNode === start ? end : start;
      if (!topNode || TOP_KINDS.has(bottomNode.kind)) return true;
      // A web whose top end sits ON the bottom line has no truss depth to span.
      return topNode.z - bottomNode.z > EPSILON;
    })
    .map((member) => ({ ...member }));

  if (raisedHeel > EPSILON) {
    [0, metrics.span].forEach((x, index) => {
      // The heel's chord node; at a kinked heel (a flat hip slice) it sits on
      // the centre-line mitre, a few millimetres off x (RT-4.1).
      const top = nodes
        .filter(
          (node) => node.kind !== 'overhang' && TOP_KINDS.has(node.kind) && Math.abs(node.x - x) <= Math.max(1, tc),
        )
        .sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
      const bottom = nodes.find((node) => node.kind === 'bottom_chord' && Math.abs(node.x - x) <= 1);
      if (!top || !bottom) return;
      members.push({
        ...createTrussMember(bottom.id, top.id, { id: `heel_stud_${index}`, memberType: 'web' }),
        role: 'heel_stud',
      });
    });
  }

  for (const member of members) {
    const start = nodeMap.get(member.startNodeId);
    const end = nodeMap.get(member.endNodeId);
    member.length = start && end ? distance2d(start, end) : 0;
  }

  const topChordRuns = (lineProfile.topChordRuns || []).map((run) => ({
    ...run,
    points: runCentrePoints(run.points || [], centreOutline, { tc, lift: bc + raisedHeel }),
    ...(run.measurementCurve
      ? { measurementCurve: { ...run.measurementCurve, zOffset: bc + raisedHeel + tc / 2 } }
      : {}),
  }));

  const run = getTrussRun(metrics.span, metrics.family);
  const pitchDegrees = metrics.family === 'flat' ? 0 : (Math.atan(metrics.rise / Math.max(run, 1)) * 180) / Math.PI;

  return {
    nodes,
    members,
    roofOutline: topFace,
    undersideOutline,
    centreOutline,
    lineOutline,
    bottomOutline: (lineProfile.bottomOutline || []).map((point) => ({ ...point })),
    topChordRuns,
    derivedMetrics: {
      memberSizes: sizes.memberSizes,
      topChordDepth: tc,
      bottomChordDepth: bc,
      webDepth: sizes.wb,
      raisedHeel,
      heelAngle: outlineAngleAt(undersideOutline, 0),
      endHeelAngle: Math.abs(outlineAngleBefore(undersideOutline, metrics.span)),
      heelHeight: sampleTrussOutlineZ(topFace, 0),
      heelHeightEnd: sampleTrussOutlineZ(topFace, metrics.span),
      overallHeight: Math.max(...topFace.map((point) => point.z)),
      outToOut: metrics.span + metrics.overhangStart + metrics.overhangEnd,
      pitchDegrees,
    },
  };
}

// --- Named web patterns (RT-3, §7.3) -----------------------------------------

function scissorBottomLine(metrics, ratio) {
  return [
    { x: 0, z: 0 },
    { x: metrics.span / 2, z: Math.max(0, metrics.rise * ratio) },
    { x: metrics.span, z: 0 },
  ];
}

/**
 * Rebuild a base line profile's nodes and members from a named web pattern.
 * The top line (kinks, tails) and the top-chord runs come from `base`, so a
 * gable end frame keeps exactly its truss's outline and purlin seats.
 */
function buildPatternLineProfile(base, metrics, shape, patternKey, options = {}) {
  const built = WEB_PATTERNS[patternKey].build(metrics);
  const span = metrics.span;
  const topLine = sortedOutline(base.roofOutline || []);
  const structuralTop = topLine.filter((point) => point.x >= -EPSILON && point.x <= span + EPSILON);
  const bottomLine =
    shape === 'scissor'
      ? scissorBottomLine(metrics, options.scissorBottomPitchRatio ?? 0.5)
      : [
          { x: 0, z: 0 },
          { x: span, z: 0 },
        ];
  const maxTop = Math.max(...structuralTop.map((point) => point.z));

  const topKind = (x, z) => {
    if (metrics.family === 'gable' && maxTop > EPSILON && z >= maxTop - EPSILON) return 'ridge';
    if (shape === 'shed' && Math.abs(x - span) <= EPSILON) return 'high_point';
    return 'top_chord';
  };

  const patternTopXs = [0, ...(built.topFractions || []).map((f) => f * span), span];
  const patternBottomXs = [0, ...(built.bottomFractions || []).map((f) => f * span), span];
  // Only real kinks (a change of slope) become extra chord points.
  const topKinkXs = structuralTop
    .slice(1, -1)
    .filter(
      (point, index) =>
        Math.abs(segmentSlope(structuralTop[index], point) - segmentSlope(point, structuralTop[index + 2])) > 1e-9,
    )
    .map((point) => point.x);
  const bottomKinkXs = bottomLine.slice(1, -1).map((point) => point.x);

  const topNodes = patternTopXs.map((x, index) => {
    const z = sampleOutlineAtX(topLine, x).z;
    return createTrussNode(x, z, { id: `top_${index}`, kind: topKind(x, z) });
  });
  topKinkXs.forEach((x, index) => {
    if (topNodes.some((node) => Math.abs(node.x - x) <= 1)) return;
    const z = sampleOutlineAtX(topLine, x).z;
    topNodes.push(createTrussNode(x, z, { id: `top_k${index}`, kind: topKind(x, z) }));
  });
  const bottomNodes = patternBottomXs.map((x, index) =>
    createTrussNode(x, sampleOutlineAtX(bottomLine, x).z, { id: `bottom_${index}`, kind: 'bottom_chord' }),
  );
  bottomKinkXs.forEach((x, index) => {
    if (bottomNodes.some((node) => Math.abs(node.x - x) <= 1)) return;
    bottomNodes.push(
      createTrussNode(x, sampleOutlineAtX(bottomLine, x).z, { id: `bottom_k${index}`, kind: 'bottom_chord' }),
    );
  });
  const overhangNodes = (base.nodes || [])
    .filter((node) => node.kind === 'overhang')
    .map((node) => createTrussNode(node.x, node.z, { id: node.id, kind: 'overhang' }));

  const sortedTop = [...topNodes].sort((a, b) => a.x - b.x);
  const sortedBottom = [...bottomNodes].sort((a, b) => a.x - b.x);
  const startTail = overhangNodes.find((node) => node.x < -EPSILON);
  const endTail = overhangNodes.find((node) => node.x > span + EPSILON);
  const members = [];
  const seen = new Set();
  const push = (startId, endId, memberType) => {
    if (!startId || !endId || startId === endId) return;
    const key = [startId, endId].sort().join('|');
    if (seen.has(key)) return;
    seen.add(key);
    addMember(members, startId, endId, memberType, members.length);
  };

  if (startTail) push(startTail.id, sortedTop[0].id, 'topChord');
  for (let index = 0; index < sortedTop.length - 1; index += 1) {
    push(sortedTop[index].id, sortedTop[index + 1].id, 'topChord');
  }
  if (endTail) push(sortedTop[sortedTop.length - 1].id, endTail.id, 'topChord');
  for (let index = 0; index < sortedBottom.length - 1; index += 1) {
    push(sortedBottom[index].id, sortedBottom[index + 1].id, 'bottomChord');
  }

  const resolveRef = (ref) => {
    const parsed = parseWebNodeRef(ref);
    if (!parsed) return null;
    return parsed.chord === 'top' ? topNodes[parsed.index] : bottomNodes[parsed.index];
  };
  for (const [refA, refB] of built.webs || []) {
    const a = resolveRef(refA);
    const b = resolveRef(refB);
    if (!a || !b || distance2d(a, b) <= EPSILON) continue;
    push(a.id, b.id, 'web');
  }

  return {
    ...base,
    nodes: [...overhangNodes, ...topNodes, ...bottomNodes],
    members,
    bottomOutline: sortedBottom.map((node) => ({ x: node.x, z: node.z, kind: 'bottom_chord' })),
  };
}

function buildBaseLineProfile(metrics, shape, options) {
  switch (shape) {
    case 'flat':
      return buildFlatProfile(metrics);
    case 'hip':
      return Number.isFinite(options?.layoutOffset) && Number.isFinite(options?.supportLength)
        ? buildHipSliceProfile(metrics, options)
        : buildHipProfile(metrics);
    case 'box_gable':
      return buildBoxGableProfile(metrics);
    case 'pyramid_hipped':
      return buildPyramidHippedProfile(metrics);
    case 'domed':
      return buildDomedProfile(metrics);
    case 'dropped_eaves':
      return buildDroppedEavesProfile(metrics);
    case 'shed':
      return buildShedProfile(metrics);
    case 'scissor':
    case 'gable':
    default:
      return buildGableProfile(metrics);
  }
}

/**
 * A truss profile with real members.
 *
 * `options`: `{memberSizes, heel}` from the truss SYSTEM
 * (`getTrussProfileOptions(trussSystem)`; defaults = AU 90 × 35, standard
 * heel), `{layoutOffset, supportLength}` for a hip slice, and `webPatternKey`
 * to force a pattern (the gable end frame passes 'gable_studs').
 */
export function buildTrussProfile(instance, catalog, options = {}) {
  const trussType = resolveTrussType(instance?.trussTypeId, catalog);
  const metrics = resolveTrussMetrics(instance, trussType);
  const shape = metrics.shape || trussType.shape || metrics.family;
  const sizes = resolveMemberSizes(options || {});

  const base = buildBaseLineProfile(metrics, shape, options);
  const webPatternKey =
    shape === 'hip'
      ? null
      : resolveWebPatternKey(shape, instance?.webPatternKey, trussType.webPattern?.key, options?.webPatternKey);
  const ratio = Number(instance?.scissorBottomPitchRatio);
  const lineProfile = webPatternKey
    ? buildPatternLineProfile(base, metrics, shape, webPatternKey, {
        scissorBottomPitchRatio: Number.isFinite(ratio) ? ratio : 0.5,
      })
    : base;
  const { derivedMetrics, ...profile } = applyMemberGeometry(lineProfile, metrics, sizes);

  return {
    trussType,
    metrics: { ...metrics, ...derivedMetrics },
    webPatternKey,
    ...profile,
  };
}

/**
 * The roof-support line of a profile: the top-chord top face raised by the
 * purlins (`purlinDepth`, square to the slope), tails included. An attached
 * roof's underside follows it (spec §7.2).
 */
export function buildTrussRoofSupportOutline(profile, purlinDepth = 0) {
  const tc = Number(profile?.metrics?.topChordDepth) || 0;
  return offsetTrussOutline(profile?.undersideOutline || profile?.roofOutline || [], tc + Math.max(0, purlinDepth));
}
