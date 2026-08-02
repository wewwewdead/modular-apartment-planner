/**
 * Per-sheet nested DXF export.
 *
 * The cut-list optimizer (utils/nestingOptimizer) packs BOM rows onto stock
 * sheets and reports, for every sheet, the footprint of each placed copy. This
 * module turns those footprints back into real cut geometry: each placement is
 * resolved to the manufacturing entities of the sketch entity it came from
 * (outline plus joinery profiles, holes and cutouts), rotated and translated
 * into sheet space, then written with the shared DXF plumbing - one file per
 * sheet, ready for CNC.
 *
 * Mapping a placement back to geometry: BOM rows carry `partId` (the entity that
 * produced the row) and, once grouped, `entityIds` (every entity merged into the
 * row). Placements carry `originalRow`, so copies of a grouped row are handed
 * out one entity id at a time in placement order - a bijection, so two panels
 * that share cut dimensions but differ in joinery still export their own holes.
 *
 * User-placed fasteners ride along too. They are not joinery output, so they
 * carry no `manufacturingSourceEntityIds` and `selectPartCutEntities` cannot see
 * them; they are gathered separately by `targetPartId` and pass through the same
 * placement transform, so the operator drills them in place on the sheet.
 */

import { computeEntityBoundingBox } from '../../utils/bboxUtils';
import { getRectCorners } from '../../utils/entityUtils';
import { isFastenerEntity } from '../../utils/fastenerUtils';
import { distancePointToSegment } from '../../utils/hitTest';
import { nestPartsOnSheets, DEFAULT_SHEET, DEFAULT_BLADE_KERF } from '../utils/nestingOptimizer';
import { exportEntitiesToDxf, selectPartCutEntities } from './dxfExport';

const SHEET_LAYER = 'SHEET';

/**
 * Slack for a fastener drilled exactly on a part edge. Big enough to absorb the
 * rounding in stored coordinates, far too small to catch a hole that belongs to
 * a neighbouring part.
 */
const FASTENER_EDGE_TOLERANCE = 0.001;

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function isFiniteBox(box) {
  return (
    Boolean(box) &&
    Number.isFinite(box.minX) &&
    Number.isFinite(box.minY) &&
    Number.isFinite(box.maxX) &&
    Number.isFinite(box.maxY)
  );
}

function normalizeRect(entity) {
  const x = Math.min(
    toNumber(entity.x1 ?? entity.x),
    toNumber(entity.x2 ?? toNumber(entity.x) + toNumber(entity.width)),
  );
  const y = Math.min(
    toNumber(entity.y1 ?? entity.y),
    toNumber(entity.y2 ?? toNumber(entity.y) + toNumber(entity.height)),
  );
  const width = Math.abs(toNumber(entity.width ?? toNumber(entity.x2) - toNumber(entity.x1)));
  const height = Math.abs(toNumber(entity.height ?? toNumber(entity.y2) - toNumber(entity.y1)));

  return { x, y, width, height, rotation: toNumber(entity.rotation) };
}

function getRectPoints(entity) {
  const corners = getRectCorners(normalizeRect(entity));
  return [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
}

function getPointsBox(points) {
  if (!points?.length) {
    return null;
  }

  const xs = points.map((point) => toNumber(point.x));
  const ys = points.map((point) => toNumber(point.y));

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function getCutEntityBox(entity) {
  // Rects may be authored as x/y/width/height or x1/y1/x2/y2; normalize first so
  // both spellings measure the same way the DXF writer draws them.
  const box = entity?.type === 'rect' ? getPointsBox(getRectPoints(entity)) : computeEntityBoundingBox(entity, []);
  return isFiniteBox(box) ? box : null;
}

function mergeBoxes(boxes) {
  if (!boxes.length) {
    return null;
  }

  return {
    minX: Math.min(...boxes.map((box) => box.minX)),
    minY: Math.min(...boxes.map((box) => box.minY)),
    maxX: Math.max(...boxes.map((box) => box.maxX)),
    maxY: Math.max(...boxes.map((box) => box.maxY)),
  };
}

/**
 * Footprint of a part in its own sketch coordinates. Outlines define the
 * footprint; interior features (holes, pockets) are ignored so a cutout touching
 * an edge cannot shift the anchor point. Feature-only parts fall back to their
 * features so something still gets placed.
 */
function getPartBox(partEntities) {
  const outlineBoxes = partEntities
    .filter((entity) => entity.type !== 'feature')
    .map(getCutEntityBox)
    .filter(Boolean);

  if (outlineBoxes.length) {
    return mergeBoxes(outlineBoxes);
  }

  return mergeBoxes(partEntities.map(getCutEntityBox).filter(Boolean));
}

function pointInPolygon(point, polygon) {
  let inside = false;

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const xi = polygon[index].x;
    const yi = polygon[index].y;
    const xj = polygon[previous].x;
    const yj = polygon[previous].y;
    const intersects = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi || 1e-6) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function isPointOnPolygonEdge(point, polygon) {
  return polygon.some(
    (vertex, index) =>
      distancePointToSegment(point, vertex, polygon[(index + 1) % polygon.length]) <= FASTENER_EDGE_TOLERANCE,
  );
}

/**
 * Solid areas of a part, in sketch coordinates. Only real outlines contribute:
 * a fastener has to sit on material, and interior features describe the holes
 * already taken out of it. Rects are read through `getRectPoints` so a rotated
 * panel is tested against its true corners rather than its bounding box.
 */
function getPartContainmentRegions(partEntities) {
  const regions = [];

  partEntities.forEach((entity) => {
    if (entity.type === 'rect') {
      regions.push({ kind: 'polygon', points: getRectPoints(entity) });
      return;
    }

    if (entity.type === 'polyline' && entity.closed && (entity.points?.length ?? 0) >= 3) {
      regions.push({ kind: 'polygon', points: entity.points });
      return;
    }

    if (entity.type === 'circle') {
      regions.push({
        kind: 'circle',
        cx: toNumber(entity.center?.x ?? entity.cx),
        cy: toNumber(entity.center?.y ?? entity.cy),
        r: Math.abs(toNumber(entity.r ?? entity.radius)),
      });
    }
  });

  return regions;
}

function isPointOnPart(point, regions, box) {
  if (regions.length) {
    return regions.some((region) =>
      region.kind === 'circle'
        ? Math.hypot(point.x - region.cx, point.y - region.cy) <= region.r + FASTENER_EDGE_TOLERANCE
        : pointInPolygon(point, region.points) || isPointOnPolygonEdge(point, region.points),
    );
  }

  // No outline to test against (feature-only part): the footprint is all we know.
  return (
    Boolean(box) &&
    point.x >= box.minX - FASTENER_EDGE_TOLERANCE &&
    point.x <= box.maxX + FASTENER_EDGE_TOLERANCE &&
    point.y >= box.minY - FASTENER_EDGE_TOLERANCE &&
    point.y <= box.maxY + FASTENER_EDGE_TOLERANCE
  );
}

/**
 * The user-placed fasteners drilled into one part.
 *
 * `targetPartId` is recorded when the fastener is placed and is never re-checked
 * afterwards, so it goes stale as soon as the part is moved out from under the
 * hole. Drilling a stale fastener would punch a hole through the wrong place on
 * the nested sheet, so every candidate is re-tested against the part's real
 * geometry and the ones that no longer land on it are dropped and counted.
 */
function selectPartFasteners(sourceEntities, partId, partEntities, box) {
  if (!partId) {
    return { fasteners: [], skipped: 0 };
  }

  const regions = getPartContainmentRegions(partEntities);
  const fasteners = [];
  let skipped = 0;

  sourceEntities.forEach((entity) => {
    if (!isFastenerEntity(entity) || entity.meta?.manufacturingHidden === true) {
      return;
    }

    if ((entity.targetPartId ?? entity.meta?.targetPartId ?? null) !== partId) {
      return;
    }

    const center = { x: Number(entity.cx), y: Number(entity.cy) };
    if (!Number.isFinite(center.x) || !Number.isFinite(center.y) || !isPointOnPart(center, regions, box)) {
      skipped += 1;
      return;
    }

    fasteners.push(entity);
  });

  return { fasteners, skipped };
}

/**
 * The optimizer normalizes every sheet part to landscape (width >= height) and
 * may then rotate it again to fit a shelf, so the placement's own `rotated` flag
 * does not describe the total turn relative to the source sketch. Comparing the
 * placed footprint against the real geometry footprint recovers the net rotation
 * (0 or 90 degrees) without depending on those internals.
 */
function resolvePlacementRotation(box, placement) {
  const sourceWidth = box.maxX - box.minX;
  const sourceHeight = box.maxY - box.minY;
  const placedWidth = toNumber(placement.placedWidth, sourceWidth);
  const placedHeight = toNumber(placement.placedHeight, sourceHeight);

  const asDrawn = Math.abs(placedWidth - sourceWidth) + Math.abs(placedHeight - sourceHeight);
  const turned = Math.abs(placedWidth - sourceHeight) + Math.abs(placedHeight - sourceWidth);

  return turned < asDrawn ? 90 : 0;
}

/** Kills floating-point dust so quarter turns produce exact 0/1 factors. */
function snapTrig(value) {
  const rounded = Math.round(value);
  return Math.abs(value - rounded) < 1e-12 ? rounded : value;
}

function buildPlacementTransform(box, placement) {
  const angle = resolvePlacementRotation(box, placement);
  const radians = (angle * Math.PI) / 180;
  const cos = snapTrig(Math.cos(radians));
  const sin = snapTrig(Math.sin(radians));

  const rotatedCorners = [
    { x: box.minX, y: box.minY },
    { x: box.maxX, y: box.minY },
    { x: box.maxX, y: box.maxY },
    { x: box.minX, y: box.maxY },
  ].map((point) => ({ x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos }));
  const rotatedBox = getPointsBox(rotatedCorners);

  return {
    angle,
    cos,
    sin,
    tx: toNumber(placement.x) - rotatedBox.minX,
    ty: toNumber(placement.y) - rotatedBox.minY,
  };
}

function transformPoint(point, transform) {
  const x = toNumber(point?.x);
  const y = toNumber(point?.y);

  return {
    x: x * transform.cos - y * transform.sin + transform.tx,
    y: x * transform.sin + y * transform.cos + transform.ty,
  };
}

function transformPoints(points, transform) {
  return (points || []).map((point) => transformPoint(point, transform));
}

function transformCenter(entity, transform) {
  return transformPoint({ x: entity.center?.x ?? entity.cx, y: entity.center?.y ?? entity.cy }, transform);
}

function transformFeature(entity, transform) {
  if (entity.shape === 'circle') {
    const center = transformCenter(entity, transform);
    return { ...entity, cx: center.x, cy: center.y };
  }

  if (entity.shape === 'ellipse') {
    const center = transformCenter(entity, transform);
    return { ...entity, cx: center.x, cy: center.y, rotation: toNumber(entity.rotation) + transform.angle };
  }

  if (entity.shape === 'polygon') {
    return { ...entity, points: transformPoints(entity.points, transform) };
  }

  const corners = transformPoints(getRectPoints({ ...entity, rotation: 0 }), transform);

  // Quarter turns keep an axis-aligned pocket axis-aligned, so it stays a rect
  // shape (and keeps its inward rect kerf compensation). Anything else has to
  // become a polygon to survive the rotation.
  if (transform.angle % 90 !== 0) {
    return { ...entity, shape: 'polygon', points: corners };
  }

  const box = getPointsBox(corners);
  return { ...entity, x: box.minX, y: box.minY, width: box.maxX - box.minX, height: box.maxY - box.minY };
}

function transformCutEntity(entity, transform) {
  switch (entity.type) {
    case 'line': {
      const start = transformPoint({ x: entity.x1, y: entity.y1 }, transform);
      const end = transformPoint({ x: entity.x2, y: entity.y2 }, transform);
      return { ...entity, x1: start.x, y1: start.y, x2: end.x, y2: end.y };
    }
    case 'rect': {
      // Emitted as a closed polyline: the outline is already baked into world
      // coordinates, so there is no x/y/rotation left to preserve.
      const points = transformPoints(getRectPoints(entity), transform);
      return { id: entity.id, type: 'polyline', closed: true, points, meta: entity.meta };
    }
    case 'circle': {
      const center = transformCenter(entity, transform);
      return { ...entity, center, cx: center.x, cy: center.y };
    }
    case 'arc': {
      return {
        ...entity,
        start: transformPoint(entity.start, transform),
        end: transformPoint(entity.end, transform),
        control: transformPoint(entity.control, transform),
      };
    }
    case 'polyline':
      return { ...entity, points: transformPoints(entity.points, transform) };
    case 'ellipse': {
      const center = transformCenter(entity, transform);
      return { ...entity, cx: center.x, cy: center.y, rotation: toNumber(entity.rotation) + transform.angle };
    }
    case 'feature':
      return transformFeature(entity, transform);
    default:
      return null;
  }
}

function buildSheetOutline(sheet, sheetIndex) {
  const width = toNumber(sheet.width, DEFAULT_SHEET.width);
  const height = toNumber(sheet.height, DEFAULT_SHEET.height);

  return {
    id: `sheet-outline-${sheetIndex + 1}`,
    type: 'polyline',
    closed: true,
    points: [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ],
    meta: { dxfLayer: SHEET_LAYER, dxfKerfExempt: true },
  };
}

/**
 * Last-resort outline for a placement whose source entity cannot be resolved
 * (row without ids, entity deleted after the BOM was built). Drawing the nested
 * footprint keeps the sheet layout complete instead of silently dropping a part.
 */
function buildFootprintOutline(placement, placementIndex) {
  const x = toNumber(placement.x);
  const y = toNumber(placement.y);
  const width = toNumber(placement.placedWidth);
  const height = toNumber(placement.placedHeight);

  if (width <= 0 || height <= 0) {
    return null;
  }

  return {
    id: `${placement.id || 'part'}-footprint-${placementIndex + 1}`,
    type: 'polyline',
    closed: true,
    points: [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ],
  };
}

function resolvePlacementEntityId(placement, copyCounters) {
  const row = placement.originalRow;
  if (!row) {
    return null;
  }

  const entityIds = (Array.isArray(row.entityIds) ? row.entityIds : []).filter(Boolean);
  const candidates = entityIds.length ? entityIds : row.partId ? [row.partId] : [];
  if (!candidates.length) {
    return null;
  }

  const copyIndex = copyCounters.get(row) ?? 0;
  copyCounters.set(row, copyIndex + 1);

  return candidates[Math.min(copyIndex, candidates.length - 1)];
}

function buildSheetEntities(sheet, sheetIndex, sourceEntities, copyCounters) {
  const sheetEntities = [buildSheetOutline(sheet, sheetIndex)];
  let skippedFasteners = 0;

  (sheet.placements || []).forEach((placement, placementIndex) => {
    const partId = resolvePlacementEntityId(placement, copyCounters);
    const partEntities = selectPartCutEntities(sourceEntities, partId);
    const box = partEntities.length ? getPartBox(partEntities) : null;

    if (!box) {
      const fallback = buildFootprintOutline(placement, placementIndex);
      if (fallback) {
        sheetEntities.push(fallback);
      }
      return;
    }

    // Fasteners share the part's transform, so they land on the sheet exactly
    // where they sit on the part - including the quarter turn the nesting may
    // have applied. The DXF writer puts them on the HARDWARE layer and leaves
    // them kerf-exempt on its own, because they still carry `hardwareId`.
    const placedFasteners = selectPartFasteners(sourceEntities, partId, partEntities, box);
    skippedFasteners += placedFasteners.skipped;

    const transform = buildPlacementTransform(box, placement);
    [...partEntities, ...placedFasteners.fasteners].forEach((entity) => {
      const transformed = transformCutEntity(entity, transform);
      if (transformed) {
        sheetEntities.push(transformed);
      }
    });
  });

  return { entities: sheetEntities, skippedFasteners };
}

export function buildNestedSheetFilename(sheetIndex, sheetCount = 0) {
  const width = Math.max(2, String(Math.max(sheetCount, sheetIndex + 1)).length);
  return `sheet-${String(sheetIndex + 1).padStart(width, '0')}.dxf`;
}

/**
 * One DXF per nested stock sheet.
 *
 * @param {Array} entities - sketch/manufacturing entities (post joinery resolve).
 * @param {Array} bomRows - grouped BOM rows, ideally carrying partId/entityIds.
 * @param {Object} options - { sheetSize, bladeKerf, kerf } where `bladeKerf` is
 *   the saw gap the optimizer leaves between parts and `kerf` is the same
 *   geometry compensation the single-file DXF export applies.
 * @returns {Array<{ filename: string, content: string, skippedFasteners: number }>}
 *   empty when there is nothing sheet-nestable to cut. `skippedFasteners` counts
 *   the fasteners left off that sheet because their centre no longer lands on
 *   the part they were placed against.
 */
export function exportNestedSheetsToDxf(entities, bomRows, options = {}) {
  const rows = Array.isArray(bomRows) ? bomRows : [];
  if (!rows.length) {
    return [];
  }

  const nesting = nestPartsOnSheets(rows, {
    sheetSize: options.sheetSize ?? DEFAULT_SHEET,
    bladeKerf: options.bladeKerf ?? DEFAULT_BLADE_KERF,
  });
  const sheets = nesting.sheets || [];
  if (!sheets.length) {
    return [];
  }

  const sourceEntities = Array.isArray(entities) ? entities : [];
  const copyCounters = new Map();

  return sheets.map((sheet, sheetIndex) => {
    const built = buildSheetEntities(sheet, sheetIndex, sourceEntities, copyCounters);

    return {
      filename: buildNestedSheetFilename(sheetIndex, sheets.length),
      content: exportEntitiesToDxf(built.entities, {
        kerf: options.kerf,
        referenceEntities: sourceEntities,
      }),
      skippedFasteners: built.skippedFasteners,
    };
  });
}
