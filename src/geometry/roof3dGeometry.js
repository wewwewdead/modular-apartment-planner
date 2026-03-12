import { wallLength, wallOutline } from './wallGeometry';
import { buildRoofPlaneGeometry } from './roofPlaneGeometry';
import { resolveParapetLine } from './roofPlanGeometry';

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

function createBoundsFromMeshPoints(points = []) {
  if (!points.length) {
    return {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      minElevation: 0,
      maxElevation: 0,
    };
  }

  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
    minElevation: Math.min(...points.map((point) => point.bottomElevation)),
    maxElevation: Math.max(...points.map((point) => point.topElevation)),
  };
}

function createPrismDescriptor(id, kind, outline, baseElevation, height, metadata = {}) {
  const topElevation = baseElevation + height;
  return {
    id,
    kind,
    geometry: 'prism',
    outline: outline.map((point) => ({ x: point.x, y: point.y })),
    holes: (metadata.holes || []).map((hole) => hole.map((point) => ({ x: point.x, y: point.y }))),
    baseElevation,
    height,
    materialKey: metadata.materialKey || kind,
    metadata,
    bounds: createBoundsFromPoints(outline, baseElevation, topElevation),
  };
}

function createRoofMeshDescriptor(id, kind, surfaces, outerBoundary, metadata = {}) {
  const meshPoints = [
    ...outerBoundary,
    ...surfaces.flatMap((surface) => surface.outline || []),
  ];

  return {
    id,
    kind,
    geometry: 'roofMesh',
    surfaces,
    outerBoundary,
    materialKey: metadata.materialKey || kind,
    metadata,
    bounds: createBoundsFromMeshPoints(meshPoints),
  };
}

function createLinearBoxDescriptor(id, kind, startPoint, endPoint, width, baseElevation, height, metadata = {}) {
  const outline = wallOutline({
    start: { x: startPoint.x, y: startPoint.y },
    end: { x: endPoint.x, y: endPoint.y },
    thickness: width,
  });
  const angle = Math.atan2(endPoint.y - startPoint.y, endPoint.x - startPoint.x);
  const topElevation = baseElevation + height;

  return {
    id,
    kind,
    geometry: 'box',
    center: {
      x: (startPoint.x + endPoint.x) / 2,
      y: (startPoint.y + endPoint.y) / 2,
    },
    size: {
      x: wallLength({ start: startPoint, end: endPoint }),
      y: height,
      z: width,
    },
    rotation: angle,
    baseElevation,
    materialKey: metadata.materialKey || kind,
    metadata,
    bounds: createBoundsFromPoints(outline, baseElevation, topElevation),
  };
}

function createBoxDescriptor(id, kind, center, size, baseElevation, rotation = 0, metadata = {}) {
  const halfX = size.x / 2;
  const halfZ = size.z / 2;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const corners = [
    { x: -halfX, y: -halfZ },
    { x: halfX, y: -halfZ },
    { x: halfX, y: halfZ },
    { x: -halfX, y: halfZ },
  ].map((point) => ({
    x: center.x + (point.x * cos - point.y * sin),
    y: center.y + (point.x * sin + point.y * cos),
  }));

  return {
    id,
    kind,
    geometry: 'box',
    center: { x: center.x, y: center.y },
    size,
    rotation,
    baseElevation,
    materialKey: metadata.materialKey || kind,
    metadata,
    bounds: createBoundsFromPoints(corners, baseElevation, baseElevation + size.y),
  };
}

export function buildRoofPreviewObjects(roofSystem) {
  if (!roofSystem || (roofSystem.boundaryPolygon || []).length < 3) return [];

  const roofGeometry = buildRoofPlaneGeometry(roofSystem);
  const roofOutline = roofGeometry.roofOutlineWithElevations || [];
  const slab = (roofSystem.roofType || 'flat') === 'flat'
    ? createPrismDescriptor(
        roofSystem.id,
        'roofSystem',
        roofSystem.boundaryPolygon,
        roofSystem.baseElevation ?? 0,
        roofSystem.slabThickness ?? 0,
        {
          sourceId: roofSystem.id,
          materialKey: 'roof',
          holes: (roofSystem.roofOpenings || []).map((opening) => opening.boundaryPoints || []),
        }
      )
    : createRoofMeshDescriptor(
        roofSystem.id,
        'roofSystem',
        (roofGeometry.planes || []).map((plane) => ({
          id: plane.id,
          outline: (plane.outline || []).map((point) => ({
            x: point.x,
            y: point.y,
            topElevation: plane.getSurfaceElevation
              ? plane.getSurfaceElevation(point, 'top')
              : roofGeometry.getSurfaceElevation(point, 'top'),
            bottomElevation: plane.getSurfaceElevation
              ? plane.getSurfaceElevation(point, 'bottom')
              : roofGeometry.getSurfaceElevation(point, 'bottom'),
          })),
        })),
        roofOutline,
        {
          sourceId: roofSystem.id,
          materialKey: 'roof',
        }
      );

  const parapets = (roofSystem.parapets || [])
    .map((parapet) => {
      const resolved = resolveParapetLine(parapet, roofSystem);
      if (!resolved?.startPoint || !resolved?.endPoint) return null;

      return createLinearBoxDescriptor(
        parapet.id,
        'parapet',
        resolved.startPoint,
        resolved.endPoint,
        parapet.thickness ?? 0,
        (roofSystem.roofType || 'flat') === 'flat'
          ? (roofSystem.baseElevation ?? 0) + (roofSystem.slabThickness ?? 0)
          : (
              (
                roofGeometry.getSurfaceElevation(resolved.startPoint, 'top')
                + roofGeometry.getSurfaceElevation(resolved.endPoint, 'top')
              ) / 2
            ),
        parapet.height ?? 0,
        {
          sourceId: parapet.id,
          materialKey: 'parapet',
        }
      );
    })
    .filter(Boolean);

  const drains = (roofSystem.drains || []).map((drain) => createBoxDescriptor(
    drain.id,
    'drain',
    drain.position,
    {
      x: drain.diameter ?? 120,
      y: Math.max(
        (
          (roofSystem.roofType || 'flat') === 'flat'
            ? (roofSystem.slabThickness ?? 0)
            : (
                roofGeometry.getSurfaceElevation(drain.position, 'top')
                - roofGeometry.getSurfaceElevation(drain.position, 'bottom')
              )
        ) * 0.6,
        80
      ),
      z: drain.diameter ?? 120,
    },
    (roofSystem.roofType || 'flat') === 'flat'
      ? (roofSystem.baseElevation ?? 0)
      : roofGeometry.getSurfaceElevation(drain.position, 'bottom'),
    0,
    {
      sourceId: drain.id,
      materialKey: 'drain',
    }
  ));

  const openings = (roofSystem.roofOpenings || [])
    .filter((opening) => (opening.boundaryPoints || []).length >= 3)
    .map((opening) => createPrismDescriptor(
      `roof-opening-${opening.id}`,
      'roofOpening',
      opening.boundaryPoints,
      (
        (opening.boundaryPoints || []).reduce((sum, point) => (
          sum + (
            (roofSystem.roofType || 'flat') === 'flat'
              ? ((roofSystem.baseElevation ?? 0) + (roofSystem.slabThickness ?? 0))
              : roofGeometry.getSurfaceElevation(point, 'top')
          )
        ), 0) / Math.max(1, (opening.boundaryPoints || []).length)
      ) - 4,
      8,
      {
        sourceId: opening.id,
        materialKey: 'roofOpening',
      }
    ));

  return [slab, ...parapets, ...drains, ...openings];
}
