import { columnOutline } from './columnGeometry';
import { unionPolygons } from './polygonBoolean';
import { getSlabRenderData } from './slabGeometry';
import { getWallRenderData } from './wallColumnGeometry';
import { distance, normalize, scale, subtract, add } from './point';
import { wallOutline } from './wallGeometry';
import { resolveWallAssembly } from '@/domain/wallAssemblies';

/**
 * Geometry for the presentation plan: which walls read as solid structure and
 * which as partitions, and the seamless outlines each tier is drawn with.
 *
 * Drawing every wall as its own stroked rectangle shows a seam at every corner
 * and tee — two outlines crossing where one wall dies into another. A rendered
 * plan draws the wall mass as one shape, so each tier is unioned into a single
 * multipolygon and stroked once.
 */

export const WALL_TIERS = Object.freeze({ SOLID: 'solid', PARTITION: 'partition' });

/** Masonry this thick or more reads as structure even when nobody declared it. */
export const SOLID_WALL_MIN_THICKNESS = 150;

/**
 * Solid: declared loadbearing, or masonry at least 150 mm thick. Everything
 * else — thin masonry and every framed assembly — is a partition.
 */
export function wallTier(wall) {
  if (!wall) return WALL_TIERS.PARTITION;
  if (wall.structuralRole === 'loadbearing') return WALL_TIERS.SOLID;
  const system = resolveWallAssembly(wall).system;
  if (system !== 'framed' && (Number(wall.thickness) || 0) >= SOLID_WALL_MIN_THICKNESS) return WALL_TIERS.SOLID;
  return WALL_TIERS.PARTITION;
}

const JOIN_TOLERANCE = 1; // mm

function endpointJoined(point, wall, walls) {
  for (const other of walls) {
    if (other === wall) continue;
    if (distance(point, other.start) <= JOIN_TOLERANCE || distance(point, other.end) <= JOIN_TOLERANCE) return true;
  }
  return false;
}

/**
 * A wall's plan outline for the union, run on by half its thickness at any end
 * that meets another wall's end.
 *
 * Two walls meeting end-to-end at a corner each stop at the shared point, which
 * leaves the outside corner square missing — a notch the drafting drawing has
 * always had and a solid black wall would make obvious. Running each end on by
 * half a thickness fills that square exactly for a right-angled corner, and
 * only overlaps (harmlessly, inside the union) for a tee or a straight run. Ends
 * that die into a column are already trimmed to its face and left alone, as are
 * arcs, whose outline is not a rectangle to extend.
 */
export function wallUnionOutline(wall, columns = [], walls = []) {
  const renderData = getWallRenderData(wall, columns);
  const outline = renderData.outline;
  if (wall.controlPoint || !walls.length) return outline;

  const extendStart = !wall.startAttachment && endpointJoined(wall.start, wall, walls);
  const extendEnd = !wall.endAttachment && endpointJoined(wall.end, wall, walls);
  if (!extendStart && !extendEnd) return outline;

  const start = renderData.trimStart || wall.start;
  const end = renderData.trimEnd || wall.end;
  const length = distance(start, end);
  if (length < 1) return outline;
  const direction = normalize(subtract(end, start));
  const half = (Number(wall.thickness) || 0) / 2;
  return wallOutline({
    start: extendStart ? add(start, scale(direction, -half)) : start,
    end: extendEnd ? add(end, scale(direction, half)) : end,
    thickness: wall.thickness,
  });
}

function validRing(points) {
  return (
    Array.isArray(points) && points.length >= 3 && points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  );
}

/**
 * The two tiers as unioned regions: `{ solid, partition }`, each a list of
 * `{ outline, holes }`. Columns join the solid tier. A degenerate input falls
 * back to the unmerged rings (see `unionPolygons`), which still draws.
 */
export function buildWallTierRegions(walls = [], columns = []) {
  const solid = [];
  const partition = [];
  for (const wall of walls) {
    const outline = wallUnionOutline(wall, columns, walls);
    if (!validRing(outline)) continue;
    (wallTier(wall) === WALL_TIERS.SOLID ? solid : partition).push(outline);
  }
  for (const column of columns) {
    const outline = columnOutline(column);
    if (validRing(outline)) solid.push(outline);
  }
  return {
    solid: unionPolygons(solid),
    partition: unionPolygons(partition),
  };
}

/**
 * The footprint the plan's white card is cut to: every wall, column, room and
 * slab on the floor, unioned. Drawn white under the zone tints, with the one
 * drop shadow the canvas is allowed to carry.
 */
export function buildPlanCardRegion(floor) {
  if (!floor) return [];
  const walls = floor.walls || [];
  const columns = floor.columns || [];
  const rings = [];
  for (const wall of walls) {
    const outline = wallUnionOutline(wall, columns, walls);
    if (validRing(outline)) rings.push(outline);
  }
  for (const column of columns) {
    const outline = columnOutline(column);
    if (validRing(outline)) rings.push(outline);
  }
  for (const room of floor.rooms || []) {
    if (validRing(room.points)) rings.push(room.points);
  }
  for (const slab of floor.slabs || []) {
    const outline = getSlabRenderData(slab)?.outline;
    if (validRing(outline)) rings.push(outline);
  }
  return unionPolygons(rings);
}

/** SVG path data for a region list, one subpath per ring — fill it even-odd. */
export function regionsToPath(regions = []) {
  return regions
    .flatMap(({ outline, holes }) => [outline, ...(holes || [])])
    .filter((ring) => ring.length >= 3)
    .map((ring) => `M${ring.map((p) => `${round(p.x)},${round(p.y)}`).join('L')}Z`)
    .join('');
}

function round(value) {
  return Math.round(value * 100) / 100;
}

// Identity caches. The reducer hands back the same `walls` / `columns` arrays
// for every edit that does not touch them, so a door move or a selection never
// pays for a union.
const tierCache = new WeakMap();

export function cachedWallTierRegions(walls, columns) {
  const byColumns = tierCache.get(walls);
  if (byColumns && byColumns.columns === columns) return byColumns.regions;
  const regions = buildWallTierRegions(walls, columns);
  tierCache.set(walls, { columns, regions });
  return regions;
}

/** Whether `cachedWallTierRegions` already holds an answer for these arrays. */
export function hasCachedWallTierRegions(walls, columns) {
  return tierCache.get(walls)?.columns === columns;
}
