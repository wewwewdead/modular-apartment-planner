import { createTrussMember, createTrussNode, resolveTrussType } from '@/domain/trussModels';

const EPSILON = 1e-6;

function lerp(a, b, t) {
  return a + ((b - a) * t);
}

function createLocalNodeMap(points, prefix) {
  return points.map((point, index) => createTrussNode(point.x, point.z, {
    id: `${prefix}_${index}`,
    kind: point.kind,
  }));
}

function addMember(members, startNodeId, endNodeId, memberType, index) {
  if (!startNodeId || !endNodeId || startNodeId === endNodeId) return;
  members.push(createTrussMember(startNodeId, endNodeId, {
    id: `${memberType}_${index}`,
    memberType,
  }));
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

function buildProfileFromStructuralOutline(metrics, structuralOutline, options = {}) {
  const webMode = options.webMode || (metrics.family === 'gable' ? 'gable' : 'alternating');
  const bottomPoints = createBottomPoints(metrics);
  const topPoints = bottomPoints.map((point, index) => {
    const sampled = sampleOutlineAtX(structuralOutline, point.x);
    return {
      x: point.x,
      z: sampled.z,
      kind: sampled.z >= Math.max(...structuralOutline.map((entry) => entry.z)) - EPSILON
        ? (metrics.family === 'gable' ? 'ridge' : 'top_chord')
        : 'top_chord',
    };
  });

  const overhangPoints = [
    { x: -metrics.overhangStart, z: structuralOutline[0]?.z || 0, kind: 'overhang' },
    { x: metrics.span + metrics.overhangEnd, z: structuralOutline[structuralOutline.length - 1]?.z || 0, kind: 'overhang' },
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
    nodes: [...overhangNodes, ...topNodes, ...bottomNodes],
    members,
    roofOutline: [
      { x: -metrics.overhangStart, z: structuralOutline[0]?.z || 0 },
      ...structuralOutline,
      { x: metrics.span + metrics.overhangEnd, z: structuralOutline[structuralOutline.length - 1]?.z || 0 },
    ],
    bottomOutline: bottomPoints,
    topChordRuns: options.topChordRuns || [{
      id: 'main',
      side: 'main',
      points: structuralOutline,
    }],
  };
}

export function resolveTrussMetrics(instance, trussType = resolveTrussType(instance?.trussTypeId)) {
  const family = trussType.family;
  const shape = trussType.shape || family;
  const span = Math.max(Number(instance?.span || trussType.defaultSpan || 0), 1000);
  const run = family === 'gable' ? span / 2 : span;
  const defaultPitch = Number(trussType.defaultPitch || 0);
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

  const riseFromPitch = ((Number.isFinite(explicitPitch) ? explicitPitch : defaultPitch) / 100) * Math.max(run, 1);
  const rise = Number.isFinite(explicitRise) ? Math.max(0, explicitRise) : Math.max(0, riseFromPitch || defaultRise);
  const pitch = Number.isFinite(explicitPitch)
    ? Math.max(0, explicitPitch)
    : ((rise / Math.max(run, 1)) * 100);

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
    const z = ratio <= 0.5
      ? lerp(0, metrics.rise, ratio / 0.5)
      : lerp(metrics.rise, 0, (ratio - 0.5) / 0.5);
    topPoints.push({ x, z, kind: index === Math.floor(metrics.panelCount / 2) ? 'ridge' : 'top_chord' });
  }

  const bottomPoints = createBottomPoints(metrics);
  const overhangPoints = [
    { x: -metrics.overhangStart, z: 0, kind: 'overhang' },
    { x: metrics.span + metrics.overhangEnd, z: 0, kind: 'overhang' },
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
    roofOutline: [
      { x: -metrics.overhangStart, z: 0 },
      ...topPoints,
      { x: metrics.span + metrics.overhangEnd, z: 0 },
    ],
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
    { x: -metrics.overhangStart, z: 0, kind: 'overhang' },
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
    roofOutline: [
      { x: -metrics.overhangStart, z: 0 },
      ...topPoints,
      { x: metrics.span + metrics.overhangEnd, z: overhangPoints[1].z },
    ],
    bottomOutline: bottomPoints,
    topChordRuns: [{ id: 'main', side: 'main', points: topPoints }],
  };
}

function buildFlatProfile(metrics) {
  const structuralOutline = uniqueOutlinePoints([
    { x: 0, z: metrics.rise },
    { x: metrics.span, z: metrics.rise },
  ]);

  return buildProfileFromStructuralOutline(metrics, structuralOutline, {
    webMode: 'alternating',
    topChordRuns: [{ id: 'main', side: 'main', points: structuralOutline }],
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
  const endDistance = supportLength > EPSILON
    ? Math.max(0, Math.min(layoutOffset, supportLength - layoutOffset))
    : halfSpan;
  const clippedRun = Math.max(0, Math.min(halfSpan, endDistance));
  const localRise = metrics.rise * (clippedRun / halfSpan);

  if (clippedRun <= EPSILON || localRise <= EPSILON) {
    return buildFlatProfile({
      ...metrics,
      rise: 0,
    });
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
  const structuralOutline = uniqueOutlinePoints(Array.from({ length: segments + 1 }, (_, index) => {
    const ratio = index / segments;
    const x = metrics.span * ratio;
    const z = metrics.rise * Math.sin(Math.PI * ratio);
    return {
      x,
      z: Math.max(0, z),
    };
  }));

  return buildProfileFromStructuralOutline(metrics, structuralOutline, {
    webMode: 'gable',
    topChordRuns: [{
      id: 'main',
      side: 'main',
      points: structuralOutline,
      measurementCurve: {
        kind: 'sine_arch',
        startX: 0,
        endX: metrics.span,
        rise: metrics.rise,
      },
    }],
  });
}

export function buildTrussProfile(instance, catalog, options = {}) {
  const trussType = resolveTrussType(instance?.trussTypeId, catalog);
  const metrics = resolveTrussMetrics(instance, trussType);
  const shape = metrics.shape || trussType.shape || metrics.family;

  let profile;
  switch (shape) {
    case 'flat':
      profile = buildFlatProfile(metrics);
      break;
    case 'hip':
      profile = Number.isFinite(options?.layoutOffset) && Number.isFinite(options?.supportLength)
        ? buildHipSliceProfile(metrics, options)
        : buildHipProfile(metrics);
      break;
    case 'box_gable':
      profile = buildBoxGableProfile(metrics);
      break;
    case 'pyramid_hipped':
      profile = buildPyramidHippedProfile(metrics);
      break;
    case 'domed':
      profile = buildDomedProfile(metrics);
      break;
    case 'dropped_eaves':
      profile = buildDroppedEavesProfile(metrics);
      break;
    case 'shed':
      profile = buildShedProfile(metrics);
      break;
    case 'gable':
    default:
      profile = buildGableProfile(metrics);
      break;
  }

  return {
    trussType,
    metrics,
    ...profile,
  };
}
