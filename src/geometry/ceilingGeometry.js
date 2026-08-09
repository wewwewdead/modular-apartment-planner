import { CEILING_HANGER_PLAN_SIZE, CEILING_WALL_ANGLE_LEG } from '@/domain/defaults';
import { deriveCeilingDetail, getCeilingLocalSpace, resolveCeilingBoundary } from '@/domain/ceilingModels';

// Square footprint for a suspension rod/wire — thin enough to read as a hanger,
// thick enough to survive the preview's 1 mm minimum box dimension. Hanger
// placement keeps half of this clear of every ceiling edge, so the box drawn
// here is exactly the space the domain reserved for it.
const HANGER_PLAN_SIZE = CEILING_HANGER_PLAN_SIZE;
// Manual-mode ceilings sit directly on their attachment plane, so the grid has
// nothing to hang from; anything shorter than this is a modelling artefact.
const MIN_HANGER_LENGTH = 5;

function createBoundsFromPoints(points, baseElevation, topElevation) {
  if (!points?.length) {
    return {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      minElevation: baseElevation,
      maxElevation: topElevation,
    };
  }

  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
    minElevation: baseElevation,
    maxElevation: topElevation,
  };
}

function createPrismDescriptor(id, kind, outline, baseElevation, height, metadata = {}) {
  return {
    id,
    kind,
    geometry: 'prism',
    // Winding is not normalised here: the ceiling's V axis is flipped relative
    // to plan Y, so every local→plan conversion reverses the loop. ExtrudeGeometry
    // forces the shape clockwise and its holes counter-clockwise regardless.
    outline: outline.map((point) => ({ x: point.x, y: point.y })),
    holes: (metadata.holes || []).map((hole) => hole.map((point) => ({ x: point.x, y: point.y }))),
    baseElevation,
    height,
    materialKey: metadata.materialKey || kind,
    metadata,
    bounds: createBoundsFromPoints(outline, baseElevation, baseElevation + height),
  };
}

function createBoxDescriptor(id, kind, center, size, baseElevation, metadata = {}) {
  const halfX = size.x / 2;
  const halfZ = size.z / 2;
  const corners = [
    { x: center.x - halfX, y: center.y - halfZ },
    { x: center.x + halfX, y: center.y - halfZ },
    { x: center.x + halfX, y: center.y + halfZ },
    { x: center.x - halfX, y: center.y + halfZ },
  ];

  return {
    id,
    kind,
    geometry: 'box',
    center: { x: center.x, y: center.y },
    size,
    rotation: 0,
    baseElevation,
    materialKey: metadata.materialKey || kind,
    metadata,
    bounds: createBoundsFromPoints(corners, baseElevation, baseElevation + size.y),
  };
}

function createSegmentDescriptor(id, kind, startPlan, endPlan, elevation, leg, metadata = {}) {
  return {
    id,
    kind,
    geometry: 'segment3d',
    // World space: x = plan x, y = elevation, z = plan y (see planPointToWorld).
    start: { x: startPlan.x, y: elevation, z: startPlan.y },
    end: { x: endPlan.x, y: elevation, z: endPlan.y },
    thickness: leg,
    crossSection: { width: leg, height: leg },
    materialKey: metadata.materialKey || kind,
    metadata,
    bounds: {
      minX: Math.min(startPlan.x, endPlan.x),
      maxX: Math.max(startPlan.x, endPlan.x),
      minY: Math.min(startPlan.y, endPlan.y),
      maxY: Math.max(startPlan.y, endPlan.y),
      minElevation: elevation - leg / 2,
      maxElevation: elevation + leg / 2,
    },
  };
}

/**
 * Ceiling → 3D preview descriptors (pure; no three.js).
 *
 * Boards extrude as prisms from the board underside, the furring/carrier grid
 * stacks above them, wall angles ring the boundary and hangers bridge the
 * carrier tops up to the attachment plane. Fasteners are deliberately omitted:
 * a room's worth of screws is thousands of tiny meshes in the main scene, and
 * they only ever read at ceiling-detail zoom.
 */
export function buildCeilingPreviewObjects(ceiling, project) {
  if (!ceiling) return [];

  const detail = deriveCeilingDetail(ceiling, project);
  const { configuration, elevations } = detail;
  if (!configuration.enabled || !configuration.face.enabled) return [];
  if (detail.length <= 0 || detail.depth <= 0) return [];

  const space = getCeilingLocalSpace(resolveCeilingBoundary(project, ceiling));
  const toPlan = (point) => space.toPlan(point);
  const shared = { ceilingId: ceiling.id, floorId: ceiling.floorId, sourceId: ceiling.id };

  const boards = detail.panels.flatMap((panel) =>
    panel.regions
      .filter((region) => (region.outline || []).length >= 3)
      .map((region, regionIndex) =>
        createPrismDescriptor(
          `${panel.id}:region:${regionIndex}`,
          'ceiling',
          region.outline.map(toPlan),
          elevations.boardUnderside,
          configuration.face.boardThickness,
          {
            ...shared,
            materialKey: 'ceilingBoard',
            ceilingDetailKind: 'panel',
            panelLabel: panel.label,
            holes: (region.holes || []).map((hole) => hole.map(toPlan)),
          },
        ),
      ),
  );

  const framing = detail.framing
    .map((member) => {
      if (member.kind === 'wall_angle') {
        return createSegmentDescriptor(
          member.id,
          'ceiling',
          toPlan(member.start),
          toPlan(member.end),
          elevations.furringBottom + CEILING_WALL_ANGLE_LEG / 2,
          CEILING_WALL_ANGLE_LEG,
          { ...shared, materialKey: 'ceilingFraming', ceilingDetailKind: 'framing', framingKind: member.kind },
        );
      }

      // Local U runs with plan x and local V runs against plan y, so both rect
      // spans stay positive extents once the centre is converted back to plan.
      const spanX = member.u1 - member.u0;
      const spanZ = member.v1 - member.v0;
      if (spanX <= 0 || spanZ <= 0) return null;

      return createBoxDescriptor(
        member.id,
        'ceiling',
        toPlan({ u: (member.u0 + member.u1) / 2, v: (member.v0 + member.v1) / 2 }),
        { x: spanX, y: member.depth, z: spanZ },
        member.kind === 'carrier' ? elevations.carrierBottom : elevations.furringBottom,
        { ...shared, materialKey: 'ceilingFraming', ceilingDetailKind: 'framing', framingKind: member.kind },
      );
    })
    .filter(Boolean);

  const hangerLength = elevations.attachment - elevations.carrierTop;
  const hangers =
    hangerLength >= MIN_HANGER_LENGTH
      ? detail.hangers.map((hanger) =>
          createBoxDescriptor(
            hanger.id,
            'ceiling',
            toPlan(hanger),
            { x: HANGER_PLAN_SIZE, y: hangerLength, z: HANGER_PLAN_SIZE },
            elevations.carrierTop,
            { ...shared, materialKey: 'ceilingHanger', ceilingDetailKind: 'hanger' },
          ),
        )
      : [];

  return [...boards, ...framing, ...hangers];
}
