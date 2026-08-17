import { getBeamRenderData } from '@/geometry/beamGeometry';
import { columnOutline } from '@/geometry/columnGeometry';
import { BEAM_SUPPORT_PROXIMITY_MM, beamSupportsOverhang, computeFloorOverhangs } from '@/geometry/floorOverhang';
import { distanceToSegment, segmentIntersection } from '@/geometry/line';
import { dot, midpoint, normalize, subtract } from '@/geometry/point';
import { pointInPolygon, polygonArea, polygonCentroid } from '@/geometry/polygon';
import { intersectionArea } from '@/geometry/polygonBoolean';
import { positionOnWall } from '@/geometry/wallGeometry';
import { getFloorElevation, getOrderedFloors } from './floorModels';
import { DESIGN_CONFIDENCE } from './trustModels';

export const DEFAULT_STRUCTURAL_COORDINATION_PROFILE = Object.freeze({
  id: 'gamma_small_rc_apartment_coordination_v1',
  maxBeamPlanningSpan: 6000,
  maxSlabPlanningSpan: 4500,
  maxCantileverPlanningLength: 1500,
  minCantileverBackSpanRatio: 3,
  minOpeningClearanceFromColumn: 300,
  source: 'configured_product_assumption_not_structural_design',
});

/** A back-span has to run on roughly the way the cantilever came in. */
const BACKSPAN_ALIGNMENT_DEGREES = 15;

/** Under this a projecting edge is a nib or a rebate, not a cantilever. */
const OVERHANG_SUPPORT_REVIEW_DEPTH_MM = 300;

/** How far below a slab soffit a beam top can sit and still be carrying it. */
export const OVERHANG_BEAM_DROP_MM = 600;

/** A beam top fractionally above the soffit is rounding, not a clash. */
export const OVERHANG_BEAM_RISE_MM = 25;

function issue(ruleId, severity, message, entityRefs, inputs, resultKind = 'configured_rule_check') {
  return {
    id: `${ruleId}:${entityRefs.map((ref) => `${ref.type}:${ref.id}`).join('|')}`,
    ruleId,
    category: 'structural_coordination',
    severity,
    message,
    entityRefs,
    evidence: {
      resultKind,
      confidence: DESIGN_CONFIDENCE.CHECKED,
      inputs,
    },
    professionalReviewRequired: true,
  };
}

function projectedWidth(points, angleDegrees) {
  if (!points?.length) return null;
  const angle = (Number(angleDegrees || 0) * Math.PI) / 180;
  const axis = { x: Math.cos(angle), y: Math.sin(angle) };
  const values = points.map((point) => point.x * axis.x + point.y * axis.y);
  return Math.max(...values) - Math.min(...values);
}

function minimumProjectedWidth(points) {
  if (!points || points.length < 3) return null;
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const angle = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI + 90;
    minimum = Math.min(minimum, projectedWidth(points, angle));
  }
  return Number.isFinite(minimum) ? minimum : null;
}

function segmentTouchesPolygon(start, end, polygon) {
  if (pointInPolygon(start, polygon) || pointInPolygon(end, polygon) || pointInPolygon(midpoint(start, end), polygon)) {
    return true;
  }
  const samples = [start, end, midpoint(start, end)];
  if (
    samples.some((sample) =>
      polygon.some((point, index) => distanceToSegment(sample, point, polygon[(index + 1) % polygon.length]) <= 1),
    )
  ) {
    return true;
  }
  for (let index = 0; index < polygon.length; index += 1) {
    if (segmentIntersection(start, end, polygon[index], polygon[(index + 1) % polygon.length])) return true;
  }
  return false;
}

function collectSupportCandidates(source, boundary, inference, refs) {
  for (const beam of source.beams || []) {
    const renderData = getBeamRenderData(beam, source.columns || []);
    if (!renderData || !segmentTouchesPolygon(renderData.start, renderData.end, boundary)) continue;
    refs.push({ kind: 'beam', id: beam.id, role: 'internal_or_edge', inference });
  }
  for (const wall of source.walls || []) {
    if (wall.structuralRole !== 'loadbearing') continue;
    if (!segmentTouchesPolygon(wall.start, wall.end, boundary)) continue;
    refs.push({ kind: 'wall', id: wall.id, role: 'loadbearing', inference });
  }
}

/**
 * Infer candidates once, then persist them as explicit slab support references.
 *
 * The storey below counts. A floor's beams frame the TOP of their own storey,
 * so the members actually under a slab are the ones filed one level down — and
 * a slab that cantilevers past its own frame has no other support to name.
 */
export function inferSlabSupportRefs(floor, slab, floorBelow = null) {
  const boundary = slab.boundaryPoints || [];
  if (boundary.length < 3) return [];
  const refs = [];
  collectSupportCandidates(floor, boundary, 'axis_intersects_slab', refs);
  if (floorBelow) {
    collectSupportCandidates(floorBelow, boundary, 'axis_intersects_slab_from_floor_below', refs);
  }
  return refs;
}

/**
 * Resolve a support reference against a slab's own level and the level below,
 * returning the floor it was found on — a below-floor beam has to be measured
 * with that floor's columns, not the slab's.
 */
function resolveSupport(floors, ref) {
  for (const floor of floors) {
    if (!floor) continue;
    const collection =
      ref?.kind === 'beam'
        ? floor.beams
        : ref?.kind === 'wall'
          ? floor.walls
          : ref?.kind === 'column'
            ? floor.columns
            : null;
    if (!collection) return null;
    const entity = (collection || []).find((entry) => entry.id === ref.id);
    if (entity) return { entity, floor };
  }
  return null;
}

/** Previous floor in stacking order — where a cantilevered slab's supports live. */
function floorBelowIndex(project) {
  const ordered = getOrderedFloors(project);
  const index = new Map();
  ordered.forEach((floor, position) => {
    if (position > 0) index.set(floor.id, ordered[position - 1]);
  });
  return index;
}

function beamAxis(beam, floor) {
  const data = getBeamRenderData(beam, floor.columns || []);
  return data
    ? { start: data.start, end: data.end, midpoint: data.midpoint, length: data.length, outline: data.outline }
    : null;
}

function polygonClearance(first, second) {
  if (intersectionArea(first, second) > 0) return 0;
  let minimum = Number.POSITIVE_INFINITY;
  for (const point of first) {
    for (let index = 0; index < second.length; index += 1) {
      minimum = Math.min(minimum, distanceToSegment(point, second[index], second[(index + 1) % second.length]));
    }
  }
  for (const point of second) {
    for (let index = 0; index < first.length; index += 1) {
      minimum = Math.min(minimum, distanceToSegment(point, first[index], first[(index + 1) % first.length]));
    }
  }
  return minimum;
}

function openingPlanSegment(wall, opening) {
  const half = (opening.width || 0) / 2;
  return [positionOnWall(wall, opening.offset - half), positionOnWall(wall, opening.offset + half)];
}

function openingClearanceToColumn(wall, opening, column) {
  const segment = openingPlanSegment(wall, opening);
  const thinOpening = [
    segment[0],
    segment[1],
    { x: segment[1].x + 0.1, y: segment[1].y + 0.1 },
    { x: segment[0].x + 0.1, y: segment[0].y + 0.1 },
  ];
  return polygonClearance(thinOpening, columnOutline(column));
}

function cantileverSupportColumnId(beam) {
  if (beam.startRef?.kind === 'column') return beam.startRef.id;
  if (beam.endRef?.kind === 'column') return beam.endRef.id;
  return null;
}

/** Split a resolved beam into the end sitting on `columnId` and the far end. */
function orientToColumn(beam, data, columnId) {
  if (beam.startRef?.kind === 'column' && beam.startRef.id === columnId) return { at: data.start, away: data.end };
  if (beam.endRef?.kind === 'column' && beam.endRef.id === columnId) return { at: data.end, away: data.start };
  return null;
}

function directionBetween(from, to) {
  const direction = normalize(subtract(to, from));
  return direction.x === 0 && direction.y === 0 ? null : direction;
}

function angleBetweenDegrees(first, second) {
  return (Math.acos(Math.max(-1, Math.min(1, dot(first, second)))) * 180) / Math.PI;
}

/**
 * The member that takes the cantilever's tail back into the frame: another beam
 * on the same column, carrying on from the support in the direction the
 * cantilever arrived from. Where several qualify the longest one governs —
 * one adequate back-span is enough, so reporting the shortest would be a
 * warning about a member that is not the one doing the work.
 */
function findCantileverBackSpan(floor, beam, data, columnId) {
  const oriented = orientToColumn(beam, data, columnId);
  if (!oriented) return null;
  const inward = directionBetween(oriented.away, oriented.at);
  if (!inward) return null;

  let best = null;
  for (const candidate of floor.beams || []) {
    if (candidate.id === beam.id) continue;
    const candidateData = beamAxis(candidate, floor);
    if (!candidateData) continue;
    const ends = orientToColumn(candidate, candidateData, columnId);
    if (!ends) continue;
    const outward = directionBetween(ends.at, ends.away);
    if (!outward) continue;
    const deviation = angleBetweenDegrees(inward, outward);
    if (deviation > BACKSPAN_ALIGNMENT_DEGREES) continue;
    if (!best || candidateData.length > best.length) {
      best = { beam: candidate, length: candidateData.length, deviationDegrees: deviation };
    }
  }
  return best;
}

function configuredProfile(project, override) {
  return {
    ...DEFAULT_STRUCTURAL_COORDINATION_PROFILE,
    ...(project.building?.systems?.structural?.coordinationProfile || {}),
    ...(override || {}),
  };
}

function validateBeamCoordination(floor, beam, profile) {
  const issues = [];
  const data = beamAxis(beam, floor);
  if (!data) return issues;
  const condition = beam.coordination?.condition || 'typical';
  const configuredMaximum = beam.coordination?.maxPlanningSpan ?? profile.maxBeamPlanningSpan;
  const columnEndCount = [beam.startRef, beam.endRef].filter((ref) => ref?.kind === 'column').length;
  const pointEndCount = [beam.startRef, beam.endRef].filter((ref) => ref?.kind === 'point').length;
  const baseInputs = { profileId: profile.id, profileSource: profile.source, floorId: floor.id, condition };

  if (condition === 'cantilever') {
    if (columnEndCount !== 1 || pointEndCount !== 1) {
      issues.push(
        issue(
          'STRUCT.CANTILEVER_INTENT_INVALID',
          'error',
          'Cantilever intent requires exactly one column support and one free point end.',
          [{ type: 'beam', id: beam.id }],
          { ...baseInputs, columnEndCount, pointEndCount },
          'verified_relationship',
        ),
      );
    }
    if (data.length > profile.maxCantileverPlanningLength) {
      issues.push(
        issue(
          'STRUCT.CANTILEVER_EXCEEDS_ASSUMPTION',
          'warning',
          'Cantilever length exceeds the configured early-planning assumption.',
          [{ type: 'beam', id: beam.id }],
          { ...baseInputs, measuredLength: data.length, configuredMaximum: profile.maxCantileverPlanningLength },
        ),
      );
    }

    const supportColumnId = columnEndCount === 1 && pointEndCount === 1 ? cantileverSupportColumnId(beam) : null;
    if (supportColumnId) {
      const backSpan = findCantileverBackSpan(floor, beam, data, supportColumnId);
      const requiredRatio = profile.minCantileverBackSpanRatio;
      if (!backSpan) {
        issues.push(
          issue(
            'STRUCT.CANTILEVER_NO_BACKSPAN',
            'warning',
            'No continuous back-span member is modeled at this cantilever support; verify how the tail is held down during engineering design.',
            [
              { type: 'beam', id: beam.id },
              { type: 'column', id: supportColumnId },
            ],
            {
              ...baseInputs,
              cantileverLength: data.length,
              alignmentToleranceDegrees: BACKSPAN_ALIGNMENT_DEGREES,
            },
            'verified_relationship',
          ),
        );
      } else if (requiredRatio != null && backSpan.length < requiredRatio * data.length) {
        issues.push(
          issue(
            'STRUCT.CANTILEVER_BACKSPAN_INSUFFICIENT',
            'warning',
            `Back-span is shorter than the configured planning assumption of ${requiredRatio}x the cantilever length.`,
            [
              { type: 'beam', id: beam.id },
              { type: 'beam', id: backSpan.beam.id },
            ],
            {
              ...baseInputs,
              cantileverLength: data.length,
              backSpanLength: backSpan.length,
              measuredRatio: data.length > 0 ? backSpan.length / data.length : null,
              configuredMinimumRatio: requiredRatio,
              alignmentDeviationDegrees: backSpan.deviationDegrees,
            },
          ),
        );
      }
    }
  }

  if (condition === 'transfer') {
    issues.push(
      issue(
        'STRUCT.TRANSFER_CONDITION_REQUIRES_ENGINEER',
        'warning',
        'Transfer-beam intent is modeled and requires explicit structural-engineer design.',
        [{ type: 'beam', id: beam.id }],
        {
          ...baseInputs,
          transferReason: beam.coordination?.transferReason || '',
          supportedElementRefs: beam.coordination?.supportedElementRefs || [],
        },
        'modeled_engineering_intent',
      ),
    );
    if (!beam.coordination?.transferReason?.trim()) {
      issues.push(
        issue(
          'STRUCT.TRANSFER_REASON_MISSING',
          'error',
          'Transfer-beam intent requires a traceable reason.',
          [{ type: 'beam', id: beam.id }],
          { ...baseInputs },
          'verified_relationship',
        ),
      );
    }
  }

  if (condition !== 'cantilever' && configuredMaximum != null && data.length > configuredMaximum) {
    issues.push(
      issue(
        'STRUCT.BEAM_SPAN_EXCEEDS_ASSUMPTION',
        'warning',
        'Beam span exceeds the configured early-planning assumption.',
        [{ type: 'beam', id: beam.id }],
        { ...baseInputs, measuredSpan: data.length, configuredMaximum },
      ),
    );
  }
  return issues;
}

function validateSlabCoordination(floor, slab, profile, floorBelow = null) {
  const issues = [];
  const refs = [{ type: 'slab', id: slab.id }];
  const baseInputs = { profileId: profile.id, profileSource: profile.source, floorId: floor.id };
  const supportRefs = slab.supportRefs || [];
  if (supportRefs.length < 2) {
    issues.push(
      issue(
        'STRUCT.SLAB_SUPPORTS_INCOMPLETE',
        'warning',
        'Slab zone has fewer than two explicit support references.',
        refs,
        { ...baseInputs, supportCount: supportRefs.length, requiredMinimum: 2 },
        'verified_relationship',
      ),
    );
  }
  for (const supportRef of supportRefs) {
    if (resolveSupport([floor, floorBelow], supportRef)) continue;
    issues.push(
      issue(
        'STRUCT.SLAB_SUPPORT_REFERENCE_BROKEN',
        'error',
        'Slab zone references a support that does not exist on its level or the level below.',
        [...refs, { type: supportRef.kind || 'support', id: supportRef.id || 'missing' }],
        { ...baseInputs, supportRef },
        'verified_relationship',
      ),
    );
  }

  const measuredSpan =
    slab.coordination?.spanDirection == null
      ? minimumProjectedWidth(slab.boundaryPoints || [])
      : projectedWidth(slab.boundaryPoints || [], slab.coordination.spanDirection);
  const configuredMaximum = slab.coordination?.maxPlanningSpan ?? profile.maxSlabPlanningSpan;
  if (measuredSpan != null && configuredMaximum != null && measuredSpan > configuredMaximum) {
    issues.push(
      issue(
        'STRUCT.SLAB_SPAN_EXCEEDS_ASSUMPTION',
        'warning',
        'Slab-zone planning span exceeds the configured early-coordination assumption.',
        refs,
        {
          ...baseInputs,
          measuredSpan,
          configuredMaximum,
          spanDirection: slab.coordination?.spanDirection ?? 'minimum_projected_width',
        },
      ),
    );
  }

  for (const opening of slab.openings || []) {
    const openingRefs = [...refs, { type: 'slabOpening', id: opening.id }];
    const openingArea = polygonArea(opening.boundaryPoints || []);
    const withinArea = intersectionArea(slab.boundaryPoints || [], opening.boundaryPoints || []);
    if (openingArea <= 0 || openingArea - withinArea > 1) {
      issues.push(
        issue(
          'STRUCT.SLAB_OPENING_OUTSIDE_ZONE',
          'error',
          'Slab opening is not fully contained by its host slab zone.',
          openingRefs,
          { ...baseInputs, openingArea, withinArea },
          'verified_geometry',
        ),
      );
    }
    for (const beam of floor.beams || []) {
      const data = beamAxis(beam, floor);
      if (!data) continue;
      const overlapArea = intersectionArea(opening.boundaryPoints || [], data.outline);
      if (overlapArea <= 1) continue;
      issues.push(
        issue(
          'STRUCT.SLAB_OPENING_INTERSECTS_BEAM',
          'error',
          'Slab opening intersects a modeled beam in plan.',
          [...openingRefs, { type: 'beam', id: beam.id }],
          { ...baseInputs, overlapArea, units: 'mm²' },
          'verified_geometry',
        ),
      );
    }
  }
  return issues;
}

function validateOpeningsNearColumns(floor, profile) {
  const issues = [];
  const walls = new Map((floor.walls || []).map((wall) => [wall.id, wall]));
  const openings = [
    ...(floor.doors || []).map((entry) => ({ ...entry, kind: 'door' })),
    ...(floor.windows || []).map((entry) => ({ ...entry, kind: 'window' })),
  ];
  for (const opening of openings) {
    const wall = walls.get(opening.wallId);
    if (!wall) continue;
    for (const column of floor.columns || []) {
      const clearance = openingClearanceToColumn(wall, opening, column);
      if (clearance === 0) {
        issues.push(
          issue(
            'STRUCT.OPENING_INTERSECTS_COLUMN',
            'error',
            `${opening.kind === 'door' ? 'Door' : 'Window'} intersects a modeled column.`,
            [
              { type: opening.kind, id: opening.id },
              { type: 'column', id: column.id },
            ],
            {
              profileId: profile.id,
              profileSource: profile.source,
              floorId: floor.id,
              measuredClearance: 0,
              configuredMinimum: profile.minOpeningClearanceFromColumn,
            },
            'verified_geometry',
          ),
        );
        continue;
      }
      if (clearance >= profile.minOpeningClearanceFromColumn) continue;
      issues.push(
        issue(
          'STRUCT.OPENING_NEAR_COLUMN',
          'warning',
          `${opening.kind === 'door' ? 'Door' : 'Window'} is close to a modeled column.`,
          [
            { type: opening.kind, id: opening.id },
            { type: 'column', id: column.id },
          ],
          {
            profileId: profile.id,
            profileSource: profile.source,
            floorId: floor.id,
            measuredClearance: clearance,
            configuredMinimum: profile.minOpeningClearanceFromColumn,
          },
        ),
      );
    }
  }
  return issues;
}

function validateLoadbearingWalls(project) {
  const issues = [];
  for (const floor of project.floors || []) {
    for (const wall of floor.walls || []) {
      if (wall.structuralRole !== 'loadbearing') continue;
      if (!wall.supportRef) {
        issues.push(
          issue(
            'STRUCT.LOADBEARING_WALL_SUPPORT_MISSING',
            'warning',
            'Loadbearing wall has no explicit supporting member or foundation relationship.',
            [{ type: 'wall', id: wall.id }],
            { floorId: floor.id, structuralRole: wall.structuralRole },
            'verified_relationship',
          ),
        );
      }
    }
  }
  return issues;
}

function slabSoffitLevel(slab, floor) {
  const top = Number.isFinite(slab?.elevation) ? slab.elevation : getFloorElevation(floor);
  const thickness = Number.isFinite(slab?.thickness) ? slab.thickness : 0;
  return top - thickness;
}

/**
 * Every resolvable beam axis in the project, whichever floor it is filed on.
 * Beam levels are absolute, and the beam carrying an upper slab's overhang is
 * normally recorded one storey down — restricting the search to the slab's own
 * floor would report every real cantilever as unsupported.
 */
function projectBeamAxes(project) {
  const axes = [];
  for (const floor of project.floors || []) {
    for (const beam of floor.beams || []) {
      const data = beamAxis(beam, floor);
      if (!data) continue;
      axes.push({ beam, floorId: floor.id, start: data.start, end: data.end });
    }
  }
  return axes;
}

/**
 * Slabs that reach past the storey below them. Planning assumptions only — the
 * depth is measured plan geometry, and what a given depth can actually carry is
 * an engineering question this never answers.
 */
function validateSlabOverhangs(project, profile) {
  const overhangs = computeFloorOverhangs(project);
  if (!overhangs.length) return [];

  const floorsById = new Map((project.floors || []).map((floor) => [floor.id, floor]));
  const beamAxes = projectBeamAxes(project);
  const issues = [];

  for (const overhang of overhangs) {
    const floor = floorsById.get(overhang.floorId);
    const slab = (floor?.slabs || []).find((entry) => entry.id === overhang.slabId);
    if (!slab) continue;

    const refs = [{ type: 'slab', id: slab.id }];
    const baseInputs = {
      profileId: profile.id,
      profileSource: profile.source,
      floorId: overhang.floorId,
      belowFloorId: overhang.belowFloorId,
      measuredOverhang: overhang.maxDepthMm,
    };

    if (overhang.maxDepthMm > profile.maxCantileverPlanningLength) {
      issues.push(
        issue(
          'STRUCT.SLAB_OVERHANG_EXCEEDS_ASSUMPTION',
          'warning',
          'Slab reaches past the floor below by more than the configured early-planning cantilever assumption.',
          refs,
          { ...baseInputs, configuredMaximum: profile.maxCantileverPlanningLength },
          'verified_geometry',
        ),
      );
    }

    if (overhang.maxDepthMm <= OVERHANG_SUPPORT_REVIEW_DEPTH_MM) continue;

    const soffitLevel = slabSoffitLevel(slab, floor);
    const carried = beamAxes.some(
      (entry) =>
        Number.isFinite(entry.beam.floorLevel) &&
        entry.beam.floorLevel >= soffitLevel - OVERHANG_BEAM_DROP_MM &&
        entry.beam.floorLevel <= soffitLevel + OVERHANG_BEAM_RISE_MM &&
        beamSupportsOverhang(entry, overhang.overhangEdges),
    );
    if (carried) continue;

    issues.push(
      issue(
        'STRUCT.SLAB_OVERHANG_UNSUPPORTED',
        'warning',
        'No modeled beam sits under this projecting slab edge; the overhang has no coordinated support in the model.',
        refs,
        {
          ...baseInputs,
          slabSoffitLevel: soffitLevel,
          reviewDepthThreshold: OVERHANG_SUPPORT_REVIEW_DEPTH_MM,
          beamTopSearchBand: [soffitLevel - OVERHANG_BEAM_DROP_MM, soffitLevel + OVERHANG_BEAM_RISE_MM],
          beamProximityAllowance: BEAM_SUPPORT_PROXIMITY_MM,
        },
        'verified_relationship',
      ),
    );
  }

  return issues;
}

export function validateStructuralCoordination(project, profileOverride = null) {
  const profile = configuredProfile(project, profileOverride);
  const below = floorBelowIndex(project);
  return [
    ...(project.floors || []).flatMap((floor) => [
      ...(floor.beams || []).flatMap((beam) => validateBeamCoordination(floor, beam, profile)),
      ...(floor.slabs || []).flatMap((slab) =>
        validateSlabCoordination(floor, slab, profile, below.get(floor.id) || null),
      ),
      ...validateOpeningsNearColumns(floor, profile),
    ]),
    ...validateLoadbearingWalls(project),
    ...validateSlabOverhangs(project, profile),
  ];
}

function nodeId(kind, id) {
  return `${kind}:${id}`;
}

/**
 * Relationship diagram only: no loads, reactions, capacity, or safety result.
 */
export function deriveConceptualLoadPath(project) {
  const nodes = [];
  const edges = [];
  const nodeIds = new Set();
  const below = floorBelowIndex(project);
  const addNode = (node) => {
    if (nodeIds.has(node.id)) return;
    nodeIds.add(node.id);
    nodes.push(node);
  };
  const addEdge = (edge) => edges.push({ id: `${edge.from}->${edge.to}:${edge.kind}`, ...edge });
  const floorIndex = new Map((project.floors || []).map((floor, index) => [floor.id, index]));

  for (const floor of project.floors || []) {
    for (const column of floor.columns || []) {
      addNode({
        id: nodeId('column', column.id),
        kind: 'column',
        entityId: column.id,
        floorId: floor.id,
        point: { x: column.x, y: column.y },
      });
    }
    for (const beam of floor.beams || []) {
      const data = beamAxis(beam, floor);
      if (!data) continue;
      addNode({
        id: nodeId('beam', beam.id),
        kind: 'beam',
        entityId: beam.id,
        floorId: floor.id,
        point: data.midpoint,
        condition: beam.coordination?.condition || 'typical',
      });
      for (const ref of [beam.startRef, beam.endRef]) {
        if (ref?.kind !== 'column') continue;
        addEdge({
          from: nodeId('beam', beam.id),
          to: nodeId('column', ref.id),
          kind: 'beam_to_column',
          floorId: floor.id,
          fromPoint: data.midpoint,
          toPoint: (floor.columns || []).find((column) => column.id === ref.id) || null,
        });
      }
    }
    for (const slab of floor.slabs || []) {
      const center = polygonCentroid(slab.boundaryPoints || []);
      addNode({ id: nodeId('slab', slab.id), kind: 'slab', entityId: slab.id, floorId: floor.id, point: center });
      for (const ref of slab.supportRefs || []) {
        // A cantilevered slab is carried by members filed one storey down, so
        // the level below is part of the search — otherwise the slab reads as
        // unsupported in the graph while standing on a real beam.
        const resolved = resolveSupport([floor, below.get(floor.id) || null], ref);
        if (!resolved) continue;
        const { entity: support, floor: supportFloor } = resolved;
        const supportPoint =
          ref.kind === 'beam'
            ? beamAxis(support, supportFloor)?.midpoint
            : ref.kind === 'wall'
              ? midpoint(support.start, support.end)
              : { x: support.x, y: support.y };
        addEdge({
          from: nodeId('slab', slab.id),
          to: nodeId(ref.kind, ref.id),
          kind: `slab_to_${ref.kind}`,
          floorId: floor.id,
          supportFloorId: supportFloor.id,
          fromPoint: center,
          toPoint: supportPoint,
        });
      }
    }
  }

  for (const stack of project.building?.systems?.structural?.columnStacks || []) {
    const refs = [...(stack.columnRefs || [])].sort(
      (a, b) => (floorIndex.get(b.floorId) || 0) - (floorIndex.get(a.floorId) || 0),
    );
    for (let index = 0; index < refs.length - 1; index += 1) {
      const upper = refs[index];
      const lower = refs[index + 1];
      addEdge({
        from: nodeId('column', upper.columnId),
        to: nodeId('column', lower.columnId),
        kind: 'column_to_column_below',
        floorId: upper.floorId,
        fromPoint: stack.origin,
        toPoint: stack.origin,
      });
    }
  }

  const outgoing = new Map();
  for (const edge of edges) outgoing.set(edge.from, (outgoing.get(edge.from) || 0) + 1);
  const unsupportedNodeIds = nodes
    .filter((node) => ['slab', 'beam'].includes(node.kind) && !outgoing.has(node.id))
    .map((node) => node.id);
  return {
    nodes,
    edges,
    unsupportedNodeIds,
    transferNodeIds: nodes.filter((node) => node.condition === 'transfer').map((node) => node.id),
    summary: {
      nodeCount: nodes.length,
      relationshipCount: edges.length,
      unsupportedNodeCount: unsupportedNodeIds.length,
      transferConditionCount: nodes.filter((node) => node.condition === 'transfer').length,
    },
    resultKind: 'conceptual_relationship_diagram',
    confidence: DESIGN_CONFIDENCE.CHECKED,
    professionalReviewRequired: true,
  };
}

export function structuralProfile(project) {
  return configuredProfile(project);
}
