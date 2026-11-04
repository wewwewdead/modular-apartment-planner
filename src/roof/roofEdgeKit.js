import { getFloorStackBounds } from '@/domain/floorModels';
import { normalizeRoofTrims } from '@/domain/roofCoveringCatalog';
import { getProjectTrussSystem } from '@/domain/trussModels';
import { pointInPolygon, polygonArea, signedPolygonArea } from '@/geometry/polygon';
import { buildRoofBoundaryEdges } from '@/geometry/roofPlanGeometry';
import { buildRoofPlaneGeometry, clipPolygonByAxis, clipPolygonToAxisBand } from '@/geometry/roofPlaneGeometry';
import { buildTrussSystemGeometry } from '@/geometry/trussGeometry';
import {
  buildSystemBoundary,
  collectSystemCopyBearingPoints,
  projectPointOntoAxis,
  resolveSystemLayoutRange,
  resolveSystemPlanAxes,
} from '@/truss/systemPlanAxes';

/**
 * The roof-edge kit: fascia, barge boards, gutters, downpipes, ridge and barge
 * capping, and the eaves soffit (docs/roof-truss-industrial.md §5.2).
 *
 * Everything is derived from the roof's own outline and its classified edges —
 * nothing is stored but the switches and sizes in `roofSystem.trims` — so the
 * kit follows the roof through every edit. `buildRoofEdgeKitLayout` is the
 * single source: the 3D descriptors, the elevation and section lines and the
 * quantity takeoff all read the same runs.
 *
 * Frames: plan points are `{x, y}` in millimetres; elevations are world
 * millimetres. 3D descriptors use the preview's world frame `{x, y: elevation,
 * z: plan y}`.
 */

const LEVEL_TOLERANCE = 1;
const MIN_RUN_LENGTH = 5;
const MIN_SOFFIT_DEPTH = 5;
// How far below the roof top edge the gutter's top sits.
const GUTTER_TOP_DROP = 20;
// Ridge/barge capping strips are a folded sheet: thin, lying on the roof.
const CAP_THICKNESS = 8;
// Downpipes stop short of the ground floor, discharging to a pit or spreader.
const DOWNPIPE_GROUND_CLEARANCE = 150;
// The raked lining sits a hair under the roof body so the two never z-fight.
const RAKED_SOFFIT_GAP = 1;

const FASCIA_ROLES = new Set(['eave', 'low_eave', 'high_edge']);
const GUTTER_ROLES = new Set(['eave', 'low_eave']);
const RAKE_ROLES = new Set(['gable_end', 'rake_edge', 'rake']);

// ── Context ──────────────────────────────────────────────────────────────

/**
 * Plan polygon of what holds the roof up, which is where the overhang (and so
 * the soffit) stops: the trusses' bearing rectangle for an attached roof, the
 * roof's own boundary (before its overhang offset) for a detached one.
 */
export function resolveRoofBearingOutline(roofSystem, trussSystem = null) {
  if (trussSystem) {
    const systemGeometry = buildTrussSystemGeometry(trussSystem);
    const planAxes = resolveSystemPlanAxes(systemGeometry);
    const bearingPoints = collectSystemCopyBearingPoints(systemGeometry).filter(Boolean);
    if (planAxes && bearingPoints.length) {
      const spanValues = bearingPoints.map((point) => projectPointOntoAxis(point, planAxes.origin, planAxes.spanAxis));
      const outline = buildSystemBoundary(
        planAxes,
        { min: Math.min(...spanValues), max: Math.max(...spanValues) },
        resolveSystemLayoutRange(systemGeometry, planAxes),
      );
      if (outline?.length >= 3) return outline;
    }
  }
  return (roofSystem?.boundaryPolygon || []).map((point) => ({ x: point.x, y: point.y }));
}

/**
 * Everything outside the roof the kit reads, gathered once. Every field is a
 * plain value or a project object reference, so a preview cache keyed on it
 * stays honest (see `buildPreviewScene`).
 */
export function resolveRoofEdgeKitContext(project, roofSystem = project?.roofSystem || null) {
  const trussSystem =
    roofSystem?.trussAttachmentId && project ? getProjectTrussSystem(project, roofSystem.trussAttachmentId) : null;
  return {
    trussSystem: trussSystem || null,
    bearingOutline: resolveRoofBearingOutline(roofSystem, trussSystem || null),
    groundElevation: (project?.floors || []).length ? getFloorStackBounds(project).minElevation : null,
  };
}

// ── Small vector helpers ─────────────────────────────────────────────────

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function addScaled(point, vector, amount) {
  return { x: point.x + vector.x * amount, y: point.y + vector.y * amount };
}

function dot2(a, b) {
  return a.x * b.x + a.y * b.y;
}

function lerp2(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function v3(x, y, z) {
  return { x, y, z };
}

function sub3(a, b) {
  return v3(a.x - b.x, a.y - b.y, a.z - b.z);
}

function add3(a, b, s = 1) {
  return v3(a.x + b.x * s, a.y + b.y * s, a.z + b.z * s);
}

function dot3(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross3(a, b) {
  return v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

function normalize3(a) {
  const length = Math.hypot(a.x, a.y, a.z) || 1;
  return v3(a.x / length, a.y / length, a.z / length);
}

/** A plan point at an elevation, in the preview's world frame. */
function world(point, elevation) {
  return v3(point.x, elevation, point.y);
}

const WORLD_UP = Object.freeze(v3(0, 1, 0));

// ── Edges into runs ──────────────────────────────────────────────────────

function segmentParameterOnEdge(edgeStart, edgeEnd, a, b) {
  // Where segment a–b crosses edge start–end, as a parameter along the edge,
  // or null when they are parallel (collinear plane edges lie ON the roof
  // edge and break nothing) or do not meet.
  const r = sub(edgeEnd, edgeStart);
  const s = sub(b, a);
  const denominator = r.x * s.y - r.y * s.x;
  if (Math.abs(denominator) < 1e-9 * Math.max(1, Math.hypot(r.x, r.y) * Math.hypot(s.x, s.y))) return null;
  const q = sub(a, edgeStart);
  const t = (q.x * s.y - q.y * s.x) / denominator;
  const u = (q.x * r.y - q.y * r.x) / denominator;
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
  return Math.min(1, Math.max(0, t));
}

/**
 * Split a roof edge where its underside kinks: wherever a plane boundary meets
 * it. A gable's rake edge runs eave → ridge → eave in plan as one straight
 * line, but in 3D it is two slopes; a profile-driven roof's rake has a slope
 * change at every profile node.
 */
function splitEdgeAtKinks(edge, roofGeometry) {
  const parameters = [0, 1];
  for (const plane of roofGeometry.planes || []) {
    const outline = plane.outline || [];
    for (let index = 0; index < outline.length; index += 1) {
      const t = segmentParameterOnEdge(edge.start, edge.end, outline[index], outline[(index + 1) % outline.length]);
      if (t !== null) parameters.push(t);
    }
  }
  for (const line of [...(roofGeometry.ridges || []), ...(roofGeometry.hips || [])]) {
    if (!line?.startPoint || !line?.endPoint) continue;
    const t = segmentParameterOnEdge(edge.start, edge.end, line.startPoint, line.endPoint);
    if (t !== null) parameters.push(t);
  }
  const minStep = MIN_RUN_LENGTH / Math.max(edge.length, 1);
  const sorted = [...parameters].sort((a, b) => a - b);
  const unique = sorted.filter((t, index) => index === 0 || t - sorted[index - 1] > minStep);
  if (unique[unique.length - 1] < 1) unique[unique.length - 1] = 1;

  const pieces = [];
  for (let index = 0; index < unique.length - 1; index += 1) {
    const start = lerp2(edge.start, edge.end, unique[index]);
    const end = lerp2(edge.start, edge.end, unique[index + 1]);
    pieces.push({ start, end });
  }
  return pieces;
}

function inwardNormal(edge, outline) {
  const normal = { x: -edge.direction.y, y: edge.direction.x };
  const probe = addScaled(edge.midpoint, normal, 5);
  if (pointInPolygon(probe, outline)) return normal;
  const flipped = { x: -normal.x, y: -normal.y };
  if (pointInPolygon(addScaled(edge.midpoint, flipped, 5), outline)) return flipped;
  // Degenerate probe: fall back on the outline's winding.
  return signedPolygonArea(outline) >= 0 ? normal : flipped;
}

/**
 * Classify every piece of every boundary edge as a fascia run (level, the
 * eaves), a barge run (the rakes) — and whether it carries a gutter.
 *
 * The roles from `buildRoofBoundaryEdges` decide first: eaves and the shed's
 * high edge carry a fascia, rakes a barge board. Two geometric corrections on
 * top: a "rake" whose underside is level at the eave height IS an eave (the
 * end of a hip roof, which the parapet classifier calls a gable end because it
 * runs along the slope), and a sloped piece of any other edge is a rake.
 */
function classifyRuns(roofSystem, roofGeometry) {
  const outline = roofGeometry.roofOutline || roofSystem.boundaryPolygon || [];
  const bottomAt = (point) => roofGeometry.getSurfaceElevation(point, 'bottom');
  const topAt = (point) => roofGeometry.getSurfaceElevation(point, 'top');
  const eaveElevation = Math.min(...outline.map(bottomAt));
  const runs = [];

  for (const edge of buildRoofBoundaryEdges(roofSystem)) {
    const role = edge.parapetPlacement?.role || 'edge';
    const inward = inwardNormal(edge, outline);
    const pieces = splitEdgeAtKinks(edge, roofGeometry).map((piece) => {
      const startBottom = bottomAt(piece.start);
      const endBottom = bottomAt(piece.end);
      const level = Math.abs(endBottom - startBottom) <= LEVEL_TOLERANCE;
      const atEave = level && Math.abs(startBottom - eaveElevation) <= LEVEL_TOLERANCE;
      let kind;
      let gutter;
      if (FASCIA_ROLES.has(role)) {
        kind = 'fascia';
        gutter = GUTTER_ROLES.has(role) && level;
      } else if (level && (atEave || !RAKE_ROLES.has(role))) {
        kind = 'fascia';
        gutter = atEave;
      } else {
        kind = 'barge';
        gutter = false;
      }
      return {
        ...piece,
        kind,
        gutter,
        startBottom,
        endBottom,
        startTop: topAt(piece.start),
        endTop: topAt(piece.end),
      };
    });

    // One board per straight run: consecutive level fascia pieces at one height
    // are the same board.
    const merged = [];
    for (const piece of pieces) {
      const previous = merged[merged.length - 1];
      if (
        previous &&
        previous.kind === 'fascia' &&
        piece.kind === 'fascia' &&
        previous.gutter === piece.gutter &&
        Math.abs(previous.endBottom - piece.startBottom) <= LEVEL_TOLERANCE &&
        Math.abs(piece.endBottom - piece.startBottom) <= LEVEL_TOLERANCE &&
        Math.abs(previous.endBottom - previous.startBottom) <= LEVEL_TOLERANCE
      ) {
        previous.end = piece.end;
        previous.endBottom = piece.endBottom;
        previous.endTop = piece.endTop;
        continue;
      }
      merged.push({ ...piece });
    }

    merged.forEach((piece, pieceIndex) => {
      const length = Math.hypot(piece.end.x - piece.start.x, piece.end.y - piece.start.y);
      if (length < MIN_RUN_LENGTH) return;
      runs.push({
        ...piece,
        edgeIndex: edge.index,
        pieceIndex,
        pieceCount: merged.length,
        role,
        inward,
        direction: edge.direction,
        length,
      });
    });
  }

  return runs;
}

function runId(roofId, part, run) {
  return run.pieceCount > 1
    ? `${roofId}-${part}-${run.edgeIndex}-${run.pieceIndex}`
    : `${roofId}-${part}-${run.edgeIndex}`;
}

// ── Boards, gutters, pipes, caps, soffits ────────────────────────────────

/**
 * A board hanging below a line: `topStart`/`topEnd` are the board's top
 * outer edge in world space, `inward` the plan direction into the roof. The
 * board's outer face is flush with the roof edge, so its centre sits half its
 * thickness inward and half its depth below the top line — "below" measured
 * square to the board's length within its vertical plane, so a barge on a
 * rake keeps its top edge exactly on the rake.
 */
function hangingBoard(topStart, topEnd, inward, depth, thickness) {
  const along = normalize3(sub3(topEnd, topStart));
  const upInPlane = normalize3(add3(WORLD_UP, along, -dot3(WORLD_UP, along)));
  const inward3 = v3(inward.x, 0, inward.y);
  const offset = add3(add3(v3(0, 0, 0), upInPlane, -depth / 2), inward3, thickness / 2);
  return {
    start: add3(topStart, offset),
    end: add3(topEnd, offset),
    up: upInPlane,
  };
}

function planeNormalAcross(roofGeometry, linePoint, across, surface = 'top') {
  // The roof's slope across a line, sampled a short way into the roof.
  const probe = 100;
  const here = roofGeometry.getSurfaceElevation(linePoint, surface);
  const there = roofGeometry.getSurfaceElevation(addScaled(linePoint, across, probe), surface);
  const k = (there - here) / probe;
  return normalize3(v3(across.x, k, across.y));
}

/**
 * A capping strip lying on the roof's top surface beside a line: `across` is
 * the plan direction away from the line on the side the strip lies, `width`
 * measured on the slope.
 */
function capStrip(roofGeometry, start, end, across, width) {
  const startTop = world(start, roofGeometry.getSurfaceElevation(start, 'top'));
  const endTop = world(end, roofGeometry.getSurfaceElevation(end, 'top'));
  const along = normalize3(sub3(endTop, startTop));
  const mid = lerp2(start, end, 0.5);
  const acrossSlope = planeNormalAcross(roofGeometry, mid, across);
  let normal = normalize3(cross3(along, acrossSlope));
  if (normal.y < 0) normal = v3(-normal.x, -normal.y, -normal.z);
  const offset = add3(add3(v3(0, 0, 0), acrossSlope, width / 2), normal, CAP_THICKNESS / 2);
  return { start: add3(startTop, offset), end: add3(endTop, offset), up: normal };
}

function soffitDepthBehind(run, bearingOutline) {
  if (!bearingOutline?.length) return 0;
  const values = bearingOutline.map((point) => dot2(sub(point, run.start), run.inward));
  const inside = values.filter((value) => value >= -LEVEL_TOLERANCE);
  return inside.length ? Math.max(0, Math.min(...inside)) : 0;
}

/**
 * Build the kit's runs for one roof. Pure: same roof + context, same layout.
 */
export function buildRoofEdgeKitLayout(roofSystem, roofGeometry = null, context = {}) {
  const empty = {
    trims: null,
    fascias: [],
    barges: [],
    gutters: [],
    downpipes: [],
    ridgeCaps: [],
    bargeCaps: [],
    soffits: [],
  };
  if (!roofSystem || (roofSystem.boundaryPolygon || []).length < 3) return empty;
  const roofType = roofSystem.roofType || 'flat';
  const trims = normalizeRoofTrims(roofSystem.trims, roofType);
  // Flat roofs have parapets, not eaves.
  if (roofType === 'flat') return { ...empty, trims };

  const geometry = roofGeometry || buildRoofPlaneGeometry(roofSystem);
  const outline = geometry.roofOutline || roofSystem.boundaryPolygon;
  const runs = classifyRuns(roofSystem, geometry);
  const roofId = roofSystem.id;
  const layout = { ...empty, trims };
  const drop = trims.fascia.drop;

  for (const run of runs) {
    if (run.kind === 'fascia' && trims.fascia.enabled) {
      layout.fascias.push({
        id: runId(roofId, 'fascia', run),
        run,
        topStart: world(run.start, run.startBottom - drop),
        topEnd: world(run.end, run.endBottom - drop),
        depth: trims.fascia.depth,
        thickness: trims.fascia.thickness,
      });
    }
    if (run.kind === 'barge' && trims.barge.enabled) {
      // Same elevation rule as the fascia, following the rake, so the two
      // boards meet at the eave corner.
      layout.barges.push({
        id: runId(roofId, 'barge', run),
        run,
        topStart: world(run.start, run.startBottom - drop),
        topEnd: world(run.end, run.endBottom - drop),
        depth: trims.barge.depth,
        thickness: trims.barge.thickness,
      });
    }
    if (run.kind === 'barge' && trims.bargeCap.enabled) {
      layout.bargeCaps.push({
        id: runId(roofId, 'bargeCap', run),
        run,
        ...capStrip(geometry, run.start, run.end, run.inward, trims.bargeCap.girth / 2),
        width: trims.bargeCap.girth / 2,
      });
    }
  }

  // Gutters hang outside the eave line; where two gutter runs meet at a
  // corner (a hip roof) each one carries on past it by its own width so the
  // outside corner is closed.
  const gutterRuns = trims.gutter.enabled && trims.gutter.profile !== 'none' ? runs.filter((run) => run.gutter) : [];
  const sharesCorner = (point, self) =>
    gutterRuns.some(
      (other) =>
        other !== self &&
        (Math.hypot(other.start.x - point.x, other.start.y - point.y) <= LEVEL_TOLERANCE ||
          Math.hypot(other.end.x - point.x, other.end.y - point.y) <= LEVEL_TOLERANCE),
    );
  for (const run of gutterRuns) {
    const outward = { x: -run.inward.x, y: -run.inward.y };
    const width = trims.gutter.width;
    const depth = trims.gutter.depth;
    const startExtension = sharesCorner(run.start, run) ? width : 0;
    const endExtension = sharesCorner(run.end, run) ? width : 0;
    const planStart = addScaled(addScaled(run.start, outward, width / 2), run.direction, -startExtension);
    const planEnd = addScaled(addScaled(run.end, outward, width / 2), run.direction, endExtension);
    const top = Math.min(run.startTop, run.endTop) - GUTTER_TOP_DROP;
    layout.gutters.push({
      id: runId(roofId, 'gutter', run),
      run,
      // Centre line of the gutter box.
      start: world(planStart, top - depth / 2),
      end: world(planEnd, top - depth / 2),
      top,
      bottom: top - depth,
      width,
      depth,
      length: run.length,
    });
  }

  // Downpipes: one at the gutter's own derived outlet (its midpoint, as
  // `buildDerivedRoofDrainage` places it) and more, evenly spread, wherever a
  // run is longer than the maximum spacing. They drop from the gutter's
  // underside to just above the ground floor.
  if (trims.downpipes.enabled && Number.isFinite(context?.groundElevation)) {
    const bottom = context.groundElevation + DOWNPIPE_GROUND_CLEARANCE;
    for (const gutter of layout.gutters) {
      const count = Math.max(1, Math.ceil(gutter.length / trims.downpipes.maxSpacing));
      if (gutter.bottom - bottom <= MIN_RUN_LENGTH) continue;
      const outward = { x: -gutter.run.inward.x, y: -gutter.run.inward.y };
      for (let index = 0; index < count; index += 1) {
        const planPoint = addScaled(
          lerp2(gutter.run.start, gutter.run.end, (index + 0.5) / count),
          outward,
          trims.gutter.width / 2,
        );
        layout.downpipes.push({
          id: `${gutter.id}-downpipe-${index}`,
          gutterId: gutter.id,
          position: planPoint,
          rotation: Math.atan2(gutter.run.direction.y, gutter.run.direction.x),
          top: gutter.bottom,
          bottom,
          diameter: trims.downpipes.diameter,
        });
      }
    }
  }

  // Ridge capping: two strips per ridge, one down each slope. Hips are capped
  // the same way — a hip roof's hips are its ridges as far as the sheet is
  // concerned.
  if (trims.ridgeCap.enabled) {
    const width = trims.ridgeCap.girth / 2;
    const lines = [
      ...(geometry.ridges || []).map((line, index) => ({ line, id: `${roofId}-ridgeCap-${index}` })),
      ...(geometry.hips || []).map((line, index) => ({ line, id: `${roofId}-hipCap-${index}` })),
    ];
    for (const { line, id } of lines) {
      const start = line.startPoint;
      const end = line.endPoint;
      if (!start || !end) continue;
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      if (length < MIN_RUN_LENGTH) continue;
      const direction = { x: (end.x - start.x) / length, y: (end.y - start.y) / length };
      const sideA = { x: -direction.y, y: direction.x };
      const sideB = { x: direction.y, y: -direction.x };
      layout.ridgeCaps.push({ id: `${id}-a`, length, width, ...capStrip(geometry, start, end, sideA, width) });
      layout.ridgeCaps.push({ id: `${id}-b`, length, width, ...capStrip(geometry, start, end, sideB, width) });
    }
  }

  // Soffit: the overhang band behind each level fascia, from the fascia line
  // back to the bearing line. Where two bands meet at a corner the earlier one
  // keeps the corner square, so no two linings overlap.
  if (trims.soffit.mode !== 'open') {
    const bearingOutline = context?.bearingOutline?.length
      ? context.bearingOutline
      : (roofSystem.boundaryPolygon || []).map((point) => ({ x: point.x, y: point.y }));
    const claimed = [];
    const soffitRuns = runs.filter(
      (run) => run.kind === 'fascia' && Math.abs(run.endBottom - run.startBottom) <= LEVEL_TOLERANCE,
    );
    for (const run of soffitRuns) {
      const depth = soffitDepthBehind(run, bearingOutline);
      if (depth < MIN_SOFFIT_DEPTH) continue;
      let polygon = clipPolygonToAxisBand(outline, run.start, run.inward, 0, depth);
      // Keep to the run's own length along the edge.
      polygon = clipPolygonToAxisBand(polygon, run.start, run.direction, 0, run.length);
      for (const other of claimed) {
        if (polygon.length < 3) break;
        polygon = clipPolygonByAxis(polygon, other.run.start, other.run.inward, other.depth, false);
      }
      if (polygon.length < 3 || polygonArea(polygon) < 1) continue;
      claimed.push({ run, depth });
      const fasciaBottom = run.startBottom - drop - trims.fascia.depth;
      layout.soffits.push({
        id: runId(roofId, 'soffit', run),
        run,
        mode: trims.soffit.mode,
        polygon,
        depth,
        baseElevation: fasciaBottom,
        thickness: trims.soffit.thickness,
        area: polygonArea(polygon),
      });
    }
  }

  return layout;
}

// ── Descriptors ──────────────────────────────────────────────────────────

function boxCorners(start, end, up, height, width) {
  const along = normalize3(sub3(end, start));
  const upAxis = up ? normalize3(add3(up, along, -dot3(up, along))) : WORLD_UP;
  const side = normalize3(cross3(along, upAxis));
  const corners = [];
  for (const base of [start, end]) {
    for (const u of [-height / 2, height / 2]) {
      for (const w of [-width / 2, width / 2]) {
        corners.push(add3(add3(base, upAxis, u), side, w));
      }
    }
  }
  return corners;
}

function boundsFromWorldPoints(points) {
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.z)),
    maxY: Math.max(...points.map((point) => point.z)),
    minElevation: Math.min(...points.map((point) => point.y)),
    maxElevation: Math.max(...points.map((point) => point.y)),
  };
}

function segmentDescriptor(id, roofSystem, part, start, end, up, crossSection, materialKey, extra = {}) {
  return {
    id,
    kind: 'roofSystem',
    geometry: 'segment3d',
    start,
    end,
    up,
    crossSection,
    thickness: Math.max(crossSection.height, crossSection.width),
    materialKey,
    metadata: { sourceId: roofSystem.id, part, ...extra },
    bounds: boundsFromWorldPoints(boxCorners(start, end, up, crossSection.height, crossSection.width)),
  };
}

function planBounds(points, minElevation, maxElevation) {
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
    minElevation,
    maxElevation,
  };
}

/**
 * The kit as preview descriptors, appended to the roof's own by
 * `buildRoofPreviewObjects`. Every one is `kind: 'roofSystem'` with the roof's
 * id as its source, so clicking a gutter selects the roof.
 */
export function buildRoofEdgeKitObjects(roofSystem, roofGeometry = null, context = {}) {
  const layout = buildRoofEdgeKitLayout(roofSystem, roofGeometry, context);
  const descriptors = [];

  for (const board of [...layout.fascias, ...layout.barges]) {
    const part = layout.fascias.includes(board) ? 'fascia' : 'barge';
    const placed = hangingBoard(board.topStart, board.topEnd, board.run.inward, board.depth, board.thickness);
    descriptors.push(
      segmentDescriptor(
        board.id,
        roofSystem,
        part,
        placed.start,
        placed.end,
        placed.up,
        { height: board.depth, width: board.thickness },
        'roofTrim',
        { edgeIndex: board.run.edgeIndex },
      ),
    );
  }

  for (const gutter of layout.gutters) {
    descriptors.push(
      segmentDescriptor(
        gutter.id,
        roofSystem,
        'gutter',
        gutter.start,
        gutter.end,
        WORLD_UP,
        { height: gutter.depth, width: gutter.width },
        'roofGutter',
        { edgeIndex: gutter.run.edgeIndex },
      ),
    );
  }

  for (const pipe of layout.downpipes) {
    const height = pipe.top - pipe.bottom;
    const half = pipe.diameter / 2;
    descriptors.push({
      id: pipe.id,
      kind: 'roofSystem',
      geometry: 'box',
      center: { x: pipe.position.x, y: pipe.position.y },
      size: { x: pipe.diameter, y: height, z: pipe.diameter },
      rotation: pipe.rotation,
      baseElevation: pipe.bottom,
      materialKey: 'roofDownpipe',
      metadata: { sourceId: roofSystem.id, part: 'downpipe', gutterId: pipe.gutterId },
      bounds: planBounds(
        [
          { x: pipe.position.x - half * Math.SQRT2, y: pipe.position.y - half * Math.SQRT2 },
          { x: pipe.position.x + half * Math.SQRT2, y: pipe.position.y + half * Math.SQRT2 },
        ],
        pipe.bottom,
        pipe.top,
      ),
    });
  }

  for (const cap of layout.ridgeCaps) {
    descriptors.push(
      segmentDescriptor(
        cap.id,
        roofSystem,
        'ridgeCap',
        cap.start,
        cap.end,
        cap.up,
        { height: CAP_THICKNESS, width: cap.width },
        'roofRidgeCap',
      ),
    );
  }

  for (const cap of layout.bargeCaps) {
    descriptors.push(
      segmentDescriptor(
        cap.id,
        roofSystem,
        'bargeCap',
        cap.start,
        cap.end,
        cap.up,
        { height: CAP_THICKNESS, width: cap.width },
        'roofRidgeCap',
        { edgeIndex: cap.run.edgeIndex },
      ),
    );
  }

  const geometry = roofGeometry || buildRoofPlaneGeometry(roofSystem);
  for (const soffit of layout.soffits) {
    if (soffit.mode === 'boxed') {
      descriptors.push({
        id: soffit.id,
        kind: 'roofSystem',
        geometry: 'prism',
        outline: soffit.polygon.map((point) => ({ x: point.x, y: point.y })),
        holes: [],
        baseElevation: soffit.baseElevation,
        height: soffit.thickness,
        materialKey: 'roofSoffit',
        metadata: { sourceId: roofSystem.id, part: 'soffit', edgeIndex: soffit.run.edgeIndex },
        bounds: planBounds(soffit.polygon, soffit.baseElevation, soffit.baseElevation + soffit.thickness),
      });
      continue;
    }
    // Raked: the lining follows the underside of the roof body.
    const points = soffit.polygon.map((point) => {
      const topElevation = geometry.getSurfaceElevation(point, 'bottom') - RAKED_SOFFIT_GAP;
      return { x: point.x, y: point.y, topElevation, bottomElevation: topElevation - soffit.thickness };
    });
    descriptors.push({
      id: soffit.id,
      kind: 'roofSystem',
      geometry: 'roofMesh',
      surfaces: [{ id: soffit.id, outline: points }],
      outerBoundary: points,
      materialKey: 'roofSoffit',
      metadata: { sourceId: roofSystem.id, part: 'soffit', edgeIndex: soffit.run.edgeIndex },
      bounds: planBounds(
        points,
        Math.min(...points.map((point) => point.bottomElevation)),
        Math.max(...points.map((point) => point.topElevation)),
      ),
    });
  }

  return descriptors;
}

// ── Quantities and summaries ─────────────────────────────────────────────

function segmentLength3(start, end) {
  return Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
}

/**
 * Trim quantities in the takeoff's units (lm, ea, m²), from the same layout
 * the 3D draws. Barge length is measured on the rake, not in plan.
 */
export function buildRoofEdgeKitQuantities(roofSystem, context = {}) {
  const layout = buildRoofEdgeKitLayout(roofSystem, null, context);
  const sum = (items, length) => items.reduce((total, item) => total + length(item), 0);
  return {
    fasciaLm: sum(layout.fascias, (board) => segmentLength3(board.topStart, board.topEnd)) / 1000,
    bargeLm: sum(layout.barges, (board) => segmentLength3(board.topStart, board.topEnd)) / 1000,
    gutterLm: sum(layout.gutters, (gutter) => gutter.length) / 1000,
    downpipeCount: layout.downpipes.length,
    ridgeCapLm:
      sum(
        layout.ridgeCaps.filter((cap, index) => index % 2 === 0),
        (cap) => segmentLength3(cap.start, cap.end),
      ) / 1000,
    soffitM2: sum(layout.soffits, (soffit) => soffit.area) / 1_000_000,
  };
}

const TRIM_LABELS = [
  ['fascia', 'Fascia'],
  ['barge', 'Barge'],
  ['gutter', 'Gutter'],
  ['downpipes', 'Downpipes'],
  ['ridgeCap', 'Ridge cap'],
  ['bargeCap', 'Barge cap'],
];

/** "Fascia · Barge · Gutter · … · Boxed soffit", or "None" — the inspect card's Trims row. */
export function describeRoofTrims(roofSystem) {
  if (!roofSystem) return 'None';
  const roofType = roofSystem.roofType || 'flat';
  if (roofType === 'flat') return 'None (flat roof)';
  const trims = normalizeRoofTrims(roofSystem.trims, roofType);
  const parts = TRIM_LABELS.filter(([key]) => trims[key].enabled).map(([, label]) => label);
  if (trims.soffit.mode !== 'open') parts.push(`${trims.soffit.mode === 'boxed' ? 'Boxed' : 'Raked'} soffit`);
  return parts.length ? parts.join(' · ') : 'None';
}
