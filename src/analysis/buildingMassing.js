/**
 * Reduces a project to the shading solids an environmental study needs: plan
 * outlines with a base elevation and a top elevation per vertex.
 *
 * This is deliberately separate from `buildPreviewObjects`, which is entangled
 * with Three.js materials and render concerns. Analysis wants dumb geometry it
 * can project, sample and union — nothing else. Keeping the two apart means a
 * change to how walls *look* can never quietly change what a shadow study
 * *computes*.
 *
 * All values are millimetres, matching the rest of the model. Elevations are
 * absolute (measured from project datum), not per-floor.
 */

import { wallOutline } from '@/geometry/wallGeometry';
import { wallBaseOffset } from '@/domain/wallFit';
import { columnOutline } from '@/geometry/columnGeometry';
import { unionPolygons } from '@/geometry/polygonBoolean';
import { buildRoofPlaneGeometry } from '@/geometry/roofPlaneGeometry';

/** Prisms whose base and top agree to within this are merged into one mass. */
const HEIGHT_BAND_MM = 10;

/** Solids shorter than this cast no shadow worth drawing (kerbs, thresholds). */
const MIN_MASS_HEIGHT_MM = 100;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function collectFloorPrisms(floor, options) {
  const prisms = [];
  const floorElevation = isFiniteNumber(floor.elevation) ? floor.elevation : 0;
  const defaultHeight = isFiniteNumber(floor.floorToFloorHeight) ? floor.floorToFloorHeight : 0;

  for (const wall of floor.walls || []) {
    const height = isFiniteNumber(wall.height) ? wall.height : defaultHeight;
    if (height < MIN_MASS_HEIGHT_MM) continue;
    const outline = wallOutline(wall);
    if (outline.length < 3) continue;
    const base = floorElevation + wallBaseOffset(wall);
    prisms.push({ outline, base, top: base + height });
  }

  if (options.includeColumns) {
    for (const column of floor.columns || []) {
      const height = isFiniteNumber(column.height) ? column.height : defaultHeight;
      if (height < MIN_MASS_HEIGHT_MM) continue;
      const outline = columnOutline(column);
      if (outline.length < 3) continue;
      prisms.push({ outline, base: floorElevation, top: floorElevation + height });
    }
  }

  if (options.includeSlabs) {
    for (const slab of floor.slabs || []) {
      const outline = (slab.boundaryPoints || []).map((point) => ({ x: point.x, y: point.y }));
      if (outline.length < 3) continue;
      // A slab's own elevation is relative to its floor. Balconies and canopies
      // shade what is below them, so they are worth including even though they
      // are thin.
      const base = floorElevation + (isFiniteNumber(slab.elevation) ? slab.elevation : 0);
      const thickness = isFiniteNumber(slab.thickness) ? slab.thickness : 0;
      prisms.push({ outline, base, top: base + thickness });
    }
  }

  return prisms;
}

/**
 * Merge prisms that share a height band into as few polygons as possible.
 * A floor of forty walls collapses to one or two outlines, which matters:
 * a day-long shadow study projects every mass at every time step, so the
 * polygon count here sets the cost of the whole study.
 */
function mergePrismsByHeightBand(prisms, idPrefix) {
  const bands = new Map();

  for (const prism of prisms) {
    const key = `${Math.round(prism.base / HEIGHT_BAND_MM)}:${Math.round(prism.top / HEIGHT_BAND_MM)}`;
    if (!bands.has(key)) bands.set(key, { base: prism.base, top: prism.top, outlines: [] });
    bands.get(key).outlines.push(prism.outline);
  }

  const masses = [];
  for (const [key, band] of bands) {
    if (band.top - band.base < MIN_MASS_HEIGHT_MM) continue;
    const regions = unionPolygons(band.outlines);
    regions.forEach((region, index) => {
      masses.push({
        id: `${idPrefix}:${key}:${index}`,
        footprint: region.outline,
        holes: region.holes || [],
        baseElevation: band.base,
        topElevations: region.outline.map(() => band.top),
        sloped: false,
      });
    });
  }
  return masses;
}

/**
 * Roof planes are the one shading solid that is genuinely sloped, so they keep
 * a per-vertex top elevation instead of being flattened to a box. Each plane is
 * planar by construction, which makes its cast shadow exact rather than an
 * approximation — a gable's shadow is the union of its two plane shadows.
 */
function collectRoofMasses(roofSystem) {
  if (!roofSystem || (roofSystem.boundaryPolygon || []).length < 3) return [];

  let geometry;
  try {
    geometry = buildRoofPlaneGeometry(roofSystem);
  } catch {
    // Roof topology solving is the most failure-prone geometry in the app.
    // A study that silently omits the roof is far better than one that throws.
    return [];
  }

  const planes = geometry?.planes || [];
  const masses = [];

  for (const plane of planes) {
    const outline = plane.outline || plane.boundaryPoints || [];
    if (outline.length < 3) continue;

    // Hip and custom planes carry their own elevation function; gable, shed and
    // flat planes do not and defer to the roof-wide one. Both are valid over
    // the plane's own outline, so fall back rather than skipping the plane —
    // silently dropping gable roofs is exactly the kind of gap a shadow study
    // must not have.
    const surfaceElevationAt =
      typeof plane.getSurfaceElevation === 'function' ? plane.getSurfaceElevation : geometry.getSurfaceElevation;
    if (typeof surfaceElevationAt !== 'function') continue;

    const elevationAt = (point, surface) => {
      const elevation = surfaceElevationAt(point, surface);
      return isFiniteNumber(elevation) ? elevation : 0;
    };

    const topElevations = outline.map((point) => elevationAt(point, 'top'));
    // Take the base from the plane's underside, so a flat roof still has its
    // slab thickness and any eave overhang beyond the walls below.
    const baseElevation = Math.min(...outline.map((point) => elevationAt(point, 'bottom')));
    const lowestTop = Math.min(...topElevations);

    masses.push({
      id: `roof:${plane.id}`,
      footprint: outline.map((point) => ({ x: point.x, y: point.y })),
      holes: [],
      baseElevation,
      topElevations,
      sloped: topElevations.some((elevation) => Math.abs(elevation - lowestTop) > HEIGHT_BAND_MM),
    });
  }

  return masses.filter((mass) => Math.max(...mass.topElevations) - mass.baseElevation >= MIN_MASS_HEIGHT_MM);
}

/**
 * Build the shading solids for a project.
 *
 * @param {object} project
 * @param {object} [options]
 * @param {boolean} [options.includeColumns]  Free-standing columns shade open
 *   structures like carports. Default true.
 * @param {boolean} [options.includeSlabs]    Balconies and canopies. Default true.
 * @param {boolean} [options.includeRoof]     Default true.
 * @param {string[]} [options.floorIds]       Restrict to specific floors. By
 *   default every floor in the project shades the site, because a shadow does
 *   not care which storey you happen to be editing.
 * @returns {Array<{id: string, footprint: Array<{x: number, y: number}>,
 *   holes: Array, baseElevation: number, topElevations: number[], sloped: boolean}>}
 */
export function buildAnalysisMassing(project, options = {}) {
  const { includeColumns = true, includeSlabs = true, includeRoof = true, floorIds = null } = options;

  const floors = (project?.floors || []).filter((floor) => !floorIds || floorIds.includes(floor.id));
  const masses = [];

  for (const floor of floors) {
    const prisms = collectFloorPrisms(floor, { includeColumns, includeSlabs });
    masses.push(...mergePrismsByHeightBand(prisms, `floor:${floor.id}`));
  }

  if (includeRoof) masses.push(...collectRoofMasses(project?.roofSystem));

  return masses;
}

/** Highest point of any shading solid, for fitting shadow cameras and grids. */
export function massingTopElevation(masses = []) {
  return masses.reduce((highest, mass) => Math.max(highest, ...mass.topElevations), 0);
}

/** Plan bounding box of the massing, or null when there is nothing to shade. */
export function massingBounds(masses = []) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const mass of masses) {
    for (const point of mass.footprint) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

export const MASSING_CONSTANTS = { HEIGHT_BAND_MM, MIN_MASS_HEIGHT_MM };
