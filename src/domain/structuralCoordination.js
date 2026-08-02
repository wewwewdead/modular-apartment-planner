import { getBeamRenderData } from '@/geometry/beamGeometry';
import { columnOutline } from '@/geometry/columnGeometry';
import { distanceToSegment, segmentIntersection } from '@/geometry/line';
import { midpoint } from '@/geometry/point';
import { pointInPolygon, polygonArea, polygonCentroid } from '@/geometry/polygon';
import { intersectionArea } from '@/geometry/polygonBoolean';
import { positionOnWall } from '@/geometry/wallGeometry';
import { DESIGN_CONFIDENCE } from './trustModels';

export const DEFAULT_STRUCTURAL_COORDINATION_PROFILE = Object.freeze({
  id: 'gamma_small_rc_apartment_coordination_v1',
  maxBeamPlanningSpan: 6000,
  maxSlabPlanningSpan: 4500,
  maxCantileverPlanningLength: 1500,
  minOpeningClearanceFromColumn: 300,
  source: 'configured_product_assumption_not_structural_design',
});

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

/** Infer candidates once, then persist them as explicit slab support references. */
export function inferSlabSupportRefs(floor, slab) {
  const boundary = slab.boundaryPoints || [];
  if (boundary.length < 3) return [];
  const refs = [];
  for (const beam of floor.beams || []) {
    const renderData = getBeamRenderData(beam, floor.columns || []);
    if (!renderData || !segmentTouchesPolygon(renderData.start, renderData.end, boundary)) continue;
    refs.push({ kind: 'beam', id: beam.id, role: 'internal_or_edge', inference: 'axis_intersects_slab' });
  }
  for (const wall of floor.walls || []) {
    if (wall.structuralRole !== 'loadbearing') continue;
    if (!segmentTouchesPolygon(wall.start, wall.end, boundary)) continue;
    refs.push({ kind: 'wall', id: wall.id, role: 'loadbearing', inference: 'axis_intersects_slab' });
  }
  return refs;
}

function resolveSupport(floor, ref) {
  if (ref?.kind === 'beam') return (floor.beams || []).find((entry) => entry.id === ref.id) || null;
  if (ref?.kind === 'wall') return (floor.walls || []).find((entry) => entry.id === ref.id) || null;
  if (ref?.kind === 'column') return (floor.columns || []).find((entry) => entry.id === ref.id) || null;
  return null;
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

function validateSlabCoordination(floor, slab, profile) {
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
    if (resolveSupport(floor, supportRef)) continue;
    issues.push(
      issue(
        'STRUCT.SLAB_SUPPORT_REFERENCE_BROKEN',
        'error',
        'Slab zone references a support that does not exist on its level.',
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

export function validateStructuralCoordination(project, profileOverride = null) {
  const profile = configuredProfile(project, profileOverride);
  return [
    ...(project.floors || []).flatMap((floor) => [
      ...(floor.beams || []).flatMap((beam) => validateBeamCoordination(floor, beam, profile)),
      ...(floor.slabs || []).flatMap((slab) => validateSlabCoordination(floor, slab, profile)),
      ...validateOpeningsNearColumns(floor, profile),
    ]),
    ...validateLoadbearingWalls(project),
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
        const support = resolveSupport(floor, ref);
        if (!support) continue;
        const supportPoint =
          ref.kind === 'beam'
            ? beamAxis(support, floor)?.midpoint
            : ref.kind === 'wall'
              ? midpoint(support.start, support.end)
              : { x: support.x, y: support.y };
        addEdge({
          from: nodeId('slab', slab.id),
          to: nodeId(ref.kind, ref.id),
          kind: `slab_to_${ref.kind}`,
          floorId: floor.id,
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
